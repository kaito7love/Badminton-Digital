'use strict';

// Cho phép đăng nhập bằng số điện thoại.
//
// Hai thay đổi đi liền nhau:
//  - `phone` phải là duy nhất, vì từ nay nó là danh tính đăng nhập chứ không
//    còn là một thông tin liên hệ cho vui. MySQL bỏ qua NULL khi kiểm UNIQUE,
//    nên nhân viên cũ chưa có số vẫn nằm yên được.
//  - `email` phải cho phép NULL, vì khách đặt sân online chỉ có số điện thoại.
//    Trước đây cột này NOT NULL nên không thể tạo tài khoản kiểu đó.
//
// Đổi lại phải có ràng buộc: một tài khoản trống cả hai thì vĩnh viễn không ai
// đăng nhập vào được — đó là dữ liệu rác, chặn ngay ở tầng DB.

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('users', 'email', {
      type: Sequelize.STRING(100),
      allowNull: true
    });

    await queryInterface.changeColumn('users', 'phone', {
      type: Sequelize.STRING(20),
      allowNull: true
    });

    await queryInterface.addIndex('users', ['phone'], {
      name: 'uq_users_phone',
      unique: true
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE users
      ADD CONSTRAINT chk_users_login_identity
      CHECK (email IS NOT NULL OR phone IS NOT NULL)
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      'ALTER TABLE users DROP CONSTRAINT chk_users_login_identity'
    );
    await queryInterface.removeIndex('users', 'uq_users_phone');
    await queryInterface.changeColumn('users', 'email', {
      type: Sequelize.STRING(100),
      allowNull: false
    });
  }
};
