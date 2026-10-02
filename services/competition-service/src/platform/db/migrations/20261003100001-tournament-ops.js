'use strict';

// Vận hành giải ngày thi đấu (plan 20):
//  - tournaments.court_refs: sân của giải (như buổi giao lưu) — "Gọi ra sân" chỉ vào các sân này;
//    null = giải tạo trước khi có cột, chỉ có court_count;
//  - tournaments.start_time 'HH:MM' (giờ địa phương của chi nhánh) — giờ dự kiến từng lượt;
//  - tournaments.check_in_required: bốc thăm tại sân, chỉ lấy người đã điểm danh;
//  - tournament_entries.checked_in_at / checked_in_by_ref: điểm danh ngày thi đấu;
//  - waitlist_reason thêm `absent`: đã đăng ký nhưng vắng lúc bốc thăm (bốc lại / mở lại thì về registered).

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('tournaments', 'court_refs', { type: Sequelize.JSON, allowNull: true, after: 'court_count' });
    await queryInterface.addColumn('tournaments', 'start_time', { type: Sequelize.CHAR(5), allowNull: true, after: 'starts_on' });
    await queryInterface.addColumn('tournaments', 'check_in_required', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false, after: 'max_entries' });
    await queryInterface.addColumn('tournament_entries', 'checked_in_at', { type: Sequelize.DATE, allowNull: true, after: 'waitlist_reason' });
    await queryInterface.addColumn('tournament_entries', 'checked_in_by_ref', { type: Sequelize.STRING(128), allowNull: true, after: 'checked_in_at' });
    await queryInterface.changeColumn('tournament_entries', 'waitlist_reason', { type: Sequelize.ENUM('capacity', 'draw', 'absent'), allowNull: true });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query("UPDATE tournament_entries SET status = 'registered', waitlist_reason = NULL WHERE waitlist_reason = 'absent'");
    await queryInterface.changeColumn('tournament_entries', 'waitlist_reason', { type: Sequelize.ENUM('capacity', 'draw'), allowNull: true });
    await queryInterface.removeColumn('tournament_entries', 'checked_in_by_ref');
    await queryInterface.removeColumn('tournament_entries', 'checked_in_at');
    await queryInterface.removeColumn('tournaments', 'check_in_required');
    await queryInterface.removeColumn('tournaments', 'start_time');
    await queryInterface.removeColumn('tournaments', 'court_refs');
  }
};
