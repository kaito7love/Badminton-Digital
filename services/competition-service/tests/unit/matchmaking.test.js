const { execFileSync } = require('child_process');
const path = require('path');
const { formBalancedTeams } = require('../../src/modules/matchmaking/domain/formBalancedTeams');
const { drawGroups } = require('../../src/modules/matchmaking/domain/drawGroups');
const { roundRobin } = require('../../src/modules/matchmaking/domain/roundRobin');
const { scheduleSlots } = require('../../src/modules/matchmaking/domain/scheduleSlots');
const { buildBracket, standardOrder } = require('../../src/modules/matchmaking/domain/buildBracket');
const { createRng } = require('../../src/modules/matchmaking/domain/seededRandom');

const people = (ratings, genderOf = () => undefined) =>
  ratings.map((rating, i) => ({ id: `p${String(i).padStart(3, '0')}`, rating, gender: genderOf(i), registeredAt: new Date(Date.UTC(2026, 8, 1, 0, i)) }));

describe('seededRandom', () => {
  test('cùng seed → cùng dãy; khác seed → khác dãy', () => {
    const a = createRng('abc');
    const b = createRng('abc');
    const c = createRng('abd');
    const seqA = [a.next(), a.next(), a.next()];
    expect([b.next(), b.next(), b.next()]).toEqual(seqA);
    expect([c.next(), c.next(), c.next()]).not.toEqual(seqA);
  });
});

describe('formBalancedTeams (docs/06 mục 4.3)', () => {
  test('ví dụ 8 người: mọi đội đều 3.40', () => {
    const r = formBalancedTeams({ players: people([4.6, 4.1, 3.8, 3.5, 3.3, 3.0, 2.7, 2.2]), seed: 's1', tolerance: 0 });
    expect(r.teams).toHaveLength(4);
    for (const t of r.teams) expect(t.teamRating).toBe(3.4);
    expect(r.stats.teamRatingStdDev).toBe(0);
    expect(r.stats.baselineRandomStdDev).toBeGreaterThan(0.2);
  });

  test('mỗi người đúng một đội; số lẻ → người đăng ký sau cùng vào danh sách chờ', () => {
    const list = people([4.1, 3.9, 3.7, 3.2, 3.1, 2.8, 2.5]);
    const r = formBalancedTeams({ players: list, seed: 's2' });
    const used = r.teams.flatMap((t) => t.players);
    expect(new Set(used).size).toBe(6);
    expect(r.waitlist).toEqual([{ playerId: 'p006', reason: 'ODD_COUNT' }]);
  });

  test('đôi nam nữ: luôn 1 nam + 1 nữ; giới dư → người đăng ký sau cùng của giới đó chờ', () => {
    // 7 nam, 5 nữ
    const genders = ['male', 'female', 'male', 'female', 'male', 'female', 'male', 'female', 'male', 'female', 'male', 'male'];
    const list = people([4.2, 3.9, 3.8, 3.5, 3.6, 3.1, 3.3, 2.9, 3.0, 2.6, 2.8, 2.4], (i) => genders[i]);
    const r = formBalancedTeams({ players: list, mode: 'mixed', seed: 's3' });
    const genderOf = new Map(list.map((p) => [p.id, p.gender]));
    expect(r.teams).toHaveLength(5);
    for (const t of r.teams) expect(t.players.map((id) => genderOf.get(id)).sort()).toEqual(['female', 'male']);
    expect(r.waitlist).toEqual([
      { playerId: 'p010', reason: 'GENDER_IMBALANCE' },
      { playerId: 'p011', reason: 'GENDER_IMBALANCE' }
    ]);
  });

  test('cùng input + cùng seed → cùng kết quả; seed khác có thể ra phương án khác nhưng vẫn cân', () => {
    const rng = createRng('ratings');
    const list = people(Array.from({ length: 24 }, () => Math.round((2 + rng.next() * 2.5) * 100) / 100));
    const a = formBalancedTeams({ players: list, seed: 'same' });
    const b = formBalancedTeams({ players: list, seed: 'same' });
    expect(b.teams).toEqual(a.teams);
    const results = ['x1', 'x2', 'x3', 'x4', 'x5'].map((seed) => formBalancedTeams({ players: list, seed }));
    const distinct = new Set(results.map((r) => JSON.stringify(r.teams.map((t) => [...t.players].sort()).sort())));
    expect(distinct.size).toBeGreaterThan(1);
    // Lời giải gốc "gấp đôi" (không tìm kiếm) là mốc trên của phương án tốt nhất.
    const fold = formBalancedTeams({ players: list, seed: 'x1', restarts: 1, stepsPerPlayer: 0 }).stats.teamRatingStdDev;
    for (const r of results) {
      expect(r.stats.teamRatingStdDev).toBeLessThanOrEqual(fold + 0.03 + 0.001);
      expect(r.stats.teamRatingStdDev).toBeLessThan(r.stats.baselineRandomStdDev / 3);
    }
  });

  test('chênh lệch tối đa trong cặp được tôn trọng khi có thể', () => {
    const list = people([4.5, 4.3, 3.5, 3.4, 3.3, 3.2, 2.4, 2.2]);
    const r = formBalancedTeams({ players: list, seed: 'gap', maxPartnerGap: 1.2 });
    const rating = new Map(list.map((p) => [p.id, p.rating]));
    for (const t of r.teams) expect(Math.abs(rating.get(t.players[0]) - rating.get(t.players[1]))).toBeLessThanOrEqual(1.2 + 1e-9);
  });

  test('128 người chạy < 200 ms (đo bằng node thường — scripts/bench-pairing.js)', () => {
    const out = JSON.parse(execFileSync(process.execPath, [path.join(__dirname, '../../scripts/bench-pairing.js'), '128']).toString());
    expect(out.teams).toBe(64);
    expect(out.ms).toBeLessThan(200);
  });

  test('thiếu giới tính ở đôi nam nữ → lỗi rõ ràng', () => {
    expect(() => formBalancedTeams({ players: people([3, 3]), mode: 'mixed' })).toThrow(/giới tính/);
  });
});

describe('drawGroups (docs/06 mục 4.4)', () => {
  const teams = Array.from({ length: 12 }, (_, i) => ({ id: `T${i + 1}`, rating: 4 - i * 0.1 }));

  test('seeded: 3 bảng × 4 đội, mỗi bảng có đúng 1 đội từ mỗi nhóm hạt giống', () => {
    const { groups } = drawGroups({ teams, groupCount: 3, mode: 'seeded', seed: 'g1' });
    expect(groups.map((g) => g.teams.length)).toEqual([4, 4, 4]);
    for (const g of groups) expect(g.teams.map((t) => t.pot).sort()).toEqual([1, 2, 3, 4]);
  });

  test('level: bảng 1 mạnh nhất, cắt liền', () => {
    const { groups } = drawGroups({ teams, groupCount: 3, mode: 'level' });
    expect(groups[0].teams.map((t) => t.id)).toEqual(['T1', 'T2', 'T3', 'T4']);
  });

  test('số đội không chia hết: các bảng lệch tối đa 1', () => {
    const { groups } = drawGroups({ teams: teams.slice(0, 10), groupCount: 3, mode: 'seeded', seed: 'g2' });
    const sizes = groups.map((g) => g.teams.length);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    expect(sizes.reduce((s, n) => s + n, 0)).toBe(10);
  });

  test('không đủ đội cho số bảng → lỗi', () => {
    expect(() => drawGroups({ teams: teams.slice(0, 5), groupCount: 3 })).toThrow(/không đủ/);
  });
});

describe('roundRobin', () => {
  test.each([2, 3, 4, 5, 6])('%i đội: mỗi cặp gặp nhau đúng 1 lần, mỗi vòng không đội nào đánh 2 trận', (n) => {
    const ids = Array.from({ length: n }, (_, i) => `T${i}`);
    const { rounds } = roundRobin(ids);
    const seen = new Map();
    for (const r of rounds) {
      const inRound = r.matches.flat();
      expect(new Set(inRound).size).toBe(inRound.length);
      for (const [a, b] of r.matches) {
        const key = [a, b].sort().join('|');
        seen.set(key, (seen.get(key) || 0) + 1);
      }
    }
    expect(seen.size).toBe((n * (n - 1)) / 2);
    for (const count of seen.values()) expect(count).toBe(1);
    if (n % 2 === 1) expect(rounds.every((r) => r.bye)).toBe(true);
  });
});

describe('scheduleSlots — ví dụ docs/06 mục 9: 3 bảng × 4 đội, 4 sân', () => {
  test('18 trận → 5 lượt, 75 phút; không đội nào đánh 2 trận cùng lượt', () => {
    const matches = [];
    for (const g of [1, 2, 3]) {
      const ids = [1, 2, 3, 4].map((i) => `G${g}T${i}`);
      roundRobin(ids).rounds.forEach((r) =>
        r.matches.forEach(([a, b], k) => matches.push({ id: `G${g}R${r.round}M${k}`, teams: [a, b], groupNo: g, round: r.round }))
      );
    }
    const { slots, estimate } = scheduleSlots({ matches, courts: 4, matchMinutes: 15 });
    expect(estimate).toEqual({ matches: 18, slots: 5, minutes: 75 });
    const byId = new Map(matches.map((m) => [m.id, m]));
    for (const s of slots) {
      expect(s.matches.length).toBeLessThanOrEqual(4);
      const teams = s.matches.flatMap((id) => byId.get(id).teams);
      expect(new Set(teams).size).toBe(teams.length);
    }
  });
});

describe('buildBracket (docs/06 mục 5)', () => {
  test('thứ tự hạt giống chuẩn', () => {
    expect(standardOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  test('từ vòng bảng: 3 bảng × 2 đội → sơ đồ 8, 2 bye cho hạt giống 1–2, nhất – nhì cùng bảng ở hai nửa', () => {
    const entrants = [
      { id: 'A1', group: 'A', groupRank: 1 },
      { id: 'B1', group: 'B', groupRank: 1 },
      { id: 'C1', group: 'C', groupRank: 1 },
      { id: 'A2', group: 'A', groupRank: 2 },
      { id: 'B2', group: 'B', groupRank: 2 },
      { id: 'C2', group: 'C', groupRank: 2 }
    ];
    const r = buildBracket({ entrants, mode: 'from_groups' });
    expect(r.size).toBe(8);
    expect(r.firstRound.filter((m) => m.bye)).toHaveLength(2);
    const byes = r.firstRound.filter((m) => m.bye).map((m) => m.a || m.b).sort();
    expect(byes).toEqual(['A1', 'B1']);
    const pos = (id) => r.positions.indexOf(id);
    const half = (id) => (pos(id) < 4 ? 0 : 1);
    for (const g of ['A', 'B', 'C']) expect(half(`${g}1`)).not.toBe(half(`${g}2`));
    for (const m of r.firstRound) if (m.a && m.b) expect(m.a[0]).not.toBe(m.b[0]);
    expect(r.constraintLevel).toBe(2);
  });

  test('4 bảng × 2 đội → tứ kết, không ai gặp đội cùng bảng ở vòng đầu', () => {
    const entrants = ['A', 'B', 'C', 'D'].map((g) => ({ id: `${g}1`, group: g, groupRank: 1 }))
      .concat(['A', 'B', 'C', 'D'].map((g) => ({ id: `${g}2`, group: g, groupRank: 2 })));
    const r = buildBracket({ entrants, mode: 'from_groups' });
    expect(r.size).toBe(8);
    for (const m of r.firstRound) expect(m.a[0]).not.toBe(m.b[0]);
  });

  test('loại trực tiếp có hạt giống: 6 đội → 2 bye cho 2 đội mạnh nhất, cùng seed → cùng sơ đồ', () => {
    const entrants = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'].map((id) => ({ id }));
    const a = buildBracket({ entrants, mode: 'seeded', seed: 'k1' });
    const b = buildBracket({ entrants, mode: 'seeded', seed: 'k1' });
    expect(b.positions).toEqual(a.positions);
    const byeTeams = a.firstRound.filter((m) => m.bye).map((m) => m.a || m.b).sort();
    expect(byeTeams).toEqual(['S1', 'S2']);
    expect(a.positions.indexOf('S1')).toBe(0);
    expect(a.positions.indexOf('S2')).toBe(4);
  });
});
