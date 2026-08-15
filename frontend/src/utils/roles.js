// Ai được vào đâu — khai báo một chỗ, để route, thanh điều hướng và trang đăng
// nhập không bao giờ nói khác nhau. Trước đây mọi vai trò đều bị đẩy về
// /dashboard, nên khách hàng đăng nhập xong rơi thẳng vào màn hình 403.

export const STAFF_ROLES = ['admin', 'branch_manager', 'employee'];
export const ALL_ROLES = ['admin', 'branch_manager', 'employee', 'customer'];

/** Vai trò được rút từ user, chấp nhận cả dạng chuỗi lẫn dạng object của API. */
export const roleOf = (user) =>
  (typeof user?.role === 'string' ? user.role : user?.role?.name) || null;

export const isStaff = (user) => STAFF_ROLES.includes(roleOf(user));

/**
 * Trang chủ sau đăng nhập của từng vai trò — phải là màn hình họ thực sự mở
 * được. /dashboard gọi /reports/dashboard, mà API đó chỉ cho admin: đưa nhân
 * viên vào đó thì họ nhận đúng một thông báo 403 ngay khi vừa đăng nhập.
 */
export const homePathForRole = (user) => {
  const role = roleOf(user);
  if (role === 'admin' || role === 'branch_manager') return '/dashboard';
  if (role === 'employee') return '/courts';
  return '/my-bookings';
};

/** Các đường dẫn thuộc bàn làm việc của nhân viên — khách hàng vào là bị chặn. */
const STAFF_PATHS = [
  '/dashboard', '/courts', '/bookings', '/accessories',
  '/customers', '/employees', '/history', '/reports', '/settings'
];

export const isStaffPath = (pathname) =>
  STAFF_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/**
 * Đăng nhập xong thì về đâu. Ưu tiên nơi người dùng đang dở việc (`from`), trừ
 * khi đó là màn hình họ không có quyền vào — lúc đó mới rơi về trang chủ của
 * vai trò. Khách bị hỏi đăng nhập giữa chừng khi đang đặt sân phải quay lại
 * đúng trang chủ để đặt nốt, chứ không bị đá sang chỗ khác.
 */
export const redirectAfterLogin = (user, from) => {
  if (!from) return homePathForRole(user);
  if (!isStaff(user) && isStaffPath(from)) return homePathForRole(user);
  return from;
};
