'use strict';

/**
 * Dọn khoá ngoại `branch_id` bị nhân đôi.
 *
 * Nguồn gốc: migration M1 (20260805000001) gọi `addColumn` kèm `references`
 * (tạo khoá ngoại lần 1, tên do Sequelize đặt: `<bảng>_branch_id_foreign_idx`)
 * rồi `changeColumn` cũng kèm `references` (tạo thêm lần 2, tên do MySQL tự
 * sinh: `<bảng>_ibfk_N`). Kết quả là 6 bảng — courts, bookings, court_sessions,
 * employees, invoices, payments — mỗi bảng mang hai ràng buộc y hệt nhau trên
 * cùng một cột: cùng trỏ `branches(id)`, cùng ON UPDATE CASCADE, cùng
 * ON DELETE RESTRICT. Không sai dữ liệu, nhưng MySQL phải kiểm tra hai lần cho
 * mỗi lần ghi, và người đọc schema dễ tưởng hai ràng buộc khác nhau.
 *
 * KHÔNG ghi cứng tên ràng buộc: phần đuôi `_ibfk_N` do MySQL đánh số theo thứ
 * tự khoá ngoại được tạo trong từng bảng, nên mỗi nơi triển khai một khác
 * (ở DB tham chiếu: courts_ibfk_1, payments_ibfk_3, bookings_ibfk_4). Migration
 * này tra `INFORMATION_SCHEMA` lúc chạy, giữ lại đúng MỘT ràng buộc cho mỗi
 * bảng và bỏ phần thừa — chạy được trên mọi DB, kể cả DB không có bản sao nào
 * (khi đó không làm gì).
 *
 * Toàn vẹn tham chiếu không đổi: ràng buộc còn lại giống hệt ràng buộc bị bỏ,
 * nên mọi phép kiểm khoá ngoại vẫn nguyên như cũ. Chỉ số (index) cũng không
 * đụng tới — các index tổng hợp bắt đầu bằng branch_id do M1 tạo vẫn phục vụ
 * cả truy vấn lẫn ràng buộc còn lại.
 */

/** Tên ưu tiên giữ lại — đặt bởi migration, ổn định giữa các nơi triển khai. */
const preferredName = (table) => `${table}_branch_id_foreign_idx`;

/** Các khoá ngoại đang trỏ từ `<bảng>.branch_id` sang `branches(id)`. */
async function branchForeignKeys(sequelize) {
  const [rows] = await sequelize.query(`
    SELECT TABLE_NAME AS tableName, CONSTRAINT_NAME AS constraintName
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND COLUMN_NAME = 'branch_id'
      AND REFERENCED_TABLE_NAME = 'branches'
      AND REFERENCED_COLUMN_NAME = 'id'
    ORDER BY TABLE_NAME, CONSTRAINT_NAME
  `);
  return rows;
}

module.exports = {
  async up(queryInterface) {
    const { sequelize } = queryInterface;
    const byTable = new Map();
    for (const { tableName, constraintName } of await branchForeignKeys(sequelize)) {
      if (!byTable.has(tableName)) byTable.set(tableName, []);
      byTable.get(tableName).push(constraintName);
    }

    for (const [table, constraints] of byTable) {
      if (constraints.length < 2) continue;

      // Giữ tên do migration đặt nếu có; không thì giữ tên đầu tiên theo thứ
      // tự chữ cái để kết quả không phụ thuộc thứ tự MySQL trả về.
      const keep = constraints.includes(preferredName(table)) ? preferredName(table) : constraints[0];
      for (const name of constraints) {
        if (name === keep) continue;
        await sequelize.query(`ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${name}\``);
      }
    }

    // Chốt chặn: mỗi bảng chỉ được còn đúng 1 ràng buộc branch_id. Nếu vẫn dư
    // thì dừng hẳn để người chạy biết, thay vì âm thầm bỏ qua.
    const leftover = new Map();
    for (const { tableName } of await branchForeignKeys(sequelize)) {
      leftover.set(tableName, (leftover.get(tableName) || 0) + 1);
    }
    const stillDuplicated = [...leftover.entries()].filter(([, n]) => n > 1);
    if (stillDuplicated.length) {
      throw new Error(
        'Vẫn còn khoá ngoại branch_id trùng lặp ở: ' +
        stillDuplicated.map(([t, n]) => `${t} (${n})`).join(', ')
      );
    }
  },

  async down() {
    // Cố ý không làm gì. Trạng thái trước đó là "một ràng buộc thừa do lỗi
    // migration M1, mang cái tên MySQL tự sinh không đoán trước được" — dựng
    // lại đúng như vậy vừa vô nghĩa vừa không tái lập được cái tên cũ. Ràng
    // buộc thật vẫn còn nguyên, nên bỏ qua migration này không mất mát gì.
  }
};
