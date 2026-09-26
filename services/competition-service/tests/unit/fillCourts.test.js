const { fillCourts } = require('../../src/modules/matchmaking/domain/fillCourts');
const { createRng } = require('../../src/modules/matchmaking/domain/seededRandom');

const MIN = 60 * 1000;
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const onCourtOf = (a) => [...a.sideA, ...a.sideB];

// Mô phỏng một buổi giao lưu: mỗi lần sân trống thì gọi fillCourts như nút
// "Xếp sân trống" (docs/06 mục 8). Trả về số trận của từng người + lịch sử.
// Mỗi trận một thời lượng 12–18 phút (bước 1 cho mọi sân cùng lượt chung một thời lượng
// → các sân luôn xong cùng lúc, che mất lỗi "nhóm 4 người dính nhau"; bước 3 sửa).
const simulate = ({ count, courts, minutes, mode = 'balanced', seed = 'sim', late = [], leaveEarly = {} }) => {
  const rng = createRng(`${seed}:ratings`);
  const start = Date.UTC(2026, 8, 26, 12, 0);
  const players = new Map();
  for (let i = 0; i < count; i += 1) {
    const id = `p${String(i).padStart(2, '0')}`;
    const joinAt = late.includes(id) ? start + 60 * MIN : start;
    players.set(id, { id, rating: Math.round((2 + rng.next() * 2.5) * 100) / 100, gamesPlayed: 0, played: 0, joinedAt: joinAt, waitingSince: joinAt });
  }
  const partners = new Map();
  const opponents = new Map();
  const quartets = new Map();
  const courtFree = new Map(courts.map((c) => [c, start]));
  const busyUntil = new Map();
  let round = 0;
  let unfair = 0; // lần xếp để một người rảnh ít trận hơn ngồi chờ thay người nhiều trận hơn
  for (let t = start; t < start + minutes * MIN; t += MIN) {
    const freeCourts = courts.filter((c) => courtFree.get(c) <= t);
    if (!freeCourts.length) continue;
    const present = [...players.values()].filter(
      (p) => p.joinedAt <= t && !(leaveEarly[p.id] && leaveEarly[p.id] <= t) && !(busyUntil.get(p.id) > t)
    );
    // Người đến muộn được tính như đã đánh bằng số trận ít nhất của những người đang có mặt.
    for (const p of present) {
      if (p.joinedAt === t && p.joinedAt > start) {
        const others = [...players.values()].filter((o) => o.joinedAt < t);
        p.gamesPlayed = Math.min(...others.map((o) => o.gamesPlayed));
      }
    }
    const { assignments } = fillCourts({
      players: present.map((p) => ({ ...p, newcomer: p.played === 0, waitingSince: new Date(p.waitingSince), joinedAt: new Date(p.joinedAt) })),
      courts: freeCourts,
      mode,
      history: {
        partners: [...partners].map(([k, n]) => [...k.split('|'), n]),
        opponents: [...opponents].map(([k, n]) => [...k.split('|'), n])
      },
      seed: `${seed}:${(round += 1)}`,
      now: new Date(t)
    });
    const chosen = new Set(assignments.flatMap(onCourtOf));
    const chosenGames = present.filter((p) => chosen.has(p.id)).map((p) => p.gamesPlayed);
    const leftGames = present.filter((p) => !chosen.has(p.id)).map((p) => p.gamesPlayed);
    if (chosenGames.length && leftGames.length && Math.max(...chosenGames) > Math.min(...leftGames)) unfair += 1;
    for (const a of assignments) {
      const duration = 12 + Math.floor(rng.next() * 7); // 12–18 phút, mỗi sân một thời lượng
      const four = [...a.sideA, ...a.sideB].sort().join(',');
      quartets.set(four, (quartets.get(four) || 0) + 1);
      courtFree.set(a.court, t + duration * MIN);
      for (const side of [a.sideA, a.sideB]) {
        partners.set(pairKey(side[0], side[1]), (partners.get(pairKey(side[0], side[1])) || 0) + 1);
      }
      for (const x of a.sideA) for (const y of a.sideB) opponents.set(pairKey(x, y), (opponents.get(pairKey(x, y)) || 0) + 1);
      for (const id of [...a.sideA, ...a.sideB]) {
        const p = players.get(id);
        p.gamesPlayed += 1;
        p.played += 1;
        busyUntil.set(id, t + duration * MIN);
        p.waitingSince = t + duration * MIN;
      }
    }
  }
  const end = start + minutes * MIN;
  return { players, partners, quartets, unfair, onCourtAtEnd: (id) => busyUntil.get(id) > end - MIN };
};

describe('fillCourts (docs/06 mục 8.3)', () => {
  test('một lượt: 10 người, 2 sân → 8 người ra sân, 2 người chờ lâu nhất / ít trận nhất được ưu tiên', () => {
    const now = new Date('2026-09-26T12:00:00Z');
    const players = Array.from({ length: 10 }, (_, i) => ({
      id: `p${i}`,
      rating: 3,
      gamesPlayed: i < 2 ? 0 : 2,
      waitingSince: new Date(now.getTime() - (i < 2 ? 30 : 5) * MIN)
    }));
    const r = fillCourts({ players, courts: ['c1', 'c2'], seed: 'one', now });
    expect(r.assignments).toHaveLength(2);
    const onCourt = r.assignments.flatMap((a) => [...a.sideA, ...a.sideB]);
    expect(onCourt).toEqual(expect.arrayContaining(['p0', 'p1']));
    expect(r.waiting).toHaveLength(2);
  });

  test('không đủ người cho một sân → không xếp', () => {
    const r = fillCourts({ players: [{ id: 'a', rating: 3 }, { id: 'b', rating: 3 }, { id: 'c', rating: 3 }], courts: ['c1'] });
    expect(r.assignments).toHaveLength(0);
    expect(r.waiting).toHaveLength(3);
  });

  test('chế độ level: sân đầu gồm 4 người mạnh nhất', () => {
    const players = [4.5, 4.2, 4.0, 3.9, 2.5, 2.4, 2.3, 2.2].map((rating, i) => ({ id: `p${i}`, rating }));
    const r = fillCourts({ players, courts: ['c1', 'c2'], mode: 'level', seed: 'lvl' });
    expect([...r.assignments[0].sideA, ...r.assignments[0].sideB].sort()).toEqual(['p0', 'p1', 'p2', 'p3']);
  });

  test('chia đội trong sân: chọn cách cân nhất (4.5+2.5 vs 3.5+3.5)', () => {
    const players = [
      { id: 'a', rating: 4.5 },
      { id: 'b', rating: 3.5 },
      { id: 'c', rating: 3.5 },
      { id: 'd', rating: 2.5 }
    ];
    const [court] = fillCourts({ players, courts: ['c1'], mode: 'balanced', seed: 'split' }).assignments;
    expect(court.teamRatings).toEqual([3.5, 3.5]);
  });

  test('tránh lặp đồng đội đã đánh cùng trong buổi', () => {
    const players = ['a', 'b', 'c', 'd'].map((id) => ({ id, rating: 3 }));
    const [court] = fillCourts({ players, courts: ['c1'], history: { partners: [['a', 'b', 2], ['c', 'd', 2]] }, seed: 'rep' }).assignments;
    const teams = [court.sideA, court.sideB].map((s) => [...s].sort().join(''));
    expect(teams).not.toContain('ab');
    expect(teams).not.toContain('cd');
  });

  const COURTS = ['c1', 'c2', 'c3', 'c4'];
  // Công bằng: (1) không lần xếp nào để người rảnh ít trận hơn ngồi chờ thay người nhiều trận
  // hơn; (2) lúc cắt buổi chênh ≤ 1 — hoặc = 2 khi mọi người ít trận nhất đang đánh dở trận
  // cuối (các sân xong lệch giờ; lượt sau họ được ưu tiên ngay, không để sân trống chờ họ).
  const expectFair = (sim, ids) => {
    expect(sim.unfair).toBe(0);
    const games = ids.map((id) => sim.players.get(id).gamesPlayed);
    const min = Math.min(...games);
    const gap = Math.max(...games) - min;
    expect(gap).toBeLessThanOrEqual(2);
    if (gap === 2) expect(ids.filter((id) => sim.players.get(id).gamesPlayed === min).every(sim.onCourtAtEnd)).toBe(true);
    return min;
  };
  const SEEDS = Array.from({ length: 10 }, (_, i) => `sim${i}`);

  test.each(SEEDS)('mô phỏng 3 giờ, 20 người, 4 sân (có người đến muộn, về sớm), seed %s: công bằng số trận, đồng đội lặp ≤ 2', (seed) => {
    const late = ['p18', 'p19'];
    const leaveEarly = { p00: Date.UTC(2026, 8, 26, 14, 0) };
    const sim = simulate({ count: 20, courts: COURTS, minutes: 180, late, leaveEarly, seed });
    const fullSession = [...sim.players.keys()].filter((id) => !late.includes(id) && !leaveEarly[id]);
    expect(expectFair(sim, fullSession)).toBeGreaterThanOrEqual(6);
    expect(Math.max(...sim.partners.values())).toBeLessThanOrEqual(2);
  });

  test.each(SEEDS)('các sân xong lệch giờ, 20 người / 4 sân, seed %s: nhóm 4 người không dính nhau cả buổi', (seed) => {
    const sim = simulate({ count: 20, courts: COURTS, minutes: 180, seed });
    expectFair(sim, [...sim.players.keys()]);
    expect(Math.max(...sim.partners.values())).toBeLessThanOrEqual(2);
    // Thuật toán bước 1 để một nhóm 4 người đánh chung tới 11 trận trong 3 giờ.
    expect(Math.max(...sim.quartets.values())).toBeLessThanOrEqual(4);
  });

  test('không để người ít trận hơn ngồi chờ thay người nhiều trận hơn, kể cả khi họ chờ ít hơn', () => {
    const now = new Date('2026-09-26T13:00:00Z');
    const players = [
      ...['a', 'b', 'c', 'd'].map((id) => ({ id, rating: 3, gamesPlayed: 3, waitingSince: new Date(now.getTime() - 20 * MIN) })),
      ...['e', 'f', 'g', 'h'].map((id) => ({ id, rating: 3, gamesPlayed: 2, waitingSince: now }))
    ];
    const [court] = fillCourts({ players, courts: ['c1'], history: { partners: [['e', 'f', 3], ['g', 'h', 3], ['e', 'g', 3]] }, seed: 'fair', now }).assignments;
    expect(onCourtOf(court).sort()).toEqual(['e', 'f', 'g', 'h']);
  });

  test('trộn nhóm: 4 người chờ đã chung sân nhiều lần, 4 người vừa xong bằng trận → kéo người vừa xong lên', () => {
    const now = new Date('2026-09-26T13:00:00Z');
    const waited = ['a', 'b', 'c', 'd'].map((id) => ({ id, rating: 3, gamesPlayed: 3, waitingSince: new Date(now.getTime() - 4 * MIN) }));
    const fresh = ['e', 'f', 'g', 'h'].map((id) => ({ id, rating: 3, gamesPlayed: 3, waitingSince: now }));
    const partners = [['a', 'b', 1], ['c', 'd', 1], ['a', 'c', 1], ['b', 'd', 1], ['a', 'd', 1], ['b', 'c', 1]];
    const r = fillCourts({ players: [...waited, ...fresh], courts: ['c1'], history: { partners }, seed: 'mix', now });
    const chosen = onCourtOf(r.assignments[0]);
    expect(chosen.some((id) => 'efgh'.includes(id))).toBe(true);
    // Không có lịch sử lặp → giữ đúng thứ tự hàng (người chờ lâu ra trước).
    const plain = fillCourts({ players: [...waited, ...fresh], courts: ['c1'], seed: 'mix', now });
    expect(onCourtOf(plain.assignments[0]).sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  // ---- plan 18 mục 9: người mới không chen, kéo lên chỉ khi đáng, thứ tự ưu tiên ----
  const at = (min) => new Date(Date.UTC(2026, 8, 26, 13, 0) - min * MIN);
  const NOW = at(0);
  const p = (id, rating, gamesPlayed, waitedMin, extra = {}) => ({ id, rating, gamesPlayed, waitingSince: at(waitedMin), joinedAt: at(60), ...extra });

  test('tái hiện ca chủ dự án bấm thử: 2 người vừa đến (được bù 1 trận) không chen trước người chờ lâu hơn', () => {
    // Đúng dữ liệu buổi demo: Võ, Bùi chờ 2 phút; 4 người chờ 1.4 phút; 2 người vừa đến
    // (0.9 và 0.3 phút) được bù nên cũng "1 trận". Bản trước chọn 2 người vừa đến vì hai đội cân hơn.
    const players = [
      p('vo', 3.09, 1, 2), p('bui', 1.88, 1, 2),
      p('le', 3.57, 1, 1.4), p('mai', 4.42, 1, 1.4), p('lan', 2.64, 1, 1.4), p('vy', 1.79, 1, 1.4),
      p('khach', 3.25, 1, 0.9, { newcomer: true, joinedAt: at(0.9) }), p('moi', 4.25, 1, 0.3, { newcomer: true, joinedAt: at(0.3) })
    ];
    const history = {
      partners: [['vy', 'mai', 1], ['le', 'lan', 1]],
      opponents: [['vo', 'bui', 1], ['vy', 'le', 1], ['vy', 'lan', 1], ['mai', 'le', 1], ['mai', 'lan', 1]]
    };
    const [court] = fillCourts({ players, courts: ['c1'], history, seed: 'demo-giao-luu-toi-nay:3', now: NOW }).assignments;
    const chosen = onCourtOf(court);
    expect(chosen).toEqual(expect.arrayContaining(['vo', 'bui']));
    expect(chosen).not.toContain('khach');
    expect(chosen).not.toContain('moi');
  });

  test('người chưa đánh trận nào trong buổi không bao giờ bị kéo lên, kể cả khi nhóm đang chờ sẽ lặp đồng đội', () => {
    const waited = ['a', 'b', 'c', 'd'].map((id) => p(id, 3, 2, 5));
    const partners = [['a', 'b', 1], ['c', 'd', 1], ['a', 'c', 1], ['b', 'd', 1], ['a', 'd', 1], ['b', 'c', 1]];
    const newcomers = ['e', 'f', 'g', 'h'].map((id) => p(id, 3, 2, 1, { newcomer: true }));
    const [court] = fillCourts({ players: [...waited, ...newcomers], courts: ['c1'], history: { partners }, seed: 'nc', now: NOW }).assignments;
    expect(onCourtOf(court).sort()).toEqual(['a', 'b', 'c', 'd']);
    // Cùng tình huống nhưng 4 người kia vừa đánh xong (không phải người mới) → được kéo lên để tránh lặp đồng đội.
    const finished = ['e', 'f', 'g', 'h'].map((id) => p(id, 3, 2, 0));
    const [mixed] = fillCourts({ players: [...waited, ...finished], courts: ['c1'], history: { partners }, seed: 'nc', now: NOW }).assignments;
    expect(onCourtOf(mixed).some((id) => 'efgh'.includes(id))).toBe(true);
  });

  test('chỉ để hai đội cân hơn một chút thì không kéo người đứng sau lên (phạt 0.30 / người)', () => {
    // Nhóm đang chờ lệch 0.30; kéo người vừa xong (3.3) lên thay 3.8 chỉ bớt được 0.25 < 0.30
    // → giữ đúng thứ tự hàng. Bản bước 3 (phạt 0.10) kéo người này lên.
    const waited = [p('a', 3.0, 1, 5), p('b', 3.0, 1, 5), p('c', 3.2, 1, 5), p('d', 3.8, 1, 5)];
    const finished = [p('e', 3.3, 1, 0)];
    const [court] = fillCourts({ players: [...waited, ...finished], courts: ['c1'], seed: 'bal', now: NOW }).assignments;
    expect(onCourtOf(court).sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  test('hai đội lệch quá nhiều thì vẫn kéo người lên (lợi hơn 0.30)', () => {
    // Nhóm đang chờ chia cách nào cũng lệch ≥ 1.1; thay một người bằng người vừa xong 2.1 → lệch 0.
    const waited = [p('a', 4.5, 1, 5), p('b', 4.4, 1, 5), p('c', 4.3, 1, 5), p('d', 2.0, 1, 5)];
    const finished = [p('e', 2.1, 1, 0)];
    const [court] = fillCourts({ players: [...waited, ...finished], courts: ['c1'], seed: 'big', now: NOW }).assignments;
    expect(onCourtOf(court)).toContain('e');
  });

  test('`order` là thứ tự ưu tiên đầy đủ: ít trận trước, rồi chờ lâu trước', () => {
    const r = fillCourts({ players: [p('a', 3, 2, 10), p('b', 3, 1, 1), p('c', 3, 1, 5), p('d', 3, 0, 0)], courts: [], seed: 'ord', now: NOW });
    expect(r.order).toEqual(['d', 'c', 'b', 'a']);
    expect(r.waiting).toEqual(r.order);
    expect(r.assignments).toEqual([]);
  });
});
