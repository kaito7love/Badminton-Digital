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
//    người "bằng trận" đứng sau hàng — kéo một người lên sớm hơn thứ tự hàng bị phạt:
//      SESSION_SKIP_PENALTY_PARTNER / người nếu việc đổi bớt được lặp đồng đội,
//      SESSION_SKIP_PENALTY / người nếu chỉ để cân trình hoặc bớt gặp lại đối thủ.
//    Người chưa đánh trận nào trong buổi (`newcomer`) không bao giờ bị kéo lên.
//
// Lịch sử: bước 1 xếp "chờ lâu nhất trước", không trộn → nhóm 4 người dính nhau cả buổi
// khi các sân xong lệch giờ. Bước 3 thêm "ít trận nhất trước" + trộn (phạt 0.10). Chủ
// dự án bấm thử thấy người vừa đến chen lên trước người chờ lâu → plan 18 mục 9: chặn
// người mới, phạt kéo lên 0.30 trừ khi để tránh lặp đồng đội.

const EPS = 1e-12;
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
  // không bao giờ để người ít trận hơn ngồi chờ thay người nhiều trận hơn. Người mới
  // (chưa đánh trận nào trong buổi) không nằm trong danh sách có thể kéo lên.
  const bandGames = count ? games(selected[count - 1]) : 0;
  const bench =
    mode === 'level' || !usable
      ? []
      : queue.slice(count).filter((p) => games(p) === bandGames && !p.newcomer).slice(0, Math.max(count, perCourt));
  // Người mới ra sân thì mọi người "bằng trận" đứng trước họ trong hàng cũng phải ra sân —
  // không để người chờ lâu ngồi nhìn người vừa đến đánh (kể cả khi người bị gạt ra là do kéo
  // một người khác lên).
  const rank = new Map(queue.map((p, i) => [p.id, i]));
  const newcomerAhead = (onCourt, waiting) =>
    waiting.some((w) => games(w) === bandGames && onCourt.some((p) => p.newcomer && rank.get(p.id) > rank.get(w.id)));

  // Chi phí một cách chia đội: chênh trình (trừ chế độ random) + phạt lặp. Tách riêng
  // phần lặp đồng đội (partRep) để biết một lần kéo người lên có bớt lặp đồng đội không.
  const times = (map, a, b) => map.get(pairKey(a.id, b.id)) || 0;
  const splitCost = (teamA, teamB) => {
    const balance = mode === 'random' ? 0 : Math.abs(mean(teamA.map((p) => p.rating)) - mean(teamB.map((p) => p.rating)));
    // Đồng đội lặp phạt theo bình phương số lần đã chung đội (lần 3 đắt gấp 4 lần 2);
    // đối thủ lặp phạt tuyến tính.
    let partRep = 0;
    for (const team of [teamA, teamB]) {
      if (team.length === 2) partRep += config.SESSION_REPEAT_PARTNER_PENALTY * times(partners, team[0], team[1]) ** 2;
    }
    let oppRep = 0;
    for (const a of teamA) for (const b of teamB) oppRep += config.SESSION_REPEAT_OPPONENT_PENALTY * times(opponents, a, b);
    return { cost: balance + partRep + oppRep, partRep };
  };

  const bestSplit = (group) => {
    if (perCourt === 2) return { teamA: [group[0]], teamB: [group[1]], ...splitCost([group[0]], [group[1]]) };
    const [a, b, c, d] = group;
    const options = [
      [[a, b], [c, d]],
      [[a, c], [b, d]],
      [[a, d], [b, c]]
    ];
    let best = null;
    for (const [teamA, teamB] of options) {
      const split = splitCost(teamA, teamB);
      if (!best || split.cost < best.cost - EPS) best = { teamA, teamB, ...split };
    }
    return best;
  };

  // Mức phạt cho mỗi người được kéo lên (moved > 0) hoặc trả về (moved < 0): rẻ khi việc
  // đó bớt lặp đồng đội (trả về thì ngược lại: làm lặp đồng đội tăng) — cùng một thang đo
  // cho cả hai chiều để tìm cục bộ không chạy vòng.
  const skipRate = (moved, before, after) =>
    (moved > 0 && after.partRep < before.partRep - EPS) || (moved < 0 && after.partRep > before.partRep + EPS)
      ? config.SESSION_SKIP_PENALTY_PARTNER
      : config.SESSION_SKIP_PENALTY;

  // Một sân trống (trường hợp thường gặp nhất giữa buổi): duyệt hết các cách chọn người
  // trong nhóm "bằng trận" — tìm cục bộ đổi từng người một có thể kẹt khi phải kéo lên
  // hai người cùng lúc mới phá được một nhóm 4 người dính nhau.
  const exhaustiveSingleCourt = () => {
    const fixed = selected.filter((p) => games(p) !== bandGames);
    const band = [...selected.filter((p) => games(p) === bandGames), ...bench];
    const k = perCourt - fixed.length;
    const strict = bestSplit(selected);
    let best = null;
    const pick = (start, chosen) => {
      if (chosen.length === k) {
        const group = [...fixed, ...chosen];
        if (newcomerAhead(group, band.filter((p) => !chosen.includes(p)))) return;
        const split = bestSplit(group);
        const moved = chosen.filter((p) => !firstPick.has(p.id)).length;
        const cost = split.cost + moved * skipRate(moved, strict, split);
        if (!best || cost < best.cost - EPS) best = { group, cost };
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
      const splits = groups.map((g) => bestSplit(g));
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
          if (newcomerAhead(groups.flatMap((g, k) => (k === i ? gi : g)), [out])) continue;
          const moved = (firstPick.has(bench[b].id) ? 0 : 1) - (firstPick.has(out.id) ? 0 : 1);
          const si = bestSplit(gi);
          if (si.cost + moved * skipRate(moved, splits[i], si) < splits[i].cost - EPS) {
            groups[i] = gi;
            splits[i] = si;
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
          const si = bestSplit(gi);
          const sj = bestSplit(gj);
          if (si.cost + sj.cost < splits[i].cost + splits[j].cost - EPS) {
            groups[i] = gi;
            groups[j] = gj;
            splits[i] = si;
            splits[j] = sj;
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
  return {
    seed,
    assignments,
    waiting: queue.filter((p) => !onCourt.has(p.id)).map((p) => p.id),
    // Thứ tự ưu tiên đầy đủ — màn hình lớn dùng đúng thứ tự này (plan 18 mục 9).
    order: queue.map((p) => p.id)
  };
};

module.exports = { fillCourts };
