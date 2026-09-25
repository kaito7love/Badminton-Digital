const { DomainError } = require('../../../shared/domainError');
const { round3 } = require('../../../shared/numbers');
const config = require('./ratingConfig');
const { levelFor } = require('./levels');

// Câu trả lời form → điểm Đơn / Đôi (docs/03 mục 2.2).
//   raw     = trung bình có trọng số các mức (1 mức = 1 điểm)
//   trần    = theo mức thấp nhất của tiêu chí then chốt, và 4.5 nếu tự chấm
// `source`: 'self' có trần 4.5; 'staff' / 'video_ai' (sau khi duyệt) thì không.

const validateAnswers = (answers, rubric, { allowNull = false } = {}) => {
  if (!answers || typeof answers !== 'object') {
    throw new DomainError('INVALID_ANSWERS', 'Thiếu câu trả lời', [{ field: 'answers', message: 'Bắt buộc' }]);
  }
  const errors = [];
  for (const c of rubric.criteria) {
    const v = answers[c.code];
    if (v === null && allowNull) continue;
    if (!Number.isInteger(v) || v < 1 || v > 5) {
      errors.push({ field: `answers.${c.code}`, message: `${c.name}: chọn một mức từ 1 đến 5` });
    }
  }
  const known = new Set(rubric.criteria.map((c) => c.code));
  for (const key of Object.keys(answers)) {
    if (!known.has(key)) errors.push({ field: `answers.${key}`, message: 'Tiêu chí không có trong bộ tiêu chí' });
  }
  if (errors.length) throw new DomainError('INVALID_ANSWERS', 'Câu trả lời chưa đủ hoặc sai', errors);
};

const scoreAssessment = (answers, rubric, { source = 'self' } = {}) => {
  validateAnswers(answers, rubric);

  const gateCriteria = rubric.criteria.filter((c) => c.gate);
  const weakestGate = gateCriteria.reduce(
    (weakest, c) => (weakest === null || answers[c.code] < answers[weakest.code] ? c : weakest),
    null
  );
  const gateLevel = weakestGate ? answers[weakestGate.code] : null;
  const gateCap = gateLevel !== null && config.GATE_CAPS[gateLevel] !== undefined ? config.GATE_CAPS[gateLevel] : Infinity;
  const selfCap = source === 'self' ? config.SELF_ASSESS_MAX : Infinity;

  const result = {};
  for (const discipline of ['singles', 'doubles']) {
    let sumW = 0;
    let sum = 0;
    for (const c of rubric.criteria) {
      sumW += c.weights[discipline];
      sum += c.weights[discipline] * answers[c.code];
    }
    const raw = round3(sum / sumW);
    const rating = round3(Math.max(config.SCALE_MIN, Math.min(raw, gateCap, selfCap)));
    let cappedBy = null;
    if (rating < raw) cappedBy = gateCap <= selfCap ? `gate:${weakestGate.code}` : 'self_max';
    result[discipline] = { raw, rating, level: levelFor(rating), cappedBy };
  }

  const trigger = rubric.verificationTrigger;
  result.needsVerification =
    source === 'self' &&
    (answers[trigger.criterion] >= trigger.level ||
      result.singles.raw > config.SELF_ASSESS_MAX ||
      result.doubles.raw > config.SELF_ASSESS_MAX);
  result.gate = weakestGate ? { criterion: weakestGate.code, level: gateLevel, cap: Number.isFinite(gateCap) ? gateCap : null } : null;
  return result;
};

// Chấm nhanh một nhãn (khách vãng lai ở buổi giao lưu) → cùng điểm cho cả hai nội dung.
const scoreQuickLevel = (levelCode) => {
  const points = config.QUICK_LEVEL_POINTS[levelCode];
  if (points === undefined) {
    throw new DomainError('INVALID_QUICK_LEVEL', `Nhãn chấm nhanh không hợp lệ: ${levelCode}`, [
      { field: 'level', message: `Một trong ${Object.keys(config.QUICK_LEVEL_POINTS).join(', ')}` }
    ]);
  }
  const item = { raw: points, rating: points, level: levelFor(points), cappedBy: null };
  return { singles: { ...item }, doubles: { ...item }, needsVerification: false, gate: null };
};

module.exports = { scoreAssessment, scoreQuickLevel, validateAnswers };
