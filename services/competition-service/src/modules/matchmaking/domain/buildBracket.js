const { DomainError } = require('../../../shared/domainError');
const { createRng, newSeed } = require('./seededRandom');

// Sơ đồ loại trực tiếp (docs/06 mục 5).
//  - kích thước = luỹ thừa của 2 nhỏ nhất ≥ số đội; lượt miễn đấu (bye) cho hạt giống cao nhất
//  - vị trí hạt giống chuẩn: 1 và 2 ở hai nửa, 3–4 ở hai phần tư còn lại…
//  - from_groups: nhất bảng là hạt giống trước; nhì bảng xếp sao cho KHÔNG gặp đội
//    cùng bảng ở vòng đầu và ở NỬA KIA so với đội nhất cùng bảng (gặp lại muộn nhất ở chung kết)
//  - seeded: B/4 hạt giống (tối thiểu 2, và đủ để nhận hết bye) giữ vị trí chuẩn,
//    còn lại bốc thăm vào vị trí trống

const nextPow2 = (n) => {
  let size = 1;
  while (size < n) size *= 2;
  return size;
};

// Thứ tự hạt giống theo vị trí: size 8 → [1, 8, 4, 5, 2, 7, 3, 6]
const standardOrder = (size) => {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order;
};

const buildBracket = ({ entrants, mode = 'seeded', seedCount = null, seed = newSeed() }) => {
  if (!Array.isArray(entrants) || entrants.length < 2) throw new DomainError('INVALID_ENTRANTS', 'Cần ít nhất 2 đội');
  const ids = entrants.map((e) => e && e.id);
  if (ids.some((id) => typeof id !== 'string') || new Set(ids).size !== ids.length) {
    throw new DomainError('INVALID_ENTRANTS', 'Mỗi đội cần id riêng');
  }
  if (!['seeded', 'from_groups'].includes(mode)) throw new DomainError('INVALID_MODE', 'mode phải là seeded hoặc from_groups');

  const q = entrants.length;
  const size = nextPow2(q);
  const order = standardOrder(size);
  const posOfSeed = new Map(order.map((s, pos) => [s, pos]));
  const positions = new Array(size).fill(null);
  const half = (pos) => (pos < size / 2 ? 0 : 1);

  let constraintLevel = null;
  if (mode === 'seeded') {
    const fixed = Math.min(q, Math.max(seedCount || Math.max(2, size / 4), size - q));
    for (let s = 1; s <= fixed; s += 1) positions[posOfSeed.get(s)] = entrants[s - 1].id;
    const byeSlots = new Set();
    for (let s = q + 1; s <= size; s += 1) byeSlots.add(posOfSeed.get(s));
    const free = [];
    for (let pos = 0; pos < size; pos += 1) if (positions[pos] === null && !byeSlots.has(pos)) free.push(pos);
    const rest = createRng(seed).shuffle(entrants.slice(fixed).map((e) => e.id));
    free.forEach((pos, i) => {
      positions[pos] = rest[i];
    });
  } else {
    if (entrants.some((e) => !e.group || ![1, 2].includes(e.groupRank))) {
      throw new DomainError('INVALID_ENTRANTS', 'from_groups cần group và groupRank (1 hoặc 2) cho từng đội');
    }
    const winners = entrants.filter((e) => e.groupRank === 1);
    const runners = entrants.filter((e) => e.groupRank === 2);
    // Nhất bảng giữ vị trí chuẩn của hạt giống 1..W.
    winners.forEach((w, i) => {
      positions[posOfSeed.get(i + 1)] = w.id;
    });
    const winnerPos = new Map(winners.map((w, i) => [w.group, posOfSeed.get(i + 1)]));
    const groupOf = new Map(entrants.map((e) => [e.id, e.group]));
    const slotSeeds = [];
    for (let s = winners.length + 1; s <= q; s += 1) slotSeeds.push(s);
    const slots = slotSeeds.map((s) => posOfSeed.get(s));

    const tryAssign = (level) => {
      const assign = new Array(runners.length).fill(null);
      const used = new Set();
      const ok = (runner, pos) => {
        const opp = positions[pos ^ 1];
        if (level >= 1 && opp && groupOf.get(opp) === runner.group) return false;
        if (level >= 2 && winnerPos.has(runner.group) && half(winnerPos.get(runner.group)) === half(pos)) return false;
        return true;
      };
      const solve = (k) => {
        if (k === runners.length) return true;
        const runner = runners[k];
        const preferred = winners.length + k + 1;
        const candidates = slots
          .map((pos, i) => ({ pos, dist: Math.abs(slotSeeds[i] - preferred), s: slotSeeds[i] }))
          .filter((c) => !used.has(c.pos))
          .sort((a, b) => a.dist - b.dist || a.s - b.s);
        for (const c of candidates) {
          if (!ok(runner, c.pos)) continue;
          used.add(c.pos);
          assign[k] = c.pos;
          positions[c.pos] = runner.id;
          if (solve(k + 1)) return true;
          positions[c.pos] = null;
          used.delete(c.pos);
          assign[k] = null;
        }
        return false;
      };
      return solve(0);
    };
    // Thử đủ cả hai ràng buộc, không được thì chỉ giữ "không gặp cùng bảng ở vòng đầu".
    for (const level of [2, 1, 0]) {
      if (tryAssign(level)) {
        constraintLevel = level;
        break;
      }
    }
  }

  const firstRound = [];
  for (let m = 0; m < size / 2; m += 1) {
    const a = positions[2 * m];
    const b = positions[2 * m + 1];
    firstRound.push({ match: m + 1, a, b, bye: !a || !b });
  }
  return {
    seed,
    size,
    rounds: Math.log2(size),
    positions,
    firstRound,
    // 2 = đủ cả hai ràng buộc; 1 = chỉ tránh cùng bảng ở vòng đầu; 0 = không thoả được
    constraintLevel
  };
};

module.exports = { buildBracket, standardOrder, nextPow2 };
