const { DomainError } = require('../../../shared/domainError');
const { round2, mean } = require('../../../shared/numbers');
const config = require('./config');
const { createRng, newSeed } = require('./seededRandom');

// Xếp sân giao lưu (docs/06 mục 8.3).
// 1. số sân dùng được = min(sân trống, ⌊người rảnh / người mỗi sân⌋)
// 2. hàng ưu tiên: ít trận nhất → chờ lâu nhất → đến sớm → ngẫu nhiên; lấy N người đầu
// 3. chia vào sân theo chế độ (level / balanced / random)
// 4. mỗi sân 4 người có 3 cách chia đội → chọn cách cost nhỏ nhất
// 5. (balanced / random) tìm cục bộ: đổi người giữa các sân, và đổi người trong sân với
//    người "bằng trận" đứng sau hàng (kéo lên sớm → phạt SESSION_SKIP_PENALTY / người)
//
// Bước 5 và thứ tự "ít trận nhất trước" có từ bước 3 (test thật qua API): khi các sân
// xong lệch giờ nhau, xếp theo "chờ lâu nhất trước" làm nhóm 4 người vừa chờ luôn ra
// cùng một sân → nhóm dính nhau cả buổi (đồng đội lặp tới 5 lần, chênh số trận tới 3).

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
  const games = (p) => p.gamesPlayed || 0;

  const partners = new Map();
  const opponents = new Map();
  for (const [a, b, count] of history.partners || []) partners.set(pairKey(a, b), count || 1);
  for (const [a, b, count] of history.opponents || []) opponents.set(pairKey(a, b), count || 1);

  const tiebreak = new Map(players.map((p) => [p.id, rng.next()]));
  const queue = [...players].sort(
    (a, b) =>
      games(a) - games(b) ||
      toTime(a.waitingSince, nowMs) - toTime(b.waitingSince, nowMs) ||
      toTime(a.joinedAt, nowMs) - toTime(b.joinedAt, nowMs) ||
      tiebreak.get(a.id) - tiebreak.get(b.id)
  );

  const usable = Math.min(courts.length, Math.floor(queue.length / perCourt));
  const count = usable * perCourt;
  const selected = queue.slice(0, count);
  const firstPick = new Set(selected.map((p) => p.id));
  // Chỉ người có số trận bằng người cuối cùng được chọn mới đổi chỗ cho nhau được —
  // không bao giờ để người ít trận hơn ngồi chờ thay người nhiều trận hơn.
  const bandGames = count ? games(selected[count - 1]) : 0;
  const bench = mode === 'level' || !usable ? [] : queue.slice(count).filter((p) => games(p) === bandGames).slice(0, Math.max(count, perCourt));

  const splitCost = (teamA, teamB) => {
    let cost = mode === 'random' ? 0 : Math.abs(mean(teamA.map((p) => p.rating)) - mean(teamB.map((p) => p.rating)));
    // Đồng đội lặp phạt theo bình phương số lần đã chung đội (lần 3 đắt gấp 4 lần 2);
    // đối thủ lặp phạt tuyến tính.
    const times = (map, a, b) => map.get(pairKey(a.id, b.id)) || 0;
    for (const team of [teamA, teamB]) {
      if (team.length === 2) cost += config.SESSION_REPEAT_PARTNER_PENALTY * times(partners, team[0], team[1]) ** 2;
    }
    for (const a of teamA) for (const b of teamB) cost += config.SESSION_REPEAT_OPPONENT_PENALTY * times(opponents, a, b);
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

  // Một sân trống (trường hợp thường gặp nhất giữa buổi): duyệt hết các cách chọn người
  // trong nhóm "bằng trận" — tìm cục bộ đổi từng người một có thể kẹt khi phải kéo lên
  // hai người cùng lúc mới phá được một nhóm 4 người dính nhau.
  const exhaustiveSingleCourt = () => {
    const fixed = selected.filter((p) => games(p) !== bandGames);
    const band = [...selected.filter((p) => games(p) === bandGames), ...bench];
    const k = perCourt - fixed.length;
    let best = null;
    const pick = (start, chosen) => {
      if (chosen.length === k) {
        const group = [...fixed, ...chosen];
        const moved = chosen.filter((p) => !firstPick.has(p.id)).length;
        const cost = bestSplit(group).cost + moved * config.SESSION_SKIP_PENALTY;
        if (!best || cost < best.cost - 1e-12) best = { group, cost };
        return;
      }
      for (let i = start; i <= band.length - (k - chosen.length); i += 1) pick(i + 1, [...chosen, band[i]]);
    };
    pick(0, []);
    return best.group;
  };

  let groups;
  if (mode !== 'level' && usable === 1 && bench.length) {
    groups = [exhaustiveSingleCourt()];
  } else if (mode === 'level') {
    const sorted = [...selected].sort((a, b) => b.rating - a.rating || (a.id < b.id ? -1 : 1));
    groups = Array.from({ length: usable }, (_, i) => sorted.slice(i * perCourt, (i + 1) * perCourt));
  } else {
    const shuffled = rng.shuffle(selected);
    groups = Array.from({ length: usable }, (_, i) => shuffled.slice(i * perCourt, (i + 1) * perCourt));
    if (usable > 1 || bench.length) {
      const costs = groups.map((g) => bestSplit(g).cost);
      for (let s = 0; s < config.SESSION_BALANCE_SWAPS; s += 1) {
        const i = rng.int(usable);
        const x = rng.int(perCourt);
        if (bench.length && (usable === 1 || rng.next() < 0.5)) {
          // Đổi một người trong sân với một người "bằng trận" đang đứng sau hàng.
          const out = groups[i][x];
          if (games(out) !== bandGames) continue;
          const b = rng.int(bench.length);
          const gi = [...groups[i]];
          gi[x] = bench[b];
          const moved = (firstPick.has(bench[b].id) ? 0 : 1) - (firstPick.has(out.id) ? 0 : 1);
          const ci = bestSplit(gi).cost;
          if (ci + moved * config.SESSION_SKIP_PENALTY < costs[i] - 1e-12) {
            groups[i] = gi;
            costs[i] = ci;
            bench[b] = out;
          }
        } else if (usable > 1) {
          // Đổi người giữa hai sân.
          let j = rng.int(usable - 1);
          if (j >= i) j += 1;
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
  }

  const onCourt = new Set(groups.flat().map((p) => p.id));
  const assignments = groups.map((group, i) => {
    const { teamA, teamB } = bestSplit(group);
    return {
      court: courts[i],
      sideA: teamA.map((p) => p.id),
      sideB: teamB.map((p) => p.id),
      teamRatings: [round2(mean(teamA.map((p) => p.rating))), round2(mean(teamB.map((p) => p.rating)))]
    };
  });
  return { seed, assignments, waiting: queue.filter((p) => !onCourt.has(p.id)).map((p) => p.id) };
};

module.exports = { fillCourts };
