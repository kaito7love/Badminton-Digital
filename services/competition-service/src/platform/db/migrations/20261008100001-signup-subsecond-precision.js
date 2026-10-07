'use strict';

// `session_signups.signed_up_at` là khoá xếp hàng chờ, nhưng cột đang là DATETIME
// (chỉ tới giây). Thứ tự chờ sắp theo `(signed_up_at, id)`, mà `uq_signup_session_player`
// buộc đăng ký lại phải DÙNG LẠI đúng hàng cũ — nên hàng đó giữ nguyên `id` nhỏ.
//
// Hệ quả: hai lượt đăng ký rơi vào cùng một giây thì tiebreak theo `id` đẩy người
// vừa huỷ-rồi-đăng-ký-lại lên TRƯỚC người đã chờ sẵn, trái đúng quy tắc "đăng ký lại
// thì xếp cuối" ghi ở migration 20261007100002. Lỗi này ẩn trên máy chậm và chỉ lộ
// khi chạy nhanh (CI đỏ ở tests/integration/sessionSignup.test.js, local xanh).
//
// DATETIME(3) giữ mili-giây, nên hai request HTTP riêng biệt không còn trùng mốc.
// Lưu ý: không đổi sang DATETIME(6) vì mili-giây đã đủ tách hai lượt gọi mạng,
// còn MySQL tốn thêm byte cho mỗi mức 2 chữ số thập phân.

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('session_signups', 'signed_up_at', {
      type: Sequelize.DATE(3),
      allowNull: false
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('session_signups', 'signed_up_at', {
      type: Sequelize.DATE,
      allowNull: false
    });
  }
};
