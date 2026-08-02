'use strict';
const bcrypt = require('bcrypt');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();

    // 1. Roles
    await queryInterface.bulkInsert('roles', [
      { id: 1, name: 'admin', description: 'Chủ sân / Quản trị hệ thống', created_at: now, updated_at: now },
      { id: 2, name: 'employee', description: 'Nhân viên vận hành tại quầy', created_at: now, updated_at: now },
      { id: 3, name: 'customer', description: 'Khách hàng thuê sân', created_at: now, updated_at: now }
    ], {});

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
    await queryInterface.bulkInsert('employees', [
      {
        id: 1,
        user_id: 1,
        position: 'Chủ sân',
        shift: 'Toàn thời gian',
        hired_at: '2026-01-01',
        created_at: now,
        updated_at: now
      },
      {
        id: 2,
        user_id: 2,
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
    await queryInterface.bulkInsert('courts', [
      {
        id: 1,
        name: 'Sân số 1 (Thường)',
        status: 'empty',
        offpeak_price_per_hour: 60000.00,
        peak_price_per_hour: 90000.00,
        note: 'Gần cửa ra vào',
        created_at: now,
        updated_at: now
      },
      {
        id: 2,
        name: 'Sân số 2 (Thường)',
        status: 'empty',
        offpeak_price_per_hour: 60000.00,
        peak_price_per_hour: 90000.00,
        note: 'Sân tiêu chuẩn',
        created_at: now,
        updated_at: now
      },
      {
        id: 3,
        name: 'Sân số 3 (Thường)',
        status: 'empty',
        offpeak_price_per_hour: 60000.00,
        peak_price_per_hour: 90000.00,
        note: 'Gần quầy nước',
        created_at: now,
        updated_at: now
      },
      {
        id: 4,
        name: 'Sân VIP (Thảm Yonex)',
        status: 'empty',
        offpeak_price_per_hour: 100000.00,
        peak_price_per_hour: 140000.00,
        note: 'Thảm thi đấu quốc tế, điều hòa',
        created_at: now,
        updated_at: now
      }
    ], {});

    // 6. Extras
    await queryInterface.bulkInsert('extras', [
      {
        id: 1,
        name: 'Cầu lông Yonex King (Quả)',
        price: 25000.00,
        stock_quantity: 100,
        low_stock_threshold: 10,
        created_at: now,
        updated_at: now
      },
      {
        id: 2,
        name: 'Thuê Vợt Badminton Pro (Lượt)',
        price: 30000.00,
        stock_quantity: 20,
        low_stock_threshold: 3,
        created_at: now,
        updated_at: now
      },
      {
        id: 3,
        name: 'Nước suối Aquafina 500ml',
        price: 10000.00,
        stock_quantity: 50,
        low_stock_threshold: 5,
        created_at: now,
        updated_at: now
      },
      {
        id: 4,
        name: 'Nước điện giải Revive 500ml',
        price: 15000.00,
        stock_quantity: 40,
        low_stock_threshold: 5,
        created_at: now,
        updated_at: now
      }
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
    await queryInterface.bulkDelete('extras', null, {});
    await queryInterface.bulkDelete('courts', null, {});
    await queryInterface.bulkDelete('customers', null, {});
    await queryInterface.bulkDelete('employees', null, {});
    await queryInterface.bulkDelete('users', null, {});
    await queryInterface.bulkDelete('roles', null, {});
  }
};
