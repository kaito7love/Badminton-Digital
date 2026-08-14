'use strict';

/**
 * Bước 1/2 của việc tách trục trạng thái sân (mở rộng → chuyển → thu hẹp).
 *
 * `courts.status` đang gộp hai khái niệm độc lập vào một cột:
 *   - vòng đời tài sản  : sân có đang được khai thác không (do quản lý quyết định)
 *   - chiếm dụng tức thời: ngay lúc này có ai chơi không (suy ra từ court_sessions)
 *
 * Bước này chỉ nới ENUM thành hợp của bộ giá trị cũ và mới, chưa đụng tới dữ liệu.
 * Nhờ vậy code cũ (ghi 'empty') và code mới (ghi 'active') đều chạy được — đây là
 * cửa sổ tương thích cho phép quay đầu nếu có sự cố.
 */
const OLD_ENUM = "ENUM('empty','playing','maintenance')";
const UNION_ENUM = "ENUM('empty','playing','maintenance','active','inactive')";

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE \`courts\` MODIFY \`status\` ${UNION_ENUM} NOT NULL DEFAULT 'empty'`
    );
  },

  async down(queryInterface) {
    // Đưa các giá trị chỉ có ở bộ mới về bộ cũ trước khi thu hẹp, nếu không MySQL
    // sẽ cắt cụt dữ liệu thành chuỗi rỗng.
    await queryInterface.sequelize.query(
      `UPDATE \`courts\` SET \`status\` = 'empty' WHERE \`status\` = 'active'`
    );
    await queryInterface.sequelize.query(
      `UPDATE \`courts\` SET \`status\` = 'maintenance' WHERE \`status\` = 'inactive'`
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE \`courts\` MODIFY \`status\` ${OLD_ENUM} NOT NULL DEFAULT 'empty'`
    );
  }
};
