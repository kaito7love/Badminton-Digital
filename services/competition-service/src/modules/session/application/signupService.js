const { Op } = require('sequelize');
const { notFound, conflict, AppError } = require('../../../platform/http/errors');

// Đăng ký buổi giao lưu online (plan 27, slice p2): khách báo trước "tôi sẽ đến"; nhân viên điểm danh thật tại quầy như cũ.
//  - chỗ = "đã đăng ký giữ chỗ ∪ đang có mặt" so với `maxPlayers` (null = không giới hạn); hết chỗ → danh sách chờ theo `signedUpAt`;
//  - điểm danh (nhân viên) → đăng ký thành `attended`; người rời buổi / người huỷ nhường chỗ → người chờ đầu tiên được giữ chỗ;
//  - mọi thay đổi phát `board` (reason `signup`) để màn hình nhân viên / công khai tải lại.
// Khoá: BUỔI trước (như mọi lệnh của module) nên đăng ký đồng thời xếp hàng, không vượt chỗ.

const createSignupService = ({ models, players, platform, ctx }) => {
  const { SessionSignup, PlaySessionPlayer } = models;
  const { audit, realtime } = platform;
  const boardChanged = (transaction, s, reason) =>
    realtime.boardChanged(transaction, { tenant: s.tenantId, contextType: 'session', contextId: s.id, reason });
  const ACTIVE = ['registered', 'waitlisted'];

  // Số người đang chiếm chỗ.
  const occupiedCount = async (sessionId, transaction) => {
    const [signed, present] = await Promise.all([
      SessionSignup.findAll({ attributes: ['playerId'], where: { sessionId, status: 'registered' }, transaction, raw: true }),
      PlaySessionPlayer.findAll({ attributes: ['playerId'], where: { sessionId, status: 'present' }, transaction, raw: true })
    ]);
    return new Set([...signed, ...present].map((r) => r.playerId)).size;
  };

  // Còn chỗ thì cho người chờ lên theo thứ tự đăng ký. Gọi sau khi có chỗ trống (huỷ, rời buổi, tăng sức chứa).
  const promoteWaiting = async (transaction, s) => {
    const waiting = await SessionSignup.findAll({ where: { sessionId: s.id, status: 'waitlisted' }, order: [['signedUpAt', 'ASC'], ['id', 'ASC']], transaction });
    if (!waiting.length) return [];
    let occupied = await occupiedCount(s.id, transaction);
    const promoted = [];
    for (const w of waiting) {
      if (s.maxPlayers && occupied >= s.maxPlayers) break;
      await w.update({ status: 'registered' }, { transaction });
      occupied += 1;
      promoted.push(w);
    }
    return promoted;
  };

  // Nhân viên điểm danh một người đã đăng ký (kể cả đang chờ — nhân viên quyết) → đăng ký thành `attended`.
  const markAttended = (transaction, s, playerId) =>
    SessionSignup.update({ status: 'attended' }, { where: { sessionId: s.id, playerId, status: ACTIVE }, transaction });

  const assertVisible = (s) => {
    if (!['open', 'closed'].includes(s.status)) throw notFound('Không tìm thấy buổi giao lưu');
    ctx.assertOpen(s); // đã đóng → 409 SESSION_CLOSED
  };

  const signUp = async ({ auth, id, requestId }) => {
    const self = await players.ensureSelf(auth, { requestId });
    return models.PlaySession.sequelize.transaction(async (transaction) => {
      const s = await ctx.load(transaction, auth.tenant, id, { lock: true });
      assertVisible(s);
      const present = await PlaySessionPlayer.findOne({ where: { sessionId: s.id, playerId: self.id, status: 'present' }, transaction });
      if (present) throw conflict('ALREADY_PRESENT', 'Bạn đang có mặt trong buổi này rồi');
      const existing = await SessionSignup.findOne({ where: { sessionId: s.id, playerId: self.id }, transaction });
      if (existing && existing.status !== 'cancelled') throw conflict('ALREADY_SIGNED_UP', 'Bạn đã đăng ký buổi này rồi');
      const full = Boolean(s.maxPlayers) && (await occupiedCount(s.id, transaction)) >= s.maxPlayers;
      const values = { tenantId: auth.tenant, sessionId: s.id, playerId: self.id, status: full ? 'waitlisted' : 'registered', signedUpByRef: auth.sub, signedUpAt: new Date() };
      const row = existing ? await existing.update(values, { transaction }) : await SessionSignup.create(values, { transaction });
      await audit.record(transaction, {
        tenant: auth.tenant, actorRef: auth.sub, action: 'session.signed_up', targetType: 'session', targetId: s.id, after: { playerId: self.id, status: row.status }, requestId
      });
      boardChanged(transaction, s, 'signup');
      return { session: s, row };
    });
  };

  const cancelRow = async (transaction, { auth, s, row, requestId, by }) => {
    const wasRegistered = row.status === 'registered';
    await row.update({ status: 'cancelled' }, { transaction });
    const promoted = wasRegistered ? await promoteWaiting(transaction, s) : [];
    await audit.record(transaction, {
      tenant: auth.tenant, actorRef: auth.sub, action: 'session.signup_cancelled', targetType: 'session', targetId: s.id,
      after: { playerId: row.playerId, by, promoted: promoted.map((p) => p.playerId) }, requestId
    });
    boardChanged(transaction, s, 'signup');
    return promoted;
  };

  // Khách tự huỷ đăng ký của chính mình.
  const cancel = async ({ auth, id, requestId }) => {
    const me = auth.player ? await players.findByRef(auth.tenant, auth.player) : null;
    return models.PlaySession.sequelize.transaction(async (transaction) => {
      const s = await ctx.load(transaction, auth.tenant, id, { lock: true });
      assertVisible(s);
      const row = me ? await SessionSignup.findOne({ where: { sessionId: s.id, playerId: me.id, status: ACTIVE }, transaction }) : null;
      if (!row) throw new AppError(404, 'NOT_SIGNED_UP', 'Bạn chưa đăng ký buổi này');
      await cancelRow(transaction, { auth, s, row, requestId, by: 'self' });
      return { session: s };
    });
  };

  // Nhân viên gỡ một đăng ký (người không đến, đăng ký nhầm, spam).
  const cancelByStaff = async ({ auth, id, signupId, requestId }) =>
    models.PlaySession.sequelize.transaction(async (transaction) => {
      const s = await ctx.load(transaction, auth.tenant, id, { lock: true });
      ctx.authorize(auth, s, 'operate');
      ctx.assertOpen(s);
      const row = await SessionSignup.findOne({ where: { id: signupId, sessionId: s.id }, transaction });
      if (!row) throw notFound('Không tìm thấy đăng ký');
      if (!ACTIVE.includes(row.status)) throw conflict('INVALID_STATE', 'Đăng ký này đã huỷ hoặc đã điểm danh');
      await cancelRow(transaction, { auth, s, row, requestId, by: 'staff' });
      return { session: s };
    });

  return { signUp, cancel, cancelByStaff, promoteWaiting, markAttended, occupiedCount, ACTIVE };
};

module.exports = { createSignupService };
