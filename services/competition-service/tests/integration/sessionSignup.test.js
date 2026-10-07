const { createTestContext, STAFF, MANAGER } = require('./helpers');

// Khách ĐĂNG KÝ buổi giao lưu online (plan 27, slice p2) bằng service thật + MySQL thật: báo trước "tôi sẽ đến", sức chứa tính theo
// "đã đăng ký giữ chỗ ∪ đang có mặt", danh sách chờ, nhân viên điểm danh → "đã đến", huỷ / rời buổi / tăng sức chứa nhường chỗ,
// nhân viên gỡ đăng ký, tên theo quyền riêng tư, đăng ký đồng thời, gộp hồ sơ.
jest.setTimeout(300000);

const SESSION = 'session:read session:operate';
const PUBLIC = 'public:read';
let ctx;
let manager;
let op;
let otherBranch;
let anon;

beforeAll(async () => {
  ctx = await createTestContext();
  manager = await ctx.as({ scope: `${MANAGER} ${SESSION} ${PUBLIC}`, sub: 'bd:user:mgr', org: ['bd:branch:1'] });
  op = await ctx.as({ scope: `${STAFF} ${SESSION} ${PUBLIC}`, sub: 'bd:user:op', org: ['bd:branch:1'] });
  otherBranch = await ctx.as({ scope: `${STAFF} ${SESSION} ${PUBLIC}`, sub: 'bd:user:other', org: ['bd:branch:2'] });
  anon = await ctx.as({ scope: `ranking:read ${PUBLIC}`, sub: 'anonymous', org: [] });
});
afterAll(() => ctx.close());

let seq = 0;
const newPlayer = async ({ name, rating = 3, gender = 'male', visibility, nickname } = {}) => {
  seq += 1;
  const ref = `bd:customer:sgn${seq}`;
  const displayName = name || `Nguyễn Văn Giao${seq}`;
  const id = (await manager.put(`/v1/players/by-ref/${ref}`).send({ displayName })).body.data.id;
  expect((await manager.patch(`/v1/players/${id}`).send({ gender, ...(visibility ? { visibility } : {}), ...(nickname ? { nickname } : {}) })).status).toBe(200);
  if (rating !== null) {
    for (const discipline of ['doubles', 'singles']) {
      expect((await manager.post(`/v1/players/${id}/rating-adjustments`).send({ discipline, newRating: rating, reason: 'Dữ liệu test đăng ký buổi' })).status).toBe(201);
    }
  }
  return { id, ref, displayName, sub: `bd:user:${ref}` };
};
const SCOPE_CUSTOMER = `rating:self ranking:read match:score ${PUBLIC} entry:self`;
const customer = async (opts) => {
  const p = await newPlayer(opts);
  p.api = await ctx.as({ scope: SCOPE_CUSTOMER, sub: p.sub, org: [], player: p.ref, name: p.displayName });
  return p;
};

const makeSession = async (over = {}) => {
  seq += 1;
  const res = await op.post('/v1/sessions').send({ organizerRef: 'bd:branch:1', name: `Giao lưu đăng ký ${seq}`, courtRefs: [`sg${seq}a`, `sg${seq}b`], ...over });
  expect(res.status).toBe(201);
  return res.body.data;
};
const signUp = (who, sid) => who.api.post(`/v1/me/sessions/${sid}/signup`).send();
const cancel = (who, sid) => who.api.delete(`/v1/me/sessions/${sid}/signup`);
const detail = async (client, sid) => (await client.get(`/v1/public/sessions/${sid}`)).body.data;
const staffSignups = async (sid) => (await op.get(`/v1/sessions/${sid}/signups`)).body.data.items;
const checkIn = (sid, p, body = {}) => op.post(`/v1/sessions/${sid}/players`).send({ playerId: p.id, ...body });
const leave = (sid, p) => op.delete(`/v1/sessions/${sid}/players/${p.id}`);

describe('quyền', () => {
  test('thiếu entry:self → 403 (người chưa đăng nhập, nhân viên, token chỉ xem); nhân viên vẫn xem được danh sách của mình', async () => {
    const s = await makeSession();
    const viewOnly = await ctx.as({ scope: `rating:self ranking:read match:score ${PUBLIC}`, sub: 'bd:user:x', org: [], player: 'bd:customer:x', name: 'X' });
    for (const client of [anon, op, manager, viewOnly]) {
      for (const call of [() => client.post(`/v1/me/sessions/${s.id}/signup`).send(), () => client.delete(`/v1/me/sessions/${s.id}/signup`), () => client.get('/v1/me/sessions')]) {
        const res = await call();
        expect([res.status, res.body.code]).toEqual([403, 'FORBIDDEN_SCOPE']);
      }
    }
    expect((await op.get(`/v1/sessions/${s.id}/signups`)).status).toBe(200);
    expect((await anon.get(`/v1/sessions/${s.id}/signups`)).status).toBe(403); // route nhân viên cần session:read
    expect((await otherBranch.get(`/v1/sessions/${s.id}/signups`)).status).toBe(404); // buổi của chi nhánh khác
  });

  test('có entry:self nhưng token không gắn người chơi → 422 PLAYER_CLAIM_REQUIRED', async () => {
    const s = await makeSession();
    const res = await (await ctx.as({ scope: SCOPE_CUSTOMER, sub: 'bd:user:orphan', org: [] })).post(`/v1/me/sessions/${s.id}/signup`).send();
    expect([res.status, res.body.code]).toEqual([422, 'PLAYER_CLAIM_REQUIRED']);
  });
});

describe('sức chứa của buổi (nhân viên đặt khi tạo / sửa)', () => {
  test('tạo buổi có maxPlayers; không đặt thì null; ngoài khoảng 2–200 → 400', async () => {
    expect((await makeSession({ maxPlayers: 12 })).maxPlayers).toBe(12);
    expect((await makeSession()).maxPlayers).toBeNull();
    for (const bad of [1, 0, -3, 201, 2.5, 'nhiều']) {
      const res = await op.post('/v1/sessions').send({ organizerRef: 'bd:branch:1', name: 'Sai sức chứa', courtRefs: ['x1'], maxPlayers: bad });
      expect([JSON.stringify(bad), res.status]).toEqual([JSON.stringify(bad), 400]);
    }
  });

  test('sửa sức chứa bằng PATCH (If-Match); chi tiết công khai báo sức chứa và chỗ còn', async () => {
    const s = await makeSession({ maxPlayers: 4 });
    const patched = await op.patch(`/v1/sessions/${s.id}`).set('If-Match', `"${s.version}"`).send({ maxPlayers: 6 });
    expect(patched.status).toBe(200);
    expect(patched.body.data.maxPlayers).toBe(6);
    expect((await detail(anon, s.id)).signup).toEqual({ open: true, maxPlayers: 6, registered: 0, waitlisted: 0, spotsLeft: 6 });
    const cleared = await op.patch(`/v1/sessions/${s.id}`).set('If-Match', `"${patched.body.data.version}"`).send({ maxPlayers: null });
    expect(cleared.body.data.maxPlayers).toBeNull();
    expect((await detail(anon, s.id)).signup).toEqual({ open: true, maxPlayers: null, registered: 0, waitlisted: 0, spotsLeft: null });
  });
});

describe('đăng ký, hết chỗ → danh sách chờ, huỷ nhường chỗ', () => {
  let s;
  const p = {};
  beforeAll(async () => {
    s = await makeSession({ maxPlayers: 2 });
    for (const k of ['a', 'b', 'c', 'd']) p[k] = await customer({ visibility: k === 'a' ? 'public' : undefined, nickname: k === 'a' ? 'An Cầu Lông' : undefined });
  });

  test('đăng ký → 201: chi tiết buổi kèm `signup` (chỗ) và `me` (giữ chỗ, huỷ được); người chưa có điểm cũng đăng ký được', async () => {
    const unrated = await customer({ rating: null });
    const res = await signUp(unrated, s.id);
    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Đã đăng ký');
    expect(res.body.data.signup).toEqual({ open: true, maxPlayers: 2, registered: 1, waitlisted: 0, spotsLeft: 1 });
    expect(res.body.data.me).toEqual({ status: 'registered', waitlistPosition: null, canCancel: true });
    expect((await cancel(unrated, s.id)).status).toBe(200); // trả chỗ cho các bước sau
  });

  test('đăng ký lần nữa → 409 ALREADY_SIGNED_UP; người thứ hai đủ chỗ; thứ ba, thứ tư vào danh sách chờ theo thứ tự', async () => {
    expect((await signUp(p.a, s.id)).status).toBe(201);
    const again = await signUp(p.a, s.id);
    expect([again.status, again.body.code]).toEqual([409, 'ALREADY_SIGNED_UP']);
    expect((await signUp(p.b, s.id)).body.data.signup).toMatchObject({ registered: 2, waitlisted: 0, spotsLeft: 0 });
    const c = await signUp(p.c, s.id);
    expect(c.status).toBe(201);
    expect(c.body.data.me).toEqual({ status: 'waitlisted', waitlistPosition: 1, canCancel: true });
    const d = await signUp(p.d, s.id);
    expect(d.body.data.me).toMatchObject({ status: 'waitlisted', waitlistPosition: 2 });
    expect(d.body.data.signup).toMatchObject({ registered: 2, waitlisted: 2, spotsLeft: 0 });
  });

  test('`me` chỉ có với khách đăng nhập có hồ sơ: chưa đăng nhập / nhân viên không có khoá me; người chưa đăng ký → me = null', async () => {
    expect('me' in (await detail(anon, s.id))).toBe(false);
    expect('me' in (await detail(op, s.id))).toBe(false);
    expect((await detail((await customer()).api, s.id)).me).toBeNull();
    expect((await detail(p.c.api, s.id)).me).toMatchObject({ status: 'waitlisted', waitlistPosition: 1 });
  });

  test('ai đã đăng ký: người chưa đăng nhập thấy tên theo quyền riêng tư; người đã đăng ký thấy tên đầy đủ của nhau; mine đúng', async () => {
    const asAnon = (await anon.get(`/v1/public/sessions/${s.id}/signups`)).body.data.items;
    expect(asAnon.map((i) => [i.status, i.waitlistPosition])).toEqual([['registered', null], ['registered', null], ['waitlisted', 1], ['waitlisted', 2]]);
    expect(asAnon[0].player).toEqual({ id: p.a.id, name: 'An Cầu Lông', masked: false }); // hồ sơ public → tên thi đấu
    for (const row of asAnon.slice(1)) expect(row.player).toMatchObject({ id: null, masked: true });
    expect(asAnon.every((i) => i.mine === false)).toBe(true);
    const asMember = (await p.c.api.get(`/v1/public/sessions/${s.id}/signups`)).body.data.items;
    expect(asMember.map((i) => i.player.name)).toEqual([p.a, p.b, p.c, p.d].map((x) => x.displayName));
    expect(asMember.map((i) => i.mine)).toEqual([false, false, true, false]);
    const text = JSON.stringify(asAnon);
    expect(text).not.toContain('bd:customer');
    expect(text).not.toContain(p.b.displayName);
  });

  test('huỷ: người giữ chỗ huỷ → người chờ đầu tiên được lên giữ chỗ, người sau dịch lên; huỷ xong me = null', async () => {
    const res = await cancel(p.a, s.id);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Đã huỷ đăng ký');
    expect(res.body.data.me).toBeNull();
    expect(res.body.data.signup).toMatchObject({ registered: 2, waitlisted: 1 });
    expect((await detail(p.c.api, s.id)).me).toEqual({ status: 'registered', waitlistPosition: null, canCancel: true });
    expect((await detail(p.d.api, s.id)).me).toMatchObject({ status: 'waitlisted', waitlistPosition: 1 });
  });

  test('huỷ khi chưa đăng ký / đã huỷ → 404 NOT_SIGNED_UP; đăng ký lại sau khi huỷ được, xếp cuối hàng chờ', async () => {
    for (const who of [await customer(), p.a]) {
      const res = await cancel(who, s.id);
      expect([res.status, res.body.code]).toEqual([404, 'NOT_SIGNED_UP']);
    }
    const back = await signUp(p.a, s.id);
    expect(back.status).toBe(201);
    expect(back.body.data.me).toMatchObject({ status: 'waitlisted', waitlistPosition: 2 });
  });

  // Chốt thẳng vào schema, vì test ngay trên chỉ bắt được lỗi khi hai lượt đăng ký
  // tình cờ rơi vào cùng một mốc thời gian — nó xanh ở máy chậm và đỏ trên CI nhanh.
  //
  // Thứ tự chờ sắp theo `(signed_up_at, id)`, mà `uq_signup_session_player` buộc người
  // đăng ký lại phải dùng lại hàng cũ nên `id` của họ nhỏ hơn người đang chờ. Nếu cột
  // chỉ tới giây, hai lượt cùng giây sẽ rơi vào tiebreak `id` và đẩy người đăng ký lại
  // lên đầu hàng chờ — trái quy tắc "đăng ký lại thì xếp cuối".
  test('signed_up_at giữ mili-giây — khoá xếp hàng chờ không được chỉ tới giây', async () => {
    const [rows] = await ctx.sequelize.query("SHOW COLUMNS FROM session_signups LIKE 'signed_up_at'");
    expect(rows[0].Type).toBe('datetime(3)');
  });

  test('buổi đã huỷ / không tồn tại → 404; buổi đã đóng → 409 SESSION_CLOSED (đăng ký và huỷ)', async () => {
    const closed = await makeSession();
    const cancelled = await makeSession();
    const who = await customer();
    expect((await signUp(who, closed.id)).status).toBe(201);
    expect((await op.post(`/v1/sessions/${closed.id}/close`).send()).status).toBe(200);
    expect((await op.post(`/v1/sessions/${cancelled.id}/cancel`).send()).status).toBe(200);
    for (const id of [cancelled.id, '00000000-0000-4000-8000-000000000000']) {
      const res = await signUp(who, id);
      expect([id, res.status, res.body.code]).toEqual([id, 404, 'NOT_FOUND']);
    }
    const lateSignUp = await signUp(await customer(), closed.id);
    expect([lateSignUp.status, lateSignUp.body.code]).toEqual([409, 'SESSION_CLOSED']);
    const lateCancel = await cancel(who, closed.id);
    expect([lateCancel.status, lateCancel.body.code]).toEqual([409, 'SESSION_CLOSED']);
  });

  test('bấm đăng ký hai lần cùng Idempotency-Key → một lần duy nhất, lần hai trả lại đúng kết quả cũ', async () => {
    const t = await makeSession({ maxPlayers: 5 });
    const who = await customer();
    const first = await who.api.post(`/v1/me/sessions/${t.id}/signup`, { key: 'idem-signup-0001' }).send();
    const second = await who.api.post(`/v1/me/sessions/${t.id}/signup`, { key: 'idem-signup-0001' }).send();
    expect([first.status, second.status]).toEqual([201, 201]);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.body.data.signup.registered).toBe(1);
    expect(await ctx.models.SessionSignup.count({ where: { sessionId: t.id, status: 'registered' } })).toBe(1);
  });

  test('đăng ký đồng thời vượt sức chứa: đúng sức chứa được giữ chỗ, còn lại vào danh sách chờ — không vượt chỗ', async () => {
    const t = await makeSession({ maxPlayers: 3 });
    const six = [];
    for (let i = 0; i < 6; i += 1) six.push(await customer()); // dựng tuần tự, chỉ việc đăng ký chạy đồng thời
    const results = await Promise.all(six.map((who) => signUp(who, t.id)));
    expect(results.map((r) => [r.status, r.body.code])).toEqual(Array(6).fill([201, undefined]));
    const rows = await staffSignups(t.id);
    expect([rows.filter((r) => r.status === 'registered').length, rows.filter((r) => r.status === 'waitlisted').length]).toEqual([3, 3]);
    expect(rows.filter((r) => r.status === 'waitlisted').map((r) => r.waitlistPosition)).toEqual([1, 2, 3]);
  });
});

describe('điểm danh tại quầy ↔ đăng ký online', () => {
  test('nhân viên điểm danh người đã đăng ký → đăng ký thành "đã đến"; không huỷ được nữa; chỗ vẫn tính (đang có mặt)', async () => {
    const s = await makeSession({ maxPlayers: 2 });
    const a = await customer();
    const b = await customer();
    const c = await customer();
    await signUp(a, s.id);
    await signUp(b, s.id);
    expect((await signUp(c, s.id)).body.data.me.status).toBe('waitlisted');
    expect((await checkIn(s.id, a)).status).toBe(201);
    const rows = await staffSignups(s.id);
    expect(rows.find((r) => r.playerId === a.id)).toMatchObject({ status: 'attended', present: true });
    expect(rows.find((r) => r.playerId === b.id)).toMatchObject({ status: 'registered', present: false });
    expect((await detail(a.api, s.id)).me).toEqual({ status: 'attended', waitlistPosition: null, canCancel: false });
    expect((await cancel(a, s.id)).body.code).toBe('NOT_SIGNED_UP');
    // Chỗ vẫn đủ 2 (a có mặt + b giữ chỗ) → c vẫn chờ.
    expect((await detail(c.api, s.id)).me).toMatchObject({ status: 'waitlisted', waitlistPosition: 1 });
    expect((await detail(anon, s.id)).signup).toEqual({ open: true, maxPlayers: 2, registered: 1, waitlisted: 1, spotsLeft: 0 });
    // Đã đến mà đăng ký lại → 409 (đang có mặt).
    const dup = await signUp(a, s.id);
    expect([dup.status, dup.body.code]).toEqual([409, 'ALREADY_PRESENT']);
  });

  test('người đang có mặt rời buổi → nhường chỗ cho người chờ đăng ký online', async () => {
    const s = await makeSession({ maxPlayers: 2 });
    const [a, b, c] = [await customer(), await customer(), await customer()];
    await signUp(a, s.id);
    await signUp(b, s.id);
    await signUp(c, s.id);
    await checkIn(s.id, a);
    await checkIn(s.id, b);
    expect((await detail(c.api, s.id)).me.status).toBe('waitlisted');
    expect((await leave(s.id, a)).status).toBe(200);
    expect((await detail(c.api, s.id)).me).toEqual({ status: 'registered', waitlistPosition: null, canCancel: true });
  });

  test('khách vãng lai (không đăng ký) được điểm danh vượt sức chứa — chiếm chỗ, người đăng ký sau phải chờ; người chờ được nhân viên điểm danh thì thành "đã đến"', async () => {
    const s = await makeSession({ maxPlayers: 2 });
    const [a, b, walkIn, late] = [await customer(), await customer(), await newPlayer(), await customer()];
    await signUp(a, s.id);
    await signUp(b, s.id);
    expect((await checkIn(s.id, walkIn)).status).toBe(201); // nhân viên quyết, không bị chặn bởi sức chứa
    expect((await detail(anon, s.id)).signup).toMatchObject({ registered: 2, spotsLeft: 0 });
    expect((await signUp(late, s.id)).body.data.me).toMatchObject({ status: 'waitlisted', waitlistPosition: 1 });
    expect((await checkIn(s.id, late)).status).toBe(201); // người đang chờ được điểm danh
    expect((await detail(late.api, s.id)).me).toMatchObject({ status: 'attended', canCancel: false });
    expect((await staffSignups(s.id)).find((r) => r.playerId === late.id)).toMatchObject({ status: 'attended', present: true });
  });

  test('người chưa có điểm đã đăng ký: nhân viên thấy rating null → điểm danh phải kèm quickLevel (luồng cũ giữ nguyên)', async () => {
    const s = await makeSession();
    const unrated = await customer({ rating: null });
    await signUp(unrated, s.id);
    const row = (await staffSignups(s.id)).find((r) => r.playerId === unrated.id);
    expect(row.rating).toBeNull();
    const noLevel = await checkIn(s.id, unrated);
    expect([noLevel.status, noLevel.body.code]).toEqual([422, 'NEEDS_ASSESSMENT']);
    expect((await checkIn(s.id, unrated, { quickLevel: 'tb' })).status).toBe(201);
    expect((await staffSignups(s.id))[0]).toMatchObject({ status: 'attended', present: true, rating: 3.25 });
  });

  test('tăng / bỏ sức chứa → người chờ lên giữ chỗ đúng thứ tự', async () => {
    const s = await makeSession({ maxPlayers: 2 });
    const people = [];
    for (let i = 0; i < 5; i += 1) {
      const who = await customer();
      people.push(who);
      await signUp(who, s.id);
    }
    expect((await detail(anon, s.id)).signup).toMatchObject({ registered: 2, waitlisted: 3 });
    const bigger = await op.patch(`/v1/sessions/${s.id}`).set('If-Match', `"${s.version}"`).send({ maxPlayers: 3 });
    expect(bigger.status).toBe(200);
    expect((await detail(people[2].api, s.id)).me.status).toBe('registered'); // người chờ đầu tiên lên
    expect((await detail(people[3].api, s.id)).me).toMatchObject({ status: 'waitlisted', waitlistPosition: 1 });
    const unlimited = await op.patch(`/v1/sessions/${s.id}`).set('If-Match', `"${bigger.body.data.version}"`).send({ maxPlayers: null });
    expect(unlimited.status).toBe(200);
    expect((await detail(anon, s.id)).signup).toEqual({ open: true, maxPlayers: null, registered: 5, waitlisted: 0, spotsLeft: null });
  });
});

describe('nhân viên: danh sách + gỡ đăng ký', () => {
  test('danh sách đủ cột (tên, giới tính, trạng thái, đã có mặt, điểm, cờ); thứ tự đăng ký; chi tiết buổi có số đăng ký', async () => {
    const s = await makeSession({ maxPlayers: 2 });
    const a = await customer({ name: 'Trần Thị Mai', gender: 'female', rating: 3.4 });
    const b = await customer({ name: 'Lê Văn Bình' });
    const c = await customer({ name: 'Phạm Văn Chờ' });
    for (const who of [a, b, c]) await signUp(who, s.id);
    const rows = await staffSignups(s.id);
    expect(rows.map((r) => [r.name, r.gender, r.status, r.waitlistPosition, r.present])).toEqual([
      ['Trần Thị Mai', 'female', 'registered', null, false],
      ['Lê Văn Bình', 'male', 'registered', null, false],
      ['Phạm Văn Chờ', 'male', 'waitlisted', 1, false]
    ]);
    expect(rows[0].rating).toBe(3.4);
    expect(Object.keys(rows[0]).sort()).toEqual(['flags', 'gender', 'id', 'name', 'playerId', 'present', 'rating', 'signedUpAt', 'status', 'waitlistPosition']);
    const staffDetail = (await op.get(`/v1/sessions/${s.id}`)).body.data;
    expect(staffDetail).toMatchObject({ maxPlayers: 2, progress: { signups: { registered: 2, waitlisted: 1 } } });
  });

  test('nhân viên gỡ một đăng ký → người chờ được lên; gỡ lại → 409; không có → 404; chi nhánh khác → 404; khách không gỡ được → 403', async () => {
    const s = await makeSession({ maxPlayers: 2 });
    const a = await customer();
    const b = await customer();
    const c = await customer();
    await signUp(a, s.id);
    await signUp(b, s.id);
    await signUp(c, s.id); // chờ
    const rows = await staffSignups(s.id);
    const target = rows.find((r) => r.playerId === a.id);
    expect((await a.api.delete(`/v1/sessions/${s.id}/signups/${target.id}`)).status).toBe(403);
    expect((await otherBranch.delete(`/v1/sessions/${s.id}/signups/${target.id}`)).status).toBe(404);
    const removed = await op.delete(`/v1/sessions/${s.id}/signups/${target.id}`);
    expect(removed.status).toBe(200);
    expect(removed.body.message).toBe('Đã gỡ đăng ký');
    expect(removed.body.data.items.map((r) => [r.playerId, r.status])).toEqual([[b.id, 'registered'], [c.id, 'registered']]); // người chờ đã lên
    expect((await detail(a.api, s.id)).me).toBeNull();
    expect((await op.delete(`/v1/sessions/${s.id}/signups/${target.id}`)).status).toBe(409);
    expect((await op.delete(`/v1/sessions/${s.id}/signups/00000000-0000-4000-8000-000000000000`)).status).toBe(404);
  });

  test('buổi đã đóng: nhân viên không gỡ được (409 SESSION_CLOSED)', async () => {
    const s = await makeSession();
    const a = await customer();
    await signUp(a, s.id);
    const id = (await staffSignups(s.id))[0].id;
    expect((await op.post(`/v1/sessions/${s.id}/close`).send()).status).toBe(200);
    const res = await op.delete(`/v1/sessions/${s.id}/signups/${id}`);
    expect([res.status, res.body.code]).toEqual([409, 'SESSION_CLOSED']);
  });
});

describe('"Buổi của tôi" và danh sách công khai', () => {
  test('GET /me/sessions: các buổi đang mở đã đăng ký (giữ chỗ / chờ), theo giờ bắt đầu; buổi đóng / đã đến / đã huỷ đăng ký không có', async () => {
    const who = await customer();
    const now = Date.now();
    const later = await makeSession({ name: 'Buổi muộn', startsAt: new Date(now + 3 * 86400000).toISOString() });
    const sooner = await makeSession({ name: 'Buổi sớm', startsAt: new Date(now + 86400000).toISOString(), maxPlayers: 2 });
    const closed = await makeSession({ name: 'Buổi đóng' });
    const attended = await makeSession({ name: 'Buổi đã đến' });
    const dropped = await makeSession({ name: 'Buổi bỏ' });
    for (const s of [later, sooner, closed, attended, dropped]) expect((await signUp(who, s.id)).status).toBe(201);
    expect((await op.post(`/v1/sessions/${closed.id}/close`).send()).status).toBe(200);
    expect((await checkIn(attended.id, who)).status).toBe(201);
    expect((await cancel(who, dropped.id)).status).toBe(200);
    const items = (await who.api.get('/v1/me/sessions')).body.data.items;
    expect(items.map((i) => i.session.name)).toEqual(['Buổi sớm', 'Buổi muộn']);
    expect(items[0]).toMatchObject({ signup: { status: 'registered', waitlistPosition: null }, session: { signup: { maxPlayers: 2, registered: 1 } } });
    expect((await (await customer()).api.get('/v1/me/sessions')).body.data.items).toEqual([]);
  });

  test('danh sách buổi công khai có số chỗ đăng ký; trường nội bộ vẫn không lộ', async () => {
    const s = await makeSession({ name: 'PUBS danh sách', maxPlayers: 3 });
    await signUp(await customer(), s.id);
    await signUp(await customer(), s.id);
    const item = (await anon.get('/v1/public/sessions?status=open&limit=100')).body.data.items.find((x) => x.name === 'PUBS danh sách');
    expect(item.signup).toEqual({ open: true, maxPlayers: 3, registered: 2, waitlisted: 0, spotsLeft: 1 });
    expect(Object.keys(item).sort()).toEqual(['closedAt', 'courtCount', 'format', 'id', 'mode', 'name', 'organizerRef', 'players', 'rated', 'rounds', 'scoring', 'signup', 'startsAt', 'status']);
    expect(JSON.stringify(item)).not.toMatch(/courtRefs|createdByRef|"seed"|"version"/);
  });
});

describe('gộp hồ sơ giữ đăng ký online', () => {
  test('hồ sơ nguồn có đăng ký ở hai buổi: buổi chỉ nguồn đăng ký → chuyển sang đích; buổi cả hai cùng đăng ký → giữ bản "đi xa" hơn; không còn đăng ký ở hồ sơ nguồn', async () => {
    const target = await newPlayer();
    const source = await newPlayer();
    const onlySource = await makeSession();
    const both = await makeSession();
    const targetApi = await ctx.as({ scope: SCOPE_CUSTOMER, sub: target.sub, org: [], player: target.ref, name: target.displayName });
    const sourceApi = await ctx.as({ scope: SCOPE_CUSTOMER, sub: source.sub, org: [], player: source.ref, name: source.displayName });
    expect((await sourceApi.post(`/v1/me/sessions/${onlySource.id}/signup`).send()).status).toBe(201);
    // Buổi "both": đích đã đăng ký rồi bị nhân viên điểm danh (attended); nguồn chỉ giữ chỗ → sau gộp đích vẫn "đã đến".
    expect((await targetApi.post(`/v1/me/sessions/${both.id}/signup`).send()).status).toBe(201);
    expect((await sourceApi.post(`/v1/me/sessions/${both.id}/signup`).send()).status).toBe(201);
    expect((await checkIn(both.id, target)).status).toBe(201);
    const merged = await manager.post(`/v1/players/${target.id}/merge`).send({ sourcePlayerId: source.id });
    expect(merged.status).toBe(200);
    const rows = await ctx.models.SessionSignup.findAll({ where: { sessionId: [onlySource.id, both.id] } });
    expect(rows.every((r) => r.playerId === target.id)).toBe(true);
    expect(Object.fromEntries(rows.map((r) => [r.sessionId, r.status]))).toEqual({ [onlySource.id]: 'registered', [both.id]: 'attended' });
    expect(await ctx.models.SessionSignup.count({ where: { playerId: source.id } })).toBe(0);
  });
});
