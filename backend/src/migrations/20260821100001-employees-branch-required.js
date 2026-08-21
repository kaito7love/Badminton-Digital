'use strict';

/**
 * Nhân viên phải thuộc một chi nhánh.
 *
 * `branchContextMiddleware` lấy chi nhánh làm việc từ `employees.branch_id`.
 * Nhân viên có cột này NULL thì mọi thao tác cần chi nhánh đều bị từ chối với
 * "Không xác định được chi nhánh bán hàng" — thực tế là tài khoản thu ngân
 * trong dữ liệu mẫu không dùng được màn hình bán hàng tại quầy.
 *
 * Vì sao lọt được: migration M1 (20260805000001) có ý định đặt cột này
 * NOT NULL, nhưng `changeColumn` kèm `references` không áp được ràng buộc đó
 * trên MySQL — kiểm tra `INFORMATION_SCHEMA` sau khi chạy M1 thì cả 6 bảng
 * (`courts`, `bookings`, `court_sessions`, `employees`, `invoices`,
 * `payments`) đều vẫn `IS_NULLABLE = YES`. Thêm nữa M1 chạy TRƯỚC seeder nên
 * lệnh backfill của nó không thấy dòng nhân viên nào để vá.
 *
 * Migration này chỉ xử lý `employees` — đúng phạm vi lỗi đã quan sát được.
 * Năm bảng còn lại vẫn đang thiếu ràng buộc và cần một đợt rà riêng.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Gán chi nhánh chính cho nhân viên chưa có chi nhánh. Dùng chi nhánh nhỏ
    // nhất đang hoạt động thay vì hằng số 1, phòng khi chi nhánh 1 đã bị đổi
    // hoặc ngưng hoạt động ở một bản triển khai nào đó.
    await queryInterface.sequelize.query(`
      UPDATE employees
      SET branch_id = (SELECT MIN(id) FROM branches WHERE is_active = 1)
      WHERE branch_id IS NULL
    `);

    await queryInterface.changeColumn('employees', 'branch_id', {
      type: Sequelize.INTEGER,
      allowNull: false
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('employees', 'branch_id', {
      type: Sequelize.INTEGER,
      allowNull: true
    });
  }
};
