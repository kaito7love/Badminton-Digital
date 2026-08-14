'use strict';

// AuditService đã lọc bí mật trước khi ghi log, nhưng các bản ghi tạo ra TRƯỚC
// bản vá đó vẫn nằm nguyên trong bảng — trong đó có cả hash mật khẩu bcrypt của
// tài khoản nhân viên. Log là dữ liệu đọc được qua API nhật ký hoạt động, nên
// phải dọn nốt phần lịch sử chứ không chỉ chặn đường ghi mới.

const SECRET_KEYS = ['passwordHash', 'password_hash', 'password', 'refreshToken', 'refresh_token'];

/** Bỏ đệ quy mọi khoá bí mật khỏi object/array đã parse từ JSON. */
const scrub = (value) => {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') {
    return Object.entries(value).reduce((acc, [key, val]) => {
      if (!SECRET_KEYS.includes(key)) acc[key] = scrub(val);
      return acc;
    }, {});
  }
  return value;
};

module.exports = {
  async up(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(
      `SELECT id, old_values, new_values FROM activity_logs
       WHERE old_values LIKE '%assword%' OR new_values LIKE '%assword%'
          OR old_values LIKE '%efreshToken%' OR new_values LIKE '%efreshToken%'
          OR old_values LIKE '%efresh_token%' OR new_values LIKE '%efresh_token%'`
    );

    for (const row of rows) {
      const clean = (raw) => {
        if (raw === null || raw === undefined) return null;
        // MySQL trả cột JSON dưới dạng object đã parse, cột TEXT thì vẫn là chuỗi
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return JSON.stringify(scrub(parsed));
      };

      await queryInterface.sequelize.query(
        'UPDATE activity_logs SET old_values = :oldValues, new_values = :newValues WHERE id = :id',
        {
          replacements: {
            id: row.id,
            oldValues: clean(row.old_values),
            newValues: clean(row.new_values)
          }
        }
      );
    }
  },

  async down() {
    // Không thể khôi phục: bí mật đã bị xoá là chủ đích của migration này.
  }
};
