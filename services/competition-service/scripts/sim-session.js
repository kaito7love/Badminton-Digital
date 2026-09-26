// Mô phỏng buổi giao lưu để đo thuật toán xếp sân (fillCourts) — số liệu ở docs/06 mục 8.3
// và plan 18 mục 9 lấy từ script này, ai cũng chạy lại được:
//   npm run sim:session                 → 200 lần chạy × mọi kịch bản
//   npm run sim:session -- --seeds 40 --only "20/4"
// Mô phỏng giống service thật: đồng hồ từng phút, mỗi trận 12–18 phút (mỗi sân một thời
// lượng), người đến muộn được bù số trận (sessionRules.lateCredit), người chưa đánh trận nào
// là `newcomer`, người về sớm rời khi rảnh.
const { fillCourts } = require('../src/modules/matchmaking/domain/fillCourts');
const { createRng } = require('../src/modules/matchmaking/domain/seededRandom');
const { lateCredit } = require('../src/modules/session/domain/sessionRules');

const MIN = 60 * 1000;
const START = Date.UTC(2026, 8, 26, 12, 0);
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

// arrivals: { id: phút đến } (không có = đầu buổi) · leaves: { id: phút về (khi rảnh) }
const SCENARIOS = {
  '20/4': {},
  '20/4 muộn+sớm': { arrivals: { p18: 60, p19: 60 }, leaves: { p0: 120 } },
  'đến rải rác 22/4': { count: 22, arrivals: { p16: 20, p17: 20, p18: 45, p19: 45, p20: 75, p21: 75 }, leaves: { p0: 100, p1: 130 } },
  '18/4': { count: 18 },
  '22/4': { count: 22 },
  '16/3': { count: 16, courts: 3 },
  '12/2': { count: 12, courts: 2 }
};

const run = (seed, { count = 20, courts = 4, minutes = 180, arrivals = {}, leaves = {} } = {}) => {
  const courtRefs = Array.from({ length: courts }, (_, i) => `c${i + 1}`);
  const rng = createRng(`${seed}:r`);
  const players = new Map();
  for (let i = 0; i < count; i += 1) {
    const id = `p${i}`;
    const joinedAt = START + (arrivals[id] || 0) * MIN;
    players.set(id, { id, rating: Math.round((2 + rng.next() * 2.5) * 100) / 100, played: 0, credit: 0, joinedAt, waitingSince: joinedAt, left: false });
  }
  const partners = new Map();
  const opponents = new Map();
  const quartets = new Map();
  const freeAt = new Map(courtRefs.map((c) => [c, START]));
  const busyUntil = new Map();
  const m = { round: 0, fills: 0, jumpFills: 0, jumps: 0, newcomerJumps: 0, backToBack: 0, imbalance: 0, matches: 0 };
  const effective = (p) => p.played + p.credit;
  for (let t = START; t < START + minutes * MIN; t += MIN) {
    for (const p of players.values()) {
      if (leaves[p.id] !== undefined && !p.left && t >= START + leaves[p.id] * MIN && !(busyUntil.get(p.id) > t)) p.left = true;
      if (p.joinedAt === t && t > START) {
        const present = [...players.values()].filter((o) => o.id !== p.id && o.joinedAt < t && !o.left).map(effective);
        p.credit = lateCredit({ gamesPlayed: p.played, currentCredit: p.credit, presentEffective: present });
      }
    }
    const free = courtRefs.filter((c) => freeAt.get(c) <= t);
    if (!free.length) continue;
    const pool = [...players.values()].filter((p) => p.joinedAt <= t && !p.left && !(busyUntil.get(p.id) > t));
    const { assignments } = fillCourts({
      players: pool.map((p) => ({ id: p.id, rating: p.rating, gamesPlayed: effective(p), newcomer: p.played === 0, waitingSince: new Date(p.waitingSince), joinedAt: new Date(p.joinedAt) })),
      courts: free,
      history: { partners: [...partners].map(([k, n]) => [...k.split('|'), n]), opponents: [...opponents].map(([k, n]) => [...k.split('|'), n]) },
      seed: `${seed}:${(m.round += 1)}`,
      now: new Date(t)
    });
    if (!assignments.length) continue;
    // "Chen hàng": người được xếp mà có người bằng trận chờ lâu hơn ít nhất 1 phút bị để lại.
    const chosen = new Set(assignments.flatMap((a) => [...a.sideA, ...a.sideB]));
    let jumped = false;
    for (const c of pool.filter((p) => chosen.has(p.id))) {
      for (const s of pool.filter((p) => !chosen.has(p.id))) {
        if (effective(s) === effective(c) && s.waitingSince <= c.waitingSince - MIN) {
          m.jumps += 1;
          jumped = true;
          if (c.joinedAt > START && c.played === 0) m.newcomerJumps += 1;
        }
      }
    }
    m.fills += 1;
    if (jumped) m.jumpFills += 1;
    for (const a of assignments) {
      const duration = 12 + Math.floor(rng.next() * 7);
      freeAt.set(a.court, t + duration * MIN);
      m.matches += 1;
      m.imbalance += Math.abs(a.teamRatings[0] - a.teamRatings[1]);
      for (const side of [a.sideA, a.sideB]) if (side.length === 2) partners.set(pairKey(side[0], side[1]), (partners.get(pairKey(side[0], side[1])) || 0) + 1);
      for (const x of a.sideA) for (const y of a.sideB) opponents.set(pairKey(x, y), (opponents.get(pairKey(x, y)) || 0) + 1);
      const four = [...a.sideA, ...a.sideB].sort().join(',');
      quartets.set(four, (quartets.get(four) || 0) + 1);
      for (const id of [...a.sideA, ...a.sideB]) {
        const p = players.get(id);
        if (p.played > 0 && p.waitingSince === t) m.backToBack += 1;
        p.played += 1;
        busyUntil.set(id, t + duration * MIN);
        p.waitingSince = t + duration * MIN;
      }
    }
  }
  const full = [...players.values()].filter((p) => p.joinedAt === START && leaves[p.id] === undefined).map((p) => p.played);
  return {
    gap: Math.max(...full) - Math.min(...full),
    partnerMax: Math.max(0, ...partners.values()),
    fourMax: Math.max(...quartets.values()),
    jumps: m.jumps,
    newcomerJumps: m.newcomerJumps,
    jumpRate: m.fills ? m.jumpFills / m.fills : 0,
    backToBack: m.backToBack,
    imbalance: m.imbalance / m.matches
  };
};

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const seeds = Array.from({ length: Number(arg('seeds', 200)) }, (_, i) => `s${i}`);
const only = arg('only', null);
console.log(`fillCourts — ${seeds.length} lần chạy mỗi kịch bản, 3 giờ, mỗi trận 12–18 phút`);
for (const [name, cfg] of Object.entries(SCENARIOS)) {
  if (only && name !== only) continue;
  const r = seeds.map((s) => run(s, cfg));
  const max = (k) => Math.max(...r.map((x) => x[k]));
  const avg = (k) => r.reduce((sum, x) => sum + x[k], 0) / r.length;
  const gaps = r.reduce((acc, x) => ({ ...acc, [x.gap]: (acc[x.gap] || 0) + 1 }), {});
  console.log(
    `  ${name.padEnd(17)} chênh số trận ${JSON.stringify(gaps)} · lặp đồng đội > 2: ${r.filter((x) => x.partnerMax > 2).length}/${r.length}` +
      ` · nhóm 4 ≤ ${max('fourMax')} · chen hàng ≈ ${avg('jumps').toFixed(1)} (người mới ≈ ${avg('newcomerJumps').toFixed(1)})` +
      ` · lượt có kéo ≈ ${Math.round(avg('jumpRate') * 100)}% · đánh liền ≈ ${Math.round(avg('backToBack'))} · lệch đội ≈ ${avg('imbalance').toFixed(3)}`
  );
}
