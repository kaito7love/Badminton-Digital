const { AppError, notFound, conflict } = require('../../../platform/http/errors');
const { liveState, addRally, undoRally } = require('../domain/liveScore');
const { liveView, emptyLive } = require('./liveView');

// Bấm điểm trực tiếp (docs/06 mục 1.5, plan 19).
//
// Ai được bấm điểm:
//   - nhân viên điều phối của ngữ cảnh (scope operate của giải / buổi, đúng chi nhánh);
//   - token "chỉ bấm điểm" của người chơi (match:score + claim player): chỉ trận mình đang đánh.
// Ai được xác nhận kết quả từ tỉ số đã bấm:
//   - nhân viên: mọi trận;
//   - người chơi trong trận: chỉ khi ngữ cảnh KHÔNG tính điểm. Trận tính điểm (giải, giao lưu
//     bật "tính điểm") để nhân viên xác nhận — không ai tự bấm có lợi cho mình rồi tự lưu.
//
// Không cộng trùng: mọi lần đổi gửi kèm `revision` đã thấy; lệch → 409 LIVE_CONFLICT.
// Khoá: dòng TRẬN FOR UPDATE trước → mọi lần bấm của cùng một trận xếp hàng, và chặn ghi kết
// quả song song → rồi mới tới dòng live. Ghi kết quả khoá ngữ cảnh → trận → dòng live: cùng
// chiều, không deadlock. Bấm điểm KHÔNG khoá buổi / giải nên không chặn "Xếp sân trống", điểm
// danh; khoá dòng trận không đổi `version` và không chặn đọc thường (màn hình lớn).
// (Bản đầu khoá dòng trận FOR SHARE: hai lần bấm cùng lúc cùng giữ khoá S trên dòng live rồi
// cùng xin nâng lên X → MySQL báo deadlock — test chịu tải bắt được.)

const createLiveScoring = ({ models, sequelize, realtime, core }) => {
  const { Match, MatchLiveScore } = models;
  const { handlerFor, applyResult, assertParticipant } = core;

  const canOperate = (auth, handler, ctx) => {
    try {
      handler.authorize(auth, ctx, 'operate');
      return true;
    } catch {
      return false;
    }
  };

  // → 'staff' | 'player'. Không được bấm → lỗi như mọi thao tác khác của ngữ cảnh
  // (khác chi nhánh → 404, thiếu scope → 403), người chơi ngoài trận → 403 NOT_A_PARTICIPANT.
  const scorerKind = async (transaction, auth, handler, ctx, match) => {
    if (canOperate(auth, handler, ctx)) return 'staff';
    if (await assertParticipant(transaction, auth, match)) return 'player';
    handler.authorize(auth, ctx, 'operate');
    return 'staff';
  };

  const channelOf = (match) => realtime.key(match.tenantId, match.contextType, match.contextId);

  const loadMatch = async (transaction, auth, matchId, lock) => {
    const match = await Match.findOne({ where: { id: matchId, tenantId: auth.tenant }, transaction, lock });
    if (!match) throw notFound('Không tìm thấy trận');
    const handler = handlerFor(match);
    const ctx = await handler.load(transaction, auth.tenant, match.contextId, { lock: false });
    return { match, handler, ctx };
  };

  const liveConflict = (row) =>
    conflict('LIVE_CONFLICT', `Tỉ số vừa được cập nhật (phiên bản ${row ? row.revision : 0}) — tải lại tỉ số rồi bấm tiếp`);

  // Đổi chuỗi pha cầu. Dòng live tạo bằng INSERT IGNORE rồi mới khoá: SELECT … FOR UPDATE trên
  // dòng CHƯA tồn tại khoá cả khoảng trống → hai sân bấm điểm đầu tiên cùng lúc sẽ deadlock.
  const mutate = ({ auth, matchId, revision }, change) =>
    sequelize.transaction(async (transaction) => {
      const { match, handler, ctx } = await loadMatch(transaction, auth, matchId, transaction.LOCK.UPDATE);
      await scorerKind(transaction, auth, handler, ctx, match);
      handler.assertCanRecord(ctx, match);
      if (match.status !== 'in_play') throw conflict('INVALID_STATE', 'Chỉ bấm điểm được trận đang đánh');
      await MatchLiveScore.bulkCreate([{ matchId: match.id, tenantId: match.tenantId }], { ignoreDuplicates: true, transaction });
      const row = await MatchLiveScore.findOne({ where: { matchId: match.id }, transaction, lock: transaction.LOCK.UPDATE });
      if (row.revision !== revision) throw liveConflict(row);
      await row.update({ ...change(row, match), revision: row.revision + 1, scoredByRef: auth.sub }, { transaction });
      const view = liveView(row, match.scoring);
      realtime.afterCommit(transaction, channelOf(match), 'score', { matchId: match.id, courtRef: match.courtRef ?? null, live: view });
      return view;
    });

  const rally = ({ auth, matchId, side, revision }) =>
    mutate({ auth, matchId, revision }, (row, match) => ({
      rallies: addRally({ rallies: row.rallies, firstServer: row.firstServer, scoring: match.scoring }, side)
    }));

  const undo = ({ auth, matchId, revision }) => mutate({ auth, matchId, revision }, (row) => ({ rallies: undoRally(row.rallies) }));

  // Đội giao trước: chỉ đổi được khi chưa bấm điểm nào.
  const setServer = ({ auth, matchId, firstServer, revision }) =>
    mutate({ auth, matchId, revision }, (row) => {
      if (row.rallies.length) throw conflict('RALLIES_STARTED', 'Đã bấm điểm — hoàn tác hết mới đổi được đội giao trước');
      return { firstServer };
    });

  // Lưu kết quả từ tỉ số đã bấm: cùng đường với "Nhập tỉ số" (điểm trình, nhả sân, người thắng
  // vào trận sau, sự kiện competition.match.completed). Thứ tự khoá như ghi kết quả.
  const confirm = ({ auth, matchId, revision, requestId }) =>
    sequelize.transaction(async (transaction) => {
      const found = await Match.findOne({ where: { id: matchId, tenantId: auth.tenant }, transaction });
      if (!found) throw notFound('Không tìm thấy trận');
      const handler = handlerFor(found);
      const ctx = await handler.load(transaction, auth.tenant, found.contextId, { lock: true });
      const match = await Match.findOne({ where: { id: matchId }, transaction, lock: transaction.LOCK.UPDATE });
      const kind = await scorerKind(transaction, auth, handler, ctx, match);
      if (kind === 'player' && ctx.rated) {
        throw new AppError(403, 'CONFIRM_REQUIRES_STAFF', 'Trận có tính điểm — nhân viên xác nhận kết quả (tỉ số đã điền sẵn)');
      }
      handler.assertCanRecord(ctx, match);
      if (match.status === 'completed') throw conflict('INVALID_STATE', 'Trận đã có kết quả — muốn sửa thì dùng "Nhập tỉ số"');
      if (match.status !== 'in_play' && match.status !== 'ended') throw conflict('INVALID_STATE', 'Trận không còn đang đánh');
      const row = await MatchLiveScore.findOne({ where: { matchId: match.id }, transaction, lock: transaction.LOCK.UPDATE });
      if (!row || row.revision !== revision) throw liveConflict(row);
      const state = liveState({ rallies: row.rallies, firstServer: row.firstServer, scoring: match.scoring });
      if (!state.decided) throw conflict('MATCH_NOT_DECIDED', 'Trận chưa đủ điểm thắng — bấm tiếp hoặc dùng "Nhập tỉ số"');
      return applyResult(transaction, { auth, match, handler, ctx, body: { games: state.games, outcome: 'normal' }, requestId, via: 'live' });
    });

  const get = async ({ auth, matchId }) => {
    const { match, handler, ctx } = await loadMatch(null, auth, matchId);
    try {
      handler.authorize(auth, ctx, 'read');
    } catch (err) {
      if (!(await assertParticipant(null, auth, match))) throw err;
    }
    const row = await MatchLiveScore.findOne({ where: { matchId: match.id } });
    return row ? liveView(row, match.scoring) : emptyLive(match);
  };

  // Gói đầu tiên của luồng TV: tỉ số mọi trận đang đánh (đã có người bấm) của ngữ cảnh.
  const snapshot = async (tenant, contextType, contextId) => {
    const live = await Match.findAll({ where: { tenantId: tenant, contextType, contextId, status: 'in_play' } });
    const rows = live.length ? await MatchLiveScore.findAll({ where: { matchId: live.map((m) => m.id) } }) : [];
    const byId = new Map(rows.map((r) => [r.matchId, r]));
    return {
      serverTime: new Date().toISOString(),
      matches: live
        .filter((m) => byId.has(m.id))
        .map((m) => ({ matchId: m.id, courtRef: m.courtRef ?? null, live: liveView(byId.get(m.id), m.scoring) }))
    };
  };

  return { rally, undo, setServer, confirm, get, snapshot };
};

module.exports = { createLiveScoring };
