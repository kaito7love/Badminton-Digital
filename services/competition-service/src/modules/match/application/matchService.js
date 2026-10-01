const { Op } = require('sequelize');
const { newId } = require('../../../platform/db/ids');
const { AppError, notFound, conflict } = require('../../../platform/http/errors');
const { assertVersion } = require('../../../platform/http/preconditions');
const { validateResult } = require('../domain/badmintonScore');
const { linesForMatch, accumulate } = require('../domain/matchStats');
const { liveView } = require('./liveView');

// Trận đấu chung cho giải và buổi giao lưu (docs/06 mục 1). Module match KHÔNG biết
// "giải" là gì: ngữ cảnh (tournament / session) đăng ký một handler lúc lắp ráp:
//   load(tx, tenant, contextId, { lock })         → đối tượng ngữ cảnh
//   authorize(auth, ctx, 'read'|'operate'|'manage') → ném lỗi nếu không được
//   assertCanRecord(ctx, match)                    → ngữ cảnh còn cho ghi kết quả không
//   afterResult(tx, { ctx, match, auth })          → vd giải chuyển drawn → in_progress
//   withdrawnTeamIds(tx, ctx)                      → đội đã rút (tự xử W.O. khi vào sơ đồ)
//   allowEndWithoutResult                          → cho "xong, không nhập tỉ số" (giao lưu)
//   afterStatusChange(tx, { ctx, match, from, to }) → vd buổi giao lưu nhả người về hàng chờ

const iso = (d) => (d ? new Date(d).toISOString() : null);
const hasBothSides = (parts) => parts.some((p) => p.side === 'A') && parts.some((p) => p.side === 'B');

const createMatchService = ({ models, sequelize, players, platform }) => {
  const { Match, MatchParticipant, MatchLiveScore } = models;
  const { outbox, audit, realtime } = platform;
  const contexts = new Map();

  // Màn hình TV của ngữ cảnh (giải / buổi) tải lại khi trận đổi trạng thái — phát sau commit.
  const notifyBoard = (transaction, match, reason) =>
    realtime.boardChanged(transaction, { tenant: match.tenantId, contextType: match.contextType, contextId: match.contextId, reason });

  const registerContext = (type, handler) => contexts.set(type, handler);
  const handlerFor = (match) => {
    const h = contexts.get(match.contextType);
    if (!h) throw new Error(`Chưa đăng ký ngữ cảnh ${match.contextType}`);
    return h;
  };

  const participantsOf = async (matchIds, { transaction } = {}) => {
    const out = new Map(matchIds.map((id) => [id, []]));
    if (!matchIds.length) return out;
    const rows = await MatchParticipant.findAll({ where: { matchId: matchIds }, order: [['side', 'ASC'], ['createdAt', 'ASC'], ['id', 'ASC']], transaction });
    for (const r of rows) out.get(r.matchId).push({ side: r.side, playerId: r.playerId });
    return out;
  };

  const teamOfSide = (match, parts, side) => ({
    teamId: side === 'A' ? match.teamAId : match.teamBId,
    players: parts.filter((p) => p.side === side).map((p) => p.playerId)
  });

  // rows: [{ key, discipline, stage, label, groupNo, roundNo, slotNo, bracketPos, teamA, teamB,
  //          scoring, ratingWeight, nextKey, nextSlot, loserNextKey, loserNextSlot,
  //          status?, courtRef?, calledAt? }]   (teamA/B = { teamId|null, players })
  const createMatches = async (transaction, { tenant, contextType, contextId, rows }) => {
    const idOf = new Map(rows.map((r) => [r.key, newId()]));
    const matchRows = rows.map((r) => ({
      id: idOf.get(r.key),
      tenantId: tenant,
      contextType,
      contextId,
      discipline: r.discipline,
      stage: r.stage,
      label: r.label || null,
      groupNo: r.groupNo ?? null,
      roundNo: r.roundNo ?? null,
      slotNo: r.slotNo ?? null,
      bracketPos: r.bracketPos ?? null,
      nextMatchId: r.nextKey ? idOf.get(r.nextKey) : null,
      nextSlot: r.nextSlot || null,
      loserNextMatchId: r.loserNextKey ? idOf.get(r.loserNextKey) : null,
      loserNextSlot: r.loserNextSlot || null,
      teamAId: r.teamA ? r.teamA.teamId : null,
      teamBId: r.teamB ? r.teamB.teamId : null,
      scoring: r.scoring,
      ratingWeight: r.ratingWeight ?? 1,
      status: r.status || 'scheduled',
      courtRef: r.courtRef || null,
      calledAt: r.calledAt || null
    }));
    if (matchRows.length) await Match.bulkCreate(matchRows, { transaction });
    const parts = [];
    rows.forEach((r) => {
      for (const [side, team] of [['A', r.teamA], ['B', r.teamB]]) {
        if (team) for (const playerId of team.players) parts.push({ id: newId(), tenantId: tenant, matchId: idOf.get(r.key), side, playerId });
      }
    });
    if (parts.length) await MatchParticipant.bulkCreate(parts, { transaction });
    return idOf;
  };

  const setSide = async (transaction, match, side, team) => {
    await MatchParticipant.destroy({ where: { matchId: match.id, side }, transaction });
    if (team && team.players.length) {
      await MatchParticipant.bulkCreate(
        team.players.map((playerId) => ({ id: newId(), tenantId: match.tenantId, matchId: match.id, side, playerId })),
        { transaction }
      );
    }
    await match.update({ [side === 'A' ? 'teamAId' : 'teamBId']: team ? team.teamId : null }, { transaction });
  };

  const emitCompleted = async (transaction, match, parts) =>
    outbox.add(transaction, {
      type: 'competition.match.completed',
      tenant: match.tenantId,
      aggregateType: match.contextType,
      aggregateId: match.contextId,
      data: {
        matchId: match.id,
        contextType: match.contextType,
        contextId: match.contextId,
        sides: { A: teamOfSide(match, parts, 'A').players, B: teamOfSide(match, parts, 'B').players },
        games: match.games || [],
        outcome: match.outcome,
        winnerSide: match.winnerSide
      }
    });

  // Xử thua (W.O.) một trận chưa đánh — đội còn lại thắng.
  const forfeit = async (transaction, match, winnerSide, actorRef, ctx) => {
    if (match.status === 'completed' || match.status === 'cancelled') return;
    const parts = (await participantsOf([match.id], { transaction })).get(match.id);
    await match.update(
      { games: [], outcome: 'walkover', winnerSide, status: 'completed', completedAt: new Date(), recordedByRef: actorRef },
      { transaction }
    );
    await emitCompleted(transaction, match, parts);
    await advance(transaction, match, parts, ctx, actorRef);
    notifyBoard(transaction, match, 'result');
  };

  // Người thắng (và người thua nếu có trận tranh hạng 3) tự vào ô của trận sau.
  const advance = async (transaction, match, parts, ctx, actorRef) => {
    const winner = match.winnerSide;
    const loser = winner === 'A' ? 'B' : 'A';
    const handler = handlerFor(match);
    for (const [nextId, slot, side] of [[match.nextMatchId, match.nextSlot, winner], [match.loserNextMatchId, match.loserNextSlot, loser]]) {
      if (!nextId) continue;
      const next = await Match.findOne({ where: { id: nextId }, transaction, lock: transaction.LOCK.UPDATE });
      await setSide(transaction, next, slot, teamOfSide(match, parts, side));
      // Đội còn lại của trận sau đã rút → xử W.O. ngay khi đủ hai đội.
      if (next.teamAId && next.teamBId && handler.withdrawnTeamIds) {
        const withdrawn = await handler.withdrawnTeamIds(transaction, ctx);
        const aOut = withdrawn.has(next.teamAId);
        const bOut = withdrawn.has(next.teamBId);
        if (aOut !== bOut) await forfeit(transaction, next, aOut ? 'B' : 'A', actorRef, ctx);
      }
    }
  };

  // Thứ tự khoá: NGỮ CẢNH (giải) trước, TRẬN sau — cùng thứ tự với rút lui / chốt giải
  // để không deadlock.
  const loadForAction = async (transaction, auth, matchId, action) => {
    const found = await Match.findOne({ where: { id: matchId, tenantId: auth.tenant }, transaction });
    if (!found) throw notFound('Không tìm thấy trận');
    const handler = handlerFor(found);
    const ctx = await handler.load(transaction, auth.tenant, found.contextId, { lock: Boolean(transaction) });
    handler.authorize(auth, ctx, action);
    const match = transaction ? await Match.findOne({ where: { id: matchId }, transaction, lock: transaction.LOCK.UPDATE }) : found;
    return { match, handler, ctx };
  };

  // Ghi kết quả — chung cho "Nhập tỉ số" và "Xác nhận" từ bấm điểm trực tiếp (via = 'live').
  // Người gọi đã khoá ngữ cảnh + trận, đã kiểm quyền và assertCanRecord.
  const applyResult = async (transaction, { auth, match, handler, ctx, body, requestId, via = 'manual' }) => {
    if (match.status === 'cancelled') throw conflict('INVALID_STATE', 'Trận đã huỷ');
    const parts = (await participantsOf([match.id], { transaction })).get(match.id);
    if (!hasBothSides(parts)) throw conflict('TEAMS_NOT_SET', 'Trận chưa đủ hai đội');
    const result = validateResult(body, match.scoring);
    const before = { status: match.status, games: match.games, outcome: match.outcome, winnerSide: match.winnerSide };

    // Sửa kết quả làm đổi người thắng: trận sau chưa bắt đầu thì đổi lại ô, đã bắt đầu thì chặn.
    if (match.status === 'completed' && match.winnerSide !== result.winnerSide) {
      for (const nextId of [match.nextMatchId, match.loserNextMatchId]) {
        if (!nextId) continue;
        const next = await Match.findOne({ where: { id: nextId }, transaction, lock: transaction.LOCK.UPDATE });
        if (next.status === 'in_play' || next.status === 'completed') {
          throw conflict('NEXT_MATCH_STARTED', 'Trận sau đã bắt đầu — không đổi được người thắng (huỷ kết quả trận sau trước)');
        }
      }
    }
    await match.update(
      {
        games: result.games, outcome: result.outcome, winnerSide: result.winnerSide, status: 'completed',
        // Nhập tỉ số sau khi đã bấm "xong" thì giữ giờ kết thúc thật.
        completedAt: match.status === 'ended' ? match.completedAt : new Date(), recordedByRef: auth.sub
      },
      { transaction }
    );
    await advance(transaction, match, parts, ctx, auth.sub);
    await audit.record(transaction, {
      tenant: auth.tenant, actorRef: auth.sub, action: before.status === 'completed' ? 'match.result_corrected' : 'match.result_recorded',
      targetType: 'match', targetId: match.id, before,
      after: { games: result.games, outcome: result.outcome, winnerSide: result.winnerSide, ...(via === 'live' ? { via } : {}) },
      requestId
    });
    await emitCompleted(transaction, match, parts);
    await handler.afterResult(transaction, { ctx, match, auth });
    await statusChanged(transaction, handler, { ctx, match, from: before.status, to: 'completed' });
    notifyBoard(transaction, match, 'result');
    return match;
  };

  const recordResult = async ({ auth, matchId, body, ifMatch, requestId }) =>
    sequelize.transaction(async (transaction) => {
      const { match, handler, ctx } = await loadForAction(transaction, auth, matchId, 'operate');
      handler.assertCanRecord(ctx, match);
      assertVersion(ifMatch, match.version, { what: 'Trận' });
      return applyResult(transaction, { auth, match, handler, ctx, body, requestId });
    });

  const statusChanged = async (transaction, handler, change) => {
    if (handler.afterStatusChange && change.from !== change.to) await handler.afterStatusChange(transaction, change);
  };

  const callMatch = async ({ auth, matchId, courtRef, requestId }) =>
    sequelize.transaction(async (transaction) => {
      const { match, handler, ctx } = await loadForAction(transaction, auth, matchId, 'operate');
      handler.assertCanRecord(ctx, match);
      if (match.status !== 'scheduled') throw conflict('INVALID_STATE', 'Chỉ gọi ra sân được trận đang chờ');
      const parts = (await participantsOf([match.id], { transaction })).get(match.id);
      if (!hasBothSides(parts)) throw conflict('TEAMS_NOT_SET', 'Trận chưa đủ hai đội');
      await match.update({ status: 'in_play', courtRef: courtRef || null, calledAt: new Date() }, { transaction });
      await audit.record(transaction, {
        tenant: auth.tenant, actorRef: auth.sub, action: 'match.called', targetType: 'match', targetId: match.id, after: { courtRef }, requestId
      });
      notifyBoard(transaction, match, 'called');
      return match;
    });

  const cancelMatch = async ({ auth, matchId, requestId }) =>
    sequelize.transaction(async (transaction) => {
      const { match, handler, ctx } = await loadForAction(transaction, auth, matchId, 'manage');
      handler.assertCanRecord(ctx, match);
      if (match.status === 'completed') throw conflict('INVALID_STATE', 'Trận đã có kết quả — không huỷ được');
      if (match.status === 'cancelled') return match;
      if (match.nextMatchId) throw conflict('INVALID_STATE', 'Trận thuộc sơ đồ loại trực tiếp — không huỷ được, hãy xử W.O.');
      const from = match.status;
      await match.update({ status: 'cancelled' }, { transaction });
      await audit.record(transaction, {
        tenant: auth.tenant, actorRef: auth.sub, action: 'match.cancelled', targetType: 'match', targetId: match.id, requestId
      });
      await statusChanged(transaction, handler, { ctx, match, from, to: 'cancelled' });
      notifyBoard(transaction, match, 'cancelled');
      return match;
    });

  // "Xong, không nhập tỉ số" — chỉ ngữ cảnh cho phép (buổi giao lưu). Trận vẫn tính là
  // đã đánh (lịch sử đồng đội / đối thủ), không vào điểm trình / thống kê.
  const endMatch = async ({ auth, matchId, requestId }) =>
    sequelize.transaction(async (transaction) => {
      const { match, handler, ctx } = await loadForAction(transaction, auth, matchId, 'operate');
      if (!handler.allowEndWithoutResult) throw conflict('RESULT_REQUIRED', 'Trận này phải có kết quả — hãy nhập tỉ số hoặc xử W.O.');
      handler.assertCanRecord(ctx, match);
      if (match.status !== 'in_play') throw conflict('INVALID_STATE', 'Chỉ kết thúc được trận đang đánh');
      await match.update({ status: 'ended', completedAt: new Date(), recordedByRef: auth.sub }, { transaction });
      await audit.record(transaction, {
        tenant: auth.tenant, actorRef: auth.sub, action: 'match.ended', targetType: 'match', targetId: match.id, requestId
      });
      await statusChanged(transaction, handler, { ctx, match, from: 'in_play', to: 'ended' });
      notifyBoard(transaction, match, 'ended');
      return match;
    });

  // --- Đọc ---
  const namesFor = async (tenant, partsList) => {
    const ids = [...new Set(partsList.flatMap((ps) => ps.map((p) => p.playerId)))];
    return new Map((await players.findByIds(tenant, ids)).map((p) => [p.id, p]));
  };

  const views = async (tenant, matches) => {
    const partsMap = await participantsOf(matches.map((m) => m.id));
    const people = await namesFor(tenant, [...partsMap.values()]);
    // Tỉ số đang bấm (null nếu chưa ai bấm điểm trận này) — màn hình lớn có sẵn tỉ số từng sân.
    const liveRows = matches.length ? await MatchLiveScore.findAll({ where: { matchId: matches.map((m) => m.id) } }) : [];
    const liveOf = new Map(liveRows.map((r) => [r.matchId, r]));
    // Trận giao lưu không có đội của giải (teamId null) nhưng vẫn có người.
    const team = (m, parts, side) => {
      const teamId = side === 'A' ? m.teamAId : m.teamBId;
      if (!teamId && !parts.some((p) => p.side === side)) return null;
      return {
        teamId: teamId || null,
        players: parts.filter((p) => p.side === side).map((p) => ({ id: p.playerId, name: people.get(p.playerId) ? people.get(p.playerId).displayName : null }))
      };
    };
    return matches.map((m) => {
      const parts = partsMap.get(m.id) || [];
      return {
        id: m.id,
        contextType: m.contextType,
        contextId: m.contextId,
        discipline: m.discipline,
        stage: m.stage,
        label: m.label ?? null,
        groupNo: m.groupNo ?? null,
        roundNo: m.roundNo ?? null,
        slotNo: m.slotNo ?? null,
        bracketPos: m.bracketPos ?? null,
        nextMatchId: m.nextMatchId ?? null,
        teamA: team(m, parts, 'A'),
        teamB: team(m, parts, 'B'),
        scoring: m.scoring,
        games: m.games || [],
        outcome: m.outcome ?? null,
        winnerSide: m.winnerSide ?? null,
        status: m.status,
        courtRef: m.courtRef ?? null,
        calledAt: iso(m.calledAt),
        completedAt: iso(m.completedAt),
        live: liveOf.has(m.id) ? liveView(liveOf.get(m.id), m.scoring) : null,
        version: m.version
      };
    });
  };

  // Token "chỉ bấm điểm" của người chơi (scope match:score + claim player) chỉ dùng được cho
  // trận mình đang đánh. Không có scope đó → false (để người gọi báo lỗi quyền như thường).
  const assertParticipant = async (transaction, auth, match) => {
    if (!auth.scopes.has('match:score') || !auth.player) return false;
    const me = await players.findByRef(auth.tenant, auth.player, { transaction });
    const parts = (await participantsOf([match.id], { transaction })).get(match.id);
    if (me && parts.some((p) => p.playerId === me.id)) return true;
    throw new AppError(403, 'NOT_A_PARTICIPANT', 'Chỉ người chơi trong trận được bấm điểm / xem trận này');
  };

  // Xem một trận: quyền đọc của ngữ cảnh, hoặc người chơi trong trận đang bấm điểm.
  const getForRead = async (auth, matchId) => {
    const match = await Match.findOne({ where: { id: matchId, tenantId: auth.tenant } });
    if (!match) throw notFound('Không tìm thấy trận');
    const handler = handlerFor(match);
    const ctx = await handler.load(null, auth.tenant, match.contextId);
    try {
      handler.authorize(auth, ctx, 'read');
    } catch (err) {
      if (!(await assertParticipant(null, auth, match))) throw err;
    }
    return match;
  };

  const listForContext = (tenant, contextType, contextId, { transaction } = {}) =>
    Match.findAll({
      where: { tenantId: tenant, contextType, contextId },
      order: [['stage', 'ASC'], ['slotNo', 'ASC'], ['roundNo', 'ASC'], ['groupNo', 'ASC'], ['bracketPos', 'ASC'], ['id', 'ASC']],
      transaction
    });

  const deleteForContext = async (transaction, tenant, contextType, contextId) => {
    const ids = (await Match.findAll({ where: { tenantId: tenant, contextType, contextId }, attributes: ['id'], transaction })).map((m) => m.id);
    if (ids.length) {
      await MatchParticipant.destroy({ where: { matchId: ids }, transaction });
      await Match.destroy({ where: { id: ids }, transaction });
    }
  };

  // Trận đã xong của một kỳ, định dạng của engine điểm trình.
  const periodMatches = async (tenant, contextType, contextId, { transaction } = {}) => {
    const matches = await Match.findAll({ where: { tenantId: tenant, contextType, contextId, status: 'completed' }, transaction });
    const partsMap = await participantsOf(matches.map((m) => m.id), { transaction });
    return matches.map((m) => {
      const parts = partsMap.get(m.id);
      return {
        matchId: m.id,
        sideA: parts.filter((p) => p.side === 'A').map((p) => p.playerId),
        sideB: parts.filter((p) => p.side === 'B').map((p) => p.playerId),
        games: m.games || [],
        outcome: m.outcome,
        winnerSide: m.winnerSide,
        weight: Number(m.ratingWeight),
        completedAt: m.completedAt
      };
    });
  };

  const markCounted = (transaction, { tenant, contextType, contextId, counted }) =>
    Match.update({ counted }, { where: { tenantId: tenant, contextType, contextId }, transaction });

  // Dựng lại cột thống kê từ trận (nguồn sự thật) cho một nhóm người, một nội dung.
  const rebuildStats = async (transaction, { tenant, playerIds, discipline, context }) => {
    if (!playerIds.length) return;
    const mine = await MatchParticipant.findAll({ where: { tenantId: tenant, playerId: playerIds }, transaction });
    const matchIds = [...new Set(mine.map((p) => p.matchId))];
    const matches = matchIds.length
      ? await Match.findAll({ where: { id: matchIds, counted: true, contextType: context, discipline, status: 'completed' }, transaction })
      : [];
    const byMatch = new Map(matches.map((m) => [m.id, m]));
    const lines = new Map(playerIds.map((id) => [id, []]));
    for (const p of mine) {
      const m = byMatch.get(p.matchId);
      if (!m) continue;
      lines.get(p.playerId).push(...linesForMatch(m, [{ playerId: p.playerId, side: p.side }]));
    }
    for (const [playerId, list] of lines) {
      await players.upsertStats(transaction, { tenant, playerId, discipline, context, patch: accumulate(list) });
    }
  };

  const playerMatches = async ({ tenant, playerId, scope = 'history', page, limit }) => {
    const mine = await MatchParticipant.findAll({ where: { tenantId: tenant, playerId }, attributes: ['matchId'] });
    const ids = mine.map((p) => p.matchId);
    if (!ids.length) return { rows: [], count: 0 };
    const where =
      scope === 'upcoming'
        ? { id: ids, status: { [Op.in]: ['scheduled', 'in_play'] } }
        : { id: ids, status: 'completed', counted: true };
    const { rows, count } = await Match.findAndCountAll({
      where,
      order: scope === 'upcoming' ? [['slotNo', 'ASC'], ['createdAt', 'ASC']] : [['completedAt', 'DESC'], ['id', 'DESC']],
      offset: (page - 1) * limit,
      limit
    });
    return { rows, count };
  };

  const countedMatchesOf = async (tenant, playerId) => {
    const mine = await MatchParticipant.findAll({ where: { tenantId: tenant, playerId } });
    const ids = mine.map((p) => p.matchId);
    const matches = ids.length ? await Match.findAll({ where: { id: ids, status: 'completed', counted: true } }) : [];
    const partsMap = await participantsOf(matches.map((m) => m.id));
    return matches.filter((m) => m.outcome !== 'walkover').map((m) => {
      const parts = partsMap.get(m.id);
      const side = parts.find((p) => p.playerId === playerId).side;
      return { match: m, parts, side, won: m.winnerSide === side };
    });
  };

  const partners = async ({ tenant, playerId }) => {
    const rows = (await countedMatchesOf(tenant, playerId)).filter((x) => x.match.discipline === 'doubles');
    const agg = new Map();
    for (const { parts, side, won } of rows) {
      const partner = parts.find((p) => p.side === side && p.playerId !== playerId);
      if (!partner) continue;
      const a = agg.get(partner.playerId) || { playerId: partner.playerId, matches: 0, wins: 0 };
      a.matches += 1;
      if (won) a.wins += 1;
      agg.set(partner.playerId, a);
    }
    const top = [...agg.values()].sort((x, y) => y.matches - x.matches || y.wins - x.wins).slice(0, 5);
    const people = new Map((await players.findByIds(tenant, top.map((t) => t.playerId))).map((p) => [p.id, p]));
    return top.map((t) => ({ ...t, name: people.get(t.playerId) ? people.get(t.playerId).displayName : null, winRate: Math.round((t.wins / t.matches) * 1000) / 1000 }));
  };

  const headToHead = async ({ tenant, playerId, otherId }) => {
    const rows = (await countedMatchesOf(tenant, playerId)).filter(({ parts, side }) =>
      parts.some((p) => p.playerId === otherId && p.side !== side)
    );
    rows.sort((x, y) => new Date(y.match.completedAt) - new Date(x.match.completedAt));
    const list = await views(tenant, rows.map((r) => r.match));
    return {
      playerId,
      otherId,
      matches: rows.length,
      wins: rows.filter((r) => r.won).length,
      losses: rows.filter((r) => !r.won).length,
      items: list
    };
  };

  // Gộp hồ sơ (docs/05 mục 4): trận của nguồn chuyển sang đích; hai hồ sơ cùng một
  // trận → 409 MERGE_CONFLICT. Thống kê của đích dựng lại từ trận (nguồn sự thật).
  const mergeHandler = async ({ tenant, target, source, transaction }) => {
    const rows = await MatchParticipant.findAll({ where: { tenantId: tenant, playerId: [target.id, source.id] }, transaction });
    const byMatch = new Map();
    for (const r of rows) byMatch.set(r.matchId, (byMatch.get(r.matchId) || new Set()).add(r.playerId));
    const shared = [...byMatch.values()].filter((set) => set.size === 2).length;
    if (shared) throw conflict('MERGE_CONFLICT', `Hai hồ sơ cùng có mặt trong ${shared} trận — không gộp được`);
    const moved = rows.filter((r) => r.playerId === source.id);
    if (!moved.length) return { matches: 0 };
    await MatchParticipant.update({ playerId: target.id }, { where: { tenantId: tenant, playerId: source.id }, transaction });
    const touched = await Match.findAll({ where: { id: [...byMatch.keys()] }, attributes: ['discipline', 'contextType'], transaction });
    const combos = new Set(touched.map((m) => `${m.discipline}|${m.contextType}`));
    for (const combo of combos) {
      const [discipline, context] = combo.split('|');
      await rebuildStats(transaction, { tenant, playerIds: [target.id], discipline, context });
    }
    return { matches: moved.length };
  };

  return {
    registerContext,
    createMatches,
    setSide,
    forfeit,
    recordResult,
    callMatch,
    cancelMatch,
    endMatch,
    mergeHandler,
    views,
    getForRead,
    listForContext,
    deleteForContext,
    participantsOf,
    periodMatches,
    markCounted,
    rebuildStats,
    playerMatches,
    partners,
    headToHead,
    // Cho liveScoring (cùng module) — không dùng từ module khác.
    internal: { handlerFor, applyResult, assertParticipant }
  };
};

module.exports = { createMatchService };
