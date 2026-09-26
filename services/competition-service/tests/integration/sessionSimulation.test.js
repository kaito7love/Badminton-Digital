const { createTestContext, STAFF, MANAGER } = require('./helpers');
const { createRng } = require('../../src/modules/matchmaking/domain/seededRandom');
const { computePeriodRatings } = require('../../src/modules/rating/domain/ratingEngine');

// Tiêu chí "xong" của bước 3 (plan 18): mô phỏng buổi 3 giờ, 20 người, 4 sân, có người
// đến muộn / về sớm — lần này qua API thật + MySQL (bước 1 mới mô phỏng hàm thuần).
// Đồng hồ mô phỏng từng phút; sự kiện được gửi theo đúng thứ tự thời gian mô phỏng.
jest.setTimeout(180000);

const COURTS = ['c1', 'c2', 'c3', 'c4'];
const LATE = [18, 19]; // đến lúc phút 60
const EARLY = 0; // về lúc phút 120 (khi rảnh)
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

let ctx;
let manager;
let op;
beforeAll(async () => {
  ctx = await createTestContext();
  manager = await ctx.as({ scope: MANAGER, sub: 'bd:user:mgr', org: ['bd:branch:1'] });
  op = await ctx.as({ scope: `${STAFF} session:read session:operate`, sub: 'bd:user:op', org: ['bd:branch:1'] });
});
afterAll(() => ctx.close());

test('3 giờ, 20 người, 4 sân: công bằng số trận, đồng đội lặp ≤ 2 lần; đóng buổi tính điểm khớp tính độc lập', async () => {
  const rng = createRng('sim-api');
  const ids = [];
  const pre = {};
  for (let i = 0; i < 20; i += 1) {
    const res = await manager.put(`/v1/players/by-ref/bd:customer:sim${i}`).send({ displayName: `Mô phỏng ${i}` });
    const rating = Math.round((2 + rng.next() * 2.5) * 100) / 100;
    await manager.post(`/v1/players/${res.body.data.id}/rating-adjustments`).send({ discipline: 'doubles', newRating: rating, reason: 'Mô phỏng buổi giao lưu' });
    ids.push(res.body.data.id);
    pre[res.body.data.id] = rating;
  }
  const session = (await op.post('/v1/sessions').send({ organizerRef: 'bd:branch:1', name: 'Mô phỏng 3 giờ', courtRefs: COURTS, rated: true, seed: 'sim' })).body.data;
  for (let i = 0; i < 20; i += 1) if (!LATE.includes(i)) expect((await op.post(`/v1/sessions/${session.id}/players`).send({ playerId: ids[i] })).status).toBe(201);

  const live = new Map(); // courtRef → { match, endsAt }
  let earlyLeft = false;
  let fills = 0;
  let boardMismatches = 0;
  let ended = 0;
  for (let t = 0; t < 180; t += 1) {
    for (const [court, x] of [...live].sort((a, b) => a[1].endsAt - b[1].endsAt)) {
      if (x.endsAt > t) continue;
      // Khoảng 1/8 trận "xong không nhập tỉ số".
      const res = rng.next() < 0.125
        ? (ended += 1, await op.post(`/v1/matches/${x.match.id}/end`).send())
        : await op.put(`/v1/matches/${x.match.id}/result`).set('If-Match', `"${x.match.version}"`).send({ games: [rng.next() < 0.5 ? [21, 12 + rng.int(8)] : [12 + rng.int(8), 21]] });
      expect(res.status).toBe(200);
      live.delete(court);
    }
    if (t === 60) for (const i of LATE) expect((await op.post(`/v1/sessions/${session.id}/players`).send({ playerId: ids[i] })).status).toBe(201);
    const busy = new Set([...live.values()].flatMap((x) => [...x.match.teamA.players, ...x.match.teamB.players].map((p) => p.id)));
    if (t >= 120 && !earlyLeft && !busy.has(ids[EARLY])) {
      expect((await op.delete(`/v1/sessions/${session.id}/players/${ids[EARLY]}`)).status).toBe(200);
      earlyLeft = true;
    }
    if (live.size < COURTS.length) {
      // Màn hình lớn báo trước ai sẽ vào sân — phải khớp đúng kết quả bấm "Xếp sân trống" ngay sau đó.
      const upcoming = (await op.get(`/v1/sessions/${session.id}/board`)).body.data.upcoming;
      const res = await op.post(`/v1/sessions/${session.id}/fill-courts`).send({});
      if (res.status === 422) { // chưa đủ người rảnh
        expect(upcoming).toEqual([]);
        continue;
      }
      expect(res.status).toBe(201);
      const created = res.body.data.matches.map((m) => [m.courtRef, [...m.teamA.players, ...m.teamB.players].map((p) => p.id).sort()]);
      const promised = upcoming.map((u) => [u.courtRef, [...u.sideA, ...u.sideB].map((p) => p.id).sort()]);
      if (JSON.stringify(created) !== JSON.stringify(promised)) boardMismatches += 1;
      fills += 1;
      for (const m of res.body.data.matches) live.set(m.courtRef, { match: m, endsAt: t + 12 + rng.int(7) });
    }
  }

  const roster = (await op.get(`/v1/sessions/${session.id}/players`)).body.data.items;
  const byId = new Map(roster.map((r) => [r.playerId, r]));
  const fullIds = ids.filter((id, i) => !LATE.includes(i) && i !== EARLY);
  const full = fullIds.map((id) => byId.get(id).gamesPlayed);
  // Chênh ≤ 1; = 2 chỉ chấp nhận khi mọi người ít trận nhất đang đánh dở trận cuối (xem test unit fillCourts).
  const gap = Math.max(...full) - Math.min(...full);
  expect(gap).toBeLessThanOrEqual(2);
  if (gap === 2) expect(fullIds.filter((id) => byId.get(id).gamesPlayed === Math.min(...full)).every((id) => byId.get(id).onCourt)).toBe(true);
  expect(Math.min(...full)).toBeGreaterThanOrEqual(6);
  // Người đến muộn: số trận "hiệu dụng" (đã đánh + bù) ngang người cả buổi.
  for (const i of LATE) {
    const r = byId.get(ids[i]);
    expect(r.gamesCredit).toBeGreaterThan(0);
    expect(r.gamesPlayed + r.gamesCredit).toBeGreaterThanOrEqual(Math.min(...full) - 1);
    expect(r.gamesPlayed + r.gamesCredit).toBeLessThanOrEqual(Math.max(...full) + 1);
  }
  expect(byId.get(ids[EARLY]).status).toBe('left');
  expect(boardMismatches).toBe(0);

  // Số trận trong DB khớp bảng điểm danh; không cặp đồng đội nào lặp quá 2 lần.
  const matches = (await op.get(`/v1/sessions/${session.id}/matches`)).body.data.items.filter((m) => m.status !== 'cancelled');
  const count = new Map();
  const partners = new Map();
  const fours = new Map();
  for (const m of matches) {
    const four = [...m.teamA.players, ...m.teamB.players].map((p) => p.id).sort().join(',');
    fours.set(four, (fours.get(four) || 0) + 1);
    for (const side of [m.teamA.players, m.teamB.players]) {
      for (const p of side) count.set(p.id, (count.get(p.id) || 0) + 1);
      const k = pairKey(side[0].id, side[1].id);
      partners.set(k, (partners.get(k) || 0) + 1);
    }
  }
  for (const r of roster) expect(r.gamesPlayed).toBe(count.get(r.playerId) || 0);
  expect(Math.max(...partners.values())).toBeLessThanOrEqual(2);
  expect(Math.max(...fours.values())).toBeLessThanOrEqual(4); // bước 1: một nhóm 4 người chung tới 11 trận
  expect(matches.filter((m) => m.status === 'ended')).toHaveLength(ended);

  // Đóng buổi (tính điểm, hệ số 0.5): khớp tính độc lập bằng engine.
  const completed = matches.filter((m) => m.status === 'completed');
  const expected = computePeriodRatings({
    players: Object.entries(pre).map(([playerId, rating]) => ({ playerId, rating, ratedMatches: 0, lastMatchAt: null })),
    matches: completed.map((m) => ({
      matchId: m.id, sideA: m.teamA.players.map((p) => p.id), sideB: m.teamB.players.map((p) => p.id),
      games: m.games, outcome: m.outcome, winnerSide: m.winnerSide, completedAt: m.completedAt, weight: 0.5
    }))
  }).changes;
  const closed = await op.post(`/v1/sessions/${session.id}/close`).send();
  expect(closed.status).toBe(200);
  expect(closed.body.data.completedMatches).toBe(completed.length);
  expect(closed.body.data.unscoredMatches).toBe(matches.length - completed.length);
  for (const c of expected) {
    const row = await ctx.models.PlayerRating.findOne({ where: { playerId: c.playerId, discipline: 'doubles' } });
    expect(Number(row.rating)).toBeCloseTo(c.after, 3);
    expect(row.ratedMatches).toBe(c.ratedMatchesAdded);
  }
  const stats = await ctx.models.PlayerStats.findAll({ where: { playerId: ids, context: 'session', discipline: 'doubles' } });
  const scored = new Map();
  for (const m of completed) for (const p of [...m.teamA.players, ...m.teamB.players]) scored.set(p.id, (scored.get(p.id) || 0) + 1);
  for (const st of stats) expect(st.matches).toBe(scored.get(st.playerId) || 0);

  // Ghi lại để báo cáo (chạy với --verbose sẽ thấy).
  console.log(JSON.stringify({ fills, boardMismatches, matches: matches.length, completed: completed.length, ended, games: { min: Math.min(...full), max: Math.max(...full) }, maxFour: Math.max(...fours.values()), maxPartnerRepeat: Math.max(...partners.values()), late: LATE.map((i) => byId.get(ids[i])).map((r) => ({ played: r.gamesPlayed, credit: r.gamesCredit })) }));
});
