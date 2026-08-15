'use strict';
const bcrypt = require('bcrypt');

// Mỗi chi nhánh demo (Quận 3, Quận 7) giờ có đủ "1 nhân viên + 1 quản lý chi
// nhánh" để test vai trò branch_manager (quyền rộng hơn nhân viên nhưng chỉ
// trong phạm vi chi nhánh của mình — xem migration 20260815300002). Tài
// khoản employee.q3/q7 seed trước đó (20260815200001) ghi position "Quản lý
// chi nhánh" nhưng role thật vẫn là 'employee' — đổi lại nhãn cho khớp, và
// thêm 2 tài khoản branch_manager thật.

const MANAGERS = [
  { branchCode: 'Q3', email: 'manager.q3@badminton.com', phone: '0906666666', fullName: 'Quản Lý Chi Nhánh Quận 3' },
  { branchCode: 'Q7', email: 'manager.q7@badminton.com', phone: '0907777777', fullName: 'Quản Lý Chi Nhánh Quận 7' }
];

const PASSWORD = 'Manager@123';

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    const [roleRows] = await queryInterface.sequelize.query(
      "SELECT id FROM roles WHERE name = 'branch_manager'"
    );
    if (!roleRows.length) {
      throw new Error('Chưa có role branch_manager — chạy migration 20260815300002 trước.');
    }
    const branchManagerRoleId = roleRows[0].id;

    const [branchRows] = await queryInterface.sequelize.query(
      "SELECT id, code FROM branches WHERE code IN ('Q3', 'Q7')"
    );
    if (branchRows.length < 2) {
      throw new Error('Thiếu chi nhánh demo — chạy seeder 20260815200001-seed-branches-2-3.js trước.');
    }
    const branchIdByCode = Object.fromEntries(branchRows.map((r) => [r.code, r.id]));

    const [existing] = await queryInterface.sequelize.query(
      'SELECT email FROM users WHERE email IN (:emails)',
      { replacements: { emails: MANAGERS.map((m) => m.email) } }
    );
    if (existing.length) {
      throw new Error(`Tài khoản quản lý chi nhánh đã tồn tại: ${existing.map((r) => r.email).join(', ')}.`);
    }

    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    await queryInterface.bulkInsert(
      'users',
      MANAGERS.map((m) => ({
        role_id: branchManagerRoleId,
        email: m.email,
        password_hash: passwordHash,
        full_name: m.fullName,
        phone: m.phone,
        is_active: true,
        created_at: now,
        updated_at: now,
        version: 0
      })),
      {}
    );
    const [userRows] = await queryInterface.sequelize.query(
      'SELECT id, email FROM users WHERE email IN (:emails)',
      { replacements: { emails: MANAGERS.map((m) => m.email) } }
    );
    const userIdByEmail = Object.fromEntries(userRows.map((r) => [r.email, r.id]));

    await queryInterface.bulkInsert(
      'employees',
      MANAGERS.map((m) => ({
        user_id: userIdByEmail[m.email],
        branch_id: branchIdByCode[m.branchCode],
        position: 'Quản lý chi nhánh',
        shift: 'Toàn thời gian',
        hired_at: now,
        created_at: now,
        updated_at: now,
        version: 0
      })),
      {}
    );

    // Đổi nhãn 2 tài khoản employee.q3/q7 cho khớp vai trò thật (role vẫn là
    // 'employee' — chỉ position bị đặt nhầm lúc seed chi nhánh).
    await queryInterface.sequelize.query(
      "UPDATE employees e JOIN users u ON u.id = e.user_id " +
      "SET e.position = 'Nhân viên bán hàng' " +
      "WHERE u.email IN ('employee.q3@badminton.com', 'employee.q7@badminton.com')"
    );
  },

  async down(queryInterface) {
    const [userRows] = await queryInterface.sequelize.query(
      'SELECT id FROM users WHERE email IN (:emails)',
      { replacements: { emails: MANAGERS.map((m) => m.email) } }
    );
    const userIds = userRows.map((r) => r.id);
    if (userIds.length) {
      await queryInterface.bulkDelete('employees', { user_id: userIds }, {});
      await queryInterface.bulkDelete('users', { id: userIds }, {});
    }

    await queryInterface.sequelize.query(
      "UPDATE employees e JOIN users u ON u.id = e.user_id " +
      "SET e.position = 'Quản lý chi nhánh' " +
      "WHERE u.email IN ('employee.q3@badminton.com', 'employee.q7@badminton.com')"
    );
  }
};
