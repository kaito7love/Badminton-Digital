const { DomainError } = require('../../../shared/domainError');

// Lịch vòng tròn — phương pháp xoay vòng (circle method): giữ đội đầu cố định,
// xoay các đội còn lại. Mỗi cặp gặp nhau đúng một lần; số đội lẻ thì mỗi vòng
// một đội nghỉ.
const roundRobin = (teamIds) => {
  if (!Array.isArray(teamIds) || teamIds.length < 2) throw new DomainError('INVALID_TEAMS', 'Cần ít nhất 2 đội');
  if (new Set(teamIds).size !== teamIds.length) throw new DomainError('INVALID_TEAMS', 'Trùng đội');

  const list = teamIds.length % 2 === 0 ? [...teamIds] : [...teamIds, null];
  const n = list.length;
  const rounds = [];
  for (let r = 0; r < n - 1; r += 1) {
    const matches = [];
    let bye = null;
    for (let i = 0; i < n / 2; i += 1) {
      const a = list[i];
      const b = list[n - 1 - i];
      if (a === null || b === null) bye = a === null ? b : a;
      // Đổi chiều theo vòng để đội cố định không luôn là "đội A".
      else matches.push(r % 2 === 0 || i !== 0 ? [a, b] : [b, a]);
    }
    rounds.push({ round: r + 1, matches, bye });
    list.splice(1, 0, list.pop());
  }
  return { rounds };
};

module.exports = { roundRobin };
