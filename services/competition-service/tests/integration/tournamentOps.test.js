const { createTestContext, STAFF, MANAGER } = require('./helpers');

// Vận hành giải ngày thi đấu (plan 20) bằng API thật: sân của giải + kiểm khi gọi ra sân, giờ dự
// kiến, điểm danh / bốc thăm tại sân, đổi đồng đội, xử W.O. đội vắng, trận kế tiếp, "không đánh
// tiếp được" (bỏ cuộc giữa trận), chặn điểm danh một người ở hai buổi giao lưu.
jest.setTimeout(180000);

const TOUR = 'tournament:read tournament:operate tournament:manage';
const SESSION = 'session:read session:operate';
let ctx;
let manager;
let op;

beforeAll(async () => {
  ctx = await createTestContext();
  manager = await ctx.as({ scope: `${MANAGER} ${TOUR} ${SESSION}`, sub: 'bd:user:mgr', org: ['bd:branch:1'] });
  op = await ctx.as({ scope: `${STAFF} tournament:read tournament:operate ${SESSION}`, sub: 'bd:user:op', org: ['bd:branch:1'] });
});
afterAll(() => ctx.close());

let seq = 0;
const newPlayer = async (rating, gender = 'male') => {
  seq += 1;
  const ref = `bd:customer:ops${seq}`;
  const id = (await manager.put(`/v1/players/by-ref/${ref}`).send({ displayName: `Người ${seq}` })).body.data.id;
  await manager.patch(`/v1/players/${id}`).send({ gender });
  for (const discipline of ['doubles', 'singles']) {
    await manager.post(`/v1/players/${id}/rating-adjustments`).send({ discipline, newRating: rating, reason: 'Dữ liệu test vận hành giải' });
  }
  return { id, ref };
};
const asPlayer = (p) => ctx.as({ scope: 'match:score rating:self ranking:read', sub: `bd:user:${p.ref}`, org: [], player: p.ref, name: 'Khách' });

const createTournament = async (body) => {
  const res = await manager.post('/v1/tournaments').send({
    organizerRef: 'bd:branch:1', name: `Vận hành ${seq}`, startsOn: '2026-10-20', tier: 'club', discipline: 'doubles', genderRule: 'open',
    pairingMode: 'fixed', format: 'round_robin', scoring: '1x21', matchMinutes: 20, ...body
  });
  expect(res.status).toBe(201);
  expect((await manager.post(`/v1/tournaments/${res.body.data.id}/open`).send()).status).toBe(200);
  return res.body.data;
};
const registerPairs = async (tid, n, rating = 3) => {
  const pairs = [];
  for (let i = 0; i < n; i += 1) {
    const a = await newPlayer(rating + i * 0.1);
    const b = await newPlayer(rating + i * 0.1);
    expect((await op.post(`/v1/tournaments/${tid}/entries`).send({ playerId: a.id, partnerPlayerId: b.id })).status).toBe(201);
    pairs.push([a, b]);
  }
  return pairs;
};
const entriesOf = async (tid) => (await manager.get(`/v1/tournaments/${tid}/entries`)).body.data.items;
const checkInAll = async (tid, players) => {
  const byPlayer = new Map((await entriesOf(tid)).map((e) => [e.playerId, e]));
  for (const p of players) expect((await op.post(`/v1/tournaments/${tid}/entries/${byPlayer.get(p.id).id}/check-in`).send()).status).toBe(200);
};
const draw = async (tid) => {
  const p = (await manager.post(`/v1/tournaments/${tid}/draw/preview`).send({ seed: 'ops' })).body.data;
  const res = await manager.post(`/v1/tournaments/${tid}/draw`).send({ seed: p.seed, teams: p.teams.map((x) => ({ players: x.players.map((y) => y.id) })), groups: p.groups, bracket: p.bracket });
  expect(res.status).toBe(200);
  return p;
};
const matchesOf = async (tid) => (await manager.get(`/v1/tournaments/${tid}/matches`)).body.data.items;
const record = (m, games) => op.put(`/v1/matches/${m.id}/result`).set('If-Match', `"${m.version}"`).send({ games });
const playersOf = (m) => [...m.teamA.players, ...m.teamB.players].map((p) => p.id);

describe('sân của giải, giờ dự kiến, gọi ra sân', () => {
  let tid;
  test('tạo giải có danh sách sân + giờ bắt đầu; sai dạng → 422', async () => {
    const bad = await manager.post('/v1/tournaments').send({
      organizerRef: 'bd:branch:1', name: 'Sai giờ', startsOn: '2026-10-20', tier: 'club', discipline: 'doubles', genderRule: 'open', format: 'round_robin',
      scoring: '1x21', startTime: '8h30'
    });
    expect([bad.status, bad.body.code]).toEqual([400, 'VALIDATION_FAILED']);
    const dup = await manager.post('/v1/tournaments').send({
      organizerRef: 'bd:branch:1', name: 'Trùng sân', startsOn: '2026-10-20', tier: 'club', discipline: 'doubles', genderRule: 'open', format: 'round_robin',
      scoring: '1x21', courtRefs: ['c1', 'c1']
    });
    expect([dup.status, dup.body.code]).toEqual([422, 'INVALID_TOURNAMENT']);
    const t = await createTournament({ courtRefs: ['c1', 'c2'], startTime: '08:30' });
    expect(t).toMatchObject({ courtRefs: ['c1', 'c2'], courtCount: 2, startTime: '08:30', checkInRequired: false });
    tid = t.id;
  });

  test('bốc thăm 4 cặp vòng tròn: giờ dự kiến theo lượt (08:30, 08:50, …)', async () => {
    await registerPairs(tid, 4);
    await draw(tid);
    const ms = await matchesOf(tid);
    expect(ms).toHaveLength(6);
    for (const m of ms) {
      const minutes = 8 * 60 + 30 + (m.slotNo - 1) * 20;
      expect(m.expectedTime).toBe(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
    }
  });

  test('gọi ra sân: thiếu sân / sân ngoài giải → 422; một đội ở hai sân → PLAYER_BUSY; hai trận một sân → COURT_BUSY', async () => {
    const ms = await matchesOf(tid);
    const first = ms.find((m) => m.slotNo === 1);
    const noCourt = await op.post(`/v1/matches/${first.id}/call`).send({});
    expect([noCourt.status, noCourt.body.code]).toEqual([422, 'COURT_REQUIRED']);
    const far = await op.post(`/v1/matches/${first.id}/call`).send({ courtRef: 'c9' });
    expect([far.status, far.body.code]).toEqual([422, 'COURT_NOT_IN_CONTEXT']);
    expect((await op.post(`/v1/matches/${first.id}/call`).send({ courtRef: 'c1' })).status).toBe(200);

    const shared = ms.find((m) => m.id !== first.id && playersOf(m).some((pid) => playersOf(first).includes(pid)));
    const twice = await op.post(`/v1/matches/${shared.id}/call`).send({ courtRef: 'c2' });
    expect([twice.status, twice.body.code]).toEqual([409, 'PLAYER_BUSY']);
    expect(twice.body.message).toContain('đang đánh ở sân c1');

    const free = ms.find((m) => !playersOf(m).some((pid) => playersOf(first).includes(pid)));
    const sameCourt = await op.post(`/v1/matches/${free.id}/call`).send({ courtRef: 'c1' });
    expect([sameCourt.status, sameCourt.body.code]).toEqual([409, 'COURT_BUSY']);
  });

  test('trận kế tiếp: sân trống không gồm c1, không đề xuất trận có người đang đánh; call-next gọi đúng trận đầu', async () => {
    const next = (await op.get(`/v1/tournaments/${tid}/next-matches`)).body.data;
    expect(next.freeCourts).toEqual(['c2']);
    const busy = new Set(playersOf((await matchesOf(tid)).find((m) => m.status === 'in_play')));
    expect(next.items.length).toBeGreaterThan(0);
    for (const it of next.items) expect(playersOf(it.match).some((pid) => busy.has(pid))).toBe(false);
    // Trận chưa gọi được vì có người đang ở sân → nói rõ ai, sân nào.
    expect(next.blocked.length).toBeGreaterThan(0);
    for (const b of next.blocked) for (const p of b.players) expect([busy.has(p.id), p.courtRef]).toEqual([true, 'c1']);
    expect(next.items[0]).toMatchObject({ rested: true, restMinutes: null });
    const called = await op.post(`/v1/tournaments/${tid}/call-next`).send({ courtRef: 'c2' });
    expect(called.status).toBe(200);
    expect(called.body.data).toMatchObject({ id: next.items[0].match.id, status: 'in_play', courtRef: 'c2' });
    // Hai sân đã đầy, 4 cặp đều đang đánh → không còn trận gọi được.
    const none = await op.post(`/v1/tournaments/${tid}/call-next`).send({ courtRef: 'c2' });
    expect([none.status, none.body.code]).toEqual([422, 'NOTHING_TO_CALL']);
  });

  test('sân của giải: bỏ sân đang có trận → 409 COURT_BUSY; thêm sân → được', async () => {
    const t = (await manager.get(`/v1/tournaments/${tid}`)).body.data;
    const busy = await manager.put(`/v1/tournaments/${tid}/courts`).send({ courtRefs: ['c2'] });
    expect([busy.status, busy.body.code]).toEqual([409, 'COURT_BUSY']);
    const more = await manager.put(`/v1/tournaments/${tid}/courts`).send({ courtRefs: ['c1', 'c2', 'c3'] });
    expect(more.status).toBe(200);
    expect(more.body.data).toMatchObject({ courtRefs: ['c1', 'c2', 'c3'], courtCount: 3, version: t.version + 1 });
  });
});

describe('không đánh tiếp được (bỏ cuộc giữa trận)', () => {
  test('trận giải 3 game: hết game 1 rồi một đội không đánh tiếp → thua, giữ game đã xong; người chơi không bấm được', async () => {
    const t = await createTournament({ courtRefs: ['k1'], scoring: '3x21' });
    const pairs = await registerPairs(t.id, 2);
    await draw(t.id);
    const [m] = await matchesOf(t.id);
    expect((await op.post(`/v1/matches/${m.id}/call`).send({ courtRef: 'k1' })).status).toBe(200);
    let live = (await op.get(`/v1/matches/${m.id}/live`)).body.data;
    for (const side of 'AB'.repeat(15) + 'A'.repeat(6) + 'BB') live = (await op.post(`/v1/matches/${m.id}/live/rallies`).send({ side, revision: live.revision })).body.data;
    expect(live).toMatchObject({ games: [[21, 15]], current: [0, 2] });

    const player = await asPlayer(pairs[0][0]);
    const byPlayer = await player.post(`/v1/matches/${m.id}/live/retire`).send({ side: 'B', revision: live.revision });
    expect([byPlayer.status, byPlayer.body.code]).toEqual([403, 'RETIRE_REQUIRES_STAFF']);
    const stale = await op.post(`/v1/matches/${m.id}/live/retire`).send({ side: 'A', revision: live.revision - 1 });
    expect([stale.status, stale.body.code]).toEqual([409, 'LIVE_CONFLICT']);

    const res = await op.post(`/v1/matches/${m.id}/live/retire`).send({ side: 'A', revision: live.revision });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'completed', outcome: 'retired', winnerSide: 'B', games: [[21, 15]] });
    const audit = await ctx.models.AuditLog.findOne({ where: { targetId: m.id, action: 'match.result_recorded' } });
    expect(audit.after).toMatchObject({ outcome: 'retired', via: 'live' });
    // Sân được nhả: gọi trận khác vào k1 được ngay (giải chỉ có một trận nên kiểm bằng danh sách sân trống).
    expect((await op.get(`/v1/tournaments/${t.id}/next-matches`)).body.data.freeCourts).toEqual(['k1']);
  });

  test('trận giao lưu → 409 RESULT_NOT_REQUIRED (dùng huỷ trận / xong không tỉ số)', async () => {
    const s = (await op.post('/v1/sessions').send({ organizerRef: 'bd:branch:1', name: 'Giao lưu bỏ cuộc', courtRefs: ['g1'] })).body.data;
    for (let i = 0; i < 4; i += 1) {
      const p = await newPlayer(3);
      expect((await op.post(`/v1/sessions/${s.id}/players`).send({ playerId: p.id })).status).toBe(201);
    }
    const [m] = (await op.post(`/v1/sessions/${s.id}/fill-courts`).send({})).body.data.matches;
    const res = await op.post(`/v1/matches/${m.id}/live/retire`).send({ side: 'A', revision: 0 });
    expect([res.status, res.body.code]).toEqual([409, 'RESULT_NOT_REQUIRED']);
    expect((await op.post(`/v1/sessions/${s.id}/cancel`).send()).status).toBe(200);
  });
});

describe('điểm danh, bốc thăm tại sân, đổi đồng đội', () => {
  let tid;
  let pairs;
  test('đổi đồng đội trước bốc thăm: người mới vào đúng chỗ của cặp; người đã có cặp → 409; giải đơn → 422', async () => {
    const t = await createTournament({ courtRefs: ['d1', 'd2'], checkInRequired: true });
    tid = t.id;
    pairs = await registerPairs(tid, 5);
    const before = await entriesOf(tid);
    const entry = before.find((e) => e.playerId === pairs[1][0].id);
    const fresh = await newPlayer(3.1);
    const taken = await op.put(`/v1/tournaments/${tid}/entries/${entry.id}/partner`).send({ partnerPlayerId: pairs[2][0].id });
    expect([taken.status, taken.body.code]).toEqual([409, 'ALREADY_REGISTERED']);
    const res = await op.put(`/v1/tournaments/${tid}/entries/${entry.id}/partner`).send({ partnerPlayerId: fresh.id });
    expect(res.status).toBe(200);
    const after = res.body.data.items;
    const oldPartner = after.find((e) => e.playerId === pairs[1][1].id);
    const newcomer = after.find((e) => e.playerId === fresh.id);
    expect(oldPartner.status).toBe('withdrawn');
    expect(newcomer).toMatchObject({ status: 'registered', partnerPlayerId: pairs[1][0].id, registeredAt: entry.registeredAt });
    expect(after.find((e) => e.id === entry.id).partnerPlayerId).toBe(fresh.id);
    pairs[1][1] = fresh;

    const single = await createTournament({ discipline: 'singles' });
    const s1 = await newPlayer(3);
    await op.post(`/v1/tournaments/${single.id}/entries`).send({ playerId: s1.id });
    const sEntry = (await entriesOf(single.id))[0];
    const notAllowed = await op.put(`/v1/tournaments/${single.id}/entries/${sEntry.id}/partner`).send({ partnerPlayerId: fresh.id });
    expect([notAllowed.status, notAllowed.body.code]).toEqual([422, 'PARTNER_NOT_ALLOWED']);
  });

  test('bốc thăm tại sân: 4 cặp đủ người + 1 cặp mới đến một người → cặp đó vắng, sang danh sách chờ; mở lại thì về đăng ký', async () => {
    await checkInAll(tid, [...pairs.slice(0, 4).flat(), pairs[4][0]]);
    const t = (await manager.get(`/v1/tournaments/${tid}`)).body.data;
    expect(t.progress.entries.checkedIn).toBe(9);
    const preview = (await manager.post(`/v1/tournaments/${tid}/draw/preview`).send({ seed: 'ops' })).body.data;
    expect(preview.teams).toHaveLength(4);
    expect(preview.absent.map((a) => a.playerId).sort()).toEqual([pairs[4][0].id, pairs[4][1].id].sort());
    await draw(tid);
    const waiting = (await entriesOf(tid)).filter((e) => e.status === 'waitlisted');
    expect(waiting.map((e) => e.waitlistReason)).toEqual(['absent', 'absent']);
    expect((await manager.post(`/v1/tournaments/${tid}/reopen`).send()).status).toBe(200);
    expect((await entriesOf(tid)).filter((e) => e.status === 'registered')).toHaveLength(10);
    // Bỏ điểm danh (bấm nhầm) rồi điểm danh lại.
    const one = (await entriesOf(tid)).find((e) => e.playerId === pairs[0][0].id);
    expect((await op.delete(`/v1/tournaments/${tid}/entries/${one.id}/check-in`)).body.data.items.find((e) => e.id === one.id).checkedInAt).toBeNull();
    expect((await op.post(`/v1/tournaments/${tid}/entries/${one.id}/check-in`).send()).body.data.items.find((e) => e.id === one.id).checkedInAt).not.toBeNull();
  });
});

describe('xử W.O. các đội vắng (đã bốc thăm trước)', () => {
  test('vòng tròn 4 cặp, 2 cặp vắng: trận của họ với đội có mặt thành W.O., trận giữa hai đội vắng bị huỷ', async () => {
    const t = await createTournament({ courtRefs: ['w1', 'w2'] });
    const pairs = await registerPairs(t.id, 4);
    await draw(t.id);
    await checkInAll(t.id, pairs.slice(0, 2).flat());
    const absent = (await op.get(`/v1/tournaments/${t.id}/no-shows`)).body.data.items;
    expect(absent).toHaveLength(2);
    const present = (await manager.get(`/v1/tournaments/${t.id}/teams`)).body.data.items.find((x) => !absent.some((a) => a.id === x.id));
    const notAbsent = await op.post(`/v1/tournaments/${t.id}/no-shows`).send({ teamIds: [present.id] });
    expect([notAbsent.status, notAbsent.body.code]).toEqual([409, 'NOT_ABSENT']);
    const res = await op.post(`/v1/tournaments/${t.id}/no-shows`).send({ teamIds: absent.map((a) => a.id) });
    expect(res.status).toBe(200);
    expect(res.body.data.teamIds.sort()).toEqual(absent.map((a) => a.id).sort());
    const ms = await matchesOf(t.id);
    const absentIds = new Set(absent.map((a) => a.id));
    for (const m of ms) {
      const outA = absentIds.has(m.teamA.teamId);
      const outB = absentIds.has(m.teamB.teamId);
      if (outA && outB) expect(m.status).toBe('cancelled');
      else if (outA || outB) expect(m).toMatchObject({ status: 'completed', outcome: 'walkover', winnerSide: outA ? 'B' : 'A' });
      else expect(m.status).toBe('scheduled');
    }
    const none = await op.post(`/v1/tournaments/${t.id}/no-shows`).send({});
    expect([none.status, none.body.code]).toEqual([422, 'NOTHING_TO_DO']);
  });

  test('loại trực tiếp: hai đội vắng gặp nhau ở vòng 1 → sơ đồ không kẹt, đối thủ ở vòng sau thắng W.O., chốt được', async () => {
    const t = await createTournament({ courtRefs: ['x1'], format: 'knockout' });
    const pairs = await registerPairs(t.id, 4);
    await draw(t.id);
    const r1 = (await matchesOf(t.id)).filter((m) => m.roundNo === 1);
    expect(r1).toHaveLength(2);
    // Hai đội của trận vòng 1 thứ nhất vắng; trận còn lại có mặt.
    const presentIds = new Set(playersOf(r1[1]));
    await checkInAll(t.id, pairs.flat().filter((p) => presentIds.has(p.id)));
    const res = await op.post(`/v1/tournaments/${t.id}/no-shows`).send({});
    expect(res.body.data.teamIds).toHaveLength(2);
    expect((await record(r1[1], [[21, 12]])).status).toBe(200);
    const final = (await matchesOf(t.id)).find((m) => m.label === 'Chung kết');
    expect(final).toMatchObject({ status: 'completed', outcome: 'walkover' });
    expect(final[final.winnerSide === 'A' ? 'teamA' : 'teamB'].teamId).toBe(r1[1].teamA.teamId);
    expect((await manager.post(`/v1/tournaments/${t.id}/finalize`).send()).status).toBe(200);
  });
});

describe('giao lưu: một người không có mặt ở hai buổi cùng lúc', () => {
  test('đang có mặt ở buổi khác chưa đóng → 409 PRESENT_ELSEWHERE (kèm id buổi); rời buổi kia rồi thì điểm danh được', async () => {
    const mk = async (name) => (await op.post('/v1/sessions').send({ organizerRef: 'bd:branch:1', name, courtRefs: ['s1'] })).body.data;
    const a = await mk('Buổi hôm qua quên đóng');
    const b = await mk('Buổi hôm nay');
    const p = await newPlayer(3);
    expect((await op.post(`/v1/sessions/${a.id}/players`).send({ playerId: p.id })).status).toBe(201);
    const twice = await op.post(`/v1/sessions/${b.id}/players`).send({ playerId: p.id });
    expect([twice.status, twice.body.code]).toEqual([409, 'PRESENT_ELSEWHERE']);
    expect(twice.body.errors[0]).toMatchObject({ field: a.id, message: 'Buổi hôm qua quên đóng' });
    expect((await op.delete(`/v1/sessions/${a.id}/players/${p.id}`)).status).toBe(200);
    expect((await op.post(`/v1/sessions/${b.id}/players`).send({ playerId: p.id })).status).toBe(201);
    // Buổi đã đóng / huỷ không tính.
    await op.post(`/v1/sessions/${b.id}/cancel`).send();
    expect((await op.post(`/v1/sessions/${a.id}/players`).send({ playerId: p.id })).status).toBe(201);
  });
});
