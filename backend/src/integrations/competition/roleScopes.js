// Vai trò của app chính → quyền ở competition-service (docs/02 mục 5). Service chỉ biết scope, không biết
// admin / employee; còn từng route cần scope nào thì service tự kiểm (requireScope) — cổng chỉ cấp TRẦN theo vai trò.
// Không bao giờ cấp `ops:admin` (xem / gửi lại outbox) và `assessment:submit-ai` (chỉ dịch vụ phân tích video).

const ANONYMOUS_SCOPES = ['ranking:read'];
const CUSTOMER_SCOPES = ['rating:self', 'ranking:read', 'match:score'];
const EMPLOYEE_SCOPES = [
  'rating:read', 'rating:assess', 'player:write', 'ranking:read', 'matchmaking:compute',
  'tournament:read', 'tournament:operate', 'session:read', 'session:operate'
];
const MANAGER_SCOPES = [...EMPLOYEE_SCOPES, 'rating:assess:any', 'rating:adjust', 'tournament:manage'];

const SCOPES_BY_ROLE = {
  customer: CUSTOMER_SCOPES,
  employee: EMPLOYEE_SCOPES,
  branch_manager: MANAGER_SCOPES,
  admin: MANAGER_SCOPES
};

const ANONYMOUS = Object.freeze({ sub: 'anonymous', scope: ANONYMOUS_SCOPES, org: [], player: null, playerName: null });

class PrincipalError extends Error {
  constructor(message, statusCode = 403) {
    super(message);
    this.statusCode = statusCode;
  }
}

const branchRef = (id) => `bd:branch:${id}`;

/**
 * Người đang gọi → thông tin ghi vào service token. `req.user` do authMiddleware nạp (kèm role, employee, customer),
 * `req.branchId` do branchContextMiddleware đặt.
 *  - nhân viên / quản lý: chỉ chi nhánh của mình;
 *  - admin: chi nhánh đang chọn (X-Branch-Id); chưa chọn → `*` (cả chuỗi);
 *  - khách: không có org, `player` = bd:customer:<id> để service chỉ cho bấm điểm đúng trận mình đang đánh.
 */
const resolvePrincipal = (req) => {
  const user = req.user;
  if (!user) return ANONYMOUS;
  const role = user.role && user.role.name;
  const scope = SCOPES_BY_ROLE[role];
  if (!scope) throw new PrincipalError('Vai trò này không dùng được tính năng thi đấu.');
  const sub = `bd:user:${user.id}`;

  if (role === 'customer') {
    if (!user.customer) throw new PrincipalError('Tài khoản chưa có hồ sơ khách hàng.');
    return {
      sub,
      scope,
      org: [],
      player: `bd:customer:${user.customer.id}`,
      playerName: user.customer.fullName || null
    };
  }

  if (role === 'admin') {
    const chosen = req.headers && req.headers['x-branch-id'] && req.branchId;
    return { sub, scope, org: chosen ? [branchRef(req.branchId)] : ['*'], player: null, playerName: null };
  }

  if (!req.branchId) throw new PrincipalError('Không xác định được chi nhánh của tài khoản.');
  return { sub, scope, org: [branchRef(req.branchId)], player: null, playerName: null };
};

module.exports = { resolvePrincipal, PrincipalError, ANONYMOUS, SCOPES_BY_ROLE, EMPLOYEE_SCOPES, MANAGER_SCOPES, CUSTOMER_SCOPES };
