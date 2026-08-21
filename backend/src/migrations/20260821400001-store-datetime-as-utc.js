'use strict';

/**
 * Chuyển toàn bộ cột DATETIME từ giờ địa phương sang UTC.
 *
 * BỐI CẢNH. `config.js` trước đây không đặt tuỳ chọn `timezone` cho Sequelize,
 * nên driver ghi DATETIME theo giờ LOCAL của tiến trình Node. Server dự án
 * chạy giờ Việt Nam, nên mọi dòng lịch sử đang lưu theo giờ VN (+07). Cách lưu
 * đó nhập nhằng: cột chỉ có "20:00" mà không kèm múi giờ, nên dời server sang
 * múi giờ khác là toàn bộ dữ liệu cũ bị hiểu sai (đo thực nghiệm: ghi trên
 * server VN ra `2026-08-20 20:00:00`, đọc trên server Mỹ thành 03:00 ngày 21).
 *
 * Migration này + `timezone: '+00:00'` trong `config.js` phải đi CÙNG NHAU:
 * từ đây DATETIME luôn là UTC, còn việc hiển thị/gộp báo cáo thì đổi sang múi
 * giờ của CHI NHÁNH (`branches.timezone`) — nhờ vậy server đặt ở đâu cũng
 * không đổi kết quả, và chi nhánh ở múi giờ khác vẫn hiện đúng giờ của nó.
 *
 * CHỈ đụng cột DATETIME/TIMESTAMP (mốc tuyệt đối). Cột DATE/TIME là "giờ treo
 * tường" — `bookings.booking_date`, `bookings.start_time`, `bookings.end_time`,
 * `employees.hired_at` — giữ nguyên: đặt sân 18:00 nghĩa là 18:00 theo đồng hồ
 * tại chi nhánh, đổi sang UTC thành 11:00 là hỏng cả hiển thị lẫn kiểm tra
 * trùng lịch. Danh sách cột tra thẳng từ INFORMATION_SCHEMA nên không sót và
 * không bao giờ chạm nhầm sang DATE/TIME.
 *
 * Việt Nam không có DST nên trừ cứng 7 giờ là chính xác tuyệt đối cho mọi dòng
 * lịch sử — không cần `CONVERT_TZ` (vốn còn đòi nạp sẵn bảng `mysql.time_zone`).
 *
 * TRIỂN KHAI Ở NƠI KHÁC: nếu server của bạn xưa nay chạy UTC chứ không phải
 * giờ VN thì dữ liệu đã là UTC sẵn, đặt `LEGACY_DB_TIMEZONE_OFFSET=0` trước
 * khi chạy để migration không dịch gì cả.
 */

const LEGACY_OFFSET_HOURS = Number(
  process.env.LEGACY_DB_TIMEZONE_OFFSET !== undefined ? process.env.LEGACY_DB_TIMEZONE_OFFSET : 7
);

/** Mọi cột mốc-tuyệt-đối trong schema hiện tại. */
async function instantColumns(sequelize) {
  const [rows] = await sequelize.query(`
    SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND DATA_TYPE IN ('datetime', 'timestamp')
      AND TABLE_NAME <> 'SequelizeMeta'
    ORDER BY TABLE_NAME, COLUMN_NAME
  `);
  return rows;
}

async function shiftAll(sequelize, hours) {
  if (!hours) return 0;
  const columns = await instantColumns(sequelize);
  const direction = hours > 0 ? 'DATE_SUB' : 'DATE_ADD';
  const magnitude = Math.abs(hours);

  for (const { tableName, columnName } of columns) {
    await sequelize.query(
      `UPDATE \`${tableName}\`
       SET \`${columnName}\` = ${direction}(\`${columnName}\`, INTERVAL ${magnitude} HOUR)
       WHERE \`${columnName}\` IS NOT NULL`
    );
  }
  return columns.length;
}

module.exports = {
  async up(queryInterface) {
    const n = await shiftAll(queryInterface.sequelize, LEGACY_OFFSET_HOURS);
    console.log(
      LEGACY_OFFSET_HOURS
        ? `→ Đã đổi ${n} cột DATETIME từ UTC${LEGACY_OFFSET_HOURS > 0 ? '+' : ''}${LEGACY_OFFSET_HOURS} sang UTC.`
        : '→ LEGACY_DB_TIMEZONE_OFFSET=0, dữ liệu đã là UTC nên không dịch gì.'
    );
  },

  async down(queryInterface) {
    // Trả lại đúng giờ địa phương cũ — đối xứng hoàn toàn với up().
    await shiftAll(queryInterface.sequelize, -LEGACY_OFFSET_HOURS);
  }
};
