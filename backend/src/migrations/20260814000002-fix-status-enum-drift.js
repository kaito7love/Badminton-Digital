'use strict';

/**
 * Schema drift fix: the Court/CourtSession Sequelize models were updated to a
 * new status vocabulary (courts: active/maintenance/inactive — PLAYING/AVAILABLE
 * are derived from active sessions, never stored; court_sessions: playing/
 * completed/cancelled/closed) but the DB ENUM columns were never migrated to
 * match. courts.status is still ENUM('empty','playing','maintenance') and
 * court_sessions.status is still ENUM('playing','closed') at the DB level,
 * which means CourtService.closeCourt() (sets session status 'completed') and
 * any attempt to persist court status 'active'/'inactive' fail against the
 * live DB even though the Sequelize model accepts those values.
 *
 * courts.status data must be remapped to different string values, which MySQL
 * ENUMs reject mid-flight (UPDATE ... SET status = 'active' fails with "Data
 * truncated" while the column is still the old ENUM, since 'active' isn't a
 * member of it yet). So both directions widen to a union of old+new values
 * first, remap the data, then narrow to the final target ENUM.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('courts', 'status', {
      type: Sequelize.ENUM('empty', 'playing', 'maintenance', 'active', 'inactive'),
      allowNull: false,
      defaultValue: 'empty'
    });
    await queryInterface.sequelize.query(
      `UPDATE courts SET status = 'active' WHERE status IN ('empty', 'playing')`
    );
    await queryInterface.changeColumn('courts', 'status', {
      type: Sequelize.ENUM('active', 'maintenance', 'inactive'),
      allowNull: false,
      defaultValue: 'active'
    });

    await queryInterface.changeColumn('court_sessions', 'status', {
      type: Sequelize.ENUM('playing', 'completed', 'cancelled', 'closed'),
      allowNull: false,
      defaultValue: 'playing'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `UPDATE court_sessions SET status = 'closed' WHERE status IN ('completed', 'cancelled')`
    );
    await queryInterface.changeColumn('court_sessions', 'status', {
      type: Sequelize.ENUM('playing', 'closed'),
      allowNull: false,
      defaultValue: 'playing'
    });

    await queryInterface.changeColumn('courts', 'status', {
      type: Sequelize.ENUM('active', 'maintenance', 'inactive', 'empty', 'playing'),
      allowNull: false,
      defaultValue: 'active'
    });
    await queryInterface.sequelize.query(
      `UPDATE courts SET status = 'empty' WHERE status = 'active'`
    );
    await queryInterface.sequelize.query(
      `UPDATE courts SET status = 'maintenance' WHERE status = 'inactive'`
    );
    await queryInterface.changeColumn('courts', 'status', {
      type: Sequelize.ENUM('empty', 'playing', 'maintenance'),
      allowNull: false,
      defaultValue: 'empty'
    });
  }
};
