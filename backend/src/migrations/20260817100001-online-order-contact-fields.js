'use strict';

// Đơn khách tự đặt trên web (sales_orders.channel = 'online') cần biết ai sẽ
// tới lấy hàng: người đặt và người nhận không phải lúc nào cũng là một, và
// nhân viên ở quầy chỉ có cái tên với số điện thoại để đối chiếu. Ghi chú là
// chỗ khách dặn thêm ("giữ giúp size L", "chiều mới qua lấy").
//
// Ba cột đều NULL: đơn POS tại quầy không dùng tới, khách đứng ngay trước mặt.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('sales_orders', 'contact_name', {
      type: Sequelize.STRING(100),
      allowNull: true,
      after: 'customer_id'
    });
    await queryInterface.addColumn('sales_orders', 'contact_phone', {
      type: Sequelize.STRING(20),
      allowNull: true,
      after: 'contact_name'
    });
    await queryInterface.addColumn('sales_orders', 'customer_note', {
      type: Sequelize.STRING(500),
      allowNull: true,
      after: 'contact_phone'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('sales_orders', 'customer_note');
    await queryInterface.removeColumn('sales_orders', 'contact_phone');
    await queryInterface.removeColumn('sales_orders', 'contact_name');
  }
};
