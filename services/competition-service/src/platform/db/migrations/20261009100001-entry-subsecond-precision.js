'use strict';

// Cùng một lỗi với migration 20261008100001 (session_signups), ở bảng thứ hai mà lần
// trước bỏ sót: `tournament_entries.registered_at` là khoá xếp hàng chờ của giải đấu.
//
// Ba thành phần ghép lại:
//  1. `uq_entry_player` UNIQUE (tournament_id, player_id) buộc đăng ký lại sau khi rút
//     phải DÙNG LẠI hàng cũ (`old.update(values)` ở tournamentService) → giữ `id` nhỏ;
//  2. thứ tự chờ sắp theo `(registered_at, id)`;
//  3. cột là DATETIME — chỉ tới giây, MySQL cắt phần mili-giây của `new Date()`.
//
// Hai lượt đăng ký rơi vào cùng một giây thì hoà thời gian, tiebreak `id` đẩy người vừa
// rút-rồi-đăng-ký-lại lên TRƯỚC người đã chờ sẵn — trái quy tắc "đăng ký lại thì vào cuối
// danh sách chờ". Chỉ lộ khi chạy đủ nhanh (CI đỏ ở selfRegistration.test.js, máy dev xanh).
//
// DATETIME(3) giữ mili-giây nên hai request HTTP riêng biệt không còn trùng mốc. Dữ liệu
// cũ giữ nguyên, phần thập phân là .000. Lưu ý đây là thu hẹp chứ chưa bịt hẳn — xem mục
// "Chưa làm" trong docs/05-extra/02-remediation/00-tien-do.md.

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('tournament_entries', 'registered_at', {
      type: Sequelize.DATE(3),
      allowNull: false
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('tournament_entries', 'registered_at', {
      type: Sequelize.DATE,
      allowNull: false
    });
  }
};
