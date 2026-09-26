'use strict';

// Module `session`: buổi giao lưu (docs/06 mục 8). Thêm vào `matches`:
//  - stage `session` (trận giao lưu không thuộc vòng bảng / loại trực tiếp);
//  - status `ended` (đã đánh xong nhưng không nhập tỉ số — sân được nhả, trận vẫn
//    tính vào lịch sử đồng đội / đối thủ của buổi; đóng buổi thì thành `cancelled`).

const STAGES = ['group', 'knockout', 'extra'];
const STATUSES = ['scheduled', 'in_play', 'completed', 'cancelled'];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const id = { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false };
    const fk = (model) => ({ type: Sequelize.CHAR(36), allowNull: false, references: { model, key: 'id' }, onDelete: 'RESTRICT' });
    const timestamps = {
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    };

    await queryInterface.createTable('play_sessions', {
      id,
      tenant_id: { type: Sequelize.STRING(64), allowNull: false },
      organizer_ref: { type: Sequelize.STRING(64), allowNull: false },
      name: { type: Sequelize.STRING(120), allowNull: false },
      starts_at: { type: Sequelize.DATE, allowNull: false },
      court_refs: { type: Sequelize.JSON, allowNull: false },
      format: { type: Sequelize.ENUM('doubles', 'singles'), allowNull: false },
      mode: { type: Sequelize.ENUM('balanced', 'level', 'random'), allowNull: false },
      scoring: { type: Sequelize.JSON, allowNull: false },
      rated: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      seed: { type: Sequelize.STRING(64), allowNull: false },
      // Số lần "Xếp sân trống" đã xác nhận — đánh số lượt, dẫn xuất seed của từng lượt.
      rounds: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      status: { type: Sequelize.ENUM('open', 'closed', 'cancelled'), allowNull: false },
      closed_at: { type: Sequelize.DATE, allowNull: true },
      created_by_ref: { type: Sequelize.STRING(128), allowNull: false },
      version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      ...timestamps
    });
    await queryInterface.addIndex('play_sessions', ['tenant_id', 'organizer_ref', 'status'], { name: 'idx_sessions_org' });

    await queryInterface.createTable('play_session_players', {
      id,
      tenant_id: { type: Sequelize.STRING(64), allowNull: false },
      session_id: fk('play_sessions'),
      player_id: fk('players'),
      status: { type: Sequelize.ENUM('present', 'left'), allowNull: false },
      joined_at: { type: Sequelize.DATE, allowNull: false },
      left_at: { type: Sequelize.DATE, allowNull: true },
      // Số trận đã được xếp trong buổi (trận bị huỷ thì trừ lại).
      games_played: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      // Người đến muộn được tính như đã đánh bằng số trận ít nhất của người đang có mặt.
      games_credit: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      // Rảnh từ lúc nào (null = đang ở sân).
      waiting_since: { type: Sequelize.DATE, allowNull: true },
      checked_in_by_ref: { type: Sequelize.STRING(128), allowNull: false },
      ...timestamps
    });
    await queryInterface.addIndex('play_session_players', ['session_id', 'player_id'], { unique: true, name: 'uq_session_player' });
    await queryInterface.addIndex('play_session_players', ['player_id'], { name: 'idx_session_players_player' });

    await queryInterface.changeColumn('matches', 'stage', { type: Sequelize.ENUM(...STAGES, 'session'), allowNull: false });
    await queryInterface.changeColumn('matches', 'status', { type: Sequelize.ENUM(...STATUSES, 'ended'), allowNull: false });
    await queryInterface.addIndex('matches', ['context_id', 'status', 'court_ref'], { name: 'idx_matches_context_court' });
  },

  async down(queryInterface, Sequelize) {
    // Trận giao lưu không còn ngữ cảnh → xoá trước khi thu hẹp ENUM.
    await queryInterface.sequelize.query(
      "DELETE mp FROM match_participants mp JOIN matches m ON m.id = mp.match_id WHERE m.context_type = 'session'"
    );
    await queryInterface.sequelize.query("DELETE FROM matches WHERE context_type = 'session'");
    await queryInterface.removeIndex('matches', 'idx_matches_context_court');
    await queryInterface.changeColumn('matches', 'status', { type: Sequelize.ENUM(...STATUSES), allowNull: false });
    await queryInterface.changeColumn('matches', 'stage', { type: Sequelize.ENUM(...STAGES), allowNull: false });
    await queryInterface.dropTable('play_session_players');
    await queryInterface.dropTable('play_sessions');
  }
};
