'use strict';

// Module `player`: hồ sơ người chơi + bảng thống kê tổng hợp. Không lưu SĐT /
// email — dữ liệu cá nhân tối thiểu (docs/05 mục 1).

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('players', {
      id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
      tenant_id: { type: Sequelize.STRING(64), allowNull: false },
      external_ref: { type: Sequelize.STRING(128), allowNull: true },
      source_version: { type: Sequelize.BIGINT, allowNull: true },
      display_name: { type: Sequelize.STRING(100), allowNull: false },
      nickname: { type: Sequelize.STRING(30), allowNull: true },
      gender: { type: Sequelize.ENUM('male', 'female'), allowNull: true },
      birth_year: { type: Sequelize.SMALLINT, allowNull: true },
      dominant_hand: { type: Sequelize.ENUM('right', 'left'), allowNull: true },
      playing_since_year: { type: Sequelize.SMALLINT, allowNull: true },
      sessions_per_week: { type: Sequelize.TINYINT, allowNull: true },
      preferred_play: { type: Sequelize.ENUM('singles', 'doubles', 'both'), allowNull: true },
      doubles_position: { type: Sequelize.ENUM('front', 'back', 'both'), allowNull: true },
      home_organizer_ref: { type: Sequelize.STRING(64), allowNull: true },
      visibility: { type: Sequelize.ENUM('public', 'members', 'hidden'), allowNull: false, defaultValue: 'members' },
      status: { type: Sequelize.ENUM('active', 'merged', 'anonymized'), allowNull: false, defaultValue: 'active' },
      merged_into_player_id: {
        type: Sequelize.CHAR(36),
        allowNull: true,
        references: { model: 'players', key: 'id' },
        onDelete: 'RESTRICT'
      },
      version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('players', ['tenant_id', 'external_ref'], { unique: true, name: 'uq_players_tenant_ref' });
    await queryInterface.addIndex('players', ['tenant_id', 'nickname'], { unique: true, name: 'uq_players_tenant_nickname' });
    await queryInterface.addIndex('players', ['tenant_id', 'display_name'], { name: 'idx_players_tenant_name' });

    await queryInterface.createTable('player_stats', {
      id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
      tenant_id: { type: Sequelize.STRING(64), allowNull: false },
      player_id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        references: { model: 'players', key: 'id' },
        onDelete: 'RESTRICT'
      },
      discipline: { type: Sequelize.ENUM('singles', 'doubles'), allowNull: false },
      context: { type: Sequelize.ENUM('tournament', 'session'), allowNull: false },
      matches: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      wins: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      losses: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      games_won: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      games_lost: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      points_won: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      points_lost: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      tournaments: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      titles: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      runner_ups: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      semis: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      streak: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      last5: { type: Sequelize.JSON, allowNull: true },
      best_rating: { type: Sequelize.DECIMAL(5, 3), allowNull: true },
      best_rating_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('player_stats', ['player_id', 'discipline', 'context'], {
      unique: true,
      name: 'uq_player_stats'
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('player_stats');
    await queryInterface.dropTable('players');
  }
};
