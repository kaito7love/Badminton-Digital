'use strict';

// Không đặt file này trong src/seeders/: sequelize-cli coi mọi file ở đó là seeder.

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

module.exports = { assertDemoSeedAllowed };
