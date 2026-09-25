'use strict';

// Module `rating`: điểm trình hiện tại, các bài chấm, sổ điểm (chỉ thêm, không
// sửa / xoá — docs/03).

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const playerFk = {
      type: Sequelize.CHAR(36),
      allowNull: false,
      references: { model: 'players', key: 'id' },
      onDelete: 'RESTRICT'
    };

    await queryInterface.createTable('player_ratings', {
      id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
      tenant_id: { type: Sequelize.STRING(64), allowNull: false },
      player_id: playerFk,
      discipline: { type: Sequelize.ENUM('singles', 'doubles'), allowNull: false },
      rating: { type: Sequelize.DECIMAL(5, 3), allowNull: false },
      rated_matches: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      last_match_at: { type: Sequelize.DATE, allowNull: true },
      verified: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      verified_by_ref: { type: Sequelize.STRING(128), allowNull: true },
      verified_at: { type: Sequelize.DATE, allowNull: true },
      version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('player_ratings', ['player_id', 'discipline'], { unique: true, name: 'uq_player_rating' });
    await queryInterface.addIndex('player_ratings', ['tenant_id', 'discipline', 'rating'], { name: 'idx_ratings_board' });

    await queryInterface.createTable('assessments', {
      id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
      tenant_id: { type: Sequelize.STRING(64), allowNull: false },
      player_id: playerFk,
      source: { type: Sequelize.ENUM('self', 'staff', 'staff_quick', 'video_ai'), allowNull: false },
      rubric_version: { type: Sequelize.STRING(16), allowNull: true },
      answers: { type: Sequelize.JSON, allowNull: false },
      profile: { type: Sequelize.JSON, allowNull: true },
      confidence: { type: Sequelize.JSON, allowNull: true },
      result: { type: Sequelize.JSON, allowNull: true },
      status: {
        type: Sequelize.ENUM('applied', 'recorded', 'pending_review', 'rejected', 'superseded'),
        allowNull: false
      },
      needs_verification: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      submitted_by_ref: { type: Sequelize.STRING(128), allowNull: false },
      reviewed_by_ref: { type: Sequelize.STRING(128), allowNull: true },
      reviewed_at: { type: Sequelize.DATE, allowNull: true },
      review_note: { type: Sequelize.STRING(500), allowNull: true },
      evidence_ref: { type: Sequelize.STRING(128), allowNull: true },
      match_id: { type: Sequelize.CHAR(36), allowNull: true },
      note: { type: Sequelize.STRING(500), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('assessments', ['tenant_id', 'status'], { name: 'idx_assessments_status' });
    await queryInterface.addIndex('assessments', ['player_id', 'created_at'], { name: 'idx_assessments_player' });

    await queryInterface.createTable('rating_changes', {
      id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
      tenant_id: { type: Sequelize.STRING(64), allowNull: false },
      player_id: playerFk,
      discipline: { type: Sequelize.ENUM('singles', 'doubles'), allowNull: false },
      rating_before: { type: Sequelize.DECIMAL(5, 3), allowNull: true },
      rating_after: { type: Sequelize.DECIMAL(5, 3), allowNull: false },
      delta: { type: Sequelize.DECIMAL(6, 3), allowNull: false },
      reason: {
        type: Sequelize.ENUM('assessment', 'tournament', 'session', 'adjustment', 'rollback', 'merge'),
        allowNull: false
      },
      assessment_id: { type: Sequelize.CHAR(36), allowNull: true },
      context_type: { type: Sequelize.STRING(16), allowNull: true },
      context_id: { type: Sequelize.CHAR(36), allowNull: true },
      actor_ref: { type: Sequelize.STRING(128), allowNull: false },
      note: { type: Sequelize.STRING(500), allowNull: true },
      calc: { type: Sequelize.JSON, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('rating_changes', ['player_id', 'discipline', 'created_at'], { name: 'idx_rating_changes_player' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('rating_changes');
    await queryInterface.dropTable('assessments');
    await queryInterface.dropTable('player_ratings');
  }
};
