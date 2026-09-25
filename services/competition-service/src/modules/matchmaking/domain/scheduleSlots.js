const { DomainError } = require('../../../shared/domainError');
const config = require('./config');

// Xếp trận vào các LƯỢT thi đấu theo số sân (docs/06 mục 4.5):
//  - mỗi lượt ≤ số sân trận, không đội nào đánh hai trận cùng lượt
//  - ưu tiên vòng nhỏ trước, rồi đội đã nghỉ lâu nhất (tránh đánh liền hai lượt),
//    rồi xen kẽ các bảng.
const scheduleSlots = ({ matches, courts, matchMinutes = config.MATCH_MINUTES_DEFAULT }) => {
  if (!Number.isInteger(courts) || courts < 1) throw new DomainError('INVALID_COURTS', 'Số sân phải ≥ 1');
  if (!Array.isArray(matches)) throw new DomainError('INVALID_MATCHES', 'matches phải là mảng');
  for (const m of matches) {
    if (!m || !m.id || !Array.isArray(m.teams) || m.teams.length !== 2 || m.teams[0] === m.teams[1]) {
      throw new DomainError('INVALID_MATCHES', 'Mỗi trận cần { id, teams: [a, b] } với hai đội khác nhau');
    }
  }

  const remaining = matches.map((m, index) => ({ ...m, index, round: m.round || 1 }));
  const lastSlot = new Map();
  const slots = [];
  while (remaining.length) {
    const slotNo = slots.length + 1;
    const busy = new Set();
    const groupUse = new Map();
    const chosen = [];
    while (chosen.length < courts) {
      let bestIdx = -1;
      let bestKey = null;
      remaining.forEach((m, idx) => {
        if (busy.has(m.teams[0]) || busy.has(m.teams[1])) return;
        const rest = Math.min(...m.teams.map((t) => (lastSlot.has(t) ? slotNo - lastSlot.get(t) : Infinity)));
        const key = [m.round, -rest, groupUse.get(m.groupNo) || 0, m.index];
        if (!bestKey || compare(key, bestKey) < 0) {
          bestKey = key;
          bestIdx = idx;
        }
      });
      if (bestIdx === -1) break;
      const [m] = remaining.splice(bestIdx, 1);
      chosen.push(m);
      m.teams.forEach((t) => busy.add(t));
      groupUse.set(m.groupNo, (groupUse.get(m.groupNo) || 0) + 1);
    }
    chosen.forEach((m) => m.teams.forEach((t) => lastSlot.set(t, slotNo)));
    slots.push({ slotNo, matches: chosen.map((m) => m.id) });
  }
  return { slots, estimate: { matches: matches.length, slots: slots.length, minutes: slots.length * matchMinutes } };
};

const compare = (a, b) => {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
};

module.exports = { scheduleSlots };
