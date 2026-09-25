// Nhãn trình theo thang 1.0 – 7.0 (docs/03 mục 1).

const LEVELS = Object.freeze([
  { code: 'beginner', label: 'Mới chơi', min: -Infinity },
  { code: 'weak', label: 'Yếu', min: 2.0 },
  { code: 'tb_minus', label: 'TB-', min: 2.5 },
  { code: 'tb', label: 'TB', min: 3.0 },
  { code: 'tb_plus', label: 'TB+', min: 3.5 },
  { code: 'kha', label: 'Khá', min: 4.0 },
  { code: 'kha_gioi', label: 'Khá giỏi', min: 4.5 },
  { code: 'ban_chuyen', label: 'Bán chuyên', min: 5.0 },
  { code: 'chuyen_nghiep', label: 'Chuyên nghiệp', min: 6.0 }
]);

// So sánh trên điểm đã làm tròn 2 số lẻ — đúng con số người chơi nhìn thấy
// (3.495 hiển thị 3.50 thì phải là TB+, không phải TB).
const levelFor = (rating) => {
  const shown = Math.round(rating * 100) / 100;
  let found = LEVELS[0];
  for (const level of LEVELS) if (shown >= level.min) found = level;
  return { code: found.code, label: found.label };
};

const levelByCode = (code) => LEVELS.find((l) => l.code === code) || null;

module.exports = { LEVELS, levelFor, levelByCode };
