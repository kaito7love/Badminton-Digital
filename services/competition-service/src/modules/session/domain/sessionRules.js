const { DomainError } = require('../../../shared/domainError');
const { MAX_COURTS, courtErrors } = require('../../../shared/courts');

// Luật thuần của buổi giao lưu (docs/06 mục 8) — không DB, test rẻ.

// Hệ số trận giao lưu khi buổi bật "tính điểm" (docs/03 mục 3.1, MATCH_WEIGHT).
const SESSION_MATCH_WEIGHT = 0.5;

const perCourt = (format) => (format === 'singles' ? 2 : 4);
const discipline = (format) => (format === 'singles' ? 'singles' : 'doubles');

const validateCourts = (courtRefs) => {
  const errors = courtErrors(courtRefs);
  if (errors.length) throw new DomainError('INVALID_SESSION', `Thông tin buổi không hợp lệ: ${errors[0].message}`, errors);
  return courtRefs;
};

// Người đến muộn (hoặc quay lại) được tính như đã đánh bằng số trận ít nhất của
// những người đang có mặt — không được ưu tiên quá, cũng không bị thiệt (mục 8.2).
// presentEffective: số trận "hiệu dụng" (đã đánh + bù) của người đang có mặt.
const lateCredit = ({ gamesPlayed = 0, currentCredit = 0, presentEffective = [] }) => {
  if (!presentEffective.length) return currentCredit;
  return Math.max(currentCredit, Math.min(...presentEffective) - gamesPlayed, 0);
};

// Lịch sử trong buổi: ai từng là đồng đội / đối thủ của ai, bao nhiêu lần.
// matches: [{ sideA: [id], sideB: [id] }] — các trận đã xếp, trừ trận bị huỷ.
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const historyFrom = (matches) => {
  const partners = new Map();
  const opponents = new Map();
  const bump = (map, a, b) => map.set(pairKey(a, b), (map.get(pairKey(a, b)) || 0) + 1);
  for (const m of matches) {
    for (const side of [m.sideA, m.sideB]) {
      for (let i = 0; i < side.length; i += 1) for (let j = i + 1; j < side.length; j += 1) bump(partners, side[i], side[j]);
    }
    for (const a of m.sideA) for (const b of m.sideB) bump(opponents, a, b);
  }
  const list = (map) => [...map].map(([k, n]) => [...k.split('|'), n]);
  return { partners: list(partners), opponents: list(opponents) };
};

// Bản xếp sân người điều phối gửi lên (có thể đã đổi tay). Chỉ kiểm cấu trúc;
// sân / người có còn rảnh không do service kiểm dưới khoá (409 FILL_STALE).
const validateAssignments = ({ assignments, format }) => {
  const size = perCourt(format) / 2;
  const errors = [];
  if (!Array.isArray(assignments) || !assignments.length) errors.push({ field: 'assignments', message: 'Cần ít nhất một sân' });
  const courts = new Set();
  const people = new Set();
  (assignments || []).forEach((a, i) => {
    if (courts.has(a.court)) errors.push({ field: `assignments[${i}].court`, message: `Sân ${a.court} bị xếp hai lần` });
    courts.add(a.court);
    for (const side of ['sideA', 'sideB']) {
      const ids = a[side] || [];
      if (ids.length !== size) errors.push({ field: `assignments[${i}].${side}`, message: `Mỗi bên cần ${size} người` });
      for (const id of ids) {
        if (people.has(id)) errors.push({ field: `assignments[${i}].${side}`, message: 'Một người bị xếp hai chỗ' });
        people.add(id);
      }
    }
  });
  if (errors.length) throw new DomainError('INVALID_ASSIGNMENTS', `Bản xếp sân không hợp lệ: ${errors[0].message}`, errors);
  return { courts: [...courts], players: [...people] };
};

// Bản gửi lên có khác đề xuất của cùng seed không (ghi nhật ký "đổi tay").
const canonical = (assignments) =>
  assignments
    .map((a) => `${a.court}:${[[...a.sideA].sort().join('+'), [...a.sideB].sort().join('+')].sort().join('/')}`)
    .sort()
    .join(',');
const isManualEdit = (proposed, chosen) => canonical(proposed) !== canonical(chosen);

module.exports = {
  MAX_COURTS,
  SESSION_MATCH_WEIGHT,
  perCourt,
  discipline,
  validateCourts,
  lateCredit,
  historyFrom,
  validateAssignments,
  isManualEdit
};
