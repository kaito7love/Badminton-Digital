'use strict';

/**
 * Biến bất biến nghiệp vụ "một sân tối đa một phiên đang mở" thành ràng buộc dữ liệu.
 *
 * Trước đây quy tắc này chỉ được bảo vệ bằng code (đọc trước - kiểm tra - rồi ghi,
 * dựa vào transaction và khoá dòng trong CourtService). Cách đó đúng nhưng mong manh:
 * chỉ cần một đường ghi mới quên kiểm tra, hoặc một script chạy tay, là dữ liệu hỏng —
 * mà khi đã có hai phiên mở trên cùng một sân thì mọi thứ phía trên đều sai theo.
 *
 * MySQL không có unique index có điều kiện, nên dùng cột sinh tự động: mang court_id
 * khi phiên đang mở, NULL khi đã đóng hoặc đã xoá mềm. UNIQUE bỏ qua NULL nên ràng
 * buộc chỉ áp lên đúng các phiên đang mở, các phiên đã đóng thì bao nhiêu cũng được.
 *
 * Phải tính cả deleted_at vì bảng này dùng xoá mềm (paranoid) — bỏ sót thì một phiên
 * đã xoá mềm vẫn giữ chỗ và không ai mở lại được sân đó.
 */
const INDEX_NAME = 'uq_court_sessions_open_court';

module.exports = {
  async up(queryInterface) {
    const [duplicates] = await queryInterface.sequelize.query(
      `SELECT court_id, COUNT(*) AS total
         FROM court_sessions
        WHERE status = 'playing' AND deleted_at IS NULL
        GROUP BY court_id
       HAVING COUNT(*) > 1`
    );

    if (duplicates.length > 0) {
      const detail = duplicates.map((d) => `sân ${d.court_id}: ${d.total} phiên`).join(', ');
      throw new Error(
        `Không thể thêm ràng buộc: đang có nhiều phiên mở trên cùng một sân (${detail}). ` +
        'Hãy đóng bớt các phiên thừa rồi chạy lại migration.'
      );
    }

    await queryInterface.sequelize.query(
      `ALTER TABLE \`court_sessions\`
         ADD COLUMN \`open_court_id\` INT
         GENERATED ALWAYS AS (
           CASE WHEN \`status\` = 'playing' AND \`deleted_at\` IS NULL THEN \`court_id\` END
         ) VIRTUAL`
    );

    await queryInterface.sequelize.query(
      `CREATE UNIQUE INDEX \`${INDEX_NAME}\` ON \`court_sessions\` (\`open_court_id\`)`
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `DROP INDEX \`${INDEX_NAME}\` ON \`court_sessions\``
    );
    await queryInterface.sequelize.query(
      `ALTER TABLE \`court_sessions\` DROP COLUMN \`open_court_id\``
    );
  }
};
