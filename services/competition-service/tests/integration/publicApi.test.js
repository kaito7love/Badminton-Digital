const http = require('http');
const { createTestContext, STAFF, MANAGER } = require('./helpers');

// API CÔNG KHAI (plan 27, slice p0) bằng service thật + MySQL thật: người chưa đăng nhập và khách xem giải / buổi giao lưu.
// Kiểm: quyền (`public:read`), giải / buổi nào được xem, KHÔNG rò trường nội bộ (hợp đồng đóng + so tập khoá), tên người chơi
// theo quyền riêng tư (chưa đăng nhập / đã đăng nhập / người trong giải / nhân viên), danh sách chờ, bảng – sơ đồ – thứ hạng, SSE.
jest.setTimeout(240000);

const TOUR = 'tournament:read tournament:operate tournament:manage';
const SESSION = 'session:read session:operate';
const PUBLIC = 'public:read';
let ctx;
let manager;
let op;
let anon;
let staffViewer;
let server;
let port;

beforeAll(async () => {
  ctx = await createTestContext({ env: { SSE_HEARTBEAT_MS: '300' } });
  manager = await ctx.as({ scope: `${MANAGER} ${TOUR} ${SESSION}`, sub: 'bd:user:mgr', org: ['bd:branch:1'] });
  op = await ctx.as({ scope: `${STAFF} ${TOUR} ${SESSION}`, sub: 'bd:user:op', org: ['bd:branch:1'] });
  // Gateway ký `sub = anonymous` + scope ranking:read public:read cho người chưa đăng nhập.
  anon = await ctx.as({ scope: `ranking:read ${PUBLIC}`, sub: 'anonymous', org: [] });
  staffViewer = await ctx.as({ scope: `${STAFF} ${PUBLIC}`, sub: 'bd:user:viewer', org: ['bd:branch:1'] });
  server = ctx.app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  ({ port } = server.address());
});
afterAll(async () => {
  ctx.built.sse.closeAll();
  await new Promise((resolve) => server.close(resolve));
  await ctx.close();
});

let seq = 0;
const newPlayer = async ({ name, rating = 3, gender = 'male', visibility, nickname } = {}) => {
  seq += 1;
  const ref = `bd:customer:pub${seq}`;
  const displayName = name || `Nguyễn Văn Số${seq}`;
  const id = (await manager.put(`/v1/players/by-ref/${ref}`).send({ displayName })).body.data.id;
  const patch = { gender, ...(visibility ? { visibility } : {}), ...(nickname ? { nickname } : {}) };
  expect((await manager.patch(`/v1/players/${id}`).send(patch)).status).toBe(200);
  for (const discipline of ['doubles', 'singles']) {
    await manager.post(`/v1/players/${id}/rating-adjustments`).send({ discipline, newRating: rating, reason: 'Dữ liệu test trang công khai' });
  }
  return { id, ref, displayName };
};
// Token của khách đăng nhập: gateway cấp rating:self + ranking:read + match:score + public:read, gắn `player`.
const asCustomer = (p) => ctx.as({ scope: `rating:self ranking:read match:score ${PUBLIC}`, sub: `bd:user:${p.ref}`, org: [], player: p.ref, name: p.displayName });

const createTournament = async (over = {}) => {
  const res = await manager.post('/v1/tournaments').send({
    organizerRef: 'bd:branch:1', name: `Giải công khai ${seq}`, startsOn: '2026-11-15', tier: 'club', discipline: 'doubles', genderRule: 'open',
    pairingMode: 'fixed', format: 'round_robin', scoring: '1x21', matchMinutes: 20, ...over
  });
  expect(res.status).toBe(201);
  return res.body.data;
};
const openIt = async (tid) => expect((await manager.post(`/v1/tournaments/${tid}/open`).send()).status).toBe(200);
const registerPair = async (tid, a, b) => expect((await op.post(`/v1/tournaments/${tid}/entries`).send({ playerId: a.id, partnerPlayerId: b.id })).status).toBe(201);
const registerSolo = async (tid, a) => expect((await op.post(`/v1/tournaments/${tid}/entries`).send({ playerId: a.id })).status).toBe(201);
const draw = async (tid) => {
  const p = (await manager.post(`/v1/tournaments/${tid}/draw/preview`).send({ seed: 'pub' })).body.data;
  const res = await manager.post(`/v1/tournaments/${tid}/draw`).send({ seed: p.seed, teams: p.teams.map((x) => ({ players: x.players.map((y) => y.id) })), groups: p.groups, bracket: p.bracket });
  expect(res.status).toBe(200);
};
const staffMatches = async (tid) => (await manager.get(`/v1/tournaments/${tid}/matches`)).body.data.items;
const record = async (m, games = [[21, 14]]) => expect((await op.put(`/v1/matches/${m.id}/result`).set('If-Match', `"${m.version}"`).send({ games })).status).toBe(200);

const get = async (client, path) => (await client.get(path)).body;
const MASKED = /^Thành viên [0-9A-F]{4}$/;
const names = (entry) => entry.players.map((p) => p.name);

// --- dữ liệu dùng chung ---
const P = {};
const T = {};
const S = {};

describe('dựng dữ liệu: giải nháp / mở đăng ký / bốc thăm / đã chốt / đã huỷ + buổi giao lưu', () => {
  test('người chơi với đủ kiểu quyền riêng tư', async () => {
    P.cu = await newPlayer({ name: 'Nguyễn Văn Cú', visibility: 'public', nickname: 'Cú Smash' });
    P.mai = await newPlayer({ name: 'Trần Thị Mai', gender: 'female' }); // members (mặc định)
    P.binh = await newPlayer({ name: 'Lê Văn Bình', visibility: 'public' }); // không biệt danh → "Bình L."
    P.dung = await newPlayer({ name: 'Phạm Văn Dũng', visibility: 'hidden' });
    for (const k of ['e', 'f', 'g', 'h', 'i', 'j']) P[k] = await newPlayer({ visibility: k === 'i' ? 'public' : undefined });
    P.outsider = await newPlayer({ name: 'Hoàng Văn Ngoài' });
  });

  test('giải nháp và giải đã huỷ (không bao giờ xem được công khai)', async () => {
    T.draft = await createTournament({ name: 'PUB nháp' });
    T.cancel = await createTournament({ name: 'PUB huỷ' });
    await openIt(T.cancel.id);
    expect((await manager.post(`/v1/tournaments/${T.cancel.id}/cancel`).send()).status).toBe(200);
  });

  test('giải đang mở đăng ký: 4 cặp đủ chỗ (8 người) + 1 cặp vào danh sách chờ', async () => {
    T.open = await createTournament({ name: 'PUB mở đăng ký', maxEntries: 8, startsOn: '2026-11-20', startTime: '08:00' });
    await openIt(T.open.id);
    await registerPair(T.open.id, P.cu, P.mai);
    await registerPair(T.open.id, P.binh, P.dung);
    await registerPair(T.open.id, P.e, P.f);
    await registerPair(T.open.id, P.g, P.h);
    await registerPair(T.open.id, P.i, P.j); // hết chỗ → chờ
  });

  test('giải đã bốc thăm (loại trực tiếp đơn, 4 người) — dừng ở trạng thái drawn', async () => {
    T.drawn = await createTournament({ name: 'PUB đã bốc thăm', discipline: 'singles', format: 'knockout', startsOn: '2026-11-10' });
    await openIt(T.drawn.id);
    const four = [];
    for (let i = 0; i < 4; i += 1) four.push(await newPlayer({ rating: 3 + i * 0.2 }));
    P.drawn = four;
    for (const p of four) await registerSolo(T.drawn.id, p);
    await draw(T.drawn.id);
  });

  test('giải đã chốt (vòng tròn, 3 cặp, đánh hết)', async () => {
    T.final = await createTournament({ name: 'PUB đã chốt', startsOn: '2026-10-30' });
    await openIt(T.final.id);
    P.final = [];
    for (let i = 0; i < 3; i += 1) {
      const a = await newPlayer({ rating: 3 + i * 0.3 });
      const b = await newPlayer({ rating: 3 + i * 0.3 });
      P.final.push([a, b]);
      await registerPair(T.final.id, a, b);
    }
    await draw(T.final.id);
    for (const m of await staffMatches(T.final.id)) await record(m);
    expect((await manager.post(`/v1/tournaments/${T.final.id}/finalize`).send()).status).toBe(200);
  });

  test('buổi giao lưu: đang mở có 6 người + 2 sân, đã đóng, đã huỷ, và một buổi đóng cách đây 40 ngày', async () => {
    const make = async (name, extra = {}) => (await op.post('/v1/sessions').send({ organizerRef: 'bd:branch:1', name, courtRefs: ['c1', 'c2'], ...extra })).body.data;
    S.open = await make('PUB giao lưu đang mở');
    P.session = [];
    for (let i = 0; i < 6; i += 1) {
      const p = await newPlayer({ rating: 2.5 + i * 0.2, visibility: i < 2 ? 'public' : i === 2 ? 'hidden' : undefined });
      P.session.push(p);
      expect((await op.post(`/v1/sessions/${S.open.id}/players`).send({ playerId: p.id })).status).toBe(201);
    }
    expect((await op.post(`/v1/sessions/${S.open.id}/fill-courts`).send({})).status).toBe(201);
    S.closed = await make('PUB giao lưu đã đóng');
    expect((await op.post(`/v1/sessions/${S.closed.id}/close`).send()).status).toBe(200);
    S.cancelled = await make('PUB giao lưu đã huỷ');
    expect((await op.post(`/v1/sessions/${S.cancelled.id}/cancel`).send()).status).toBe(200);
    S.old = await make('PUB giao lưu cũ');
    expect((await op.post(`/v1/sessions/${S.old.id}/close`).send()).status).toBe(200);
    await ctx.models.PlaySession.update({ startsAt: new Date(Date.now() - 40 * 86400000) }, { where: { id: S.old.id } });
  });
});

describe('quyền truy cập', () => {
  test('không có token → 401; token thiếu public:read → 403 FORBIDDEN_SCOPE', async () => {
    const none = await ctx.api.get('/v1/public/tournaments');
    expect([none.status, none.body.code]).toEqual([401, 'UNAUTHENTICATED']);
    const noScope = await (await ctx.as({ scope: 'ranking:read', sub: 'anonymous', org: [] })).get('/v1/public/tournaments');
    expect([noScope.status, noScope.body.code]).toEqual([403, 'FORBIDDEN_SCOPE']);
    const sessions = await (await ctx.as({ scope: 'ranking:read rating:self', sub: 'bd:user:x', org: [] })).get('/v1/public/sessions');
    expect(sessions.status).toBe(403);
  });

  test('các route công khai không cho GHI: POST / PATCH / DELETE vào /v1/public/* → 404 (không có route)', async () => {
    for (const method of ['post', 'patch', 'delete', 'put']) {
      const res = await manager[method](`/v1/public/tournaments/${T.open.id}`).send({});
      expect([404, 405]).toContain(res.status);
    }
  });
});

describe('danh sách và chi tiết giải', () => {
  test('chỉ giải open / drawn / finalized; nháp và đã huỷ không có; mặc định ngày sớm nhất trước', async () => {
    const body = await get(anon, '/v1/public/tournaments?limit=50');
    const list = body.data.items.filter((t) => t.name.startsWith('PUB '));
    expect(list.map((t) => t.status).sort()).toEqual(['drawn', 'finalized', 'open']);
    expect(list.map((t) => t.name)).not.toEqual(expect.arrayContaining(['PUB nháp']));
    expect(list.map((t) => t.startsOn)).toEqual([...list.map((t) => t.startsOn)].sort());
    const desc = (await get(anon, '/v1/public/tournaments?limit=50&order=desc')).data.items.filter((t) => t.name.startsWith('PUB '));
    expect(desc.map((t) => t.startsOn)).toEqual([...desc.map((t) => t.startsOn)].sort().reverse());
  });

  test('lọc theo trạng thái (một hoặc nhiều), tên, chi nhánh, phân trang; status lạ → 400', async () => {
    const open = (await get(anon, '/v1/public/tournaments?status=open')).data;
    expect(open.items.map((t) => t.name)).toEqual(['PUB mở đăng ký']);
    // Cả dấu phẩy thô lẫn %2C (frontend mã hoá bằng encodeURIComponent) đều được.
    for (const q of ['drawn,finalized', 'drawn%2Cfinalized']) {
      expect((await get(anon, `/v1/public/tournaments?status=${q}`)).data.items.map((t) => t.status).sort()).toEqual(['drawn', 'finalized']);
    }
    expect((await get(anon, `/v1/public/tournaments?q=${encodeURIComponent('đã chốt')}`)).data.items.map((t) => t.name)).toEqual(['PUB đã chốt']);
    expect((await get(anon, '/v1/public/tournaments?organizerRef=bd:branch:2')).data.total).toBe(0);
    const page = (await get(anon, '/v1/public/tournaments?limit=1&page=2')).data;
    expect([page.items.length, page.page, page.totalPages, page.total]).toEqual([1, 2, 3, 3]);
    for (const bad of ['status=draft', 'status=cancelled', 'status=open,draft', 'order=sideways']) {
      const res = await anon.get(`/v1/public/tournaments?${bad}`);
      expect([res.status, res.body.code]).toEqual([400, 'VALIDATION_FAILED']);
    }
  });

  test('không rò trường nội bộ: đúng tập khoá của giải, không có courtRefs / createdByRef / drawSeed / version', async () => {
    const item = (await get(anon, '/v1/public/tournaments?status=open')).data.items[0];
    expect(Object.keys(item).sort()).toEqual([
      'advancePerGroup', 'courtCount', 'description', 'discipline', 'finalizedAt', 'format', 'genderRule', 'groupCount', 'id', 'matchMinutes',
      'maxEntries', 'name', 'organizerRef', 'pairingMode', 'ranked', 'rated', 'ratingRule', 'registration', 'scoring', 'stage', 'startTime',
      'startsOn', 'status', 'thirdPlaceMatch', 'tier'
    ]);
    const text = JSON.stringify(await get(anon, `/v1/public/tournaments/${T.open.id}`));
    for (const leak of ['courtRefs', 'createdByRef', 'drawSeed', 'version', 'checkInRequired', 'maxPartnerGap', 'bd:user']) expect(text).not.toContain(leak);
  });

  test('chi tiết giải mở đăng ký: số chỗ tính theo người, đang chờ, cần đồng đội', async () => {
    const d = (await get(anon, `/v1/public/tournaments/${T.open.id}`)).data;
    expect(d).toMatchObject({
      status: 'open', startTime: '08:00', maxEntries: 8,
      registration: { open: true, needsPartner: true, registered: 8, waitlisted: 2, maxEntries: 8, spotsLeft: 0 },
      matches: { total: 0, completed: 0 }
    });
    const solo = (await get(anon, `/v1/public/tournaments/${T.drawn.id}`)).data;
    expect(solo.registration).toMatchObject({ open: false, needsPartner: false, registered: 4, waitlisted: 0, maxEntries: null, spotsLeft: null });
    expect(solo.matches.total).toBe(3);
    const final = (await get(anon, `/v1/public/tournaments/${T.final.id}`)).data;
    expect([final.status, final.stage, final.matches.total, final.matches.completed]).toEqual(['finalized', 'group', 3, 3]);
    expect(final.finalizedAt).toEqual(expect.any(String));
  });

  test('nháp / đã huỷ / không tồn tại → 404 ở MỌI route con', async () => {
    for (const id of [T.draft.id, T.cancel.id, '00000000-0000-4000-8000-000000000000']) {
      for (const sub of ['', '/entries', '/matches', '/standings', '/bracket', '/placements']) {
        const res = await anon.get(`/v1/public/tournaments/${id}${sub}`);
        expect([res.status, res.body.code]).toEqual([404, 'NOT_FOUND']);
      }
    }
  });
});

describe('danh sách đăng ký và quyền riêng tư của tên', () => {
  test('người chưa đăng nhập: hồ sơ public hiện tên thi đấu / "Tên H."; members và hidden bị che, id null', async () => {
    const items = (await get(anon, `/v1/public/tournaments/${T.open.id}/entries`)).data.items;
    expect(items).toHaveLength(5);
    expect(items[0].players[0]).toEqual({ id: P.cu.id, name: 'Cú Smash', masked: false });
    expect(items[0].players[1]).toMatchObject({ id: null, masked: true });
    expect(items[0].players[1].name).toMatch(MASKED);
    expect(items[1].players[0]).toEqual({ id: P.binh.id, name: 'Bình L.', masked: false });
    expect(items[1].players[1]).toMatchObject({ id: null, masked: true });
    expect(items.map((e) => e.mine)).toEqual([false, false, false, false, false]);
    const text = JSON.stringify(items);
    expect(text).not.toContain('Trần Thị Mai');
    expect(text).not.toContain('Phạm Văn Dũng');
    expect(text).not.toContain('bd:customer');
  });

  test('khách đã đăng nhập (không tham gia giải): thấy tên đầy đủ, trừ hồ sơ hidden bị che', async () => {
    const member = await asCustomer(P.outsider);
    const items = (await get(member, `/v1/public/tournaments/${T.open.id}/entries`)).data.items;
    expect(names(items[0])).toEqual(['Nguyễn Văn Cú', 'Trần Thị Mai']);
    expect(items[1].players[0].name).toBe('Lê Văn Bình');
    expect(items[1].players[1]).toMatchObject({ id: null, masked: true });
    expect(items[1].players[1].name).toMatch(MASKED);
    expect(items.every((e) => !e.mine)).toBe(true);
  });

  test('người trong giải thấy tên đầy đủ của mọi người (kể cả hidden) và dòng của mình có mine = true', async () => {
    const mine = await asCustomer(P.mai); // trong cặp 1
    const items = (await get(mine, `/v1/public/tournaments/${T.open.id}/entries`)).data.items;
    expect(names(items[1])).toEqual(['Lê Văn Bình', 'Phạm Văn Dũng']);
    expect(items.map((e) => e.mine)).toEqual([true, false, false, false, false]);
    // Người đã RÚT khỏi giải thì không còn là người trong giải: lại bị che.
    const solo = await newPlayer({ visibility: 'public' });
    const other = await newPlayer({ visibility: 'public' });
    const t = await createTournament({ name: 'PUB rút' });
    await openIt(t.id);
    await registerPair(t.id, solo, other);
    const entry = (await op.get(`/v1/tournaments/${t.id}/entries`)).body.data.items.find((e) => e.playerId === solo.id);
    expect((await op.delete(`/v1/tournaments/${t.id}/entries/${entry.id}`)).status).toBe(200);
    expect((await get(anon, `/v1/public/tournaments/${t.id}/entries`)).data.items).toHaveLength(0);
  });

  test('nhân viên (rating:read) thấy tên đầy đủ', async () => {
    const items = (await get(staffViewer, `/v1/public/tournaments/${T.open.id}/entries`)).data.items;
    expect(names(items[1])).toEqual(['Lê Văn Bình', 'Phạm Văn Dũng']);
    expect(items[1].players[1].masked).toBe(false);
  });

  test('danh sách chờ vì hết chỗ có thứ tự; người chính thức không có', async () => {
    const items = (await get(anon, `/v1/public/tournaments/${T.open.id}/entries`)).data.items;
    expect(items.slice(0, 4).map((e) => [e.status, e.waitlistReason, e.waitlistPosition])).toEqual(Array(4).fill(['registered', null, null]));
    expect([items[4].status, items[4].waitlistReason, items[4].waitlistPosition]).toEqual(['waitlisted', 'capacity', 1]);
    expect(items[4].players).toHaveLength(2);
  });

  test('nhãn che ổn định giữa các lần gọi và giữa các route (một người bị che luôn cùng mã)', async () => {
    const a = (await get(anon, `/v1/public/tournaments/${T.open.id}/entries`)).data.items[0].players[1].name;
    const b = (await get(anon, `/v1/public/tournaments/${T.open.id}/entries`)).data.items[0].players[1].name;
    expect(a).toBe(b);
    const final = (await get(anon, `/v1/public/tournaments/${T.final.id}/matches`)).data.items;
    const seen = new Set(final.flatMap((m) => [...m.teamA.players, ...m.teamB.players]).filter((p) => p.masked).map((p) => p.name));
    expect(seen.size).toBeGreaterThan(0); // giải đã chốt dùng người chơi members (mặc định) → bị che với người chưa đăng nhập
    for (const n of seen) expect(n).toMatch(MASKED);
  });
});

describe('lịch, bảng, sơ đồ, thứ hạng', () => {
  test('lịch giải đã chốt: đủ 3 trận, tỉ số, không có version / contextId, tên bị che theo quyền', async () => {
    const items = (await get(anon, `/v1/public/tournaments/${T.final.id}/matches`)).data.items;
    expect(items).toHaveLength(3);
    expect(items.every((m) => m.status === 'completed' && m.games.length === 1 && m.winnerSide)).toBe(true);
    expect(Object.keys(items[0]).sort()).toEqual([
      'bracketPos', 'calledAt', 'completedAt', 'courtRef', 'discipline', 'expectedTime', 'games', 'groupNo', 'id', 'label', 'live', 'nextMatchId',
      'outcome', 'roundNo', 'scoring', 'slotNo', 'stage', 'status', 'teamA', 'teamB', 'winnerSide'
    ]);
    const text = JSON.stringify(items);
    expect(text).not.toContain('contextId');
    expect(text).not.toContain('"version"');
    // Người trong giải thấy tên thật.
    const mine = await asCustomer(P.final[0][0]);
    const full = (await get(mine, `/v1/public/tournaments/${T.final.id}/matches`)).data.items;
    expect(JSON.stringify(full)).toContain(P.final[1][0].displayName);
    expect(JSON.stringify(items)).not.toContain(P.final[1][0].displayName);
  });

  test('bảng vòng tròn: 3 đội xếp hạng 1-2-3, mỗi đội 2 trận; tên theo quyền', async () => {
    const groups = (await get(anon, `/v1/public/tournaments/${T.final.id}/standings`)).data.groups;
    expect(groups).toHaveLength(1);
    expect(groups[0].rows.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(groups[0].rows.every((r) => r.played === 2 && r.team.players.length === 2)).toBe(true);
    expect(Object.keys(groups[0].rows[0].team).sort()).toEqual(['groupNo', 'id', 'players', 'seed', 'withdrawn']);
  });

  test('sơ đồ loại trực tiếp (giải đã bốc thăm): 2 vòng — 2 trận bán kết + chung kết, chưa có kết quả', async () => {
    const rounds = (await get(anon, `/v1/public/tournaments/${T.drawn.id}/bracket`)).data.rounds;
    expect(rounds.map((r) => r.matches.length)).toEqual([2, 1]);
    expect(rounds[0].matches.every((m) => m.status === 'scheduled' && m.teamA && m.teamB)).toBe(true);
    const list = (await get(anon, `/v1/public/tournaments/${T.drawn.id}/matches`)).data.items;
    expect(list).toHaveLength(3);
  });

  test('thứ hạng cuối (vòng tròn: Hạng 1, Hạng 2, …); giải chưa chốt → rỗng', async () => {
    const rows = (await get(anon, `/v1/public/tournaments/${T.final.id}/placements`)).data.items;
    expect(rows.map((r) => r.label).slice(0, 2)).toEqual(['Hạng 1', 'Hạng 2']);
    expect(rows.every((r) => r.players.length === 2)).toBe(true);
    expect((await get(anon, `/v1/public/tournaments/${T.open.id}/placements`)).data.items).toEqual([]);
    expect((await get(anon, `/v1/public/tournaments/${T.open.id}/standings`)).data.groups).toEqual([]);
    expect((await get(anon, `/v1/public/tournaments/${T.open.id}/bracket`)).data.rounds).toEqual([]);
    expect((await get(anon, `/v1/public/tournaments/${T.open.id}/matches`)).data.items).toEqual([]);
  });
});

describe('buổi giao lưu', () => {
  test('danh sách: buổi đang mở + buổi đóng trong 30 ngày; huỷ và đóng quá 30 ngày không có', async () => {
    const all = (await get(anon, '/v1/public/sessions?limit=50')).data.items.filter((s) => s.name.startsWith('PUB '));
    expect(all.map((s) => s.name).sort()).toEqual(['PUB giao lưu đang mở', 'PUB giao lưu đã đóng']);
    const open = (await get(anon, '/v1/public/sessions?status=open')).data.items.filter((s) => s.name.startsWith('PUB '));
    expect(open.map((s) => s.status)).toEqual(['open']);
    expect(open[0]).toMatchObject({ courtCount: 2, players: { present: 6 }, format: 'doubles' });
    const closed = (await get(anon, '/v1/public/sessions?status=closed')).data.items.filter((s) => s.name.startsWith('PUB '));
    expect(closed.map((s) => s.name)).toEqual(['PUB giao lưu đã đóng']);
    for (const bad of ['status=cancelled', 'status=open,cancelled']) expect((await anon.get(`/v1/public/sessions?${bad}`)).status).toBe(400);
  });

  test('không rò trường nội bộ của buổi (courtRefs, seed, createdByRef)', async () => {
    const item = (await get(anon, '/v1/public/sessions?status=open')).data.items.find((s) => s.name === 'PUB giao lưu đang mở');
    expect(Object.keys(item).sort()).toEqual(['closedAt', 'courtCount', 'format', 'id', 'mode', 'name', 'organizerRef', 'players', 'rated', 'rounds', 'scoring', 'signup', 'startsAt', 'status']);
    const text = JSON.stringify(await get(anon, `/v1/public/sessions/${S.open.id}`));
    for (const leak of ['courtRefs', '"seed"', 'createdByRef', '"version"', 'bd:user']) expect(text).not.toContain(leak);
  });

  test('chi tiết: số người có mặt, số trận; huỷ / cũ / không tồn tại → 404 ở mọi route', async () => {
    const d = (await get(anon, `/v1/public/sessions/${S.open.id}`)).data;
    expect(d).toMatchObject({ status: 'open', players: { present: 6 }, matches: { total: 1, inPlay: 1, completed: 0, ended: 0 } });
    for (const id of [S.cancelled.id, S.old.id, '00000000-0000-4000-8000-000000000000']) {
      for (const sub of ['', '/board']) {
        const res = await anon.get(`/v1/public/sessions/${id}${sub}`);
        expect([res.status, res.body.code]).toEqual([404, 'NOT_FOUND']);
      }
    }
    expect((await anon.get(`/v1/public/sessions/${S.closed.id}`)).status).toBe(200);
  });

  test('bảng sân: sân đang đánh, hàng chờ, người sắp vào sân — tên theo quyền riêng tư', async () => {
    const board = (await get(anon, `/v1/public/sessions/${S.open.id}/board`)).data;
    expect(board.courts).toHaveLength(2);
    const busy = board.courts.filter((c) => c.status === 'busy');
    expect(busy).toHaveLength(1);
    const players = [...busy[0].match.teamA.players, ...busy[0].match.teamB.players];
    expect(players).toHaveLength(4);
    expect(players.some((p) => p.masked)).toBe(true);
    expect(board.queue.length).toBe(2);
    expect(board.queue.every((q) => q.player && typeof q.player.name === 'string' && !('playerId' in q))).toBe(true);
    expect(board.counts).toEqual({ present: 6, onCourt: 4, waiting: 2 });
    const text = JSON.stringify(board);
    expect(text).not.toContain('Nguyễn Văn Số'); // tên đầy đủ không lộ cho người chưa đăng nhập
    // Người đang có mặt trong buổi thấy tên đầy đủ của mọi người.
    const insider = await asCustomer(P.session[0]);
    const full = (await get(insider, `/v1/public/sessions/${S.open.id}/board`)).data;
    expect(JSON.stringify(full)).toContain('Nguyễn Văn Số');
    expect(JSON.stringify(full)).not.toContain('Thành viên');
  });

  test('buổi đã đóng: không còn hàng chờ, không ai sắp vào sân', async () => {
    const board = (await get(anon, `/v1/public/sessions/${S.closed.id}/board`)).data;
    expect([board.session.status, board.queue, board.upcoming]).toEqual(['closed', [], []]);
  });
});

// ---------- SSE ----------
const openStream = (path, token) =>
  new Promise((resolve, reject) => {
    const headers = { Accept: 'text/event-stream' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const req = http.get({ host: '127.0.0.1', port, path, headers }, (res) => {
      const s = { status: res.statusCode, headers: res.headers, events: [], body: '' };
      let buf = '';
      const waiters = new Set();
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        if (res.statusCode !== 200) {
          s.body += chunk;
          return;
        }
        buf += chunk;
        for (let i = buf.indexOf('\n\n'); i >= 0; i = buf.indexOf('\n\n')) {
          const frame = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = { event: null, data: null };
          for (const line of frame.split('\n')) {
            if (line.startsWith('event: ')) ev.event = line.slice(7);
            else if (line.startsWith('data: ')) ev.data = JSON.parse(line.slice(6));
          }
          if (ev.event) s.events.push(ev);
        }
        waiters.forEach((w) => w());
      });
      s.waitFor = (pred, timeoutMs = 5000) =>
        new Promise((ok, fail) => {
          const check = () => {
            const hit = s.events.find(pred);
            if (hit) {
              waiters.delete(check);
              clearTimeout(timer);
              ok(hit);
            }
          };
          const timer = setTimeout(() => {
            waiters.delete(check);
            fail(new Error(`Không thấy sự kiện; đã nhận: ${s.events.map((e) => e.event).join(', ')}`));
          }, timeoutMs);
          waiters.add(check);
          check();
        });
      s.close = () => req.destroy();
      resolve(s);
      res.on('error', () => {});
    });
    req.on('error', reject);
  });

describe('luồng SSE công khai', () => {
  test('người chưa đăng nhập mở luồng của giải đang chạy: 200 text/event-stream, có snapshot và ping', async () => {
    const token = await ctx.token({ scope: `ranking:read ${PUBLIC}`, sub: 'anonymous', org: [], ttl: 120 });
    const s = await openStream(`/v1/public/tournaments/${T.drawn.id}/stream`, token);
    expect(s.status).toBe(200);
    expect(s.headers['content-type']).toMatch(/^text\/event-stream/);
    const snap = await s.waitFor((e) => e.event === 'snapshot');
    expect(snap.data).toMatchObject({ matches: [] });
    await s.waitFor((e) => e.event === 'ping');
    // Nhân viên vừa gọi một trận ra sân → luồng công khai nhận `board` để tải lại.
    const first = (await staffMatches(T.drawn.id)).find((m) => m.status === 'scheduled');
    // Sân dùng chung giữa giải và buổi giao lưu (c1 / c2 đang bận ở buổi) → gọi ra sân khác.
    const called = await op.post(`/v1/matches/${first.id}/call`).send({ courtRef: 'c9' });
    expect([called.status, called.body.code]).toEqual([200, undefined]);
    await s.waitFor((e) => e.event === 'board');
    s.close();
  });

  test('luồng của buổi giao lưu đang mở; giải nháp / buổi huỷ / không token / thiếu scope bị từ chối', async () => {
    const token = await ctx.token({ scope: `ranking:read ${PUBLIC}`, sub: 'anonymous', org: [], ttl: 120 });
    const s = await openStream(`/v1/public/sessions/${S.open.id}/stream`, token);
    expect(s.status).toBe(200);
    await s.waitFor((e) => e.event === 'snapshot');
    s.close();
    const draft = await openStream(`/v1/public/tournaments/${T.draft.id}/stream`, token);
    expect(draft.status).toBe(404);
    const cancelled = await openStream(`/v1/public/sessions/${S.cancelled.id}/stream`, token);
    expect(cancelled.status).toBe(404);
    expect((await openStream(`/v1/public/tournaments/${T.drawn.id}/stream`, null)).status).toBe(401);
    expect((await openStream(`/v1/public/tournaments/${T.drawn.id}/stream`, await ctx.token({ scope: 'ranking:read', sub: 'anonymous', org: [] }))).status).toBe(403);
  });
});
