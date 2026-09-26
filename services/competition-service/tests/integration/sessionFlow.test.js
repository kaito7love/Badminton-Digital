const { createTestContext, STAFF, MANAGER } = require('./helpers');
const { computePeriodRatings } = require('../../src/modules/rating/domain/ratingEngine');

// Buổi giao lưu (docs/06 mục 8) bằng API thật: tạo buổi, điểm danh (kèm chấm nhanh),
// "Xếp sân trống" (xem trước → đổi tay → xác nhận), sân xong thì chỉ sân đó được xếp,
// người đến muộn / rời buổi, "xong không tỉ số", màn hình lớn, đóng buổi có tính điểm
// (hệ số 0.5), huỷ buổi, quyền.
jest.setTimeout(120000);

const SESSION = 'session:read session:operate';
let ctx;
let manager;
let op;
let plainOp;
let other;
let reader;

beforeAll(async () => {
  ctx = await createTestContext();
  manager = await ctx.as({ scope: `${MANAGER} tournament:read tournament:operate tournament:manage`, sub: 'bd:user:mgr', org: ['bd:branch:1'] });
  op = await ctx.as({ scope: `${STAFF} ${SESSION}`, sub: 'bd:user:op', org: ['bd:branch:1'] });
  plainOp = await ctx.as({ scope: `player:write ${SESSION}`, sub: 'bd:user:plain', org: ['bd:branch:1'] });
  other = await ctx.as({ scope: `${STAFF} ${SESSION}`, sub: 'bd:user:other', org: ['bd:branch:2'] });
  reader = await ctx.as({ scope: 'session:read', sub: 'bd:user:tv', org: ['bd:branch:1'] });
});
afterAll(() => ctx.close());

let seq = 0;
const newPlayer = async (rating, discipline = 'doubles') => {
  seq += 1;
  const res = await manager.put(`/v1/players/by-ref/bd:customer:s${seq}`).send({ displayName: `Khách s${seq}` });
  const id = res.body.data.id;
  if (rating !== null) {
    const adj = await manager.post(`/v1/players/${id}/rating-adjustments`).send({ discipline, newRating: rating, reason: 'Dữ liệu test buổi giao lưu' });
    expect(adj.status).toBe(201);
  }
  return id;
};
const createSession = async (extra = {}) => {
  const res = await op.post('/v1/sessions').send({ organizerRef: 'bd:branch:1', name: `Giao lưu tối ${seq}`, courtRefs: ['c1', 'c2'], ...extra });
  expect(res.status).toBe(201);
  return res.body.data;
};
const checkIn = (sid, playerId, extra = {}) => op.post(`/v1/sessions/${sid}/players`).send({ playerId, ...extra });
const roster = async (sid) => new Map((await op.get(`/v1/sessions/${sid}/players`)).body.data.items.map((r) => [r.playerId, r]));
const sessionMatches = async (sid) => (await op.get(`/v1/sessions/${sid}/matches`)).body.data.items;
const onCourt = (a) => [...a.sideA, ...a.sideB];
const score = (m, games = [[21, 15]]) => op.put(`/v1/matches/${m.id}/result`).set('If-Match', `"${m.version}"`).send({ games });

describe('tạo buổi', () => {
  test('mặc định: đôi, cân bằng, 1 game × 21, không tính điểm; phạm vi chi nhánh', async () => {
    const s = await createSession();
    expect(s).toMatchObject({
      format: 'doubles', mode: 'balanced', scoring: { bestOf: 1, points: 21, cap: 30 }, rated: false, status: 'open', rounds: 0,
      progress: { players: { present: 0, left: 0 }, freeCourts: 2 }
    });
    expect((await other.post('/v1/sessions').send({ organizerRef: 'bd:branch:1', name: 'Không được', courtRefs: ['c1'] })).status).toBe(403);
    expect((await other.get(`/v1/sessions/${s.id}`)).status).toBe(404);
    expect((await reader.get('/v1/sessions?status=open')).body.data.items.map((x) => x.id)).toContain(s.id);
    expect((await other.get('/v1/sessions')).body.data.items.map((x) => x.id)).not.toContain(s.id);
    const dup = await op.post('/v1/sessions').send({ organizerRef: 'bd:branch:1', name: 'Sân trùng', courtRefs: ['c1', 'c1'] });
    expect([dup.status, dup.body.code]).toEqual([422, 'INVALID_SESSION']);
  });
});

describe('điểm danh', () => {
  test('chưa có điểm → 422; chấm nhanh cần rating:assess; điểm danh trùng → 409', async () => {
    const s = await createSession();
    const guest = await newPlayer(null);
    const res = await checkIn(s.id, guest);
    expect([res.status, res.body.code]).toEqual([422, 'NEEDS_ASSESSMENT']);
    expect((await plainOp.post(`/v1/sessions/${s.id}/players`).send({ playerId: guest, quickLevel: 'tb' })).status).toBe(403);
    const quick = await checkIn(s.id, guest, { quickLevel: 'tb' });
    expect(quick.status).toBe(201);
    const row = quick.body.data.items.find((r) => r.playerId === guest);
    expect(row).toMatchObject({ status: 'present', gamesPlayed: 0, gamesCredit: 0, rating: 3.25, onCourt: null });
    expect(row.flags).toContain('quick');
    const again = await checkIn(s.id, guest);
    expect([again.status, again.body.code]).toEqual([409, 'ALREADY_CHECKED_IN']);
  });
});

describe('xếp sân trống', () => {
  let s;
  const ids = [];
  let firstRound;

  test('xem trước: 10 người, 2 sân → 8 ra sân, 2 chờ; cùng seed → cùng đề xuất; không ghi gì', async () => {
    s = await createSession();
    for (const r of [4.2, 4.0, 3.8, 3.6, 3.4, 3.2, 3.0, 2.8, 2.6, 2.4]) {
      ids.push(await newPlayer(r));
      expect((await checkIn(s.id, ids[ids.length - 1])).status).toBe(201);
    }
    const p1 = (await op.post(`/v1/sessions/${s.id}/fill-courts/preview`).send({ seed: 'r1' })).body.data;
    const p2 = (await op.post(`/v1/sessions/${s.id}/fill-courts/preview`).send({ seed: 'r1' })).body.data;
    expect(p1).toEqual(p2);
    expect(p1.round).toBe(1);
    expect(p1.assignments).toHaveLength(2);
    expect(p1.waiting).toHaveLength(2);
    expect(Object.keys(p1.players)).toHaveLength(10);
    // Cân bằng: hai đội trong từng sân chênh nhau ít.
    for (const a of p1.assignments) expect(Math.abs(a.teamRatings[0] - a.teamRatings[1])).toBeLessThanOrEqual(0.3);
    expect(await sessionMatches(s.id)).toHaveLength(0);
    firstRound = p1;
  });

  test('đổi tay một người với người chờ → xác nhận: trận đang đánh trên sân, ghi "đổi tay"; gửi lại cùng key → không tạo thêm', async () => {
    const edited = firstRound.assignments.map((a) => ({ court: a.court, sideA: [...a.sideA], sideB: [...a.sideB] }));
    const out = edited[0].sideA[0];
    edited[0].sideA[0] = firstRound.waiting[0];
    const key = `fill-${s.id}`;
    const res = await op.post(`/v1/sessions/${s.id}/fill-courts`, { key }).send({ seed: firstRound.seed, assignments: edited });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ round: 1, manualEdits: true });
    expect(res.body.data.matches).toHaveLength(2);
    for (const m of res.body.data.matches) {
      expect(m).toMatchObject({ contextType: 'session', stage: 'session', status: 'in_play', label: 'Lượt 1', roundNo: 1 });
      expect(m.teamA.teamId).toBeNull();
      expect(['c1', 'c2']).toContain(m.courtRef);
    }
    const replay = await op.post(`/v1/sessions/${s.id}/fill-courts`, { key }).send({ seed: firstRound.seed, assignments: edited });
    expect(replay.status).toBe(201);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(await sessionMatches(s.id)).toHaveLength(2);

    const r = await roster(s.id);
    expect(r.get(out)).toMatchObject({ gamesPlayed: 0, onCourt: null });
    expect(r.get(firstRound.waiting[0]).gamesPlayed).toBe(1);
    expect([...r.values()].filter((x) => x.onCourt).length).toBe(8);
    expect([...r.values()].filter((x) => x.onCourt).every((x) => x.waitingSince === null)).toBe(true);
    const audit = await ctx.models.AuditLog.findOne({ where: { targetId: s.id, action: 'session.courts_filled' } });
    expect(audit.after).toMatchObject({ round: 1, manualEdits: true, courts: ['c1', 'c2'] });
  });

  test('hết sân trống → xem trước rỗng, xác nhận → 422 NOTHING_TO_FILL; màn hình lớn', async () => {
    const p = (await op.post(`/v1/sessions/${s.id}/fill-courts/preview`).send({})).body.data;
    expect(p.assignments).toEqual([]);
    const res = await op.post(`/v1/sessions/${s.id}/fill-courts`).send({});
    expect([res.status, res.body.code]).toEqual([422, 'NOTHING_TO_FILL']);
    const board = (await reader.get(`/v1/sessions/${s.id}/board`)).body.data;
    expect(board.courts.map((c) => c.status)).toEqual(['busy', 'busy']);
    expect(board.courts[0].match.teamA.players[0].name).toMatch(/^Khách s/);
    expect(board.queue).toHaveLength(2);
    expect(board.counts).toEqual({ present: 10, onCourt: 8, waiting: 2 });
  });

  test('sân c1 xong → chỉ c1 được xếp; 2 người chờ từ đầu buổi được ưu tiên; bản xem trước cũ → 409 FILL_STALE', async () => {
    const queueBefore = (await op.get(`/v1/sessions/${s.id}/board`)).body.data.queue.map((q) => q.playerId);
    const c1 = (await sessionMatches(s.id)).find((m) => m.courtRef === 'c1');
    expect((await score(c1)).status).toBe(200);
    const p = (await op.post(`/v1/sessions/${s.id}/fill-courts/preview`).send({ seed: 'r2' })).body.data;
    expect(p.freeCourts).toEqual(['c1']);
    expect(p.assignments).toHaveLength(1);
    expect(onCourt(p.assignments[0])).toEqual(expect.arrayContaining(queueBefore));
    // Người đang đánh sân c2 không bị lấy.
    const c2Players = (await sessionMatches(s.id)).find((m) => m.courtRef === 'c2' && m.status === 'in_play');
    const busy = [...c2Players.teamA.players, ...c2Players.teamB.players].map((x) => x.id);
    expect(onCourt(p.assignments[0]).some((x) => busy.includes(x))).toBe(false);

    const stale = await op.post(`/v1/sessions/${s.id}/fill-courts`).send({ assignments: [{ ...p.assignments[0], court: 'c2' }] });
    expect([stale.status, stale.body.code]).toEqual([409, 'FILL_STALE']);
    // Không gửi assignments: hệ thống tự xếp theo seed → đúng bản xem trước.
    const res = await op.post(`/v1/sessions/${s.id}/fill-courts`).send({ seed: 'r2' });
    expect(res.status).toBe(201);
    expect(res.body.data.manualEdits).toBe(false);
    const m = res.body.data.matches[0];
    expect([m.courtRef, m.roundNo]).toEqual(['c1', 2]);
    expect([...m.teamA.players, ...m.teamB.players].map((x) => x.id).sort()).toEqual(onCourt(p.assignments[0]).sort());
  });

  test('xong không tỉ số → sân trống, trận "ended"; trận giải thì không được', async () => {
    const c2 = (await sessionMatches(s.id)).find((m) => m.courtRef === 'c2' && m.status === 'in_play');
    const res = await op.post(`/v1/matches/${c2.id}/end`).send();
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'ended', games: [], winnerSide: null });
    const board = (await op.get(`/v1/sessions/${s.id}/board`)).body.data;
    expect(board.courts.find((c) => c.courtRef === 'c2').status).toBe('free');
    // Nhập tỉ số sau khi đã bấm "xong" vẫn được.
    const scored = await score(res.body.data, [[21, 19]]);
    expect([scored.status, scored.body.data.status]).toEqual([200, 'completed']);

    const [a, b] = [await newPlayer(3.5, 'singles'), await newPlayer(3.4, 'singles')];
    const t = (await manager.post('/v1/tournaments').send({ organizerRef: 'bd:branch:1', name: 'Giải nhỏ', startsOn: '2026-11-20', tier: 'club', discipline: 'singles', genderRule: 'open', format: 'round_robin', scoring: '1x21' })).body.data;
    await manager.post(`/v1/tournaments/${t.id}/open`).send();
    for (const pid of [a, b]) await manager.post(`/v1/tournaments/${t.id}/entries`).send({ playerId: pid });
    const pv = (await manager.post(`/v1/tournaments/${t.id}/draw/preview`, { key: false }).send({ seed: 'x' })).body.data;
    await manager.post(`/v1/tournaments/${t.id}/draw`).send({ seed: pv.seed, teams: pv.teams.map((x) => ({ players: x.players.map((y) => y.id) })), groups: pv.groups, bracket: pv.bracket });
    const tm = (await manager.get(`/v1/tournaments/${t.id}/matches`)).body.data.items[0];
    await manager.post(`/v1/matches/${tm.id}/call`).send({ courtRef: 'c9' });
    const end = await manager.post(`/v1/matches/${tm.id}/end`).send();
    expect([end.status, end.body.code]).toEqual([409, 'RESULT_REQUIRED']);
  });

  test('người đến muộn được bù số trận; đang ở sân không rời được; huỷ trận → không tính là đã đánh', async () => {
    const late = await newPlayer(3.3);
    const joined = await checkIn(s.id, late);
    const effective = [...(await roster(s.id)).values()].filter((x) => x.status === 'present' && x.playerId !== late).map((x) => x.gamesPlayed + x.gamesCredit);
    expect(joined.body.data.items.find((r) => r.playerId === late)).toMatchObject({ gamesPlayed: 0, gamesCredit: Math.min(...effective) });
    expect(Math.min(...effective)).toBeGreaterThanOrEqual(1);

    const live = (await sessionMatches(s.id)).find((m) => m.status === 'in_play');
    const busyId = live.teamA.players[0].id;
    const blocked = await op.delete(`/v1/sessions/${s.id}/players/${busyId}`);
    expect([blocked.status, blocked.body.code]).toEqual([409, 'PLAYER_ON_COURT']);
    const idle = [...(await roster(s.id)).values()].find((x) => x.status === 'present' && !x.onCourt && x.playerId !== late);
    const left = await op.delete(`/v1/sessions/${s.id}/players/${idle.playerId}`);
    expect(left.status).toBe(200);
    expect(left.body.data.items.find((r) => r.playerId === idle.playerId)).toMatchObject({ status: 'left', onCourt: null });

    const before = await roster(s.id);
    const cancelled = await op.post(`/v1/matches/${live.id}/cancel`).send();
    expect([cancelled.status, cancelled.body.data.status]).toEqual([200, 'cancelled']);
    const after = await roster(s.id);
    for (const p of [...live.teamA.players, ...live.teamB.players]) {
      expect(after.get(p.id).gamesPlayed).toBe(before.get(p.id).gamesPlayed - 1);
      expect(after.get(p.id).waitingSince).not.toBeNull();
    }
    // Rời rồi quay lại: vẫn giữ số trận đã đánh, bù thêm nếu thiếu.
    const back = await checkIn(s.id, idle.playerId);
    expect(back.body.data.items.find((r) => r.playerId === idle.playerId)).toMatchObject({ status: 'present', gamesPlayed: idle.gamesPlayed });
  });

  test('sửa buổi: If-Match bắt buộc; có trận thì khoá Đơn / Đôi; không bỏ được sân đang có trận', async () => {
    await op.post(`/v1/sessions/${s.id}/fill-courts`).send({});
    const cur = (await op.get(`/v1/sessions/${s.id}`)).body.data;
    expect((await op.patch(`/v1/sessions/${s.id}`).send({ name: 'Không có If-Match' })).status).toBe(412);
    const fmt = await op.patch(`/v1/sessions/${s.id}`).set('If-Match', `"${cur.version}"`).send({ format: 'singles' });
    expect([fmt.status, fmt.body.code]).toEqual([409, 'LOCKED_AFTER_MATCHES']);
    const busyCourt = (await op.get(`/v1/sessions/${s.id}/board`)).body.data.courts.find((c) => c.status === 'busy').courtRef;
    const drop = await op.patch(`/v1/sessions/${s.id}`).set('If-Match', `"${cur.version}"`).send({ courtRefs: ['c1', 'c2'].filter((c) => c !== busyCourt) });
    expect([drop.status, drop.body.code]).toEqual([409, 'COURT_BUSY']);
    const okRes = await op.patch(`/v1/sessions/${s.id}`).set('If-Match', `"${cur.version}"`).send({ name: 'Giao lưu tối thứ Sáu', courtRefs: ['c1', 'c2', 'c3'] });
    expect(okRes.status).toBe(200);
    expect(okRes.body.data).toMatchObject({ name: 'Giao lưu tối thứ Sáu', courtRefs: ['c1', 'c2', 'c3'] });
    expect((await op.patch(`/v1/sessions/${s.id}`).set('If-Match', `"${cur.version}"`).send({ name: 'Bản cũ' })).status).toBe(409);
  });
});

describe('đóng / huỷ buổi', () => {
  test('buổi có tính điểm: hệ số 0.5 khớp tính độc lập; trận chưa tỉ số bị huỷ; thống kê "giao lưu"; sự kiện', async () => {
    const s = await createSession({ rated: true });
    const ratings = {};
    for (const r of [3.9, 3.7, 3.5, 3.3, 3.1, 2.9, 2.7, 2.5]) {
      const id = await newPlayer(r);
      ratings[id] = r;
      await checkIn(s.id, id);
    }
    const round1 = (await op.post(`/v1/sessions/${s.id}/fill-courts`).send({ seed: 'close' })).body.data.matches;
    expect((await score(round1[0], [[21, 17]])).status).toBe(200);
    expect((await op.post(`/v1/matches/${round1[1].id}/end`).send()).status).toBe(200);
    const round2 = (await op.post(`/v1/sessions/${s.id}/fill-courts`).send({ seed: 'close2' })).body.data.matches;
    expect(round2).toHaveLength(2);
    expect((await score(round2[0], [[18, 21]])).status).toBe(200);
    // round2[1] để đang đánh → bị huỷ khi đóng.

    const preview = (await op.get(`/v1/sessions/${s.id}/close-preview`)).body.data;
    expect(preview).toMatchObject({ rated: true, completedMatches: 2, unscoredMatches: 2 });

    const completed = (await sessionMatches(s.id)).filter((m) => m.status === 'completed');
    const engineMatches = completed.map((m) => ({
      matchId: m.id, sideA: m.teamA.players.map((p) => p.id), sideB: m.teamB.players.map((p) => p.id),
      games: m.games, outcome: m.outcome, winnerSide: m.winnerSide, completedAt: m.completedAt, weight: 0.5
    }));
    const players = Object.entries(ratings).map(([playerId, rating]) => ({ playerId, rating, ratedMatches: 0, lastMatchAt: null }));
    const expected = computePeriodRatings({ players, matches: engineMatches }).changes;
    const fullWeight = computePeriodRatings({ players, matches: engineMatches.map((m) => ({ ...m, weight: 1 })) }).changes;

    const res = await op.post(`/v1/sessions/${s.id}/close`).send();
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ rated: true, completedMatches: 2, unscoredMatches: 2, session: { status: 'closed' } });
    expect(res.body.data.ratingChanges).toEqual(preview.ratingChanges);
    const { PlayerRating, RatingChange, PlayerStats, OutboxEvent } = ctx.models;
    expect(expected.length).toBeGreaterThan(0);
    for (const c of expected) {
      const row = await PlayerRating.findOne({ where: { playerId: c.playerId, discipline: 'doubles' } });
      expect(Number(row.rating)).toBeCloseTo(c.after, 3);
      const full = fullWeight.find((x) => x.playerId === c.playerId);
      expect(Math.abs(c.after - c.before)).toBeLessThan(Math.abs(full.after - full.before));
    }
    expect(await RatingChange.count({ where: { contextId: s.id, reason: 'session' } })).toBe(expected.length);

    const all = await sessionMatches(s.id);
    expect(all.map((m) => m.status).sort()).toEqual(['cancelled', 'cancelled', 'completed', 'completed']);
    const someone = completed[0].teamA.players[0].id;
    const stats = await PlayerStats.findOne({ where: { playerId: someone, discipline: 'doubles', context: 'session' } });
    expect(stats.matches).toBe(completed.filter((m) => [...m.teamA.players, ...m.teamB.players].some((p) => p.id === someone)).length);

    const ev = await OutboxEvent.findOne({ where: { aggregateId: s.id, type: 'competition.session.closed' } });
    expect(ctx.eventValidator.check(ev.payload)).toEqual([]);
    expect(ev.payload.data).toMatchObject({ sessionId: s.id, rated: true, matches: 2 });
    expect(ev.payload.data.ratingChanges).toHaveLength(expected.length);

    const late = await score(completed[0], [[21, 10]]);
    expect([late.status, late.body.code]).toEqual([409, 'SESSION_CLOSED']);
    expect((await checkIn(s.id, await newPlayer(3))).body.code).toBe('SESSION_CLOSED');
    expect((await op.post(`/v1/sessions/${s.id}/close`).send()).body.code).toBe('SESSION_CLOSED');
  });

  test('buổi không tính điểm: đóng không đổi điểm, vẫn vào thống kê', async () => {
    const s = await createSession();
    const ids = [];
    for (const r of [3.2, 3.1, 3.0, 2.9]) {
      ids.push(await newPlayer(r));
      await checkIn(s.id, ids[ids.length - 1]);
    }
    const [m] = (await op.post(`/v1/sessions/${s.id}/fill-courts`).send({})).body.data.matches;
    await score(m);
    const res = await op.post(`/v1/sessions/${s.id}/close`).send();
    expect(res.body.data).toMatchObject({ rated: false, completedMatches: 1, ratingChanges: [] });
    expect(await ctx.models.RatingChange.count({ where: { contextId: s.id } })).toBe(0);
    expect(await ctx.models.PlayerStats.count({ where: { playerId: ids, context: 'session' } })).toBe(4);
  });

  test('huỷ buổi: không điểm, không thống kê; trận đang đánh bị huỷ', async () => {
    const s = await createSession({ rated: true });
    const ids = [];
    for (const r of [3.2, 3.1, 3.0, 2.9, 2.8, 2.7, 2.6, 2.5]) {
      ids.push(await newPlayer(r));
      await checkIn(s.id, ids[ids.length - 1]);
    }
    const [m1] = (await op.post(`/v1/sessions/${s.id}/fill-courts`).send({})).body.data.matches;
    await score(m1);
    const res = await op.post(`/v1/sessions/${s.id}/cancel`).send();
    expect([res.status, res.body.data.status]).toEqual([200, 'cancelled']);
    expect((await sessionMatches(s.id)).map((m) => m.status).sort()).toEqual(['cancelled', 'completed']);
    expect(await ctx.models.RatingChange.count({ where: { contextId: s.id } })).toBe(0);
    expect(await ctx.models.PlayerStats.count({ where: { playerId: ids, context: 'session' } })).toBe(0);
  });
});

describe('quyền', () => {
  test('chỉ xem (TV) không xếp sân; người điều phối giải không ghi được trận giao lưu; chi nhánh khác → 404', async () => {
    const s = await createSession();
    for (const r of [3, 3, 3, 3]) await checkIn(s.id, await newPlayer(r));
    expect((await reader.post(`/v1/sessions/${s.id}/fill-courts/preview`).send({})).status).toBe(403);
    expect((await reader.get(`/v1/sessions/${s.id}/board`)).status).toBe(200);
    const [m] = (await op.post(`/v1/sessions/${s.id}/fill-courts`).send({})).body.data.matches;
    const tourOp = await ctx.as({ scope: 'tournament:read tournament:operate', org: ['bd:branch:1'] });
    expect((await tourOp.put(`/v1/matches/${m.id}/result`).set('If-Match', `"${m.version}"`).send({ games: [[21, 5]] })).status).toBe(403);
    expect((await other.put(`/v1/matches/${m.id}/result`).set('If-Match', `"${m.version}"`).send({ games: [[21, 5]] })).status).toBe(404);
    expect((await other.get(`/v1/sessions/${s.id}/board`)).status).toBe(404);
  });
});
