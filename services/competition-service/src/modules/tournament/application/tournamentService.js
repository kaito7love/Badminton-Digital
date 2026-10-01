const { Op } = require('sequelize');
const { DomainError } = require('../../../shared/domainError');
const { round3, mean } = require('../../../shared/numbers');
const { notFound, conflict, unprocessable, AppError } = require('../../../platform/http/errors');
const { canAccessOrganizer } = require('../../../platform/http/auth');
const { assertVersion } = require('../../../platform/http/preconditions');
const { roundRobin, scheduleSlots, buildBracket, newSeed } = require('../../matchmaking').domain;
const { PRESETS, validateScoring } = require('../../match').domain.badmintonScore;
const { assertAction } = require('../domain/stateMachine');
const { checkPlayer, checkPair, validateRatingRule } = require('../domain/eligibility');
const { buildTeams, buildStructure, validateDraw, teamStats } = require('../domain/draw');
const { planBracket } = require('../domain/bracketPlan');
const { computeStandings } = require('../domain/standings');

// Lệnh của module tournament (docs/06 mục 2–5): tạo / sửa / mở / huỷ giải, đăng
// ký / rút, bốc thăm (xem trước → xác nhận bản đã chỉnh tay), mở lại, thêm trận,
// sơ đồ loại trực tiếp. Chốt / huỷ chốt ở finalizeService.

const invalid = (errors) => new DomainError('INVALID_TOURNAMENT', `Thông tin giải không hợp lệ: ${errors[0].message}`, errors);

const createTournamentService = ({ models, sequelize, players, ratingQueries, matches, platform, ctx }) => {
  const { Tournament, TournamentEntry, TournamentTeam } = models;
  const { outbox, audit, realtime } = platform;
  // Lịch / bảng đấu / TV của giải tải lại khi trận đổi — phát sau commit (plan 19).
  const boardChanged = (transaction, t, reason) =>
    realtime.boardChanged(transaction, { tenant: t.tenantId, contextType: 'tournament', contextId: t.id, reason });

  // ---------- tạo / sửa ----------
  const normalize = (body, base = {}) => {
    const t = { ...base, ...body };
    const errors = [];
    if (t.discipline === 'singles') {
      if (t.genderRule === 'mixed') errors.push({ field: 'genderRule', message: 'Đánh đơn không có nội dung nam nữ' });
      t.pairingMode = 'fixed';
    }
    t.pairingMode = t.pairingMode || 'fixed';
    let scoring = t.scoring;
    if (typeof scoring === 'string') {
      scoring = PRESETS[scoring];
      if (!scoring) errors.push({ field: 'scoring', message: `Preset không có: ${t.scoring}` });
    }
    if (errors.length) throw invalid(errors);
    t.scoring = validateScoring(scoring);
    t.ratingRule = t.ratingRule ? validateRatingRule(t.ratingRule, t) : null;
    if (t.format === 'groups_knockout') {
      if (t.groupCount !== undefined && t.groupCount !== null && t.groupCount < 2) errors.push({ field: 'groupCount', message: 'Vòng bảng + loại trực tiếp cần ≥ 2 bảng' });
      if (t.advancePerGroup !== undefined && t.advancePerGroup !== null && ![1, 2].includes(t.advancePerGroup)) {
        errors.push({ field: 'advancePerGroup', message: '1 hoặc 2 đội đi tiếp mỗi bảng' });
      }
    }
    if (t.pairingMode === 'random_balanced' && t.discipline !== 'doubles') errors.push({ field: 'pairingMode', message: 'Bốc thăm ghép cặp chỉ dùng cho đánh đôi' });
    if (errors.length) throw invalid(errors);
    return t;
  };

  const FIELDS = [
    'name', 'description', 'startsOn', 'tier', 'discipline', 'genderRule', 'pairingMode', 'maxPartnerGap', 'maxEntries', 'ratingRule',
    'format', 'groupCount', 'groupMode', 'advancePerGroup', 'thirdPlaceMatch', 'scoring', 'courtCount', 'matchMinutes', 'rated', 'ranked'
  ];
  const pick = (obj) => Object.fromEntries(FIELDS.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));

  const create = async ({ auth, body, requestId }) => {
    if (!canAccessOrganizer(auth, body.organizerRef)) {
      throw new AppError(403, 'FORBIDDEN_ORGANIZER', 'Không được tạo giải cho chi nhánh này');
    }
    if (body.tier === 'chain' && !auth.allOrgs) throw new AppError(403, 'FORBIDDEN_ORGANIZER', 'Giải toàn chuỗi chỉ admin tạo được');
    const fields = normalize(pick(body));
    return sequelize.transaction(async (transaction) => {
      const t = await Tournament.create(
        { ...fields, tenantId: auth.tenant, organizerRef: body.organizerRef, status: 'draft', createdByRef: auth.sub },
        { transaction }
      );
      await audit.record(transaction, {
        tenant: auth.tenant, actorRef: auth.sub, action: 'tournament.created', targetType: 'tournament', targetId: t.id, after: fields, requestId
      });
      return t;
    });
  };

  const LOCKED_AFTER_ENTRIES = ['discipline', 'genderRule', 'pairingMode', 'scoring', 'ratingRule'];

  const update = async ({ auth, id, body, ifMatch, requestId }) =>
    sequelize.transaction(async (transaction) => {
      const t = await ctx.load(transaction, auth.tenant, id, { lock: true });
      ctx.authorize(auth, t, 'manage');
      assertAction(t, 'update');
      assertVersion(ifMatch, t.version, { what: 'Giải' });
      const changes = pick(body);
      const hasEntries = (await TournamentEntry.count({ where: { tournamentId: t.id, status: { [Op.ne]: 'withdrawn' } }, transaction })) > 0;
      if (hasEntries) {
        const locked = LOCKED_AFTER_ENTRIES.filter((k) => changes[k] !== undefined && JSON.stringify(changes[k]) !== JSON.stringify(t[k]));
        if (locked.length) throw conflict('LOCKED_AFTER_ENTRIES', `Đã có người đăng ký — không đổi được: ${locked.join(', ')}`);
      }
      const before = Object.fromEntries(Object.keys(changes).map((k) => [k, t[k]]));
      const normalized = normalize(changes, pick(t.get({ plain: true })));
      await t.update(pick(normalized), { transaction });
      await audit.record(transaction, {
        tenant: auth.tenant, actorRef: auth.sub, action: 'tournament.updated', targetType: 'tournament', targetId: t.id, before, after: changes, requestId
      });
      return t;
    });

  const transition = (action, to, extra = () => ({})) => async ({ auth, id, requestId }) =>
    sequelize.transaction(async (transaction) => {
      const t = await ctx.load(transaction, auth.tenant, id, { lock: true });
      ctx.authorize(auth, t, 'manage');
      assertAction(t, action);
      const before = t.status;
      await t.update({ status: to, ...(await extra(t, transaction)) }, { transaction });
      await audit.record(transaction, {
        tenant: auth.tenant, actorRef: auth.sub, action: `tournament.${action}`, targetType: 'tournament', targetId: t.id,
        before: { status: before }, after: { status: to }, requestId
      });
      return t;
    });

  const open = transition('open', 'open');

  const cancel = async ({ auth, id, requestId }) => {
    const t = await transition('cancel', 'cancelled', async (tour, transaction) => {
      const list = await matches.listForContext(auth.tenant, 'tournament', tour.id, { transaction });
      for (const m of list) if (m.status === 'scheduled' || m.status === 'in_play') await m.update({ status: 'cancelled' }, { transaction });
      await outbox.add(transaction, {
        type: 'competition.tournament.cancelled', tenant: auth.tenant, aggregateType: 'tournament', aggregateId: tour.id,
        data: { tournamentId: tour.id, organizerRef: tour.organizerRef, reason: 'Huỷ giải' }
      });
      return {};
    })({ auth, id, requestId });
    return t;
  };

  // ---------- đăng ký ----------
  const register = async ({ auth, id, playerId, partnerPlayerId, requestId }) =>
    sequelize.transaction(async (transaction) => {
      const t = await ctx.load(transaction, auth.tenant, id, { lock: true });
      ctx.authorize(auth, t, 'operate');
      assertAction(t, 'register');
      const needsPartner = t.discipline === 'doubles' && t.pairingMode === 'fixed';
      if (needsPartner && !partnerPlayerId) throw unprocessable('PARTNER_REQUIRED', 'Giải cặp cố định — cần chọn đồng đội');
      if (!needsPartner && partnerPlayerId) throw unprocessable('PARTNER_NOT_ALLOWED', 'Giải này đăng ký từng người');
      const ids = [playerId, partnerPlayerId].filter(Boolean);
      const people = await players.findByIds(auth.tenant, ids, { transaction });
      const byId = new Map(people.map((p) => [p.id, p]));
      for (const pid of ids) if (!byId.has(pid)) throw notFound('Không tìm thấy người chơi');
      const ratings = await ratingQueries.disciplineRatings(auth.tenant, ids, t.discipline);
      for (const pid of ids) checkPlayer({ tournament: t, player: byId.get(pid), rating: ratings.get(pid) });
      if (partnerPlayerId) {
        checkPair({ tournament: t, a: byId.get(playerId), b: byId.get(partnerPlayerId), ratingA: ratings.get(playerId), ratingB: ratings.get(partnerPlayerId) });
      }
      const existing = await TournamentEntry.findAll({ where: { tournamentId: t.id, playerId: ids }, transaction });
      const active = existing.filter((e) => e.status !== 'withdrawn');
      if (active.length) {
        throw conflict('ALREADY_REGISTERED', `${byId.get(active[0].playerId).displayName} đã đăng ký giải này`);
      }
      const registered = await TournamentEntry.count({ where: { tournamentId: t.id, status: 'registered' }, transaction });
      const full = t.maxEntries && registered + ids.length > t.maxEntries;
      const status = full ? 'waitlisted' : 'registered';
      const now = new Date();
      const out = [];
      for (const pid of ids) {
        const values = {
          tenantId: auth.tenant,
          tournamentId: t.id,
          playerId: pid,
          partnerPlayerId: pid === playerId ? partnerPlayerId || null : playerId,
          status,
          waitlistReason: full ? 'capacity' : null,
          ratingSnapshot: ratings.get(pid).rating,
          pairingRatingSnapshot: ratings.get(pid).pairingRating,
          registeredAt: now,
          registeredByRef: auth.sub
        };
        const old = existing.find((e) => e.playerId === pid);
        out.push(old ? await old.update(values, { transaction }) : await TournamentEntry.create(values, { transaction }));
      }
      await audit.record(transaction, {
        tenant: auth.tenant, actorRef: auth.sub, action: 'tournament.entry_added', targetType: 'tournament', targetId: t.id,
        after: { players: ids, status }, requestId
      });
      return { tournament: t, entries: out };
    });

  // Rút: trước bốc thăm → nhường chỗ cho người chờ; sau bốc thăm → cả đội rút, trận
  // chưa đánh thành W.O. cho đối thủ (docs/06 mục 7.4).
  const withdraw = async ({ auth, id, entryId, requestId }) =>
    sequelize.transaction(async (transaction) => {
      const t = await ctx.load(transaction, auth.tenant, id, { lock: true });
      ctx.authorize(auth, t, 'operate');
      assertAction(t, 'withdraw');
      const entry = await TournamentEntry.findOne({ where: { id: entryId, tournamentId: t.id }, transaction });
      if (!entry) throw notFound('Không tìm thấy lượt đăng ký');
      if (entry.status === 'withdrawn') return { tournament: t, entries: [entry] };
      const group = [entry];
      if (t.pairingMode === 'fixed' && entry.partnerPlayerId) {
        const partner = await TournamentEntry.findOne({ where: { tournamentId: t.id, playerId: entry.partnerPlayerId }, transaction });
        if (partner && partner.status !== 'withdrawn') group.push(partner);
      }
      const wasRegistered = entry.status === 'registered';

      if (t.status === 'open') {
        for (const e of group) await e.update({ status: 'withdrawn', waitlistReason: null }, { transaction });
        if (wasRegistered) {
          // Người chờ vì hết chỗ, sớm nhất trước.
          const waiting = await TournamentEntry.findAll({
            where: { tournamentId: t.id, status: 'waitlisted', waitlistReason: 'capacity' },
            order: [['registeredAt', 'ASC'], ['id', 'ASC']],
            transaction
          });
          let free = group.length;
          for (const w of waiting) {
            if (free <= 0) break;
            await w.update({ status: 'registered', waitlistReason: null }, { transaction });
            free -= 1;
          }
        }
      } else {
        const team = await TournamentTeam.findOne({
          where: { tournamentId: t.id, [Op.or]: [{ player1Id: entry.playerId }, { player2Id: entry.playerId }] },
          transaction
        });
        if (team) {
          await team.update({ withdrawnAt: new Date() }, { transaction });
          const teammates = await TournamentEntry.findAll({ where: { tournamentId: t.id, playerId: [team.player1Id, team.player2Id].filter(Boolean) }, transaction });
          for (const e of teammates) await e.update({ status: 'withdrawn' }, { transaction });
          const withdrawn = await ctx.withdrawnTeamIds(transaction, t);
          const list = await matches.listForContext(auth.tenant, 'tournament', t.id, { transaction });
          for (const m of list) {
            if (!['scheduled', 'in_play'].includes(m.status)) continue;
            if (m.teamAId !== team.id && m.teamBId !== team.id) continue;
            const other = m.teamAId === team.id ? m.teamBId : m.teamAId;
            if (!other) continue; // ô trận sau chưa có đối thủ — xử khi đối thủ vào
            if (withdrawn.has(other)) {
              if (!m.nextMatchId) await m.update({ status: 'cancelled' }, { transaction });
              continue;
            }
            await matches.forfeit(transaction, m, m.teamAId === team.id ? 'B' : 'A', auth.sub, t);
          }
          if (t.status === 'drawn' && list.some((m) => m.status === 'completed')) await t.update({ status: 'in_progress' }, { transaction });
        } else {
          for (const e of group) await e.update({ status: 'withdrawn' }, { transaction });
        }
      }
      await audit.record(transaction, {
        tenant: auth.tenant, actorRef: auth.sub, action: 'tournament.entry_withdrawn', targetType: 'tournament', targetId: t.id,
        after: { entryId, players: group.map((e) => e.playerId) }, requestId
      });
      boardChanged(transaction, t, 'withdrawn');
      return { tournament: t, entries: group };
    });

  // ---------- bốc thăm ----------
  const drawInputs = async (tenant, t, transaction) => {
    const entries = await TournamentEntry.findAll({
      where: { tournamentId: t.id, status: 'registered' },
      order: [['registeredAt', 'ASC'], ['id', 'ASC']],
      transaction
    });
    const ids = entries.map((e) => e.playerId);
    const people = new Map((await players.findByIds(tenant, ids, { transaction })).map((p) => [p.id, p]));
    const ratings = await ratingQueries.disciplineRatings(tenant, ids, t.discipline);
    return entries.map((e) => {
      const p = people.get(e.playerId);
      const r = ratings.get(e.playerId);
      return {
        entry: e,
        playerId: e.playerId,
        partnerPlayerId: e.partnerPlayerId,
        name: p ? p.displayName : null,
        gender: p ? p.gender : null,
        position: p ? p.doublesPosition : null,
        rating: r ? r.rating : Number(e.ratingSnapshot),
        pairingRating: r ? r.pairingRating : Number(e.pairingRatingSnapshot),
        registeredAt: e.registeredAt
      };
    });
  };

  const hasResults = async (tenant, t, transaction) =>
    (await matches.listForContext(tenant, 'tournament', t.id, { transaction })).some((m) => m.status === 'completed' || m.status === 'in_play');

  const previewDraw = async ({ auth, id, seed }) => {
    const t = await ctx.load(null, auth.tenant, id);
    ctx.authorize(auth, t, 'manage');
    assertAction(t, 'draw');
    if (t.status === 'drawn' && (await hasResults(auth.tenant, t))) throw conflict('HAS_RESULTS', 'Đã có kết quả — không bốc thăm lại được');
    const inputs = await drawInputs(auth.tenant, t);
    const minPlayers = t.discipline === 'singles' ? 2 : 4;
    if (inputs.length < minPlayers) throw unprocessable('NOT_ENOUGH_ENTRIES', `Cần ít nhất ${minPlayers} người đăng ký để bốc thăm`);
    const s = seed || newSeed();
    const teamsResult = buildTeams({ tournament: t, entries: inputs, seed: s });
    if (teamsResult.teams.length < 2) throw unprocessable('NOT_ENOUGH_ENTRIES', 'Chưa đủ 2 đội');
    const structure = buildStructure({ tournament: t, teams: teamsResult.teams, seed: s });
    const byId = new Map(inputs.map((i) => [i.playerId, i]));
    return {
      tournament: t,
      proposal: {
        seed: s,
        teams: teamsResult.teams.map((team, index) => ({
          index,
          players: team.players.map((pid) => ({ id: pid, name: byId.get(pid).name, gender: byId.get(pid).gender ?? null, pairingRating: byId.get(pid).pairingRating })),
          teamRating: team.teamRating
        })),
        waitlist: teamsResult.waitlist.map((w) => ({ playerId: w.playerId, name: byId.get(w.playerId).name, reason: w.reason })),
        groups: structure.groups,
        bracket: structure.bracket,
        matches: structure.matches.map((m) => ({ stage: m.stage, groupNo: m.groupNo ?? null, round: m.round, slotNo: m.slotNo ?? null, teams: m.teams })),
        estimate: structure.estimate,
        stats: {
          ...teamStats(teamsResult.teams),
          baselineRandomStdDev: teamsResult.stats ? teamsResult.stats.baselineRandomStdDev : null
        }
      }
    };
  };

  const scoringOf = (t) => t.scoring;
  const teamRef = (team) => ({ teamId: team.id, players: [team.player1Id, team.player2Id].filter(Boolean) });

  // Số lượt cho trận loại trực tiếp: tiếp nối sau lượt cuối đã có, mỗi vòng một cụm.
  const knockoutSlots = (plan, courts, startSlot) => {
    const slotOf = new Map();
    let slot = startSlot;
    const rounds = [...new Set(plan.matches.map((m) => m.roundNo))].sort((a, b) => a - b);
    for (const r of rounds) {
      const inRound = plan.matches.filter((m) => m.roundNo === r).sort((a, b) => (a.thirdPlace ? 1 : 0) - (b.thirdPlace ? 1 : 0) || a.bracketPos - b.bracketPos);
      inRound.forEach((m, i) => slotOf.set(m.key, slot + Math.floor(i / courts) + 1));
      slot += Math.ceil(inRound.length / courts);
    }
    return slotOf;
  };

  const bracketRows = (t, plan, teamByRef, startSlot) => {
    const slotOf = knockoutSlots(plan, t.courtCount, startSlot);
    return plan.matches.map((m) => ({
      key: m.key,
      discipline: t.discipline,
      stage: 'knockout',
      label: m.label,
      roundNo: m.roundNo,
      bracketPos: m.bracketPos,
      slotNo: slotOf.get(m.key),
      teamA: m.teamA ? teamRef(teamByRef.get(m.teamA)) : null,
      teamB: m.teamB ? teamRef(teamByRef.get(m.teamB)) : null,
      scoring: scoringOf(t),
      nextKey: m.nextKey,
      nextSlot: m.nextSlot,
      loserNextKey: m.loserNextKey,
      loserNextSlot: m.loserNextSlot
    }));
  };

  const resetDraw = async (tenant, t, transaction) => {
    await matches.deleteForContext(transaction, tenant, 'tournament', t.id);
    await TournamentTeam.destroy({ where: { tournamentId: t.id }, transaction });
    await TournamentEntry.update(
      { status: 'registered', waitlistReason: null },
      { where: { tournamentId: t.id, status: 'waitlisted', waitlistReason: 'draw' }, transaction }
    );
  };

  const confirmDraw = async ({ auth, id, body, requestId }) =>
    sequelize.transaction(async (transaction) => {
      const t = await ctx.load(transaction, auth.tenant, id, { lock: true });
      ctx.authorize(auth, t, 'manage');
      assertAction(t, 'draw');
      if (t.status === 'drawn') {
        if (await hasResults(auth.tenant, t, transaction)) throw conflict('HAS_RESULTS', 'Đã có kết quả — không bốc thăm lại được');
        await resetDraw(auth.tenant, t, transaction);
      }
      const inputs = await drawInputs(auth.tenant, t, transaction);
      validateDraw({ tournament: t, entries: inputs, teams: body.teams, groups: body.groups, bracket: body.bracket });
      const byId = new Map(inputs.map((i) => [i.playerId, i]));
      const teamRatings = body.teams.map((team) => round3(mean(team.players.map((pid) => byId.get(pid).pairingRating))));
      const seedOrder = teamRatings.map((r, i) => [r, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map(([, i]) => i);
      const groupOf = new Map();
      (body.groups || []).forEach((g) => g.teams.forEach((idx) => groupOf.set(idx, g.groupNo)));

      const created = [];
      for (let i = 0; i < body.teams.length; i += 1) {
        const [p1, p2] = body.teams[i].players;
        created.push(
          await TournamentTeam.create(
            {
              tenantId: auth.tenant,
              tournamentId: t.id,
              player1Id: p1,
              player2Id: p2 || null,
              teamRating: teamRatings[i],
              groupNo: groupOf.get(i) ?? null,
              seed: seedOrder.indexOf(i) + 1
            },
            { transaction }
          )
        );
      }
      const inTeams = new Set(body.teams.flatMap((team) => team.players));
      for (const input of inputs) {
        if (inTeams.has(input.playerId)) {
          await input.entry.update({ ratingSnapshot: input.rating, pairingRatingSnapshot: input.pairingRating }, { transaction });
        } else {
          await input.entry.update({ status: 'waitlisted', waitlistReason: 'draw' }, { transaction });
        }
      }

      let rows;
      if (t.format === 'knockout') {
        const positions = body.bracket.map((idx) => (idx === null ? null : created[idx].id));
        const plan = planBracket({ positions, thirdPlace: t.thirdPlaceMatch });
        rows = bracketRows(t, plan, new Map(created.map((c) => [c.id, c])), 0);
      } else {
        const groupMatches = [];
        for (const g of body.groups) {
          const ids = g.teams.map((idx) => created[idx].id);
          roundRobin(ids).rounds.forEach((r) =>
            r.matches.forEach(([a, b], k) => groupMatches.push({ key: `G${g.groupNo}R${r.round}M${k + 1}`, groupNo: g.groupNo, round: r.round, teams: [a, b] }))
          );
        }
        const schedule = scheduleSlots({
          matches: groupMatches.map((m) => ({ id: m.key, teams: m.teams, groupNo: m.groupNo, round: m.round })),
          courts: t.courtCount,
          matchMinutes: t.matchMinutes
        });
        const slotOf = new Map();
        schedule.slots.forEach((s) => s.matches.forEach((key) => slotOf.set(key, s.slotNo)));
        const teamById = new Map(created.map((c) => [c.id, c]));
        rows = groupMatches.map((m) => ({
          key: m.key,
          discipline: t.discipline,
          stage: 'group',
          groupNo: m.groupNo,
          roundNo: m.round,
          slotNo: slotOf.get(m.key),
          teamA: teamRef(teamById.get(m.teams[0])),
          teamB: teamRef(teamById.get(m.teams[1])),
          scoring: scoringOf(t)
        }));
      }
      await matches.createMatches(transaction, { tenant: auth.tenant, contextType: 'tournament', contextId: t.id, rows });

      // Có chỉnh tay so với đề xuất của chính seed đó không (ghi vào sự kiện + nhật ký).
      const proposed = buildTeams({ tournament: t, entries: inputs, seed: body.seed }).teams;
      const canon = (teams) => teams.map((x) => [...x.players].sort().join('+')).sort().join(',');
      const manualEdits = canon(proposed) !== canon(body.teams);

      await t.update({ status: 'drawn', stage: t.format === 'knockout' ? 'knockout' : 'group', drawSeed: body.seed }, { transaction });
      await outbox.add(transaction, {
        type: 'competition.tournament.drawn',
        tenant: auth.tenant,
        aggregateType: 'tournament',
        aggregateId: t.id,
        data: {
          tournamentId: t.id,
          organizerRef: t.organizerRef,
          seed: body.seed,
          manualEdits,
          teams: created.map((c) => ({ teamId: c.id, players: teamRef(c).players, groupNo: c.groupNo ?? null })),
          matches: rows.length
        }
      });
      await audit.record(transaction, {
        tenant: auth.tenant, actorRef: auth.sub, action: 'tournament.drawn', targetType: 'tournament', targetId: t.id,
        after: { seed: body.seed, teams: created.length, matches: rows.length, manualEdits }, requestId
      });
      boardChanged(transaction, t, 'drawn');
      return t;
    });

  const reopen = async ({ auth, id, requestId }) =>
    sequelize.transaction(async (transaction) => {
      const t = await ctx.load(transaction, auth.tenant, id, { lock: true });
      ctx.authorize(auth, t, 'manage');
      assertAction(t, 'reopen');
      if (await hasResults(auth.tenant, t, transaction)) throw conflict('HAS_RESULTS', 'Đã có kết quả — không mở lại đăng ký được');
      await resetDraw(auth.tenant, t, transaction);
      await t.update({ status: 'open', stage: null, drawSeed: null }, { transaction });
      await audit.record(transaction, { tenant: auth.tenant, actorRef: auth.sub, action: 'tournament.reopened', targetType: 'tournament', targetId: t.id, requestId });
      boardChanged(transaction, t, 'reopened');
      return t;
    });

  const addMatch = async ({ auth, id, body, requestId }) =>
    sequelize.transaction(async (transaction) => {
      const t = await ctx.load(transaction, auth.tenant, id, { lock: true });
      ctx.authorize(auth, t, 'manage');
      assertAction(t, 'addMatch');
      if (body.teamAId === body.teamBId) throw unprocessable('INVALID_MATCH', 'Hai đội phải khác nhau');
      const teams = await TournamentTeam.findAll({ where: { tournamentId: t.id, id: [body.teamAId, body.teamBId] }, transaction });
      if (teams.length !== 2) throw notFound('Không tìm thấy đội trong giải');
      if (teams.some((x) => x.withdrawnAt)) throw unprocessable('INVALID_MATCH', 'Có đội đã rút');
      const byId = new Map(teams.map((x) => [x.id, x]));
      const idOf = await matches.createMatches(transaction, {
        tenant: auth.tenant,
        contextType: 'tournament',
        contextId: t.id,
        rows: [{ key: 'X', discipline: t.discipline, stage: 'extra', label: body.label || 'Trận thêm', teamA: teamRef(byId.get(body.teamAId)), teamB: teamRef(byId.get(body.teamBId)), scoring: scoringOf(t) }]
      });
      await audit.record(transaction, {
        tenant: auth.tenant, actorRef: auth.sub, action: 'tournament.match_added', targetType: 'tournament', targetId: t.id,
        after: { matchId: idOf.get('X'), label: body.label }, requestId
      });
      boardChanged(transaction, t, 'match_added');
      return idOf.get('X');
    });

  // ---------- sơ đồ loại trực tiếp từ vòng bảng ----------
  const knockoutInputs = async (tenant, t, transaction) => {
    if (t.format !== 'groups_knockout') throw conflict('INVALID_STATE', 'Chỉ thể thức vòng bảng + loại trực tiếp mới cần bước này');
    if (t.stage !== 'group') throw conflict('INVALID_STATE', 'Sơ đồ loại trực tiếp đã được khoá');
    const list = await matches.listForContext(tenant, 'tournament', t.id, { transaction });
    const groupMatches = list.filter((m) => m.stage === 'group');
    if (groupMatches.some((m) => m.status !== 'completed' && m.status !== 'cancelled')) {
      throw conflict('GROUP_STAGE_NOT_DONE', `Còn ${groupMatches.filter((m) => m.status !== 'completed' && m.status !== 'cancelled').length} trận vòng bảng chưa xong`);
    }
    const teams = await TournamentTeam.findAll({ where: { tournamentId: t.id }, transaction });
    const groupNos = [...new Set(teams.map((x) => x.groupNo))].sort((a, b) => a - b);
    const advance = t.advancePerGroup || (groupNos.length * 2 <= 16 ? 2 : 1);
    const rating = new Map(teams.map((x) => [x.id, Number(x.teamRating)]));
    const withdrawn = new Set(teams.filter((x) => x.withdrawnAt).map((x) => x.id));
    const qualifiers = [];
    for (const g of groupNos) {
      const standings = computeStandings({
        teamIds: teams.filter((x) => x.groupNo === g).map((x) => x.id),
        matches: groupMatches.filter((m) => m.groupNo === g),
        bestOf: t.scoring.bestOf,
        seed: t.drawSeed
      }).filter((r) => !withdrawn.has(r.teamId));
      standings.slice(0, advance).forEach((row, i) =>
        qualifiers.push({ ...row, groupNo: g, groupRank: i + 1, winRate: row.played ? row.wins / row.played : 0, gdpm: row.played ? row.gameDiff / row.played : 0, pdpm: row.played ? row.pointDiff / row.played : 0 })
      );
    }
    const order = (a, b) => b.winRate - a.winRate || b.gdpm - a.gdpm || b.pdpm - a.pdpm || rating.get(b.teamId) - rating.get(a.teamId);
    const winners = qualifiers.filter((q) => q.groupRank === 1).sort(order);
    const runners = qualifiers.filter((q) => q.groupRank === 2).sort(order);
    const entrants = [...winners, ...runners].map((q) => ({ id: q.teamId, group: String(q.groupNo), groupRank: q.groupRank }));
    if (entrants.length < 2) throw conflict('INVALID_STATE', 'Chưa đủ đội vào vòng trong');
    const bracket = buildBracket({ entrants, mode: 'from_groups', seed: t.drawSeed || 'knockout' });
    return { teams, entrants, bracket, list };
  };

  const previewKnockout = async ({ auth, id }) => {
    const t = await ctx.load(null, auth.tenant, id);
    ctx.authorize(auth, t, 'manage');
    assertAction(t, 'knockout');
    const { teams, entrants, bracket } = await knockoutInputs(auth.tenant, t);
    return { tournament: t, teams, entrants, bracket };
  };

  const confirmKnockout = async ({ auth, id, positions, requestId }) =>
    sequelize.transaction(async (transaction) => {
      const t = await ctx.load(transaction, auth.tenant, id, { lock: true });
      ctx.authorize(auth, t, 'manage');
      assertAction(t, 'knockout');
      const { teams, entrants, bracket, list } = await knockoutInputs(auth.tenant, t, transaction);
      let chosen = bracket.positions;
      if (positions) {
        const qualified = new Set(entrants.map((e) => e.id));
        const placed = positions.filter((p) => p !== null);
        const bad =
          positions.length !== bracket.size ||
          placed.length !== qualified.size ||
          new Set(placed).size !== placed.length ||
          placed.some((p) => !qualified.has(p)) ||
          Array.from({ length: positions.length / 2 }, (_, m) => positions[2 * m] === null && positions[2 * m + 1] === null).some(Boolean);
        if (bad) throw new DomainError('BRACKET_INVALID', 'Sơ đồ không hợp lệ: mỗi đội đi tiếp đúng một ô, không có trận hai ô trống', [{ field: 'positions', message: 'Không hợp lệ' }]);
        chosen = positions;
      }
      const plan = planBracket({ positions: chosen, thirdPlace: t.thirdPlaceMatch });
      const lastSlot = Math.max(0, ...list.map((m) => m.slotNo || 0));
      const rows = bracketRows(t, plan, new Map(teams.map((x) => [x.id, x])), lastSlot);
      await matches.createMatches(transaction, { tenant: auth.tenant, contextType: 'tournament', contextId: t.id, rows });
      await t.update({ stage: 'knockout' }, { transaction });
      await audit.record(transaction, {
        tenant: auth.tenant, actorRef: auth.sub, action: 'tournament.knockout_locked', targetType: 'tournament', targetId: t.id,
        after: { positions: chosen, manual: Boolean(positions) }, requestId
      });
      boardChanged(transaction, t, 'knockout_locked');
      return t;
    });

  return { create, update, open, cancel, register, withdraw, previewDraw, confirmDraw, reopen, addMatch, previewKnockout, confirmKnockout };
};

module.exports = { createTournamentService };
