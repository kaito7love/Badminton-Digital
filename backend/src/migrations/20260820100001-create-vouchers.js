'use strict';

// Mã giảm giá dùng chung toàn chuỗi (giống catalog sản phẩm — không có
// branch_id), áp được cho cả đơn khách tự đặt online lẫn đơn nhân viên bán
// tại quầy. Không có bảng "lượt đã dùng" riêng — số lượt đã dùng đếm trực
// tiếp bằng COUNT trên sales_orders.voucher_id (bỏ qua đơn cancelled, đúng
// nguyên tắc "huỷ thì trả lại" đã dùng cho tồn kho).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('vouchers', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      code: { type: Sequelize.STRING(32), allowNull: false, unique: true },
      description: { type: Sequelize.STRING(255), allowNull: true },
      discount_type: { type: Sequelize.ENUM('percent', 'flat'), allowNull: false },
      discount_value: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      // Chỉ có ý nghĩa với percent — chặn phần trăm ăn theo đơn quá lớn thành
      // một số tiền vô lý. Flat bỏ qua cột này vì giá trị giảm đã là số cố định.
      max_discount_amount: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
      min_order_amount: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      starts_at: { type: Sequelize.DATE, allowNull: true },
      ends_at: { type: Sequelize.DATE, allowNull: true },
      usage_limit: { type: Sequelize.INTEGER, allowNull: true },
      per_customer_limit: { type: Sequelize.INTEGER, allowNull: true },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
      version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 }
    });

    await queryInterface.addColumn('sales_orders', 'voucher_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      after: 'payment_deadline_at',
      references: { model: 'vouchers', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    });
    // Snapshot mã lúc áp dụng: voucher có thể bị admin đổi/xoá sau này, đơn cũ
    // vẫn phải hiện đúng mã khách đã dùng lúc đó, không phụ thuộc bản ghi hiện tại.
    await queryInterface.addColumn('sales_orders', 'voucher_code', {
      type: Sequelize.STRING(32),
      allowNull: true,
      after: 'voucher_id'
    });
    await queryInterface.addColumn('sales_orders', 'voucher_discount_amount', {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: true,
      after: 'voucher_code'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('sales_orders', 'voucher_discount_amount');
    await queryInterface.removeColumn('sales_orders', 'voucher_code');
    await queryInterface.removeColumn('sales_orders', 'voucher_id');
    await queryInterface.dropTable('vouchers');
  }
};
