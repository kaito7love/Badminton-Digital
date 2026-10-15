'use strict';

// Thông báo trong ứng dụng cho khách (kế hoạch 43): lịch được duyệt / tự huỷ quá hạn / bị nhân viên huỷ / bị đổi.
// Ghi CÙNG transaction với thay đổi trạng thái lịch nên không bao giờ lệch. Chỉ chứa tên sân + ngày + giờ.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('customer_notifications', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      customer_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'customers', key: 'id' },
        onDelete: 'CASCADE'
      },
      branch_id: { type: Sequelize.INTEGER, allowNull: true },
      type: { type: Sequelize.STRING(40), allowNull: false },
      title: { type: Sequelize.STRING(160), allowNull: false },
      body: { type: Sequelize.STRING(500), allowNull: false },
      booking_id: { type: Sequelize.INTEGER, allowNull: true },
      read_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('customer_notifications', ['customer_id', 'read_at', 'created_at'], {
      name: 'idx_customer_notifications_inbox'
    });
    await queryInterface.addIndex('customer_notifications', ['created_at'], {
      name: 'idx_customer_notifications_created'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('customer_notifications');
  }
};
