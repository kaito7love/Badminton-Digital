'use strict';

/**
 * Bước thu hẹp cuối cùng: bỏ các cột khách vãng lai sau khi dữ liệu đã được gộp
 * vào bảng customers (migration 20260814100005).
 *
 * Từ đây chỉ còn một chỗ duy nhất lưu thông tin người chơi: bảng customers.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.removeColumn('bookings', 'guest_name');
    await queryInterface.removeColumn('bookings', 'guest_phone');
    await queryInterface.removeColumn('court_sessions', 'guest_name');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('bookings', 'guest_name', {
      type: Sequelize.STRING(100),
      allowNull: true
    });
    await queryInterface.addColumn('bookings', 'guest_phone', {
      type: Sequelize.STRING(20),
      allowNull: true
    });
    await queryInterface.addColumn('court_sessions', 'guest_name', {
      type: Sequelize.STRING(100),
      allowNull: true
    });
  }
};
