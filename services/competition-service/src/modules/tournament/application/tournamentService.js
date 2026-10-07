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
const { validateStartTime, teamPresent, pickNextMatches } = require('../domain/operations');
const { courtErrors } = require('../../../shared/courts');

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
    // Sân của giải (plan 20): có danh sách thì số sân = số phần tử.
    if (t.courtRefs !== undefined && t.courtRefs !== null) {
      errors.push(...courtErrors(t.courtRefs));
      if (!errors.length) t.courtCount = t.courtRefs.length;
    }
    if (errors.length) throw invalid(errors);
    t.startTime = validateStartTime(t.startTime);
    return t;
  };

  const FIELDS = [
    'name', 'description', 'startsOn', 'startTime', 'tier', 'discipline', 'genderRule', 'pairingMode', 'maxPartnerGap', 'maxEntries', 'checkInRequired',
    'ratingRule', 'format', 'groupCount', 'groupMode', 'advancePerGroup', 'thirdPlaceMatch', 'scoring', 'courtCount', 'courtRefs', 'matchMinutes', 'rated', 'ranked'
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
  // `self`: khách tự đăng ký trên trang công khai (plan 27) — quyền do selfRegistration kiểm (entry:self + người đăng ký là chính mình),
  // giải chưa xem công khai được (nháp / huỷ) coi như không tồn tại; mọi luật còn lại y như nhân viên đăng ký.
  const register = async ({ auth, id, playerId, partnerPlayerId, requestId, self = false }) =>
    sequelize.transaction(async (transaction) => {
      const t = await ctx.load(transaction, auth.tenant, id, { lock: true });
      if (self) {
        if (['draft', 'cancelled'].includes(t.status)) throw notFound('Không tìm thấy giải');
      } else ctx.authorize(auth, t, 'operate');
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
          registeredByRef: auth.sub,
          registeredVia: self ? 'self' : 'staff'
        };
        const old = existing.find((e) => e.playerId === pid);
        out.push(old ? await old.update(values, { transaction }) : await TournamentEntry.create(values, { transaction }));
      }
      await audit.record(transaction, {
        tenant: auth.tenant, actorRef: auth.sub, action: 'tournament.entry_added', targetType: 'tournament', targetId: t.id,
        after: { players: ids, status, via: self ? 'self' : 'staff' }, requestId
      });
      return { tournament: t, entries: out };
    });

  // Cả đội rút sau bốc thăm (rút lui / vắng mặt): trận chưa đánh thành W.O. cho đối thủ.
  // Đánh dấu MỌI đội rút trước rồi mới xử trận, để hai đội cùng rút gặp nhau không "thắng" nhau:
  //  - vòng bảng / trận thêm → huỷ;
  //  - sơ đồ → xử cho ô A đi tiếp như một đội đã rút: vào ô trận sau gặp ai thì người đó thắng W.O.
  //    (advance của module match), sơ đồ không bị kẹt một trận mãi không xong.
  const withdrawTeams = async (transaction, auth, t, teams) => {
    const ids = new Set(teams.map((x) => x.id));
    for (const team of teams) {
      await team.update({ withdrawnAt: new Date() }, { transaction });
      await TournamentEntry.update(
        { status: 'withdrawn' },
        { where: { tournamentId: t.id, playerId: [team.player1Id, team.player2Id].filter(Boolean) }, transaction }
      );
    }
    const withdrawn = await ctx.withdrawnTeamIds(transaction, t);
    const list = await matches.listForContext(auth.tenant, 'tournament', t.id, { transaction });
    for (const m of list) {
      if (!['scheduled', 'in_play'].includes(m.status)) continue;
      if (!ids.has(m.teamAId) && !ids.has(m.teamBId)) continue;
      if (!m.teamAId || !m.teamBId) continue; // ô trận sau chưa có đối thủ — xử khi đối thủ vào
      const aOut = withdrawn.has(m.teamAId);
      const bOut = withdrawn.has(m.teamBId);
      if (aOut && bOut) {
        if (m.nextMatchId) await matches.forfeit(transaction, m, 'A', auth.sub, t);
        else await m.update({ status: 'cancelled' }, { transaction });
        continue;
      }
      await matches.forfeit(transaction, m, aOut ? 'B' : 'A', auth.sub, t);
    }
    if (t.status === 'drawn' && list.some((m) => m.status === 'completed')) await t.update({ status: 'in_progress' }, { transaction });
  };

  // Rút: trước bốc thăm → nhường chỗ cho người chờ; sau bốc thăm → cả đội rút, trận
  // chưa đánh thành W.O. cho đối thủ (docs/06 mục 7.4).
  const withdraw = async ({ auth, id, entryId, requestId, self = false }) =>
    sequelize.transaction(async (transaction) => {
      const t = await ctx.load(transaction, auth.tenant, id, { lock: true });
      if (!self) ctx.authorize(auth, t, 'operate'); // khách tự rút: quyền + "đúng là lượt của mình" do selfRegistration kiểm
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
          await withdrawTeams(transaction, auth, t, [team]);
        } else {
          for (const e of group) await e.update({ status: 'withdrawn' }, { transaction });
        }
      }
      await audit.record(transaction, {
        tenant: auth.tenant, actorRef: auth.sub, action: 'tournament.entry_withdrawn', targetType: 'tournament', targetId: t.id,
        after: { entryId, players: group.map((e) => e.playerId), via: self ? 'self' : 'staff' }, requestId
      });
      boardChanged(transaction, t, 'withdrawn');
      return { tournament: t, entries: group };
    });

  // ---------- bốc thăm ----------
  // Người vào bốc thăm. Giải "bốc thăm tại sân" (checkInRequired) chỉ lấy người đã điểm danh; đôi
  // cặp sẵn cần cả hai người — thiếu một là cả cặp vắng (plan 20).
  const presentSplit = (t, entries) => {
    if (!t.checkInRequired) return { present: entries, absent: [] };
    const checked = new Set(entries.filter((e) => e.checkedInAt).map((e) => e.playerId));
    const fixedPairs = t.discipline === 'doubles' && t.pairingMode === 'fixed';
    const ok = (e) => checked.has(e.playerId) && (!fixedPairs || checked.has(e.partnerPlayerId));
    return { present: entries.filter(ok), absent: entries.filter((e) => !ok(e)) };
  };

  const drawInputs = async (tenant, t, transaction) => {
    const registered = await TournamentEntry.findAll({
      where: { tournamentId: t.id, status: 'registered' },
      order: [['registeredAt', 'ASC'], ['id', 'ASC']],
      transaction
    });
    const { present: entries } = presentSplit(t, registered);
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

  const absentEntries = async (t, transaction) =>
    presentSplit(t, await TournamentEntry.findAll({ where: { tournamentId: t.id, status: 'registered' }, order: [['registeredAt', 'ASC'], ['id', 'ASC']], transaction })).absent;

  const hasResults = async (tenant, t, transaction) =>
    (await matches.listForContext(tenant, 'tournament', t.id, { transaction })).some((m) => m.status === 'completed' || m.status === 'in_play');

  const previewDraw = async ({ auth, id, seed }) => {
    const t = await ctx.load(null, auth.tenant, id);
    ctx.authorize(auth, t, 'manage');
    assertAction(t, 'draw');
    if (t.status === 'drawn' && (await hasResults(auth.tenant, t))) throw conflict('HAS_RESULTS', 'Đã có kết quả — không bốc thăm lại được');
    const inputs = await drawInputs(auth.tenant, t);
    const absent = await absentEntries(t);
    const absentPeople = new Map((await players.findByIds(auth.tenant, absent.map((e) => e.playerId))).map((p) => [p.id, p]));
    const minPlayers = t.discipline === 'singles' ? 2 : 4;
    if (inputs.length < minPlayers) {
      throw unprocessable('NOT_ENOUGH_ENTRIES', `Cần ít nhất ${minPlayers} người ${t.checkInRequired ? 'đã điểm danh' : 'đăng ký'} để bốc thăm`);
    }
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
        // Đã đăng ký nhưng chưa điểm danh (giải bốc thăm tại sân) — không vào bốc thăm.
        absent: absent.map((e) => ({ playerId: e.playerId, name: absentPeople.get(e.playerId) ? absentPeople.get(e.playerId).displayName : null })),
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
      { where: { tournamentId: t.id, status: 'waitlisted', waitlistReason: ['draw', 'absent'] }, transaction }
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
      const absent = await absentEntries(t, transaction);
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
      // Vắng lúc bốc thăm tại sân → danh sách chờ (lý do `absent`); bốc lại / mở lại thì về đăng ký.
      for (const e of absent) await e.update({ status: 'waitlisted', waitlistReason: 'absent' }, { transaction });

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

  // ---------- vận hành ngày thi đấu (plan 20) ----------
  // Sân của giải: sửa được tới khi chốt (thêm / bớt sân trong ngày). Không bỏ được sân đang có trận.
  const setCourts = async ({ auth, id, courtRefs, requestId }) =>
    sequelize.transaction(async (transaction) => {
      const t = await ctx.load(transaction, auth.tenant, id, { lock: true });
      ctx.authorize(auth, t, 'manage');
      assertAction(t, 'courts');
      const errors = courtErrors(courtRefs);
      if (errors.length) throw invalid(errors);
      const live = (await matches.listForContext(auth.tenant, 'tournament', t.id, { transaction })).filter((m) => m.status === 'in_play' && m.courtRef);
      const removedBusy = [...new Set(live.map((m) => m.courtRef))].filter((c) => !courtRefs.includes(c));
      if (removedBusy.length) throw conflict('COURT_BUSY', `Sân đang có trận, chưa bỏ ra được: ${removedBusy.join(', ')}`);
      const before = { courtRefs: t.courtRefs, courtCount: t.courtCount };
      await t.update({ courtRefs, courtCount: courtRefs.length }, { transaction });
      await audit.record(transaction, {
        tenant: auth.tenant, actorRef: auth.sub, action: 'tournament.courts_changed', targetType: 'tournament', targetId: t.id, before, after: { courtRefs }, requestId
      });
      boardChanged(transaction, t, 'courts');
      return t;
    });

  // Điểm danh từng người (đôi: mỗi người tự đến). present = false → bỏ điểm danh.
  const checkIn = async ({ auth, id, entryId, present, requestId }) =>
    sequelize.transaction(async (transaction) => {
      const t = await ctx.load(transaction, auth.tenant, id, { lock: true });
      ctx.authorize(auth, t, 'operate');
      assertAction(t, 'checkIn');
      const entry = await TournamentEntry.findOne({ where: { id: entryId, tournamentId: t.id }, transaction });
      if (!entry) throw notFound('Không tìm thấy lượt đăng ký');
      if (entry.status === 'withdrawn') throw conflict('INVALID_STATE', 'Người này đã rút khỏi giải');
      if (present && entry.checkedInAt) return t;
      if (!present && !entry.checkedInAt) return t;
      await entry.update(present ? { checkedInAt: new Date(), checkedInByRef: auth.sub } : { checkedInAt: null, checkedInByRef: null }, { transaction });
      await audit.record(transaction, {
        tenant: auth.tenant, actorRef: auth.sub, action: present ? 'tournament.checked_in' : 'tournament.check_in_undone', targetType: 'tournament', targetId: t.id,
        after: { entryId, playerId: entry.playerId }, requestId
      });
      boardChanged(transaction, t, 'checked_in');
      return t;
    });

  // Đổi đồng đội (đôi cặp sẵn, trước bốc thăm): người cũ rời giải, người mới vào đúng chỗ của cặp
  // (cùng trạng thái, cùng thứ tự đăng ký), kiểm lại điều kiện như lúc đăng ký.
  const changePartner = async ({ auth, id, entryId, partnerPlayerId, requestId }) =>
    sequelize.transaction(async (transaction) => {
      const t = await ctx.load(transaction, auth.tenant, id, { lock: true });
      ctx.authorize(auth, t, 'operate');
      assertAction(t, 'partner');
      if (!(t.discipline === 'doubles' && t.pairingMode === 'fixed')) throw unprocessable('PARTNER_NOT_ALLOWED', 'Chỉ giải đôi cặp đăng ký sẵn mới có đồng đội cố định');
      const entry = await TournamentEntry.findOne({ where: { id: entryId, tournamentId: t.id }, transaction });
      if (!entry) throw notFound('Không tìm thấy lượt đăng ký');
      if (entry.status === 'withdrawn') throw conflict('INVALID_STATE', 'Cặp này đã rút khỏi giải');
      if (!partnerPlayerId) throw unprocessable('PARTNER_REQUIRED', 'Chọn đồng đội mới');
      if (partnerPlayerId === entry.partnerPlayerId) return t;
      const ids = [entry.playerId, partnerPlayerId];
      const people = await players.findByIds(auth.tenant, ids, { transaction });
      const byId = new Map(people.map((p) => [p.id, p]));
      if (!byId.has(partnerPlayerId)) throw notFound('Không tìm thấy người chơi');
      const ratings = await ratingQueries.disciplineRatings(auth.tenant, ids, t.discipline);
      checkPlayer({ tournament: t, player: byId.get(partnerPlayerId), rating: ratings.get(partnerPlayerId) });
      checkPair({ tournament: t, a: byId.get(entry.playerId), b: byId.get(partnerPlayerId), ratingA: ratings.get(entry.playerId), ratingB: ratings.get(partnerPlayerId) });
      const existing = await TournamentEntry.findOne({ where: { tournamentId: t.id, playerId: partnerPlayerId }, transaction });
      if (existing && existing.status !== 'withdrawn') throw conflict('ALREADY_REGISTERED', `${byId.get(partnerPlayerId).displayName} đã đăng ký giải này`);
      const old = await TournamentEntry.findOne({ where: { tournamentId: t.id, playerId: entry.partnerPlayerId }, transaction });
      if (old) await old.update({ status: 'withdrawn', waitlistReason: null, checkedInAt: null, checkedInByRef: null }, { transaction });
      const values = {
        tenantId: auth.tenant, tournamentId: t.id, playerId: partnerPlayerId, partnerPlayerId: entry.playerId, status: entry.status, waitlistReason: entry.waitlistReason,
        ratingSnapshot: ratings.get(partnerPlayerId).rating, pairingRatingSnapshot: ratings.get(partnerPlayerId).pairingRating,
        registeredAt: entry.registeredAt, registeredByRef: auth.sub, registeredVia: 'staff', checkedInAt: null, checkedInByRef: null
      };
      if (existing) await existing.update(values, { transaction });
      else await TournamentEntry.create(values, { transaction });
      await entry.update({ partnerPlayerId }, { transaction });
      await audit.record(transaction, {
        tenant: auth.tenant, actorRef: auth.sub, action: 'tournament.partner_changed', targetType: 'tournament', targetId: t.id,
        before: { partnerPlayerId: old ? old.playerId : null }, after: { entryId, playerId: entry.playerId, partnerPlayerId }, requestId
      });
      return t;
    });

  // Đội vắng sau bốc thăm: chưa đánh trận nào (không tính trận được W.O.) và chưa đủ người điểm danh.
  const absentTeams = async (t, transaction) => {
    const teams = await TournamentTeam.findAll({ where: { tournamentId: t.id, withdrawnAt: null }, order: [['seed', 'ASC']], transaction });
    const checked = new Set(
      (await TournamentEntry.findAll({ where: { tournamentId: t.id, checkedInAt: { [Op.ne]: null } }, attributes: ['playerId'], transaction })).map((e) => e.playerId)
    );
    const list = await matches.listForContext(t.tenantId, 'tournament', t.id, { transaction });
    const played = new Set(
      list.filter((m) => m.status === 'in_play' || (m.status === 'completed' && m.outcome !== 'walkover')).flatMap((m) => [m.teamAId, m.teamBId])
    );
    return teams.filter((x) => !played.has(x.id) && !teamPresent([x.player1Id, x.player2Id].filter(Boolean), checked));
  };

  // "Xử W.O. các đội vắng": teamIds = danh sách BTC đã xem và chọn (bỏ trống = mọi đội vắng).
  const noShows = async ({ auth, id, teamIds, requestId }) =>
    sequelize.transaction(async (transaction) => {
      const t = await ctx.load(transaction, auth.tenant, id, { lock: true });
      ctx.authorize(auth, t, 'operate');
      assertAction(t, 'noShows');
      const absent = await absentTeams(t, transaction);
      let chosen = absent;
      if (teamIds) {
        const ok = new Set(absent.map((x) => x.id));
        const bad = teamIds.filter((x) => !ok.has(x));
        if (bad.length) throw conflict('NOT_ABSENT', 'Có đội đã điểm danh đủ hoặc đã đánh — không xử vắng được', bad.map((x) => ({ field: x, message: 'Không vắng' })));
        chosen = absent.filter((x) => teamIds.includes(x.id));
      }
      if (!chosen.length) throw unprocessable('NOTHING_TO_DO', 'Không có đội nào vắng');
      await withdrawTeams(transaction, auth, t, chosen);
      await audit.record(transaction, {
        tenant: auth.tenant, actorRef: auth.sub, action: 'tournament.no_shows', targetType: 'tournament', targetId: t.id,
        after: { teams: chosen.map((x) => x.id) }, requestId
      });
      boardChanged(transaction, t, 'no_shows');
      return { tournament: t, teamIds: chosen.map((x) => x.id) };
    });

  // Trận kế tiếp (đọc, không khoá): ứng viên cho một sân vừa trống + các sân đang trống của giải.
  const nextMatches = async ({ auth, id }) => {
    const t = await ctx.load(null, auth.tenant, id);
    ctx.authorize(auth, t, 'read');
    const list = await matches.listForContext(auth.tenant, 'tournament', t.id);
    const parts = await matches.participantsOf(list.map((m) => m.id));
    const lastPlayedAt = new Map();
    for (const m of list) {
      if (m.status !== 'completed' || !m.completedAt || m.outcome === 'walkover') continue;
      for (const p of parts.get(m.id)) if (!lastPlayedAt.has(p.playerId) || lastPlayedAt.get(p.playerId) < m.completedAt) lastPlayedAt.set(p.playerId, m.completedAt);
    }
    const busy = await matches.busyPlayers(auth.tenant);
    const busyCourts = new Set([...busy.values()].map((b) => b.courtRef).filter(Boolean));
    // Trận đủ đội nhưng chưa gọi được vì có người đang ở sân (giải này hoặc giải / buổi khác) — để
    // màn hình nói rõ "chờ X đang đánh ở sân Y" thay vì im lặng.
    const blocked = list
      .filter((m) => m.status === 'scheduled' && m.teamAId && m.teamBId)
      .map((m) => ({ matchId: m.id, players: parts.get(m.id).filter((p) => busy.has(p.playerId)).map((p) => ({ id: p.playerId, courtRef: busy.get(p.playerId).courtRef })) }))
      .filter((b) => b.players.length);
    const candidates = pickNextMatches({
      matches: list.map((m) => ({ id: m.id, status: m.status, slotNo: m.slotNo, stage: m.stage, teamIds: [m.teamAId, m.teamBId], players: parts.get(m.id).map((p) => p.playerId) })),
      busy: new Set(busy.keys()),
      lastPlayedAt,
      withdrawn: await ctx.withdrawnTeamIds(null, t),
      now: new Date()
    });
    return {
      tournament: t,
      freeCourts: t.courtRefs ? t.courtRefs.filter((c) => !busyCourts.has(c)) : null,
      candidates,
      blocked,
      byId: new Map(list.map((m) => [m.id, m]))
    };
  };

  // Gọi trận kế tiếp ra sân `courtRef` — đi đúng đường "Gọi ra sân" (kiểm sân / người bận trong
  // transaction của nó). Ứng viên vừa bị người khác gọi mất thì thử ứng viên sau.
  const callNext = async ({ auth, id, courtRef, requestId }) => {
    const t = await ctx.load(null, auth.tenant, id);
    ctx.authorize(auth, t, 'operate');
    assertAction(t, 'callNext');
    const { candidates } = await nextMatches({ auth, id });
    if (!candidates.length) throw unprocessable('NOTHING_TO_CALL', 'Chưa có trận nào gọi được: các trận còn lại đang chờ đội từ trận trước hoặc có người đang đánh');
    for (const c of candidates.slice(0, 5)) {
      try {
        return await matches.callMatch({ auth, matchId: c.id, courtRef, requestId });
      } catch (err) {
        if (!['PLAYER_BUSY', 'INVALID_STATE'].includes(err.code)) throw err;
      }
    }
    throw conflict('NOTHING_TO_CALL', 'Các trận kế tiếp vừa được gọi ở sân khác — tải lại rồi thử lại');
  };

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

  return {
    create, update, open, cancel, register, withdraw, previewDraw, confirmDraw, reopen, addMatch, previewKnockout, confirmKnockout,
    setCourts, checkIn, changePartner, absentTeams, noShows, nextMatches, callNext
  };
};

module.exports = { createTournamentService };
