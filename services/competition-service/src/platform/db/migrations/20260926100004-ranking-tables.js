'use strict';

// Module `ranking`: ảnh chụp BXH hằng ngày để tính mũi tên lên / xuống so với 7
// ngày trước (docs/05 mục 3.3). Giữ 90 ngày.

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('leaderboard_snapshots', {
      id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
      tenant_id: { type: Sequelize.STRING(64), allowNull: false },
      kind: { type: Sequelize.ENUM('rating', 'points'), allowNull: false },
      category: { type: Sequelize.STRING(4), allowNull: false },
      scope: { type: Sequelize.STRING(80), allowNull: false },
      snapshot_date: { type: Sequelize.DATEONLY, allowNull: false },
      player_id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        references: { model: 'players', key: 'id' },
        onDelete: 'RESTRICT'
      },
      rank: { type: Sequelize.INTEGER, allowNull: false },
      value: { type: Sequelize.DECIMAL(10, 3), allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex(
      'leaderboard_snapshots',
      ['tenant_id', 'kind', 'category', 'scope', 'snapshot_date', 'player_id'],
      { unique: true, name: 'uq_snapshot_row' }
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('leaderboard_snapshots');
  }
};
