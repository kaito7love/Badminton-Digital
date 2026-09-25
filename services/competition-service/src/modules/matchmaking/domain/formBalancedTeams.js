const { DomainError } = require('../../../shared/domainError');
const { round2, round3, mean, stdDev } = require('../../../shared/numbers');
const config = require('./config');
const { createRng, newSeed } = require('./seededRandom');

// Ghép đồng đội NGẪU NHIÊN NHƯNG CÂN BẰNG (docs/06 mục 4.3).
// 1. chọn người vào đội (lẻ / lệch nam–nữ → người đăng ký sau cùng vào danh sách chờ)
// 2. lời giải gốc "gấp đôi": mạnh nhất + yếu nhất, nhì + áp chót…
// 3. tìm kiếm cục bộ ngẫu nhiên nhiều lần khởi đầu, gom mọi phương án có
//    cost ≤ tốt nhất + tolerance
// 4. PRNG theo seed chọn một → vẫn là "bốc thăm", nhưng luôn cân.

const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

const byRegistration = (a, b) => {
  const ta = a.registeredAt ? new Date(a.registeredAt).getTime() : 0;
  const tb = b.registeredAt ? new Date(b.registeredAt).getTime() : 0;
  if (ta !== tb) return ta - tb;
  return a._index - b._index;
};

const validatePlayers = (players, mode) => {
  if (!Array.isArray(players)) throw new DomainError('INVALID_PLAYERS', 'players phải là mảng');
  const seen = new Set();
  const errors = [];
  players.forEach((p, i) => {
    if (!p || typeof p.id !== 'string' || !p.id) errors.push({ field: `players[${i}].id`, message: 'Bắt buộc' });
    else if (seen.has(p.id)) errors.push({ field: `players[${i}].id`, message: 'Trùng người chơi' });
    else seen.add(p.id);
    if (!p || typeof p.rating !== 'number' || !Number.isFinite(p.rating)) {
      errors.push({ field: `players[${i}].rating`, message: 'Phải là số' });
    }
    if (mode === 'mixed' && (!p || !['male', 'female'].includes(p.gender))) {
      errors.push({ field: `players[${i}].gender`, message: 'Đôi nam nữ cần giới tính của từng người' });
    }
  });
  if (errors.length) {
    throw new DomainError('INVALID_PLAYERS', `Danh sách người chơi không hợp lệ: ${errors[0].message}`, errors);
  }
};

const formBalancedTeams = ({
  players,
  mode = 'doubles',
  seed = newSeed(),
  tolerance = config.PAIRING_TOLERANCE,
  maxPartnerGap = null,
  recentPartners = [],
  restarts = config.PAIRING_RESTARTS,
  stepsPerPlayer = config.PAIRING_STEPS_PER_PLAYER
}) => {
  if (!['doubles', 'mixed'].includes(mode)) throw new DomainError('INVALID_MODE', 'mode phải là doubles hoặc mixed');
  validatePlayers(players, mode);

  const ordered = players.map((p, i) => ({ ...p, _index: i })).sort(byRegistration);
  const waitlist = [];
  let first; // phần tử thứ nhất của mỗi đội (mixed: nam)
  let second; // phần tử thứ hai (mixed: nữ)

  if (mode === 'mixed') {
    const men = ordered.filter((p) => p.gender === 'male');
    const women = ordered.filter((p) => p.gender === 'female');
    const k = Math.min(men.length, women.length);
    for (const p of [...men.slice(k), ...women.slice(k)]) waitlist.push({ playerId: p.id, reason: 'GENDER_IMBALANCE' });
    first = men.slice(0, k);
    second = women.slice(0, k);
  } else {
    let pool = ordered;
    if (pool.length % 2 === 1) {
      waitlist.push({ playerId: pool[pool.length - 1].id, reason: 'ODD_COUNT' });
      pool = pool.slice(0, -1);
    }
    first = pool;
    second = null;
  }

  const teamCount = mode === 'mixed' ? first.length : first.length / 2;
  if (teamCount === 0) {
    return { seed, teams: [], waitlist, stats: { teamRatingStdDev: 0, teamRatingRange: 0, baselineRandomStdDev: 0, alternativesConsidered: 0 } };
  }

  // --- Biểu diễn: slots[i] = [x, y] (chỉ số trong mảng people) ---
  const people = mode === 'mixed' ? [...first, ...second] : first;
  const rating = people.map((p) => p.rating);
  const position = people.map((p) => p.position || null);
  // Cặp đồng đội gần đây, khoá theo chỉ số (số nguyên) để tra nhanh trong vòng lặp.
  const indexOf = new Map(people.map((p, i) => [p.id, i]));
  const n = people.length;
  const recent = new Set();
  for (const pair of recentPartners) {
    if (!Array.isArray(pair) || pair.length !== 2) continue;
    const x = indexOf.get(pair[0]);
    const y = indexOf.get(pair[1]);
    if (x !== undefined && y !== undefined) recent.add(Math.min(x, y) * n + Math.max(x, y));
  }
  const hasGap = maxPartnerGap !== null && maxPartnerGap !== undefined;
  const hasPenalty = hasGap || recent.size > 0 || position.some(Boolean);

  const teamPenalty = (x, y) => {
    if (!hasPenalty) return 0;
    let pen = 0;
    if (hasGap) pen += config.PAIRING_GAP_PENALTY * Math.max(0, Math.abs(rating[x] - rating[y]) - maxPartnerGap);
    if (recent.has(Math.min(x, y) * n + Math.max(x, y))) pen += config.PAIRING_REPEAT_PARTNER_PENALTY;
    if (position[x] && position[x] === position[y] && position[x] !== 'both') pen += config.PAIRING_SAME_POSITION_PENALTY;
    return pen;
  };

  const foldSlots = () => {
    if (mode === 'mixed') {
      const men = first.map((_, i) => i).sort((a, b) => rating[b] - rating[a] || a - b);
      const women = second.map((_, i) => first.length + i).sort((a, b) => rating[a] - rating[b] || a - b);
      return men.map((m, i) => [m, women[i]]);
    }
    const idx = people.map((_, i) => i).sort((a, b) => rating[b] - rating[a] || a - b);
    const out = [];
    for (let i = 0; i < teamCount; i += 1) out.push([idx[i], idx[idx.length - 1 - i]]);
    return out;
  };

  const rng = createRng(seed);
  const randomSlots = () => {
    if (mode === 'mixed') {
      const women = rng.shuffle(second.map((_, i) => first.length + i));
      return first.map((_, i) => [i, women[i]]);
    }
    const idx = rng.shuffle(people.map((_, i) => i));
    const out = [];
    for (let i = 0; i < teamCount; i += 1) out.push([idx[2 * i], idx[2 * i + 1]]);
    return out;
  };

  // Trạng thái có cập nhật O(1): tổng / tổng bình phương điểm đội + tổng phạt.
  const makeState = (slots) => {
    const team = slots.map(([x, y]) => (rating[x] + rating[y]) / 2);
    const pen = slots.map(([x, y]) => teamPenalty(x, y));
    let sum = 0;
    let sumSq = 0;
    let penSum = 0;
    for (let i = 0; i < team.length; i += 1) {
      sum += team[i];
      sumSq += team[i] * team[i];
      penSum += pen[i];
    }
    return { slots, team, pen, sum, sumSq, penSum };
  };
  const costOf = (s) => {
    const m = s.sum / teamCount;
    return Math.sqrt(Math.max(0, s.sumSq / teamCount - m * m)) + s.penSum;
  };
  const canonical = (slots) =>
    slots
      .map(([x, y]) => pairKey(people[x].id, people[y].id))
      .sort()
      .join(',');

  // Pool các phương án gần tối ưu. Dựng khoá chuẩn (O(t log t)) tốn nhất, nên
  // chỉ lấy mẫu: cuối mỗi lần khởi đầu + mỗi RECORD_EVERY bước được chấp nhận.
  const RECORD_EVERY = 8;
  const pool = new Map();
  let best = Infinity;
  let accepted = 0;
  const record = (state, cost, force = false) => {
    if (cost < best) best = cost;
    if (!force && (accepted += 1) % RECORD_EVERY !== 0) return;
    if (cost <= best + tolerance + 1e-12 && pool.size < config.PAIRING_POOL_CAP) {
      const key = canonical(state.slots);
      if (!pool.has(key)) pool.set(key, { key, slots: state.slots.map((t) => [...t]), cost });
    }
  };

  const steps = Math.max(1, stepsPerPlayer * people.length);
  for (let r = 0; r < restarts; r += 1) {
    const state = makeState(r === 0 ? foldSlots() : randomSlots());
    let cost = costOf(state);
    record(state, cost, true);
    if (teamCount < 2) break;
    for (let step = 0; step < steps; step += 1) {
      const i = rng.int(teamCount);
      let j = rng.int(teamCount - 1);
      if (j >= i) j += 1;
      // mixed: đổi hai bạn nữ; doubles: đổi một người bất kỳ của hai đội.
      const a = mode === 'mixed' ? 1 : rng.int(2);
      const b = mode === 'mixed' ? 1 : rng.int(2);
      const si = state.slots[i];
      const sj = state.slots[j];
      // Đội i giữ si[1-a], nhận sj[b]; đội j giữ sj[1-b], nhận si[a].
      const keepI = si[1 - a];
      const keepJ = sj[1 - b];
      const moveToI = sj[b];
      const moveToJ = si[a];
      const ti = (rating[keepI] + rating[moveToI]) / 2;
      const tj = (rating[keepJ] + rating[moveToJ]) / 2;
      const pi = teamPenalty(keepI, moveToI);
      const pj = teamPenalty(keepJ, moveToJ);
      const sum = state.sum - state.team[i] - state.team[j] + ti + tj;
      const sumSq = state.sumSq - state.team[i] * state.team[i] - state.team[j] * state.team[j] + ti * ti + tj * tj;
      const penSum = state.penSum - state.pen[i] - state.pen[j] + pi + pj;
      const m = sum / teamCount;
      const newCost = Math.sqrt(Math.max(0, sumSq / teamCount - m * m)) + penSum;
      if (newCost <= cost + 1e-12) {
        si[a] = moveToI;
        sj[b] = moveToJ;
        state.team[i] = ti;
        state.team[j] = tj;
        state.pen[i] = pi;
        state.pen[j] = pj;
        state.sum = sum;
        state.sumSq = sumSq;
        state.penSum = penSum;
        cost = newCost;
        record(state, cost);
      }
    }
    record(state, cost, true);
  }

  const candidates = [...pool.values()]
    .filter((c) => c.cost <= best + tolerance + 1e-12)
    .sort((x, y) => (x.key < y.key ? -1 : 1));
  const chosen = candidates[createRng(`${seed}:pick`).int(candidates.length)];

  const teams = chosen.slots
    .map(([x, y]) => {
      const members = mode === 'mixed' ? [people[x], people[y]] : [people[x], people[y]].sort((p, q) => q.rating - p.rating);
      return { players: members.map((p) => p.id), teamRating: round2(mean(members.map((p) => p.rating))) };
    })
    .sort((p, q) => q.teamRating - p.teamRating || (p.players[0] < q.players[0] ? -1 : 1));

  const teamRatings = chosen.slots.map(([x, y]) => (rating[x] + rating[y]) / 2);
  return {
    seed,
    teams,
    waitlist,
    stats: {
      teamRatingStdDev: round3(stdDev(teamRatings)),
      teamRatingRange: round3(Math.max(...teamRatings) - Math.min(...teamRatings)),
      baselineRandomStdDev: round3(baselineRandomStdDev(people, first, second, mode, teamCount, seed)),
      alternativesConsidered: candidates.length
    }
  };
};

// Độ lệch trung bình nếu bốc thăm thuần tuý — để BTC và người chơi thấy cân
// bằng hơn bao nhiêu.
const baselineRandomStdDev = (people, first, second, mode, teamCount, seed) => {
  const rng = createRng(`${seed}:baseline`);
  let total = 0;
  for (let s = 0; s < config.BASELINE_SIMULATIONS; s += 1) {
    const teams = [];
    if (mode === 'mixed') {
      const women = rng.shuffle(second);
      first.forEach((m, i) => teams.push((m.rating + women[i].rating) / 2));
    } else {
      const shuffled = rng.shuffle(people);
      for (let i = 0; i < teamCount; i += 1) teams.push((shuffled[2 * i].rating + shuffled[2 * i + 1].rating) / 2);
    }
    total += stdDev(teams);
  }
  return total / config.BASELINE_SIMULATIONS;
};

module.exports = { formBalancedTeams };
