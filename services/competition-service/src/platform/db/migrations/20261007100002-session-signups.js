'use strict';

// Đăng ký buổi giao lưu online (plan 27, slice p2):
//  - play_sessions.max_players: sức chứa (null = không giới hạn). Chỗ tính theo "đã đăng ký giữ chỗ ∪ đang có mặt".
//  - session_signups: khách báo trước "tôi sẽ đến" (khác `play_session_players` = điểm danh thật tại quầy). Điểm danh xong
//    thì đăng ký chuyển `attended`; huỷ thì `cancelled` (dòng giữ lại để đăng ký lại / dấu vết); hết chỗ thì `waitlisted`.
//    `signed_up_at` là khoá xếp hàng chờ (đăng ký lại sau khi huỷ thì xếp cuối).

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('play_sessions', 'max_players', { type: Sequelize.INTEGER, allowNull: true, after: 'rated' });

    const fk = (model) => ({ type: Sequelize.CHAR(36), allowNull: false, references: { model, key: 'id' }, onDelete: 'RESTRICT' });
    await queryInterface.createTable('session_signups', {
      id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
      tenant_id: { type: Sequelize.STRING(64), allowNull: false },
      session_id: fk('play_sessions'),
      player_id: fk('players'),
      status: { type: Sequelize.ENUM('registered', 'waitlisted', 'attended', 'cancelled'), allowNull: false },
      signed_up_by_ref: { type: Sequelize.STRING(128), allowNull: false },
      signed_up_at: { type: Sequelize.DATE, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('session_signups', ['session_id', 'player_id'], { unique: true, name: 'uq_signup_session_player' });
    await queryInterface.addIndex('session_signups', ['tenant_id', 'session_id', 'status', 'signed_up_at'], { name: 'idx_signups_session' });
    await queryInterface.addIndex('session_signups', ['player_id', 'status'], { name: 'idx_signups_player' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('session_signups');
    await queryInterface.removeColumn('play_sessions', 'max_players');
  }
};
