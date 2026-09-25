const { DomainError } = require('../../../shared/domainError');
const { round2, mean } = require('../../../shared/numbers');
const config = require('./config');
const { createRng, newSeed } = require('./seededRandom');

// Xếp sân giao lưu (docs/06 mục 8.3).
// 1. số sân dùng được = min(sân trống, ⌊người rảnh / người mỗi sân⌋)
// 2. chọn người: chờ lâu nhất → đánh ít trận nhất → đến sớm → ngẫu nhiên
// 3. chia vào sân theo chế độ (level / balanced / random)
// 4. mỗi sân 4 người có 3 cách chia đội → chọn cách cost nhỏ nhất

const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const toTime = (v, fallback) => (v ? new Date(v).getTime() : fallback);

const fillCourts = ({ players, courts, format = 'doubles', mode = 'balanced', history = {}, seed = newSeed(), now = new Date() }) => {
  if (!Array.isArray(players)) throw new DomainError('INVALID_PLAYERS', 'players phải là mảng');
  if (!Array.isArray(courts)) throw new DomainError('INVALID_COURTS', 'courts phải là mảng mã sân');
  if (!['doubles', 'singles'].includes(format)) throw new DomainError('INVALID_FORMAT', 'format phải là doubles hoặc singles');
  if (!['balanced', 'level', 'random'].includes(mode)) throw new DomainError('INVALID_MODE', 'mode phải là balanced, level hoặc random');
  const ids = players.map((p) => p && p.id);
  if (ids.some((id) => typeof id !== 'string') || new Set(ids).size !== ids.length) {
    throw new DomainError('INVALID_PLAYERS', 'Mỗi người chơi cần id riêng');
  }

  const perCourt = format === 'doubles' ? 4 : 2;
  const rng = createRng(seed);
  const nowMs = now.getTime();

  const partners = new Map();
  const opponents = new Map();
  for (const [a, b, count] of history.partners || []) partners.set(pairKey(a, b), count || 1);
  for (const [a, b, count] of history.opponents || []) opponents.set(pairKey(a, b), count || 1);

  const tiebreak = new Map(players.map((p) => [p.id, rng.next()]));
  const queue = [...players].sort(
    (a, b) =>
      toTime(a.waitingSince, nowMs) - toTime(b.waitingSince, nowMs) ||
      (a.gamesPlayed || 0) - (b.gamesPlayed || 0) ||
      toTime(a.joinedAt, nowMs) - toTime(b.joinedAt, nowMs) ||
      tiebreak.get(a.id) - tiebreak.get(b.id)
  );

  const usable = Math.min(courts.length, Math.floor(queue.length / perCourt));
  const selected = queue.slice(0, usable * perCourt);
  const waiting = queue.slice(usable * perCourt).map((p) => p.id);

  const splitCost = (teamA, teamB) => {
    let cost = mode === 'random' ? 0 : Math.abs(mean(teamA.map((p) => p.rating)) - mean(teamB.map((p) => p.rating)));
    const penalize = (map, a, b, weight) => {
      cost += weight * (map.get(pairKey(a.id, b.id)) || 0);
    };
    if (teamA.length === 2) penalize(partners, teamA[0], teamA[1], config.SESSION_REPEAT_PARTNER_PENALTY);
    if (teamB.length === 2) penalize(partners, teamB[0], teamB[1], config.SESSION_REPEAT_PARTNER_PENALTY);
    for (const a of teamA) for (const b of teamB) penalize(opponents, a, b, config.SESSION_REPEAT_OPPONENT_PENALTY);
    return cost;
  };

  const bestSplit = (group) => {
    if (perCourt === 2) return { teamA: [group[0]], teamB: [group[1]], cost: splitCost([group[0]], [group[1]]) };
    const [a, b, c, d] = group;
    const options = [
      [[a, b], [c, d]],
      [[a, c], [b, d]],
      [[a, d], [b, c]]
    ];
    let best = null;
    for (const [teamA, teamB] of options) {
      const cost = splitCost(teamA, teamB);
      if (!best || cost < best.cost - 1e-12) best = { teamA, teamB, cost };
    }
    return best;
  };

  let groups;
  if (mode === 'level') {
    const sorted = [...selected].sort((a, b) => b.rating - a.rating || (a.id < b.id ? -1 : 1));
    groups = Array.from({ length: usable }, (_, i) => sorted.slice(i * perCourt, (i + 1) * perCourt));
  } else {
    const shuffled = rng.shuffle(selected);
    groups = Array.from({ length: usable }, (_, i) => shuffled.slice(i * perCourt, (i + 1) * perCourt));
    if (mode === 'balanced' && usable > 1) {
      // Đổi người giữa hai sân nếu giảm được tổng cost.
      const costs = groups.map((g) => bestSplit(g).cost);
      for (let s = 0; s < config.SESSION_BALANCE_SWAPS; s += 1) {
        const i = rng.int(usable);
        let j = rng.int(usable - 1);
        if (j >= i) j += 1;
        const x = rng.int(perCourt);
        const y = rng.int(perCourt);
        const gi = [...groups[i]];
        const gj = [...groups[j]];
        [gi[x], gj[y]] = [gj[y], gi[x]];
        const ci = bestSplit(gi).cost;
        const cj = bestSplit(gj).cost;
        if (ci + cj < costs[i] + costs[j] - 1e-12) {
          groups[i] = gi;
          groups[j] = gj;
          costs[i] = ci;
          costs[j] = cj;
        }
      }
    }
  }

  const assignments = groups.map((group, i) => {
    const { teamA, teamB } = bestSplit(group);
    return {
      court: courts[i],
      sideA: teamA.map((p) => p.id),
      sideB: teamB.map((p) => p.id),
      teamRatings: [round2(mean(teamA.map((p) => p.rating))), round2(mean(teamB.map((p) => p.rating)))]
    };
  });
  return { seed, assignments, waiting };
};

module.exports = { fillCourts };
