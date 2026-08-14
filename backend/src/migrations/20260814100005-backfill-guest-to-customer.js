'use strict';

/**
 * Chuyển dữ liệu khách vãng lai đang nằm rải rác ở guest_name/guest_phone thành
 * hồ sơ khách hàng thật, rồi gán customer_id cho booking / phiên chơi tương ứng.
 *
 * Chạy sau khi customers.phone đã được nới (migration 20260814100004) và trước khi
 * xoá các cột guest_* (migration 20260814100006).
 *
 * Khách có số điện thoại thì gộp theo (branch_id, phone) để không tạo trùng; khách
 * chỉ có tên thì mỗi lần là một hồ sơ riêng — không có gì để định danh nên không
 * thể gộp, và đó là phản ánh đúng thực tế.
 */
const findOrCreateCustomer = async (queryInterface, { branchId, fullName, phone, transaction }) => {
  const name = (fullName || '').trim() || 'Khách vãng lai';
  const normalizedPhone = (phone || '').trim() || null;

  if (normalizedPhone) {
    const [found] = await queryInterface.sequelize.query(
      'SELECT id FROM `customers` WHERE `branch_id` = ? AND `phone` = ? LIMIT 1',
      { replacements: [branchId, normalizedPhone], transaction }
    );
    if (found.length > 0) return found[0].id;
  }

  const [result] = await queryInterface.sequelize.query(
    `INSERT INTO \`customers\`
       (\`branch_id\`, \`full_name\`, \`phone\`, \`total_spent\`, \`loyalty_tier\`, \`created_at\`, \`updated_at\`, \`version\`)
     VALUES (?, ?, ?, 0.00, 'normal', NOW(), NOW(), 0)`,
    { replacements: [branchId, name, normalizedPhone], transaction }
  );

  return result;
};

module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const [bookings] = await queryInterface.sequelize.query(
        `SELECT id, branch_id, guest_name, guest_phone
           FROM \`bookings\`
          WHERE \`customer_id\` IS NULL AND \`guest_name\` IS NOT NULL AND \`guest_name\` <> ''`,
        { transaction }
      );

      for (const booking of bookings) {
        const customerId = await findOrCreateCustomer(queryInterface, {
          branchId: booking.branch_id,
          fullName: booking.guest_name,
          phone: booking.guest_phone,
          transaction
        });
        await queryInterface.sequelize.query(
          'UPDATE `bookings` SET `customer_id` = ? WHERE `id` = ?',
          { replacements: [customerId, booking.id], transaction }
        );
      }

      const [sessions] = await queryInterface.sequelize.query(
        `SELECT id, branch_id, guest_name
           FROM \`court_sessions\`
          WHERE \`customer_id\` IS NULL AND \`guest_name\` IS NOT NULL AND \`guest_name\` <> ''`,
        { transaction }
      );

      for (const session of sessions) {
        const customerId = await findOrCreateCustomer(queryInterface, {
          branchId: session.branch_id,
          fullName: session.guest_name,
          phone: null,
          transaction
        });
        await queryInterface.sequelize.query(
          'UPDATE `court_sessions` SET `customer_id` = ? WHERE `id` = ?',
          { replacements: [customerId, session.id], transaction }
        );
      }

      await transaction.commit();
      console.log(`[backfill] Đã chuyển ${bookings.length} booking và ${sessions.length} phiên chơi sang hồ sơ khách hàng.`);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down() {
    // Không hoàn tác: không phân biệt được hồ sơ nào do backfill sinh ra và hồ sơ
    // nào do nhân viên tạo tay sau đó. Muốn quay lui thì khôi phục từ bản sao lưu.
    console.warn('[backfill] Bỏ qua hoàn tác — dữ liệu khách hàng đã gộp không tách ngược được.');
  }
};
