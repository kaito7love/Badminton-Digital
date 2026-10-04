'use strict';

// Outbox của app chính cho tích hợp competition-service (plan 23): sự kiện bd.customer.* được ghi CÙNG
// transaction với việc đổi tên / gộp / xoá khách, rồi dispatcher gửi sang service — nên service tắt lúc đó
// thì sự kiện vẫn không mất. `subject` (vd customer/12) giữ thứ tự gửi theo từng khách.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('integration_outbox', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      event_id: { type: Sequelize.STRING(36), allowNull: false, unique: true },
      type: { type: Sequelize.STRING(100), allowNull: false },
      subject: { type: Sequelize.STRING(100), allowNull: false },
      payload: { type: Sequelize.JSON, allowNull: false },
      status: { type: Sequelize.ENUM('pending', 'sent', 'dead'), allowNull: false, defaultValue: 'pending' },
      attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      next_attempt_at: { type: Sequelize.DATE, allowNull: false },
      last_error: { type: Sequelize.STRING(255), allowNull: true },
      sent_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('integration_outbox', ['status', 'next_attempt_at'], { name: 'idx_integration_outbox_due' });
    await queryInterface.addIndex('integration_outbox', ['subject', 'status'], { name: 'idx_integration_outbox_subject' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('integration_outbox');
  }
};
