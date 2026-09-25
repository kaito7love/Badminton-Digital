// Mọi hằng số của điểm trình ở một chỗ (docs/03 mục 5). Đổi số ở đây, không
// đụng logic; test giữ các ví dụ trong tài liệu.

module.exports = Object.freeze({
  SCALE_MIN: 1.0,
  SCALE_MAX: 7.0,

  SELF_ASSESS_MAX: 4.5,
  // Mức thấp nhất trong các tiêu chí then chốt → trần điểm.
  GATE_CAPS: Object.freeze({ 1: 2.49, 2: 3.49, 3: 4.49 }),
  // Chấm nhanh: điểm = giữa khoảng của nhãn.
  QUICK_LEVEL_POINTS: Object.freeze({
    beginner: 1.5,
    weak: 2.25,
    tb_minus: 2.75,
    tb: 3.25,
    tb_plus: 3.75,
    kha: 4.25
  }),

  ELO_D: 1.0,
  K_MIN: 0.08,
  K_MAX: 0.3,
  K_FULL_AFTER: 20,

  MARGIN_MIN: 0.9,
  MARGIN_MAX: 1.25,
  MARGIN_SLOPE: 2,

  MATCH_WEIGHT: Object.freeze({ tournament: 1.0, session: 0.5 }),

  PROVISIONAL_BELOW: 10,
  RELIABILITY_PER_MATCH: 5,
  INACTIVE_AFTER_DAYS: 180,

  ANTI_SANDBAG_WINDOW_DAYS: 365,
  ANTI_SANDBAG_DROP: 0.5
});
