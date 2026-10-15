'use strict';

// R3 + R4 (báo cáo 33, kế hoạch 37 nhóm C): thu hồi phiên đăng nhập.
//
//  - token_version: access token mang claim `tv`; tăng khi logout / đổi / đặt lại mật khẩu để mọi access
//    token đã phát (còn hạn ≤ 15 phút) mất hiệu lực ngay. Mặc định 0 = khớp token phát TRƯỚC khi có cột
//    này (không có `tv` → coi như 0), nên deploy không đăng xuất ai.
//  - previous_refresh_token / previous_refresh_expires_at: hash refresh token ngay trước lần xoay gần nhất và
//    hạn "ân hạn" (30 giây). Hai tab/luồng SSE cùng refresh một lúc: bên thua cuộc đưa token cũ vẫn được
//    nhận access token mới thay vì bị đăng xuất.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'token_version', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    });
    await queryInterface.addColumn('users', 'previous_refresh_token', {
      type: Sequelize.STRING(64),
      allowNull: true
    });
    await queryInterface.addColumn('users', 'previous_refresh_expires_at', {
      type: Sequelize.DATE,
      allowNull: true
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'previous_refresh_expires_at');
    await queryInterface.removeColumn('users', 'previous_refresh_token');
    await queryInterface.removeColumn('users', 'token_version');
  }
};
