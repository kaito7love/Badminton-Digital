'use strict';

// Hộp thư đến cho sự kiện competition.* (plan 23): khử trùng theo event_id — service gửi "ít nhất một lần"
// nên cùng một sự kiện có thể tới hai lần; mỗi sự kiện chỉ được có hiệu ứng (ActivityLog) đúng một lần.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('integration_inbox', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      event_id: { type: Sequelize.STRING(64), allowNull: false, unique: true },
      type: { type: Sequelize.STRING(100), allowNull: false },
      status: { type: Sequelize.ENUM('processed', 'ignored'), allowNull: false },
      received_at: { type: Sequelize.DATE, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('integration_inbox');
  }
};
