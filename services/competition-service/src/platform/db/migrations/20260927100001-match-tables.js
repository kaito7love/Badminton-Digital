'use strict';

// Module `match`: mô hình trận CHUNG cho giải và buổi giao lưu (docs/06 mục 1).

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('matches', {
      id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
      tenant_id: { type: Sequelize.STRING(64), allowNull: false },
      context_type: { type: Sequelize.ENUM('tournament', 'session'), allowNull: false },
      context_id: { type: Sequelize.CHAR(36), allowNull: false },
      discipline: { type: Sequelize.ENUM('singles', 'doubles'), allowNull: false },
      stage: { type: Sequelize.ENUM('group', 'knockout', 'extra'), allowNull: false },
      label: { type: Sequelize.STRING(60), allowNull: true },
      group_no: { type: Sequelize.INTEGER, allowNull: true },
      round_no: { type: Sequelize.INTEGER, allowNull: true },
      slot_no: { type: Sequelize.INTEGER, allowNull: true },
      bracket_pos: { type: Sequelize.INTEGER, allowNull: true },
      next_match_id: { type: Sequelize.CHAR(36), allowNull: true },
      next_slot: { type: Sequelize.ENUM('A', 'B'), allowNull: true },
      loser_next_match_id: { type: Sequelize.CHAR(36), allowNull: true },
      loser_next_slot: { type: Sequelize.ENUM('A', 'B'), allowNull: true },
      team_a_id: { type: Sequelize.CHAR(36), allowNull: true },
      team_b_id: { type: Sequelize.CHAR(36), allowNull: true },
      scoring: { type: Sequelize.JSON, allowNull: false },
      games: { type: Sequelize.JSON, allowNull: true },
      outcome: { type: Sequelize.ENUM('normal', 'walkover', 'retired'), allowNull: true },
      winner_side: { type: Sequelize.ENUM('A', 'B'), allowNull: true },
      status: { type: Sequelize.ENUM('scheduled', 'in_play', 'completed', 'cancelled'), allowNull: false },
      rating_weight: { type: Sequelize.DECIMAL(3, 2), allowNull: false, defaultValue: 1 },
      // true khi kỳ tính điểm chứa trận đã chốt → trận vào thống kê.
      counted: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      court_ref: { type: Sequelize.STRING(64), allowNull: true },
      called_at: { type: Sequelize.DATE, allowNull: true },
      completed_at: { type: Sequelize.DATE, allowNull: true },
      recorded_by_ref: { type: Sequelize.STRING(128), allowNull: true },
      version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('matches', ['tenant_id', 'context_type', 'context_id'], { name: 'idx_matches_context' });
    await queryInterface.addIndex('matches', ['next_match_id'], { name: 'idx_matches_next' });

    await queryInterface.createTable('match_participants', {
      id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
      tenant_id: { type: Sequelize.STRING(64), allowNull: false },
      match_id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        references: { model: 'matches', key: 'id' },
        onDelete: 'CASCADE'
      },
      side: { type: Sequelize.ENUM('A', 'B'), allowNull: false },
      player_id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        references: { model: 'players', key: 'id' },
        onDelete: 'RESTRICT'
      },
      created_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('match_participants', ['match_id', 'player_id'], { unique: true, name: 'uq_match_player' });
    await queryInterface.addIndex('match_participants', ['player_id', 'match_id'], { name: 'idx_participant_player' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('match_participants');
    await queryInterface.dropTable('matches');
  }
};
