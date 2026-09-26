const { notFound, forbiddenScope, conflict } = require('../../../platform/http/errors');
const { canAccessOrganizer } = require('../../../platform/http/auth');

// Phần dùng chung của module session: tải buổi, phân quyền, dựng view.

const SCOPES = {
  read: ['session:read', 'session:operate'],
  operate: ['session:operate'],
  // Huỷ một trận giao lưu: nhân viên điều phối làm được (không có cấp "quản lý" riêng).
  manage: ['session:operate']
};

const iso = (d) => (d ? new Date(d).toISOString() : null);

const createSessionContext = ({ models }) => {
  const { PlaySession } = models;

  const load = async (transaction, tenant, id, { lock = false } = {}) => {
    const s = await PlaySession.findOne({
      where: { id, tenantId: tenant },
      transaction,
      lock: lock && transaction ? transaction.LOCK.UPDATE : undefined
    });
    if (!s) throw notFound('Không tìm thấy buổi giao lưu');
    return s;
  };

  // Buổi thuộc chi nhánh ngoài claim `org` → coi như không tồn tại.
  const authorize = (auth, session, action) => {
    if (!canAccessOrganizer(auth, session.organizerRef)) throw notFound('Không tìm thấy buổi giao lưu');
    const need = SCOPES[action];
    if (!need.some((s) => auth.scopes.has(s))) throw forbiddenScope(need);
  };

  const assertOpen = (session) => {
    if (session.status !== 'open') {
      throw conflict('SESSION_CLOSED', session.status === 'closed' ? 'Buổi giao lưu đã đóng' : 'Buổi giao lưu đã huỷ');
    }
  };

  const view = (s, extra = {}) => ({
    id: s.id,
    organizerRef: s.organizerRef,
    name: s.name,
    startsAt: iso(s.startsAt),
    courtRefs: s.courtRefs,
    format: s.format,
    mode: s.mode,
    scoring: s.scoring,
    rated: s.rated,
    seed: s.seed,
    rounds: s.rounds,
    status: s.status,
    closedAt: iso(s.closedAt),
    createdByRef: s.createdByRef,
    version: s.version,
    createdAt: iso(s.createdAt),
    ...extra
  });

  return { load, authorize, assertOpen, view, SCOPES };
};

module.exports = { createSessionContext };
