const { Op } = require('sequelize');
const { round2, mean } = require('../../../shared/numbers');
const { DomainError } = require('../../../shared/domainError');
const { notFound, conflict, unprocessable, forbiddenScope, AppError } = require('../../../platform/http/errors');
const { canAccessOrganizer } = require('../../../platform/http/auth');
const { assertVersion } = require('../../../platform/http/preconditions');
const { fillCourts, newSeed } = require('../../matchmaking').domain;
const { PRESETS, validateScoring } = require('../../match').domain.badmintonScore;
const {
  SESSION_MATCH_WEIGHT, perCourt, discipline, validateCourts, lateCredit, historyFrom, validateAssignments, isManualEdit
} = require('../domain/sessionRules');

// Lệnh của module session (docs/06 mục 8): tạo / sửa buổi, điểm danh (kèm chấm
// nhanh), rời buổi, "Xếp sân trống" (xem trước → xác nhận bản đã đổi tay), đóng buổi
// (tính điểm hệ số 0.5 nếu bật), huỷ buổi.
//
// Thứ tự khoá: BUỔI trước, TRẬN sau — giống giải, và giống module match khi ghi kết
// quả trận giao lưu (khoá ngữ cảnh rồi mới khoá trận).

const FIELDS = ['name', 'startsAt', 'courtRefs', 'format', 'mode', 'scoring', 'rated', 'maxPlayers'];
const pick = (obj) => Object.fromEntries(FIELDS.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));
const PLAYED = new Set(['in_play', 'ended', 'completed']); // đã ra sân → vào lịch sử đồng đội / đối thủ
const DEFAULTS = { format: 'doubles', mode: 'balanced', scoring: '1x21', rated: false };

const createSessionService = ({ models, sequelize, players, ratings, ratingQueries, matches, platform, ctx, signups }) => {
  const { PlaySession, PlaySessionPlayer, SessionSignup } = models;
  const { outbox, audit, realtime } = platform;
  // Màn hình TV của buổi tải lại khi sân / hàng chờ đổi — phát sau commit (plan 19).
  const boardChanged = (transaction, s, reason) =>
    realtime.boardChanged(transaction, { tenant: s.tenantId, contextType: 'session', contextId: s.id, reason });

  const normalize = (body) => {
    const out = pick(body);
    if (out.scoring !== undefined) {
      const scoring = typeof out.scoring === 'string' ? PRESETS[out.scoring] : out.scoring;
      if (!scoring) throw new DomainError('INVALID_SESSION', `Preset không có: ${out.scoring}`, [{ field: 'scoring', message: 'Không có preset này' }]);
      out.scoring = validateScoring(scoring);
    }
    if (out.courtRefs !== undefined) out.courtRefs = validateCourts(out.courtRefs);
    if (out.startsAt !== undefined) out.startsAt = new Date(out.startsAt);
    return out;
  };

  // ---------- trạng thái hiện tại của buổi ----------
  const snapshot = async (tenant, s, transaction) => {
    const list = await matches.listForContext(tenant, 'session', s.id, { transaction });
    const partsMap = await matches.participantsOf(list.map((m) => m.id), { transaction });
    const sidesOf = (m) => {
      const ps = partsMap.get(m.id) || [];
      return { sideA: ps.filter((p) => p.side === 'A').map((p) => p.playerId), sideB: ps.filter((p) => p.side === 'B').map((p) => p.playerId) };
    };
    const live = list.filter((m) => m.status === 'in_play');
    const courtOf = new Map();
    for (const m of live) {
      const { sideA, sideB } = sidesOf(m);
      for (const pid of [...sideA, ...sideB]) courtOf.set(pid, m.courtRef);
    }
    const busy = new Set(live.map((m) => m.courtRef));
    const roster = await PlaySessionPlayer.findAll({ where: { sessionId: s.id }, order: [['joinedAt', 'ASC'], ['id', 'ASC']], transaction });
    return {
      list,
      sidesOf,
      live,
      courtOf,
      roster,
      freeCourts: s.courtRefs.filter((c) => !busy.has(c)),
      busyCourts: busy,
      history: historyFrom(list.filter((m) => PLAYED.has(m.status)).map(sidesOf))
    };
  };

  // Người có mặt và đang rảnh, định dạng của fillCourts. Điểm dùng pairingRating của
  // nội dung buổi (chống giấu trình, docs/03 mục 4).
  const fillInputs = async (tenant, s, snap) => {
    const free = snap.roster.filter((r) => r.status === 'present' && !snap.courtOf.has(r.playerId));
    const rated = await ratingQueries.disciplineRatings(tenant, free.map((r) => r.playerId), discipline(s.format));
    const known = [...rated.values()].map((r) => r.pairingRating);
    const fallback = known.length ? mean(known) : 3;
    return free.map((r) => ({
      id: r.playerId,
      rating: rated.has(r.playerId) ? rated.get(r.playerId).pairingRating : fallback,
      gamesPlayed: r.gamesPlayed + r.gamesCredit,
      // Chưa đánh trận nào trong buổi → không bị kéo lên trước người chờ lâu hơn (plan 18 mục 9).
      newcomer: r.gamesPlayed === 0,
      waitingSince: r.waitingSince,
      joinedAt: r.joinedAt
    }));
  };

  const roundSeed = (s) => `${s.seed}:${s.rounds + 1}`;
  const propose = (s, snap, inputs, seed) =>
    fillCourts({
      players: inputs, courts: s.status === 'open' ? snap.freeCourts : [], format: s.format, mode: s.mode, history: snap.history, seed, now: new Date()
    });

  // Đề xuất cho lượt tới với seed mặc định — CÙNG hàm, cùng dữ liệu, cùng seed với "Xếp sân
  // trống" (xem trước không seed / xác nhận không gửi bản xếp) → màn hình lớn báo đúng người
  // sẽ vào sân. Không có sân trống thì chỉ có thứ tự ưu tiên (`order`), không ai được xếp.
  const nextProposal = async (tenant, s, snap) => {
    const inputs = await fillInputs(tenant, s, snap);
    return { inputs, result: propose(s, snap, inputs, roundSeed(s)) };
  };

  // ---------- tạo / sửa ----------
  const create = async ({ auth, body, requestId }) => {
    if (!canAccessOrganizer(auth, body.organizerRef)) {
      throw new AppError(403, 'FORBIDDEN_ORGANIZER', 'Không được tạo buổi giao lưu cho chi nhánh này');
    }
    const fields = normalize({ ...DEFAULTS, startsAt: new Date().toISOString(), ...body });
    return sequelize.transaction(async (transaction) => {
      const s = await PlaySession.create(
        {
          ...fields, tenantId: auth.tenant, organizerRef: body.organizerRef, seed: body.seed || newSeed(),
          rounds: 0, status: 'open', createdByRef: auth.sub
        },
        { transaction }
      );
      await audit.record(transaction, {
        tenant: auth.tenant, actorRef: auth.sub, action: 'session.created', targetType: 'session', targetId: s.id, after: fields, requestId
      });
      return s;
    });
  };

  const update = async ({ auth, id, body, ifMatch, requestId }) =>
    sequelize.transaction(async (transaction) => {
      const s = await ctx.load(transaction, auth.tenant, id, { lock: true });
      ctx.authorize(auth, s, 'operate');
      ctx.assertOpen(s);
      assertVersion(ifMatch, s.version, { what: 'Buổi giao lưu' });
      const changes = normalize(body);
      const snap = await snapshot(auth.tenant, s, transaction);
      if (changes.format && changes.format !== s.format && snap.list.length) {
        throw conflict('LOCKED_AFTER_MATCHES', 'Buổi đã có trận — không đổi được hình thức Đơn / Đôi');
      }
      if (changes.courtRefs) {
        const removedBusy = [...snap.busyCourts].filter((c) => !changes.courtRefs.includes(c));
        if (removedBusy.length) throw conflict('COURT_BUSY', `Sân đang có trận, chưa bỏ ra được: ${removedBusy.join(', ')}`);
      }
      const before = Object.fromEntries(Object.keys(changes).map((k) => [k, s[k]]));
      await s.update(changes, { transaction });
      // Tăng / bỏ sức chứa → người chờ đăng ký online được lên (plan 27).
      if (changes.maxPlayers !== undefined) await signups.promoteWaiting(transaction, s);
      await audit.record(transaction, {
        tenant: auth.tenant, actorRef: auth.sub, action: 'session.updated', targetType: 'session', targetId: s.id, before, after: changes, requestId
      });
      boardChanged(transaction, s, 'updated');
      return s;
    });

  // ---------- điểm danh / rời buổi ----------
  const checkIn = async ({ auth, id, playerId, quickLevel, requestId }) =>
    sequelize.transaction(async (transaction) => {
      const s = await ctx.load(transaction, auth.tenant, id, { lock: true });
      ctx.authorize(auth, s, 'operate');
      ctx.assertOpen(s);
      const player = await players.requireActive(auth.tenant, playerId, { transaction });
      const disc = discipline(s.format);
      const has = (await ratingQueries.disciplineRatings(auth.tenant, [player.id], disc)).has(player.id);
      let quickAssessed = false;
      if (!has) {
        if (!quickLevel) {
          throw unprocessable('NEEDS_ASSESSMENT', `${player.displayName} chưa có điểm ${disc === 'doubles' ? 'Đôi' : 'Đơn'} — chấm nhanh (quickLevel) hoặc chấm đầy đủ trước`);
        }
        if (!auth.scopes.has('rating:assess')) throw forbiddenScope(['rating:assess']);
        await ratings.quickAssess({ auth, playerId: player.id, level: quickLevel, note: `Chấm nhanh khi điểm danh buổi "${s.name}"`, requestId, transaction });
        quickAssessed = true;
      }
      const roster = await PlaySessionPlayer.findAll({ where: { sessionId: s.id }, transaction });
      const existing = roster.find((r) => r.playerId === player.id);
      if (existing && existing.status === 'present') throw conflict('ALREADY_CHECKED_IN', `${player.displayName} đã điểm danh`);
      // Đang "có mặt" ở buổi khác chưa đóng (thường là buổi trước quên đóng / quên bấm "Rời buổi") →
      // chặn, để một người không bị xếp ra sân ở hai nơi (plan 20). errors[].field = id buổi kia.
      const elsewhere = await PlaySessionPlayer.findAll({ where: { tenantId: auth.tenant, playerId: player.id, status: 'present', sessionId: { [Op.ne]: s.id } }, transaction });
      if (elsewhere.length) {
        const open = await PlaySession.findAll({ where: { id: elsewhere.map((r) => r.sessionId), status: 'open' }, transaction });
        if (open.length) {
          throw conflict(
            'PRESENT_ELSEWHERE',
            `${player.displayName} đang có mặt ở buổi "${open[0].name}" — cho rời buổi đó trước`,
            open.map((o) => ({ field: o.id, message: o.name }))
          );
        }
      }
      const presentEffective = roster.filter((r) => r.status === 'present').map((r) => r.gamesPlayed + r.gamesCredit);
      const now = new Date();
      let row;
      if (existing) {
        const credit = lateCredit({ gamesPlayed: existing.gamesPlayed, currentCredit: existing.gamesCredit, presentEffective });
        row = await existing.update({ status: 'present', leftAt: null, gamesCredit: credit, waitingSince: now }, { transaction });
      } else {
        row = await PlaySessionPlayer.create(
          {
            tenantId: auth.tenant, sessionId: s.id, playerId: player.id, status: 'present', joinedAt: now,
            gamesPlayed: 0, gamesCredit: lateCredit({ presentEffective }), waitingSince: now, checkedInByRef: auth.sub
          },
          { transaction }
        );
      }
      await audit.record(transaction, {
        tenant: auth.tenant, actorRef: auth.sub, action: existing ? 'session.player_rejoined' : 'session.player_joined', targetType: 'session', targetId: s.id,
        after: { playerId: player.id, gamesCredit: row.gamesCredit, quickLevel: quickAssessed ? quickLevel : null }, requestId
      });
      await signups.markAttended(transaction, s, player.id); // đã đăng ký online thì thành "đã đến" (plan 27)
      boardChanged(transaction, s, 'checked_in');
      return { session: s, row, quickAssessed };
    });

  const leave = async ({ auth, id, playerId, requestId }) =>
    sequelize.transaction(async (transaction) => {
      const s = await ctx.load(transaction, auth.tenant, id, { lock: true });
      ctx.authorize(auth, s, 'operate');
      ctx.assertOpen(s);
      const row = await PlaySessionPlayer.findOne({ where: { sessionId: s.id, playerId }, transaction });
      if (!row) throw notFound('Người chơi không có trong buổi này');
      if (row.status === 'left') return { session: s, row };
      const snap = await snapshot(auth.tenant, s, transaction);
      if (snap.courtOf.has(playerId)) {
        throw conflict('PLAYER_ON_COURT', `Đang đánh ở sân ${snap.courtOf.get(playerId)} — nhập tỉ số hoặc kết thúc trận trước`);
      }
      await row.update({ status: 'left', leftAt: new Date(), waitingSince: null }, { transaction });
      await signups.promoteWaiting(transaction, s); // nhường chỗ cho người chờ đăng ký online (plan 27)
      await audit.record(transaction, {
        tenant: auth.tenant, actorRef: auth.sub, action: 'session.player_left', targetType: 'session', targetId: s.id, after: { playerId }, requestId
      });
      boardChanged(transaction, s, 'left');
      return { session: s, row };
    });

  // ---------- xếp sân trống ----------
  const previewFill = async ({ auth, id, seed }) => {
    const s = await ctx.load(null, auth.tenant, id);
    ctx.authorize(auth, s, 'operate');
    ctx.assertOpen(s);
    const snap = await snapshot(auth.tenant, s);
    const inputs = await fillInputs(auth.tenant, s, snap);
    const result = propose(s, snap, inputs, seed || roundSeed(s));
    return { session: s, snap, inputs, result };
  };

  const confirmFill = async ({ auth, id, body, requestId }) =>
    sequelize.transaction(async (transaction) => {
      const s = await ctx.load(transaction, auth.tenant, id, { lock: true });
      ctx.authorize(auth, s, 'operate');
      ctx.assertOpen(s);
      const snap = await snapshot(auth.tenant, s, transaction);
      const inputs = await fillInputs(auth.tenant, s, snap);
      const seed = body.seed || roundSeed(s);
      const proposed = propose(s, snap, inputs, seed);
      let chosen = proposed.assignments;
      if (body.assignments) {
        validateAssignments({ assignments: body.assignments, format: s.format });
        // Bản xem trước đã cũ: sân vừa được xếp / người vừa ra sân hoặc rời buổi.
        const free = new Set(inputs.map((p) => p.id));
        const freeCourts = new Set(snap.freeCourts);
        const errors = [
          ...body.assignments.filter((a) => !freeCourts.has(a.court)).map((a) => ({ field: 'court', message: `Sân ${a.court} không trống hoặc không thuộc buổi` })),
          ...body.assignments.flatMap((a) => [...a.sideA, ...a.sideB]).filter((pid) => !free.has(pid)).map((pid) => ({ field: pid, message: 'Người này không có mặt hoặc đang ở sân khác' }))
        ];
        if (errors.length) throw conflict('FILL_STALE', 'Sân hoặc người chơi không còn rảnh — xem trước lại', errors);
        chosen = body.assignments.map((a) => ({ court: a.court, sideA: a.sideA, sideB: a.sideB }));
      }
      if (!chosen.length) {
        throw unprocessable('NOTHING_TO_FILL', snap.freeCourts.length ? `Chưa đủ ${perCourt(s.format)} người rảnh để xếp một sân` : 'Không có sân trống');
      }
      const round = s.rounds + 1;
      const now = new Date();
      const idOf = await matches.createMatches(transaction, {
        tenant: auth.tenant,
        contextType: 'session',
        contextId: s.id,
        rows: chosen.map((a, i) => ({
          key: `C${i}`,
          discipline: discipline(s.format),
          stage: 'session',
          label: `Lượt ${round}`,
          roundNo: round,
          teamA: { teamId: null, players: a.sideA },
          teamB: { teamId: null, players: a.sideB },
          scoring: s.scoring,
          ratingWeight: SESSION_MATCH_WEIGHT,
          status: 'in_play',
          courtRef: a.court,
          calledAt: now
        }))
      });
      const onCourt = chosen.flatMap((a) => [...a.sideA, ...a.sideB]);
      await PlaySessionPlayer.increment('gamesPlayed', { by: 1, where: { sessionId: s.id, playerId: onCourt }, transaction });
      await PlaySessionPlayer.update({ waitingSince: null }, { where: { sessionId: s.id, playerId: onCourt }, transaction });
      const manualEdits = Boolean(body.assignments) && isManualEdit(proposed.assignments, chosen);
      await s.update({ rounds: round }, { transaction });
      await audit.record(transaction, {
        tenant: auth.tenant, actorRef: auth.sub, action: 'session.courts_filled', targetType: 'session', targetId: s.id,
        after: { round, seed, courts: chosen.map((a) => a.court), manualEdits }, requestId
      });
      boardChanged(transaction, s, 'filled');
      return { session: s, round, seed, manualEdits, matchIds: chosen.map((a, i) => idOf.get(`C${i}`)) };
    });

  // Trận giao lưu đổi trạng thái (module match gọi qua hook của ngữ cảnh):
  //  - rời sân (có tỉ số / xong không tỉ số / huỷ) → về hàng chờ từ lúc này;
  //  - trận bị huỷ → không tính là đã đánh.
  const onMatchStatus = async (transaction, { ctx: s, match, from, to }) => {
    const ids = ((await matches.participantsOf([match.id], { transaction })).get(match.id) || []).map((p) => p.playerId);
    if (!ids.length) return;
    if (from === 'in_play') {
      await PlaySessionPlayer.update({ waitingSince: new Date() }, { where: { sessionId: s.id, playerId: ids, status: 'present' }, transaction });
    }
    if (to === 'cancelled') {
      await PlaySessionPlayer.decrement('gamesPlayed', { by: 1, where: { sessionId: s.id, playerId: ids, gamesPlayed: { [Op.gt]: 0 } }, transaction });
    }
  };

  // ---------- đóng / huỷ buổi ----------
  const closeOutcome = async (tenant, s, transaction) => {
    const list = await matches.listForContext(tenant, 'session', s.id, { transaction });
    return {
      list,
      unscored: list.filter((m) => m.status !== 'completed' && m.status !== 'cancelled'),
      completed: list.filter((m) => m.status === 'completed')
    };
  };

  const changeViews = async (tenant, changes, transaction) => {
    const people = new Map((await players.findByIds(tenant, changes.map((c) => c.playerId), { transaction })).map((p) => [p.id, p]));
    return changes.map((c) => ({
      playerId: c.playerId, name: people.get(c.playerId) ? people.get(c.playerId).displayName : null,
      before: round2(c.before), after: round2(c.after), delta: c.delta, matches: c.ratedMatchesAdded
    }));
  };

  const previewClose = async ({ auth, id }) => {
    const s = await ctx.load(null, auth.tenant, id);
    ctx.authorize(auth, s, 'read');
    ctx.assertOpen(s);
    const o = await closeOutcome(auth.tenant, s);
    let ratingChanges = [];
    if (s.rated && o.completed.length) {
      const engine = await matches.periodMatches(auth.tenant, 'session', s.id);
      ratingChanges = await changeViews(auth.tenant, (await ratings.previewPeriod({ tenant: auth.tenant, discipline: discipline(s.format), matches: engine })).changes);
    }
    return { session: s, result: { rated: s.rated, completedMatches: o.completed.length, unscoredMatches: o.unscored.length, ratingChanges } };
  };

  const close = async ({ auth, id, requestId }) =>
    sequelize.transaction(async (transaction) => {
      const s = await ctx.load(transaction, auth.tenant, id, { lock: true });
      ctx.authorize(auth, s, 'operate');
      ctx.assertOpen(s);
      const o = await closeOutcome(auth.tenant, s, transaction);
      // Trận chưa có tỉ số (đang đánh / xong không tỉ số) → huỷ: không tính điểm, không vào thống kê.
      for (const m of o.unscored) await m.update({ status: 'cancelled' }, { transaction });
      const disc = discipline(s.format);
      let changes = [];
      if (s.rated && o.completed.length) {
        const engine = await matches.periodMatches(auth.tenant, 'session', s.id, { transaction });
        changes = (await ratings.applyPeriod(transaction, {
          tenant: auth.tenant, discipline: disc, contextType: 'session', contextId: s.id, matches: engine, actorRef: auth.sub
        })).changes;
      }
      await matches.markCounted(transaction, { tenant: auth.tenant, contextType: 'session', contextId: s.id, counted: true });
      const parts = await matches.participantsOf(o.completed.map((m) => m.id), { transaction });
      const playerIds = [...new Set([...parts.values()].flat().map((p) => p.playerId))];
      await matches.rebuildStats(transaction, { tenant: auth.tenant, playerIds, discipline: disc, context: 'session' });
      await s.update({ status: 'closed', closedAt: new Date() }, { transaction });
      await outbox.add(transaction, {
        type: 'competition.session.closed',
        tenant: auth.tenant,
        aggregateType: 'session',
        aggregateId: s.id,
        data: {
          sessionId: s.id,
          organizerRef: s.organizerRef,
          rated: s.rated,
          matches: o.completed.length,
          ratingChanges: changes.map((c) => ({ playerId: c.playerId, discipline: disc, before: c.before, after: c.after }))
        }
      });
      await audit.record(transaction, {
        tenant: auth.tenant, actorRef: auth.sub, action: 'session.closed', targetType: 'session', targetId: s.id,
        after: { completed: o.completed.length, cancelled: o.unscored.length, ratingChanges: changes.length }, requestId
      });
      boardChanged(transaction, s, 'closed');
      return {
        session: s,
        result: { rated: s.rated, completedMatches: o.completed.length, unscoredMatches: o.unscored.length, ratingChanges: await changeViews(auth.tenant, changes, transaction) }
      };
    });

  const cancel = async ({ auth, id, requestId }) =>
    sequelize.transaction(async (transaction) => {
      const s = await ctx.load(transaction, auth.tenant, id, { lock: true });
      ctx.authorize(auth, s, 'operate');
      ctx.assertOpen(s);
      const o = await closeOutcome(auth.tenant, s, transaction);
      for (const m of o.unscored) await m.update({ status: 'cancelled' }, { transaction });
      await s.update({ status: 'cancelled', closedAt: new Date() }, { transaction });
      await audit.record(transaction, {
        tenant: auth.tenant, actorRef: auth.sub, action: 'session.cancelled', targetType: 'session', targetId: s.id,
        after: { cancelledMatches: o.unscored.length }, requestId
      });
      boardChanged(transaction, s, 'cancelled');
      return s;
    });

  // ---------- gộp hồ sơ (docs/05 mục 4) ----------
  // Nguồn và đích cùng ĐANG có mặt trong một buổi chưa đóng → 409 MERGE_CONFLICT (cho
  // một bên rời buổi trước). Còn lại gộp hai dòng điểm danh làm một.
  const mergeHandler = async ({ tenant, target, source, transaction }) => {
    const rows = await PlaySessionPlayer.findAll({ where: { tenantId: tenant, playerId: [target.id, source.id] }, transaction });
    let sessions = 0;
    for (const src of rows.filter((r) => r.playerId === source.id)) {
      sessions += 1;
      const tgt = rows.find((r) => r.playerId === target.id && r.sessionId === src.sessionId);
      if (!tgt) {
        await src.update({ playerId: target.id }, { transaction });
        continue;
      }
      const session = await PlaySession.findOne({ where: { id: src.sessionId }, transaction });
      if (session.status === 'open' && src.status === 'present' && tgt.status === 'present') {
        throw conflict('MERGE_CONFLICT', `Hai hồ sơ cùng đang có mặt ở buổi "${session.name}" — cho một bên rời buổi trước`);
      }
      const present = [src, tgt].find((r) => r.status === 'present');
      await tgt.update(
        {
          status: present ? 'present' : 'left',
          joinedAt: new Date(Math.min(new Date(src.joinedAt), new Date(tgt.joinedAt))),
          leftAt: present ? null : new Date(Math.max(new Date(src.leftAt || 0), new Date(tgt.leftAt || 0))),
          gamesPlayed: src.gamesPlayed + tgt.gamesPlayed,
          gamesCredit: Math.max(src.gamesCredit, tgt.gamesCredit),
          waitingSince: present ? present.waitingSince : null
        },
        { transaction }
      );
      await src.destroy({ transaction });
    }
    // Đăng ký online (plan 27): hai hồ sơ cùng đăng ký một buổi → giữ bản "đi xa" hơn (đã đến > giữ chỗ > đang chờ > đã huỷ).
    const sigs = await SessionSignup.findAll({ where: { tenantId: tenant, playerId: [target.id, source.id] }, transaction });
    const strength = { attended: 3, registered: 2, waitlisted: 1, cancelled: 0 };
    for (const src of sigs.filter((r) => r.playerId === source.id)) {
      const tgt = sigs.find((r) => r.playerId === target.id && r.sessionId === src.sessionId);
      if (!tgt) {
        await src.update({ playerId: target.id }, { transaction });
        continue;
      }
      if (strength[src.status] > strength[tgt.status]) await tgt.update({ status: src.status, signedUpAt: src.signedUpAt }, { transaction });
      await src.destroy({ transaction });
    }
    return { sessions };
  };

  return { create, update, checkIn, leave, previewFill, confirmFill, onMatchStatus, previewClose, close, cancel, mergeHandler, snapshot, nextProposal };
};

module.exports = { createSessionService };
