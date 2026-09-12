'use strict';
const bcrypt = require('bcrypt');
const { assertDemoSeedAllowed } = require('../utils/demoSeedGuard');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    assertDemoSeedAllowed();
    const now = new Date();

    // 1. Roles — không seed ở đây nữa. Ba role lõi do migration
    // 20260912100001-ensure-core-roles.js tạo, để bản cài production chỉ
    // migrate (không seed demo) vẫn đủ vai trò.

    // 2. Users (Admin@123, Employee@123, Customer@123)
    const adminPassword = await bcrypt.hash('Admin@123', 10);
    const employeePassword = await bcrypt.hash('Employee@123', 10);
    const customerPassword = await bcrypt.hash('Customer@123', 10);

    await queryInterface.bulkInsert('users', [
      {
        id: 1,
        role_id: 1,
        email: 'admin@badminton.com',
        password_hash: adminPassword,
        full_name: 'Quản Trị Viên',
        phone: '0901111111',
        is_active: true,
        created_at: now,
        updated_at: now
      },
      {
        id: 2,
        role_id: 2,
        email: 'employee@badminton.com',
        password_hash: employeePassword,
        full_name: 'Nhân Viên Thu Ngân',
        phone: '0902222222',
        is_active: true,
        created_at: now,
        updated_at: now
      },
      {
        id: 3,
        role_id: 3,
        email: 'customer@badminton.com',
        password_hash: customerPassword,
        full_name: 'Nguyễn Văn Khách',
        phone: '0903333333',
        is_active: true,
        created_at: now,
        updated_at: now
      }
    ], {});

    // 3. Employees
    // branch_id là BẮT BUỘC: `branchContextMiddleware` lấy chi nhánh làm việc
    // của nhân viên từ cột này, thiếu là mọi thao tác cần chi nhánh (bán hàng
    // tại quầy, mở/đóng sân, kho) đều bị từ chối "Không xác định được chi
    // nhánh". Seeder này viết từ trước khi hệ thống lên đa chi nhánh nên từng
    // bỏ trống — gán chi nhánh 1 (chi nhánh chính, cũng là nơi seeder tồn kho
    // đổ hàng vào). Admin vẫn chuyển chi nhánh tuỳ ý bằng header X-Branch-Id.
    await queryInterface.bulkInsert('employees', [
      {
        id: 1,
        user_id: 1,
        branch_id: 1,
        position: 'Chủ sân',
        shift: 'Toàn thời gian',
        hired_at: '2026-01-01',
        created_at: now,
        updated_at: now
      },
      {
        id: 2,
        user_id: 2,
        branch_id: 1,
        position: 'Thu ngân',
        shift: 'Ca sáng',
        hired_at: '2026-02-01',
        created_at: now,
        updated_at: now
      }
    ], {});

    // 4. Customers
    await queryInterface.bulkInsert('customers', [
      {
        id: 1,
        user_id: 3,
        full_name: 'Nguyễn Văn Khách',
        phone: '0903333333',
        email: 'customer@badminton.com',
        total_spent: 0.00,
        loyalty_tier: 'normal',
        created_at: now,
        updated_at: now
      },
      {
        id: 2,
        user_id: null,
        full_name: 'Khách Vãng Lai VIP',
        phone: '0988888888',
        email: null,
        total_spent: 0.00,
        loyalty_tier: 'normal',
        created_at: now,
        updated_at: now
      }
    ], {});

    // 5. Courts
    // branch_id BẮT BUỘC (xem ghi chú ở mục Employees) — sân thuộc về một cơ
    // sở vật lý cụ thể. Bốn sân mẫu này là của chi nhánh chính.
    await queryInterface.bulkInsert('courts', [
      {
        id: 1,
        branch_id: 1,
        name: 'Sân số 1 (Thường)',
        status: 'active',
        offpeak_price_per_hour: 60000.00,
        peak_price_per_hour: 90000.00,
        note: 'Gần cửa ra vào',
        created_at: now,
        updated_at: now
      },
      {
        id: 2,
        branch_id: 1,
        name: 'Sân số 2 (Thường)',
        status: 'active',
        offpeak_price_per_hour: 60000.00,
        peak_price_per_hour: 90000.00,
        note: 'Sân tiêu chuẩn',
        created_at: now,
        updated_at: now
      },
      {
        id: 3,
        branch_id: 1,
        name: 'Sân số 3 (Thường)',
        status: 'active',
        offpeak_price_per_hour: 60000.00,
        peak_price_per_hour: 90000.00,
        note: 'Gần quầy nước',
        created_at: now,
        updated_at: now
      },
      {
        id: 4,
        branch_id: 1,
        name: 'Sân VIP (Thảm Yonex)',
        status: 'active',
        offpeak_price_per_hour: 100000.00,
        peak_price_per_hour: 140000.00,
        note: 'Thảm thi đấu quốc tế, điều hòa',
        created_at: now,
        updated_at: now
      }
    ], {});

    // 6. Extras (danh mục dùng chung mọi chi nhánh — tồn kho nằm riêng ở extra_stocks)
    await queryInterface.bulkInsert('extras', [
      {
        id: 1,
        name: 'Cầu lông Yonex King (Quả)',
        price: 25000.00,
        low_stock_threshold: 10,
        created_at: now,
        updated_at: now
      },
      {
        id: 2,
        name: 'Thuê Vợt Badminton Pro (Lượt)',
        price: 30000.00,
        low_stock_threshold: 3,
        created_at: now,
        updated_at: now
      },
      {
        id: 3,
        name: 'Nước suối Aquafina 500ml',
        price: 10000.00,
        low_stock_threshold: 5,
        created_at: now,
        updated_at: now
      },
      {
        id: 4,
        name: 'Nước điện giải Revive 500ml',
        price: 15000.00,
        low_stock_threshold: 5,
        created_at: now,
        updated_at: now
      }
    ], {});

    // Tồn kho ban đầu cho chi nhánh chính (id=1) — dữ liệu demo, tương đương
    // opening balance của từng sản phẩm.
    await queryInterface.bulkInsert('extra_stocks', [
      { extra_id: 1, branch_id: 1, quantity: 100, created_at: now, updated_at: now, version: 0 },
      { extra_id: 2, branch_id: 1, quantity: 20, created_at: now, updated_at: now, version: 0 },
      { extra_id: 3, branch_id: 1, quantity: 50, created_at: now, updated_at: now, version: 0 },
      { extra_id: 4, branch_id: 1, quantity: 40, created_at: now, updated_at: now, version: 0 }
    ], {});

    // 7. Settings
    await queryInterface.bulkInsert('settings', [
      {
        id: 1,
        key: 'operating_hours',
        value: JSON.stringify({ open: '06:00', close: '22:00', peak_start: '17:00', peak_end: '21:00' }),
        created_at: now,
        updated_at: now
      },
      {
        id: 2,
        key: 'store_info',
        value: JSON.stringify({ name: 'Badminton Digital Center', address: '123 Đường Cầu Lông, TP. Hồ Chí Minh', phone: '0909123456' }),
        created_at: now,
        updated_at: now
      }
    ], {});
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('settings', null, {});
    await queryInterface.bulkDelete('extra_stocks', null, {});
    await queryInterface.bulkDelete('extras', null, {});
    await queryInterface.bulkDelete('courts', null, {});
    await queryInterface.bulkDelete('customers', null, {});
    await queryInterface.bulkDelete('employees', null, {});
    await queryInterface.bulkDelete('users', null, {});
    // Không xoá roles: bảng này thuộc migration 20260912100001-ensure-core-roles.js.
  }
};
