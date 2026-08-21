'use strict';

/**
 * Áp ràng buộc `branch_id NOT NULL` cho 5 bảng còn lại của mô hình đa chi
 * nhánh: courts, bookings, court_sessions, invoices, payments.
 *
 * Vì sao tới giờ mới có: migration M1 (20260805000001) đã ĐỊNH áp ràng buộc
 * này, nhưng `changeColumn` của nó truyền kèm `references` — trên MySQL,
 * Sequelize sinh ra một ALTER vừa không đặt được NOT NULL vừa gắn thêm một
 * khoá ngoại thứ hai trùng lặp (`*_ibfk_N` nằm cạnh `*_branch_id_foreign_idx`).
 * Kết quả: kiểm `INFORMATION_SCHEMA` sau khi chạy M1 thì cả 6 bảng vẫn
 * `IS_NULLABLE = YES`. Migration 20260821100001 đã xử lý `employees`; đây là
 * 5 bảng còn lại. Cách vá: `changeColumn` KHÔNG kèm `references` — khoá ngoại
 * đã có sẵn từ `addColumn`, không cần khai lại.
 *
 * Backfill suy ra chi nhánh TỪ QUAN HỆ CHA, không gán cứng chi nhánh 1: một
 * booking thuộc về chi nhánh của cái sân nó đặt, một payment thuộc về chi
 * nhánh của hoá đơn nó trả. Gán cứng số 1 sẽ ném dữ liệu của chi nhánh khác
 * vào nhầm sổ. Chỉ `courts` là không có cha nên mới dùng chi nhánh mặc định.
 *
 * Thứ tự bắt buộc: courts → bookings/court_sessions → invoices → payments,
 * vì mỗi bước lấy chi nhánh từ bảng vừa được vá ở bước trước.
 */

const TABLES = ['courts', 'bookings', 'court_sessions', 'invoices', 'payments'];

module.exports = {
  async up(queryInterface, Sequelize) {
    const { sequelize } = queryInterface;

    // 1. courts — không có quan hệ cha, dùng chi nhánh đang hoạt động nhỏ nhất
    //    (dữ liệu có trước đa chi nhánh vốn đều thuộc cơ sở gốc).
    await sequelize.query(`
      UPDATE courts
      SET branch_id = (SELECT MIN(id) FROM branches WHERE is_active = 1)
      WHERE branch_id IS NULL
    `);

    // 2. bookings — theo sân đã đặt. courts.branch_id vừa được vá ở bước 1.
    await sequelize.query(`
      UPDATE bookings b
      JOIN courts c ON c.id = b.court_id
      SET b.branch_id = c.branch_id
      WHERE b.branch_id IS NULL
    `);

    // 3. court_sessions — cũng theo sân (court_id NOT NULL nên luôn suy được;
    //    booking_id thì nullable với phiên khách vãng lai nên không dùng).
    await sequelize.query(`
      UPDATE court_sessions s
      JOIN courts c ON c.id = s.court_id
      SET s.branch_id = c.branch_id
      WHERE s.branch_id IS NULL
    `);

    // 4. invoices — hoá đơn treo vào MỘT trong hai: phiên chơi sân hoặc đơn
    //    bán hàng. Thử phiên trước, rồi tới đơn hàng.
    await sequelize.query(`
      UPDATE invoices i
      JOIN court_sessions s ON s.id = i.session_id
      SET i.branch_id = s.branch_id
      WHERE i.branch_id IS NULL
    `);
    await sequelize.query(`
      UPDATE invoices i
      JOIN sales_orders o ON o.id = i.sales_order_id
      SET i.branch_id = o.branch_id
      WHERE i.branch_id IS NULL
    `);

    // 5. payments — theo hoá đơn nó thanh toán (invoice_id NOT NULL).
    await sequelize.query(`
      UPDATE payments p
      JOIN invoices i ON i.id = p.invoice_id
      SET p.branch_id = i.branch_id
      WHERE p.branch_id IS NULL
    `);

    // Lưới cuối: dòng mồ côi (cha cũng NULL, hoặc hoá đơn không gắn vào đâu)
    // vẫn phải có chi nhánh thì mới đặt được NOT NULL.
    for (const table of TABLES) {
      await sequelize.query(`
        UPDATE \`${table}\`
        SET branch_id = (SELECT MIN(id) FROM branches WHERE is_active = 1)
        WHERE branch_id IS NULL
      `);
    }

    // Chốt chặn trước khi đổi cột: KHÔNG dựa vào sql_mode của máy chủ đích.
    // Máy chủ không bật STRICT_TRANS_TABLES sẽ âm thầm biến NULL thành 0 khi
    // đặt NOT NULL — sinh ra dòng trỏ tới chi nhánh không tồn tại. Thà dừng
    // hẳn và báo rõ còn hơn để lại dữ liệu hỏng.
    for (const table of TABLES) {
      const [[{ remaining }]] = await sequelize.query(
        `SELECT COUNT(*) AS remaining FROM \`${table}\` WHERE branch_id IS NULL`
      );
      if (Number(remaining) > 0) {
        throw new Error(
          `Bảng ${table} còn ${remaining} dòng có branch_id NULL không suy ra được chi nhánh. ` +
          'Kiểm tra xem bảng branches đã có chi nhánh nào is_active = 1 chưa, ' +
          'và các dòng đó có quan hệ cha hợp lệ không, rồi chạy lại migration này.'
        );
      }
    }

    // `references` cố tình KHÔNG truyền vào đây — chính nó làm M1 không áp
    // được NOT NULL. Khoá ngoại đã tồn tại sẵn từ addColumn của M1.
    for (const table of TABLES) {
      await queryInterface.changeColumn(table, 'branch_id', {
        type: Sequelize.INTEGER,
        allowNull: false
      });
    }
  },

  async down(queryInterface, Sequelize) {
    // Nới lại theo thứ tự ngược, cho đối xứng với up().
    for (const table of [...TABLES].reverse()) {
      await queryInterface.changeColumn(table, 'branch_id', {
        type: Sequelize.INTEGER,
        allowNull: true
      });
    }
  }
};
