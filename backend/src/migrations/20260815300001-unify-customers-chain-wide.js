'use strict';

// Gộp khách hàng thành 1 hồ sơ duy nhất toàn chuỗi thay vì tách theo từng chi
// nhánh. Trước đây (20260814100004-relax-customer-phone.js) unique được đặt
// theo (branch_id, phone) với lý do "hai chi nhánh không được trùng số điện
// thoại" — nhưng với số điện thoại thật thì 1 số = 1 người, nên ràng buộc đó
// mới là điểm sai: cùng 1 khách đặt sân ở 2 chi nhánh sẽ bị tách thành 2 hồ
// sơ, loyalty/tổng chi tiêu không gộp. Migration này gộp lại rồi bỏ hẳn
// branch_id khỏi customers — Booking/CourtSession vẫn giữ branch_id riêng để
// biết giao dịch diễn ra ở đâu, chỉ danh tính khách hàng là dùng chung.

const computeLoyaltyTier = (totalSpent) => {
  if (totalSpent >= 15000000) return 'vip';
  if (totalSpent >= 5000000) return 'gold';
  return 'normal';
};

module.exports = {
  async up(queryInterface) {
    // 1. Gộp các hồ sơ trùng số điện thoại nằm ở nhiều chi nhánh khác nhau.
    //    Ưu tiên hồ sơ đã gắn tài khoản đăng nhập (user_id) làm hồ sơ sống sót.
    const [dupeGroups] = await queryInterface.sequelize.query(
      'SELECT phone FROM customers WHERE phone IS NOT NULL GROUP BY phone HAVING COUNT(*) > 1'
    );

    for (const { phone } of dupeGroups) {
      const [rows] = await queryInterface.sequelize.query(
        'SELECT id, user_id, total_spent FROM customers WHERE phone = ? ORDER BY (user_id IS NULL) ASC, id ASC',
        { replacements: [phone] }
      );
      const survivor = rows[0];
      const losers = rows.slice(1);
      const totalSpent = rows.reduce((sum, r) => sum + Number(r.total_spent), 0);
      const loyaltyTier = computeLoyaltyTier(totalSpent);

      for (const loser of losers) {
        await queryInterface.sequelize.query(
          'UPDATE bookings SET customer_id = ? WHERE customer_id = ?',
          { replacements: [survivor.id, loser.id] }
        );
        await queryInterface.sequelize.query(
          'UPDATE court_sessions SET customer_id = ? WHERE customer_id = ?',
          { replacements: [survivor.id, loser.id] }
        );
      }

      await queryInterface.sequelize.query(
        'UPDATE customers SET total_spent = ?, loyalty_tier = ? WHERE id = ?',
        { replacements: [totalSpent, loyaltyTier, survivor.id] }
      );

      if (losers.length) {
        await queryInterface.sequelize.query(
          `DELETE FROM customers WHERE id IN (${losers.map((l) => l.id).join(',')})`
        );
      }
    }

    // 2. Bỏ FK trước — MySQL không cho drop index đang được FK dùng làm chỗ
    //    tựa. Tra tên constraint động vì tên có thể khác nhau giữa các môi
    //    trường (mirror cách p1-production-safety đã xử lý activity_logs).
    const [fkRows] = await queryInterface.sequelize.query(
      `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers'
         AND COLUMN_NAME = 'branch_id' AND REFERENCED_TABLE_NAME IS NOT NULL`
    );
    for (const { CONSTRAINT_NAME } of fkRows) {
      await queryInterface.sequelize.query(`ALTER TABLE \`customers\` DROP FOREIGN KEY \`${CONSTRAINT_NAME}\``);
    }

    // 3. Unique theo phone toàn hệ thống thay vì theo (branch_id, phone).
    //    MySQL cho phép nhiều NULL trong unique index nên khách vãng lai
    //    không số điện thoại vẫn thoải mái cùng tồn tại.
    await queryInterface.sequelize.query('DROP INDEX `uq_customers_branch_phone` ON `customers`');
    await queryInterface.sequelize.query('CREATE UNIQUE INDEX `uk_customers_phone` ON `customers` (`phone`)');

    // 4. Bỏ hẳn cột branch_id khỏi customers.
    await queryInterface.removeColumn('customers', 'branch_id');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('customers', 'branch_id', {
      type: Sequelize.INTEGER,
      allowNull: true
    });
    await queryInterface.sequelize.query('UPDATE `customers` SET `branch_id` = 1 WHERE `branch_id` IS NULL');
    await queryInterface.changeColumn('customers', 'branch_id', {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: { model: 'branches', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    });

    await queryInterface.sequelize.query('DROP INDEX `uk_customers_phone` ON `customers`').catch(() => {});
    await queryInterface.sequelize.query('CREATE UNIQUE INDEX `uq_customers_branch_phone` ON `customers` (`branch_id`, `phone`)');

    // Không thể tách lại các hồ sơ đã gộp ở up() — không phân biệt được hồ sơ
    // nào là gộp, hồ sơ nào vốn đã là 1. Cần khôi phục từ bản backup nếu muốn
    // dữ liệu quay đúng như trước.
    console.warn('[unify-customers] down(): các hồ sơ khách hàng đã gộp ở up() không tách ngược được — khôi phục từ backup nếu cần.');
  }
};
