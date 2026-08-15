'use strict';

// Dashboard/ReportService lọc payments theo đúng 3 cột này mỗi lần mở
// (branch_id, status, paid_at) — thêm index gộp để tránh full scan khi
// bảng lớn dần theo thời gian. Thuần chỉ mục, không đổi dữ liệu.
module.exports = {
  async up(queryInterface) {
    await queryInterface.addIndex('payments', ['branch_id', 'status', 'paid_at'], {
      name: 'idx_payments_branch_status_paidat'
    });
  },

  async down(queryInterface) {
    // Trước khi xoá index gộp, phải tạo lại 1 index đơn trên branch_id —
    // đã phát hiện lúc test rollback: 2 khoá ngoại (payments_branch_id_foreign_idx,
    // payments_ibfk_3) hiện KHÔNG có index riêng nào khác đứng ra thay thế, nếu
    // xoá thẳng index gộp sẽ gãy khoá ngoại ("needed in a foreign key constraint").
    await queryInterface.addIndex('payments', ['branch_id'], {
      name: 'idx_payments_branch_id'
    });
    await queryInterface.removeIndex('payments', 'idx_payments_branch_status_paidat');
  }
};
