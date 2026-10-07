'use strict';

// Đăng ký online (plan 27, slice p1): đồng đội chưa có tài khoản.
//  - players.contact_phone: SĐT khách nhập khi đăng ký hộ đồng đội (chuẩn hoá 0xxxxxxxxx) — chỉ nhân viên xem, dùng để nhận ra
//    cùng một người ở lần đăng ký sau (một SĐT = một hồ sơ khách) và để nhân viên liên hệ / gộp hồ sơ khi họ có tài khoản;
//  - players.source: 'online_guest' = hồ sơ do khách tạo khi đăng ký online (null = tạo từ app chính / nhân viên);
//  - players.created_by_ref: ai tạo (bd:user:<id>) — để giới hạn số hồ sơ khách mới mỗi người mỗi ngày.

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('players', 'contact_phone', { type: Sequelize.STRING(20), allowNull: true, after: 'external_ref' });
    await queryInterface.addColumn('players', 'source', { type: Sequelize.STRING(24), allowNull: true, after: 'contact_phone' });
    await queryInterface.addColumn('players', 'created_by_ref', { type: Sequelize.STRING(128), allowNull: true, after: 'source' });
    await queryInterface.addIndex('players', ['tenant_id', 'contact_phone'], { name: 'idx_players_contact_phone' });
    await queryInterface.addIndex('players', ['tenant_id', 'created_by_ref', 'created_at'], { name: 'idx_players_created_by' });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('players', 'idx_players_created_by');
    await queryInterface.removeIndex('players', 'idx_players_contact_phone');
    await queryInterface.removeColumn('players', 'created_by_ref');
    await queryInterface.removeColumn('players', 'source');
    await queryInterface.removeColumn('players', 'contact_phone');
  }
};
