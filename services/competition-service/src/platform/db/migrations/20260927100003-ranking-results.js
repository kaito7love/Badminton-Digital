'use strict';

// Module `ranking`: điểm BXH thành tích theo thứ hạng ở giải (docs/05 mục 3.2).
// tournament_id là chuỗi mờ (không khoá ngoại): ranking không phụ thuộc tournament.

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('ranking_results', {
      id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
      tenant_id: { type: Sequelize.STRING(64), allowNull: false },
      player_id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        references: { model: 'players', key: 'id' },
        onDelete: 'RESTRICT'
      },
      category: { type: Sequelize.ENUM('MS', 'WS', 'MD', 'WD', 'XD'), allowNull: false },
      tournament_id: { type: Sequelize.CHAR(36), allowNull: false },
      tournament_name: { type: Sequelize.STRING(120), allowNull: false },
      placement_from: { type: Sequelize.INTEGER, allowNull: false },
      placement_to: { type: Sequelize.INTEGER, allowNull: false },
      placement_label: { type: Sequelize.STRING(40), allowNull: false },
      base_points: { type: Sequelize.INTEGER, allowNull: false },
      tier_factor: { type: Sequelize.DECIMAL(4, 2), allowNull: false },
      size_factor: { type: Sequelize.DECIMAL(4, 3), allowNull: false },
      strength_factor: { type: Sequelize.DECIMAL(4, 3), allowNull: false },
      points: { type: Sequelize.INTEGER, allowNull: false },
      awarded_at: { type: Sequelize.DATE, allowNull: false },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      revoked_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('ranking_results', ['tenant_id', 'category', 'expires_at'], { name: 'idx_ranking_results_board' });
    await queryInterface.addIndex('ranking_results', ['tournament_id'], { name: 'idx_ranking_results_tournament' });
    await queryInterface.addIndex('ranking_results', ['player_id'], { name: 'idx_ranking_results_player' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('ranking_results');
  }
};
