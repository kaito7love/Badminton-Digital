'use strict';

/**
 * Bước 2/2 của việc tách trục trạng thái sân.
 *
 * Chuyển dữ liệu sang bộ giá trị mới rồi thu hẹp ENUM:
 *   empty, playing -> active   (sân vẫn đang khai thác; việc "có ai chơi không"
 *                               từ nay suy ra từ court_sessions đang mở)
 *   maintenance    -> giữ nguyên
 *   inactive       -> giá trị mới, dành cho sân ngưng khai thác dài hạn
 *                     (chưa mở bán, đã thanh lý, cho thuê mục đích khác)
 *
 * Phân biệt maintenance/inactive có ý nghĩa nghiệp vụ thật: sân bảo trì vẫn nằm
 * trong công suất kinh doanh (đang mất doanh thu tạm thời), sân inactive thì không
 * — nên mẫu số của tỷ lệ lấp đầy phải loại sân inactive ra.
 */
const UNION_ENUM = "ENUM('empty','playing','maintenance','active','inactive')";
const NEW_ENUM = "ENUM('active','maintenance','inactive')";

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE \`courts\` SET \`status\` = 'active' WHERE \`status\` IN ('empty','playing')`
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE \`courts\` MODIFY \`status\` ${NEW_ENUM} NOT NULL DEFAULT 'active'`
    );
  },

  async down(queryInterface) {
    // Trả về trạng thái mở rộng của migration trước. Lưu ý đây là bước có mất mát
    // thông tin: 'inactive' không tồn tại trong bộ cũ nên bị gộp về 'maintenance'.
    await queryInterface.sequelize.query(
      `ALTER TABLE \`courts\` MODIFY \`status\` ${UNION_ENUM} NOT NULL DEFAULT 'empty'`
    );
    await queryInterface.sequelize.query(
      `UPDATE \`courts\` SET \`status\` = 'empty' WHERE \`status\` = 'active'`
    );
    await queryInterface.sequelize.query(
      `UPDATE \`courts\` SET \`status\` = 'maintenance' WHERE \`status\` = 'inactive'`
    );
  }
};
