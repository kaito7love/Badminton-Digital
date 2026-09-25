'use strict';

/**
 * Chế độ demo công khai (`DEMO_MODE=true`).
 *
 * Trang đăng nhập của bản demo in sẵn email + mật khẩu của các tài khoản dưới
 * đây cho người xem thử. Không khoá thì người xem đầu tiên đổi mật khẩu (hoặc
 * quản lý demo xoá nhân viên demo) là mọi người xem sau không vào được nữa.
 * Các thao tác nghiệp vụ khác vẫn làm bình thường — dữ liệu được reset hằng
 * đêm bằng scripts/demo-reset.js.
 *
 * Không gồm admin: admin của bản demo dùng mật khẩu bí mật (DEMO_ADMIN_PASSWORD,
 * xem utils/demoSeedGuard.js) và là tài khoản của chủ dự án.
 *
 * Phải khớp email trong seeder và khối tài khoản thử nghiệm ở
 * frontend/src/pages/Login/LoginPage.jsx — tests/demoMode.test.js đối chiếu với seeder.
 */
const LOCKED_DEMO_EMAILS = Object.freeze([
  'employee@badminton.com',
  'employee.q3@badminton.com',
  'employee.q7@badminton.com',
  'manager.q3@badminton.com',
  'manager.q7@badminton.com',
  'customer@badminton.com'
]);

const LOCKED_SET = new Set(LOCKED_DEMO_EMAILS);

const isDemoMode = (env = process.env) => env.DEMO_MODE === 'true';

/** `user` là bản ghi User (hoặc object có `email`). */
const isLockedDemoAccount = (user, env = process.env) =>
  isDemoMode(env) && Boolean(user?.email) && LOCKED_SET.has(String(user.email).toLowerCase());

const assertNotLockedDemoAccount = (user, env = process.env) => {
  if (!isLockedDemoAccount(user, env)) return;
  const error = new Error(
    'Đây là tài khoản demo dùng chung nên không đổi được mật khẩu, thông tin đăng nhập hay xoá. ' +
    'Dữ liệu demo tự khôi phục mỗi đêm.'
  );
  error.statusCode = 403;
  throw error;
};

module.exports = { LOCKED_DEMO_EMAILS, isDemoMode, isLockedDemoAccount, assertNotLockedDemoAccount };
