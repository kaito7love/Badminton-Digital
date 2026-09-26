'use strict';

// Module `tournament` (docs/06 mục 2–7).

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const id = { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false };
    const fk = (model, allowNull = false) => ({
      type: Sequelize.CHAR(36),
      allowNull,
      references: { model, key: 'id' },
      onDelete: 'RESTRICT'
    });
    const timestamps = {
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    };

    await queryInterface.createTable('tournaments', {
      id,
      tenant_id: { type: Sequelize.STRING(64), allowNull: false },
      organizer_ref: { type: Sequelize.STRING(64), allowNull: false },
      name: { type: Sequelize.STRING(120), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      starts_on: { type: Sequelize.DATEONLY, allowNull: false },
      tier: { type: Sequelize.ENUM('club', 'open', 'chain'), allowNull: false },
      discipline: { type: Sequelize.ENUM('singles', 'doubles'), allowNull: false },
      gender_rule: { type: Sequelize.ENUM('open', 'men', 'women', 'mixed'), allowNull: false },
      pairing_mode: { type: Sequelize.ENUM('fixed', 'random_balanced'), allowNull: false },
      max_partner_gap: { type: Sequelize.DECIMAL(4, 2), allowNull: true },
      max_entries: { type: Sequelize.INTEGER, allowNull: true },
      rating_rule: { type: Sequelize.JSON, allowNull: true },
      format: { type: Sequelize.ENUM('round_robin', 'groups_knockout', 'knockout'), allowNull: false },
      group_count: { type: Sequelize.INTEGER, allowNull: true },
      group_mode: { type: Sequelize.ENUM('seeded', 'level'), allowNull: false, defaultValue: 'seeded' },
      advance_per_group: { type: Sequelize.INTEGER, allowNull: true },
      third_place_match: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      scoring: { type: Sequelize.JSON, allowNull: false },
      court_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 2 },
      match_minutes: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 15 },
      rated: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      ranked: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      draw_seed: { type: Sequelize.STRING(64), allowNull: true },
      status: { type: Sequelize.ENUM('draft', 'open', 'drawn', 'in_progress', 'finalized', 'cancelled'), allowNull: false },
      stage: { type: Sequelize.ENUM('group', 'knockout'), allowNull: true },
      finalized_at: { type: Sequelize.DATE, allowNull: true },
      created_by_ref: { type: Sequelize.STRING(128), allowNull: false },
      version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      ...timestamps
    });
    await queryInterface.addIndex('tournaments', ['tenant_id', 'organizer_ref', 'status'], { name: 'idx_tournaments_org' });

    await queryInterface.createTable('tournament_entries', {
      id,
      tenant_id: { type: Sequelize.STRING(64), allowNull: false },
      tournament_id: fk('tournaments'),
      player_id: fk('players'),
      partner_player_id: fk('players', true),
      status: { type: Sequelize.ENUM('registered', 'waitlisted', 'withdrawn'), allowNull: false },
      // capacity = hết chỗ lúc đăng ký; draw = lẻ người / lệch nam–nữ khi bốc thăm (bốc lại thì trả về registered)
      waitlist_reason: { type: Sequelize.ENUM('capacity', 'draw'), allowNull: true },
      rating_snapshot: { type: Sequelize.DECIMAL(5, 3), allowNull: true },
      pairing_rating_snapshot: { type: Sequelize.DECIMAL(5, 3), allowNull: true },
      registered_at: { type: Sequelize.DATE, allowNull: false },
      registered_by_ref: { type: Sequelize.STRING(128), allowNull: false },
      ...timestamps
    });
    await queryInterface.addIndex('tournament_entries', ['tournament_id', 'player_id'], { unique: true, name: 'uq_entry_player' });

    await queryInterface.createTable('tournament_teams', {
      id,
      tenant_id: { type: Sequelize.STRING(64), allowNull: false },
      tournament_id: fk('tournaments'),
      player1_id: fk('players'),
      player2_id: fk('players', true),
      team_rating: { type: Sequelize.DECIMAL(5, 3), allowNull: false },
      group_no: { type: Sequelize.INTEGER, allowNull: true },
      pot_no: { type: Sequelize.INTEGER, allowNull: true },
      seed: { type: Sequelize.INTEGER, allowNull: true },
      withdrawn_at: { type: Sequelize.DATE, allowNull: true },
      ...timestamps
    });
    await queryInterface.addIndex('tournament_teams', ['tournament_id'], { name: 'idx_teams_tournament' });

    await queryInterface.createTable('tournament_placements', {
      id,
      tenant_id: { type: Sequelize.STRING(64), allowNull: false },
      tournament_id: fk('tournaments'),
      team_id: fk('tournament_teams'),
      position_from: { type: Sequelize.INTEGER, allowNull: false },
      position_to: { type: Sequelize.INTEGER, allowNull: false },
      label: { type: Sequelize.STRING(40), allowNull: false },
      reached_knockout: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      wins: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('tournament_placements', ['tournament_id', 'team_id'], { unique: true, name: 'uq_placement_team' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('tournament_placements');
    await queryInterface.dropTable('tournament_teams');
    await queryInterface.dropTable('tournament_entries');
    await queryInterface.dropTable('tournaments');
  }
};
