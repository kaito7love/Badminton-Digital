const { DomainError } = require('../../../shared/domainError');

// Vận hành giải ngày thi đấu (plan 20) — hàm thuần: giờ dự kiến từng lượt, chọn trận kế tiếp
// cho sân vừa trống, ai đã điểm danh.

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const validateStartTime = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !TIME.test(value)) {
    throw new DomainError('INVALID_TOURNAMENT', 'Giờ bắt đầu phải dạng HH:MM (vd 08:30)', [{ field: 'startTime', message: 'HH:MM' }]);
  }
  return value;
};

// Lượt n bắt đầu sau (n − 1) × số phút một trận. Qua nửa đêm thì quay vòng (giải không kéo qua ngày).
const expectedTime = (startTime, slotNo, matchMinutes) => {
  if (!startTime || !slotNo) return null;
  const [h, m] = startTime.split(':').map(Number);
  const total = (h * 60 + m + (slotNo - 1) * matchMinutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

// Đội có mặt khi MỌI người trong đội đã điểm danh.
const teamPresent = (playerIds, checkedIn) => playerIds.length > 0 && playerIds.every((pid) => checkedIn.has(pid));

// Nghỉ tối thiểu giữa hai trận của một người: trận có người vừa đánh xong chưa đủ thì xếp sau
// mọi trận đã nghỉ đủ (vẫn gọi được nếu không còn trận nào khác).
const MIN_REST_MINUTES = 5;

// Trận kế tiếp cho một sân vừa trống.
// matches: [{ id, status, slotNo, stage, players: [playerId], teamIds: [id] }]
// busy: Set playerId đang ở sân (mọi giải / buổi) · lastPlayedAt: Map playerId → Date trận gần nhất xong
// withdrawn: Set teamId đã rút.
// Thứ tự: đã nghỉ đủ trước → lượt sớm hơn trước (giữ đúng lịch đã bốc) → đội đã nghỉ lâu hơn trước (so
// người nghỉ ít nhất của mỗi trận; chưa đánh trận nào coi như nghỉ vô hạn) → vòng bảng trước sơ đồ → id.
const pickNextMatches = ({ matches, busy, lastPlayedAt, withdrawn = new Set(), now = new Date(), minRestMinutes = MIN_REST_MINUTES }) => {
  const rest = (m) => Math.min(...m.players.map((pid) => (lastPlayedAt.has(pid) ? now - lastPlayedAt.get(pid) : Infinity)));
  const stageOrder = { group: 0, extra: 1, knockout: 2 };
  const minRestMs = minRestMinutes * 60000;
  return matches
    .filter((m) => m.status === 'scheduled' && m.teamIds.length === 2 && m.teamIds.every(Boolean) && !m.teamIds.some((id) => withdrawn.has(id)))
    .filter((m) => !m.players.some((pid) => busy.has(pid)))
    .map((m) => ({ ...m, restMs: rest(m) }))
    .map((m) => ({ ...m, rested: m.restMs >= minRestMs }))
    .sort(
      (a, b) =>
        Number(b.rested) - Number(a.rested) ||
        (a.slotNo ?? Infinity) - (b.slotNo ?? Infinity) ||
        b.restMs - a.restMs ||
        (stageOrder[a.stage] ?? 3) - (stageOrder[b.stage] ?? 3) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );
};

module.exports = { MIN_REST_MINUTES, validateStartTime, expectedTime, teamPresent, pickNextMatches };
