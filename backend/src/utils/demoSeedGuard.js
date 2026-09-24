'use strict';

// Không đặt file này trong src/seeders/: sequelize-cli coi mọi file ở đó là seeder.

// Mật khẩu các tài khoản demo đã in trong repo, trang đăng nhập, Postman và k6.
const PUBLISHED_DEMO_PASSWORDS = Object.freeze(['admin@123', 'manager@123', 'employee@123', 'customer@123']);
const MIN_ADMIN_PASSWORD_LENGTH = 12;
const DEV_ADMIN_PASSWORD = 'Admin@123';

/**
 * Seeder demo tạo tài khoản với mật khẩu công khai trong repo (Admin@123,
 * Manager@123...). Chạy nhầm lên production là ai đọc repo cũng đăng nhập được,
 * nên mặc định chặn khi NODE_ENV=production. Bản demo công khai muốn có dữ liệu
 * mẫu thì bật có ý thức bằng ALLOW_DEMO_SEED=true.
 *
 * Gọi ở dòng đầu tiên trong `up()` của mọi seeder, trước khi chạm DB.
 */
const assertDemoSeedAllowed = (env = process.env) => {
  if (env.NODE_ENV === 'production' && env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error(
      'Đã chặn seed dữ liệu demo khi NODE_ENV=production: các tài khoản mẫu dùng mật khẩu công khai trong repo. ' +
      'Tạo admin đầu tiên bằng `npm run create-admin`. ' +
      'Nếu đây là bản demo công khai, đặt ALLOW_DEMO_SEED=true rồi chạy lại.'
    );
  }
};

/** Lỗi của một mật khẩu admin, rỗng là dùng được. Cùng luật với `npm run create-admin`. */
const findAdminPasswordProblems = (password, envName) => {
  const value = String(password || '');
  if (value.length < MIN_ADMIN_PASSWORD_LENGTH) {
    return [`${envName} phải có tối thiểu ${MIN_ADMIN_PASSWORD_LENGTH} ký tự.`];
  }
  if (PUBLISHED_DEMO_PASSWORDS.includes(value.toLowerCase())) {
    return [`${envName} trùng mật khẩu tài khoản demo đã công khai trong repo — chọn mật khẩu khác.`];
  }
  return [];
};

/**
 * Mật khẩu của admin trong dữ liệu demo.
 *
 * Bản demo công khai hiện sẵn các tài khoản nhân viên/khách, nhưng admin thì
 * không — mà repo lại công khai `Admin@123`. Seed lên production với mật khẩu
 * đó là ai đọc GitHub cũng vào được admin, xoá nhân viên, đổi giá, phá demo
 * của mọi người xem sau. Nên ở production mật khẩu admin bắt buộc lấy từ
 * DEMO_ADMIN_PASSWORD (bí mật, chỉ chủ dự án biết); máy dev giữ Admin@123.
 */
const resolveDemoAdminPassword = (env = process.env) => {
  if (env.NODE_ENV !== 'production') return env.DEMO_ADMIN_PASSWORD || DEV_ADMIN_PASSWORD;
  const problems = findAdminPasswordProblems(env.DEMO_ADMIN_PASSWORD, 'DEMO_ADMIN_PASSWORD');
  if (problems.length) {
    throw new Error(
      `Không seed được admin của bản demo: ${problems.join(' ')} ` +
      'Bản demo công khai phải dùng mật khẩu admin bí mật, không dùng Admin@123 in trong repo.'
    );
  }
  return env.DEMO_ADMIN_PASSWORD;
};

module.exports = {
  assertDemoSeedAllowed,
  resolveDemoAdminPassword,
  findAdminPasswordProblems,
  PUBLISHED_DEMO_PASSWORDS,
  MIN_ADMIN_PASSWORD_LENGTH
};
