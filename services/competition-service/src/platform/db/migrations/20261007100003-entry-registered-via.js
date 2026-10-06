'use strict';

// Đăng ký giải online (plan 27, slice p4): nhân viên cần biết một đăng ký do khách tự bấm hay do nhân viên nhập (chip "Đăng ký online" ở danh sách,
// để để ý trình đồng đội khách chưa xác nhận). `registered_via` = 'self' (khách) | 'staff' (mặc định, mọi đăng ký cũ).

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('tournament_entries', 'registered_via', {
      type: Sequelize.ENUM('staff', 'self'),
      allowNull: false,
      defaultValue: 'staff',
      after: 'registered_by_ref'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('tournament_entries', 'registered_via');
  }
};
