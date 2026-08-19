'use strict';

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    await queryInterface.bulkInsert('roles', [
      {
        // ID cố định: đúng theo quy trình cài mới (migrate rồi seed — xem
        // README), migration này chạy TRƯỚC seeder gán id=1/2/3 cho
        // admin/employee/customer (20260723000001-seed-initial-data.js).
        // Bảng roles lúc đó hoàn toàn trống nên không có ID cố định thì
        // auto-increment tự cấp id=1 cho branch_manager, đụng ngay PRIMARY
        // KEY với seeder admin chạy sau — chặn đứng mọi lần cài mới từ đầu.
        id: 4,
        name: 'branch_manager',
        description: 'Quản lý vận hành trong phạm vi 1 chi nhánh',
        created_at: now,
        updated_at: now
      }
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('roles', { name: 'branch_manager' }, {});
  }
};
