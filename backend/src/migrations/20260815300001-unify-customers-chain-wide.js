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
  async up(queryInterface, Sequelize) {
    // 0. Bảng audit ghi lại từng quyết định gộp / xung đột trước khi đổi dữ
    //    liệu — vì bước gộp bên dưới xoá thẳng hồ sơ (paranoid bị bỏ qua do
    //    dùng raw SQL) nên cần có dấu vết để đối chiếu/điều tra sau này.
    await queryInterface.createTable('customer_merge_audit', {
      id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
      phone: { allowNull: false, type: Sequelize.STRING(30) },
      action: { allowNull: false, type: Sequelize.STRING(30) }, // 'merged' | 'conflict_needs_review'
      survivor_customer_id: { allowNull: true, type: Sequelize.INTEGER },
      affected_customer_id: { allowNull: false, type: Sequelize.INTEGER },
      affected_user_id: { allowNull: true, type: Sequelize.INTEGER },
      affected_total_spent: { allowNull: true, type: Sequelize.DECIMAL(12, 2) },
      note: { allowNull: true, type: Sequelize.STRING(255) },
      created_at: { allowNull: false, type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }
    });

    // 1. Gộp các hồ sơ trùng số điện thoại nằm ở nhiều chi nhánh khác nhau.
    //    Ưu tiên hồ sơ đã gắn tài khoản đăng nhập (user_id) làm hồ sơ sống sót.
    //    Chỉ TỰ ĐỘNG gộp khi tối đa 1 hồ sơ trong nhóm đã gắn tài khoản đăng
    //    nhập — nếu có từ 2 hồ sơ có user_id trở lên cùng trùng SĐT, đó là 2
    //    tài khoản thật khác nhau vô tình trùng số (đổi SIM, người thân dùng
    //    chung máy, gõ nhầm...), KHÔNG được tự xoá/gộp lịch sử của họ. Thay
    //    vào đó chỉ gỡ SĐT khỏi các hồ sơ dư để không vi phạm unique index
    //    mới ở bước 3, ghi log vào customer_merge_audit và để admin tự đối
    //    chiếu, xử lý tay.
    const [dupeGroups] = await queryInterface.sequelize.query(
      'SELECT phone FROM customers WHERE phone IS NOT NULL GROUP BY phone HAVING COUNT(*) > 1'
    );

    for (const { phone } of dupeGroups) {
      const [rows] = await queryInterface.sequelize.query(
        'SELECT id, user_id, total_spent FROM customers WHERE phone = ? ORDER BY (user_id IS NULL) ASC, id ASC',
        { replacements: [phone] }
      );
      const linkedCount = rows.filter((r) => r.user_id !== null).length;

      if (linkedCount > 1) {
        const [keep, ...rest] = rows;
        for (const row of rest) {
          await queryInterface.sequelize.query('UPDATE customers SET phone = NULL WHERE id = ?', {
            replacements: [row.id]
          });
          await queryInterface.sequelize.query(
            `INSERT INTO customer_merge_audit
               (phone, action, survivor_customer_id, affected_customer_id, affected_user_id, affected_total_spent, note, created_at)
             VALUES (?, 'conflict_needs_review', NULL, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            {
              replacements: [
                phone,
                row.id,
                row.user_id,
                row.total_spent,
                `>=2 hồ sơ có tài khoản đăng nhập cùng trùng SĐT ${phone} (id: ${rows.map((r) => r.id).join(', ')}); giữ SĐT trên #${keep.id}, đã gỡ SĐT khỏi #${row.id} — cần admin đối chiếu thủ công trước khi gộp.`
              ]
            }
          );
        }
        continue;
      }

      const survivor = rows[0];
      const losers = rows.slice(1);
      const totalSpent = rows.reduce((sum, r) => sum + Number(r.total_spent), 0);
      const loyaltyTier = computeLoyaltyTier(totalSpent);

      for (const loser of losers) {
        await queryInterface.sequelize.query(
          `INSERT INTO customer_merge_audit
             (phone, action, survivor_customer_id, affected_customer_id, affected_user_id, affected_total_spent, created_at)
           VALUES (?, 'merged', ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          { replacements: [phone, survivor.id, loser.id, loser.user_id, loser.total_spent] }
        );

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

    await queryInterface.dropTable('customer_merge_audit');
  }
};
