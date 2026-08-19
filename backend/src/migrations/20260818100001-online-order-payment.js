'use strict';

// Thanh toán online thật cho đơn khách tự đặt: khách chọn "chuyển khoản" thì
// hệ thống tạo hoá đơn + giao dịch ngay lúc đặt (không chờ nhân viên), quét mã
// VietQR trả tiền trước khi tới quầy — xác nhận qua đúng webhook đã dùng cho
// POS. Hai cột mới trên sales_orders chỉ đơn 'online' dùng:
//
// - payment_method: khách định trả bằng gì. NULL cho đơn POS (nhân viên chọn
//   ngay lúc checkout, không cần lưu trước).
// - payment_deadline_at: chỉ set khi payment_method = 'transfer' — mốc 30
//   phút để tác vụ quét nền tự huỷ đơn không thanh toán, trả hàng về kệ cho
//   người khác thay vì giam vô thời hạn.
//
// payments.employee_id đổi sang cho phép NULL vì thanh toán qua webhook không
// có nhân viên nào đứng quầy xử lý — đã rà, không báo cáo nào gộp theo cột
// này nên đổi an toàn.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('sales_orders', 'payment_method', {
      type: Sequelize.ENUM('cash', 'transfer'),
      allowNull: true,
      after: 'customer_note'
    });
    await queryInterface.addColumn('sales_orders', 'payment_deadline_at', {
      type: Sequelize.DATE,
      allowNull: true,
      after: 'payment_method'
    });
    await queryInterface.changeColumn('payments', 'employee_id', {
      type: Sequelize.INTEGER,
      allowNull: true
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('payments', 'employee_id', {
      type: Sequelize.INTEGER,
      allowNull: false
    });
    await queryInterface.removeColumn('sales_orders', 'payment_deadline_at');
    await queryInterface.removeColumn('sales_orders', 'payment_method');
  }
};
