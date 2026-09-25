const { DomainError } = require('../../../shared/domainError');
const { createRng, newSeed } = require('./seededRandom');

// Chia bảng (docs/06 mục 4.4).
//  seeded: sắp đội giảm dần → cắt thành "nhóm hạt giống" mỗi nhóm = số bảng →
//          mỗi nhóm xáo theo seed rồi chia lần lượt vào các bảng (kiểu bốc thăm World Cup)
//  level : sắp giảm dần, cắt liền thành các bảng (bảng 1 mạnh nhất)
// Các bảng lệch nhau tối đa 1 đội, mỗi bảng ≥ 2 đội.

const drawGroups = ({ teams, groupCount, mode = 'seeded', seed = newSeed() }) => {
  if (!Array.isArray(teams) || teams.some((t) => !t || typeof t.id !== 'string' || typeof t.rating !== 'number')) {
    throw new DomainError('INVALID_TEAMS', 'teams phải là mảng { id, rating }');
  }
  if (!Number.isInteger(groupCount) || groupCount < 1) throw new DomainError('INVALID_GROUP_COUNT', 'Số bảng phải ≥ 1');
  if (teams.length < groupCount * 2) {
    throw new DomainError('INVALID_GROUP_COUNT', `${teams.length} đội không đủ chia ${groupCount} bảng (mỗi bảng ≥ 2 đội)`);
  }
  if (!['seeded', 'level'].includes(mode)) throw new DomainError('INVALID_MODE', 'mode phải là seeded hoặc level');

  const sorted = [...teams].sort((a, b) => b.rating - a.rating || (a.id < b.id ? -1 : 1));
  const groups = Array.from({ length: groupCount }, (_, i) => ({ groupNo: i + 1, teams: [] }));
  const rng = createRng(seed);

  if (mode === 'level') {
    const base = Math.floor(sorted.length / groupCount);
    const extra = sorted.length % groupCount;
    let cursor = 0;
    groups.forEach((g, i) => {
      const size = base + (i < extra ? 1 : 0);
      g.teams = sorted.slice(cursor, cursor + size).map((t) => ({ id: t.id, pot: null }));
      cursor += size;
    });
  } else {
    for (let potStart = 0, pot = 1; potStart < sorted.length; potStart += groupCount, pot += 1) {
      const potTeams = rng.shuffle(sorted.slice(potStart, potStart + groupCount));
      // Nhóm cuối có thể thiếu: chia vào các bảng đang ít đội nhất, thứ tự bảng ngẫu nhiên.
      const order =
        potTeams.length === groupCount
          ? groups
          : rng.shuffle(groups).sort((a, b) => a.teams.length - b.teams.length);
      potTeams.forEach((t, i) => order[i].teams.push({ id: t.id, pot }));
    }
  }

  const ratingOf = new Map(teams.map((t) => [t.id, t.rating]));
  for (const g of groups) g.teams.sort((a, b) => ratingOf.get(b.id) - ratingOf.get(a.id));
  return { seed, groups };
};

module.exports = { drawGroups };
