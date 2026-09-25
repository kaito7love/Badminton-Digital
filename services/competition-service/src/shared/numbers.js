const round = (value, digits) => {
  const f = 10 ** digits;
  return Math.round((value + Number.EPSILON) * f) / f;
};

const round2 = (value) => round(value, 2);
const round3 = (value) => round(value, 3);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const mean = (values) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0);

// Độ lệch chuẩn tổng thể (population) — đo độ chênh điểm giữa các đội.
const stdDev = (values) => {
  if (values.length === 0) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length);
};

module.exports = { round, round2, round3, clamp, mean, stdDev };
