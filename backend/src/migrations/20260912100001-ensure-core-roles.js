'use strict';

// Ba vai trò lõi trước đây chỉ được tạo trong seeder DEMO
// (20260723000001-seed-initial-data.js). Cài production đúng cách — chỉ
// migrate, không seed tài khoản mật khẩu công khai — thì bảng roles chỉ có
// branch_manager: khách tự đăng ký nhận 500 "chưa cấu hình vai trò khách hàng",
// và không có role admin để tạo tài khoản quản trị đầu tiên.
//
// Giữ id cố định 1/2/3 như seeder cũ: seeder demo và dữ liệu đang có đều tham
// chiếu role_id 1–3, branch_manager đã chiếm id 4. Chèn theo tên và bỏ qua
// role đã có, nên DB đang chạy đủ 4 role thì migration này không đổi gì.
const CORE_ROLES = [
  { id: 1, name: 'admin', description: 'Chủ sân / Quản trị hệ thống' },
  { id: 2, name: 'employee', description: 'Nhân viên vận hành tại quầy' },
  { id: 3, name: 'customer', description: 'Khách hàng thuê sân' }
];

module.exports = {
  async up(queryInterface) {
    for (const role of CORE_ROLES) {
      await queryInterface.sequelize.query(
        `INSERT INTO roles (id, name, description, created_at, updated_at)
         SELECT :id, :name, :description, UTC_TIMESTAMP(), UTC_TIMESTAMP()
         FROM DUAL
         WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = :name)`,
        { replacements: role }
      );
    }
  },

  // Không xoá gì. Role đang được users tham chiếu (khoá ngoại), và trên DB cài
  // trước migration này thì chính các role đó do seeder tạo ra — xoá khi undo
  // là phá dữ liệu không thuộc về migration này.
  async down() {}
};
