'use strict';

// Chuyển sân giữa phiên từng chỉ đổi `court_id`, nên lúc checkout cả phiên bị
// tính theo giá sân đích: chơi 2 giờ sân thường rồi sang sân VIP là bị thu cả 2
// giờ đó theo giá VIP (chuyển chiều ngược lại thì thu thiếu). Hai cột mới giữ
// phần đã chơi ở các sân trước:
//
// - billed_from: đầu đoạn đang tính theo giá sân hiện tại. NULL = phiên chưa
//   chuyển sân lần nào, tính từ start_time như cũ — nên phiên đang chơi lúc
//   deploy vẫn tính đúng như trước khi có migration này.
// - accrued_court_fee: tiền các đoạn trước, CHƯA làm tròn nghìn (làm tròn một
//   lần lúc chốt hoá đơn, không làm tròn từng đoạn rồi cộng lệch).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('court_sessions', 'billed_from', {
      type: Sequelize.DATE,
      allowNull: true,
      after: 'court_fee'
    });
    await queryInterface.addColumn('court_sessions', 'accrued_court_fee', {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
      after: 'billed_from'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('court_sessions', 'accrued_court_fee');
    await queryInterface.removeColumn('court_sessions', 'billed_from');
  }
};
