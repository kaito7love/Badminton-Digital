'use strict';

// Module `match`: bấm điểm trực tiếp (docs/06 mục 1.5, plan 19). Một dòng cho mỗi trận đã
// bấm điểm; tỉ số tính lại từ chuỗi pha cầu. Bảng riêng (không thêm cột vào `matches`)
// để mỗi lần bấm không đổi `version` của trận và không khoá dòng trận lâu.

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('match_live_scores', {
      // Xoá trận (huỷ bốc thăm, gỡ migration giao lưu) thì xoá theo.
      match_id: {
        type: Sequelize.CHAR(36),
        primaryKey: true,
        allowNull: false,
        references: { model: 'matches', key: 'id' },
        onDelete: 'CASCADE'
      },
      tenant_id: { type: Sequelize.STRING(64), allowNull: false },
      // Mỗi ký tự là đội thắng một pha cầu: 'A' / 'B'.
      rallies: { type: Sequelize.STRING(1000), allowNull: false, defaultValue: '' },
      first_server: { type: Sequelize.ENUM('A', 'B'), allowNull: false, defaultValue: 'A' },
      // Tăng ở MỌI lần đổi (kể cả hoàn tác) — client gửi kèm để không cộng trùng.
      revision: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      scored_by_ref: { type: Sequelize.STRING(128), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('match_live_scores');
  }
};
