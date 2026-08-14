'use strict';

/**
 * Nới ràng buộc số điện thoại khách hàng — sửa gốc của việc phải đẻ ra cột riêng
 * cho khách vãng lai.
 *
 * Lý do trước đây phải thêm guest_name/guest_phone vào bookings và court_sessions
 * là vì customers.phone đang NOT NULL + UNIQUE: khách vãng lai không có số điện
 * thoại thì không tạo nổi hồ sơ khách hàng. Nới ràng buộc thì mọi khách đều là
 * khách hàng, khách vãng lai chỉ là hồ sơ thiếu thông tin — không cần cột riêng.
 *
 * Nhân tiện sửa luôn một lỗi của mô hình multi-branch: unique cũ áp trên toàn hệ
 * thống nên hai chi nhánh không thể có cùng một số điện thoại. Unique mới gắn với
 * (branch_id, phone). MySQL cho phép nhiều NULL trong unique index, nên khách vãng
 * lai không số vẫn thoải mái cùng tồn tại.
 */
const NEW_INDEX = 'uq_customers_branch_phone';

// Xoá index theo tên, bỏ qua nếu tên đó không tồn tại (tuỳ lịch sử DB từng máy)
const dropIndexIfExists = async (queryInterface, table, indexName) => {
  const [rows] = await queryInterface.sequelize.query(
    `SHOW INDEX FROM \`${table}\` WHERE Key_name = '${indexName}'`
  );
  if (rows.length > 0) {
    await queryInterface.sequelize.query(`DROP INDEX \`${indexName}\` ON \`${table}\``);
  }
};

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      'ALTER TABLE `customers` MODIFY `phone` VARCHAR(20) NULL'
    );

    await dropIndexIfExists(queryInterface, 'customers', 'phone');
    // index thường trên cùng cột, thừa khi đã có composite phía dưới
    await dropIndexIfExists(queryInterface, 'customers', 'customers_phone');

    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX \`${NEW_INDEX}\` ON \`customers\` (\`branch_id\`, \`phone\`)`
    );
  },

  async down(queryInterface) {
    await dropIndexIfExists(queryInterface, 'customers', NEW_INDEX);

    // Chỉ khôi phục được NOT NULL nếu không còn khách nào thiếu số điện thoại
    const [missing] = await queryInterface.sequelize.query(
      'SELECT COUNT(*) AS total FROM `customers` WHERE `phone` IS NULL'
    );
    if (Number(missing[0].total) > 0) {
      throw new Error(
        `Không thể hoàn tác: đang có ${missing[0].total} khách hàng không có số điện thoại ` +
        '(khách vãng lai). Hãy bổ sung số hoặc xoá các hồ sơ đó trước.'
      );
    }

    await queryInterface.sequelize.query(
      'ALTER TABLE `customers` MODIFY `phone` VARCHAR(20) NOT NULL'
    );
    await queryInterface.sequelize.query(
      'CREATE UNIQUE INDEX `phone` ON `customers` (`phone`)'
    );
  }
};
