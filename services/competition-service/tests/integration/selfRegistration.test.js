const { createTestContext, STAFF, MANAGER } = require('./helpers');

// Khách TỰ ĐĂNG KÝ giải trên trang công khai (plan 27, slice p1) bằng service thật + MySQL thật: quyền entry:self, giải đơn và giải đôi
// cặp cố định (nhận cả hai người cùng lúc), đồng đội đã có hồ sơ hoặc chưa có tài khoản (hồ sơ khách + điểm tạm), hết chỗ → danh sách
// chờ, đăng ký đồng thời, rút (nhường chỗ, khoá sau bốc thăm), tìm đồng đội theo quyền riêng tư, giới hạn hồ sơ khách mỗi ngày.
jest.setTimeout(300000);

const TOUR = 'tournament:read tournament:operate tournament:manage';
const PUBLIC = 'public:read';
let ctx;
let manager;
let op;
let anon;

beforeAll(async () => {
  ctx = await createTestContext();
  manager = await ctx.as({ scope: `${MANAGER} ${TOUR} ${PUBLIC}`, sub: 'bd:user:mgr', org: ['bd:branch:1'] });
  op = await ctx.as({ scope: `${STAFF} ${TOUR} ${PUBLIC}`, sub: 'bd:user:op', org: ['bd:branch:1'] });
  anon = await ctx.as({ scope: `ranking:read ${PUBLIC}`, sub: 'anonymous', org: [] });
});
afterAll(() => ctx.close());

let seq = 0;
// rating = null → người chơi CHƯA có điểm (chưa tự chấm trình).
const newPlayer = async ({ name, rating = 3, gender = 'male', visibility, nickname } = {}) => {
  seq += 1;
  const ref = `bd:customer:self${seq}`;
  const displayName = name || `Nguyễn Văn Khách${seq}`;
  const id = (await manager.put(`/v1/players/by-ref/${ref}`).send({ displayName })).body.data.id;
  const patch = { gender, ...(visibility ? { visibility } : {}), ...(nickname ? { nickname } : {}) };
  expect((await manager.patch(`/v1/players/${id}`).send(patch)).status).toBe(200);
  if (rating !== null) {
    for (const discipline of ['doubles', 'singles']) {
      // Dựng dữ liệu phải thành công — thiếu điểm sẽ thành NEEDS_ASSESSMENT khó hiểu ở bài test chính.
      expect((await manager.post(`/v1/players/${id}/rating-adjustments`).send({ discipline, newRating: rating, reason: 'Dữ liệu test tự đăng ký' })).status).toBe(201);
    }
  }
  return { id, ref, displayName, sub: `bd:user:${ref}` };
};
// Token khách như gateway cấp: rating:self ranking:read match:score public:read entry:self + claim player.
const SCOPE_CUSTOMER = `rating:self ranking:read match:score ${PUBLIC} entry:self`;
const asCustomer = (p, scope = SCOPE_CUSTOMER) => ctx.as({ scope, sub: p.sub, org: [], player: p.ref, name: p.displayName });
const customer = async (opts) => {
  const p = await newPlayer(opts);
  p.api = await asCustomer(p);
  return p;
};

const createTournament = async (over = {}) => {
  const res = await manager.post('/v1/tournaments').send({
    organizerRef: 'bd:branch:1', name: `Tự đăng ký ${seq}`, startsOn: '2026-12-05', tier: 'club', discipline: 'singles', genderRule: 'open',
    format: 'round_robin', scoring: '1x21', matchMinutes: 20, ...over
  });
  expect(res.status).toBe(201);
  return res.body.data;
};
const openTournament = async (over = {}) => {
  const t = await createTournament(over);
  expect((await manager.post(`/v1/tournaments/${t.id}/open`).send()).status).toBe(200);
  return t;
};
const DOUBLES = { discipline: 'doubles', pairingMode: 'fixed' };

const register = (who, tid, body) => who.api.post(`/v1/me/tournaments/${tid}/entries`).send(body || {});
const withdraw = (who, tid) => who.api.delete(`/v1/me/tournaments/${tid}/entries`);
const publicDetail = async (client, tid) => (await client.get(`/v1/public/tournaments/${tid}`)).body.data;
const staffEntries = async (tid) => (await manager.get(`/v1/tournaments/${tid}/entries`)).body.data.items;
const guestBody = (over = {}) => ({ partner: { guest: { name: 'Lê Văn Bình', phone: '0912 345 678', gender: 'male', level: 'tb', ...over } } });
const guestsByPhone = (phone) => ctx.models.Player.count({ where: { tenantId: ctx.tenant, contactPhone: phone, source: 'online_guest' } });

describe('quyền', () => {
  let t;
  beforeAll(async () => {
    t = await openTournament({ name: 'PUBQ quyền' });
  });

  test('thiếu entry:self → 403 FORBIDDEN_SCOPE (người chưa đăng nhập, nhân viên, token chỉ xem)', async () => {
    const viewOnly = await ctx.as({ scope: `rating:self ranking:read match:score ${PUBLIC}`, sub: 'bd:user:x', org: [], player: 'bd:customer:x', name: 'X' });
    for (const client of [anon, op, manager, viewOnly]) {
      for (const call of [
        () => client.post(`/v1/me/tournaments/${t.id}/entries`).send({}),
        () => client.delete(`/v1/me/tournaments/${t.id}/entries`),
        () => client.get('/v1/me/partners?search=an')
      ]) {
        const res = await call();
        expect([res.status, res.body.code]).toEqual([403, 'FORBIDDEN_SCOPE']);
      }
    }
  });

  test('có entry:self nhưng token không gắn người chơi (thiếu claim player) → 422 PLAYER_CLAIM_REQUIRED', async () => {
    const noPlayer = await ctx.as({ scope: SCOPE_CUSTOMER, sub: 'bd:user:orphan', org: [] });
    const res = await noPlayer.post(`/v1/me/tournaments/${t.id}/entries`).send({});
    expect([res.status, res.body.code]).toEqual([422, 'PLAYER_CLAIM_REQUIRED']);
  });

  test('lần đầu dùng: hồ sơ người chơi tự tạo từ claim player_name (JIT) rồi đăng ký chưa có điểm → NEEDS_ASSESSMENT', async () => {
    const fresh = { ref: 'bd:customer:jit1', sub: 'bd:user:jit1', displayName: 'Khách Mới Tinh' };
    fresh.api = await asCustomer(fresh);
    const res = await register(fresh, t.id);
    expect([res.status, res.body.code]).toEqual([422, 'NEEDS_ASSESSMENT']);
    expect(await ctx.models.Player.count({ where: { tenantId: ctx.tenant, externalRef: 'bd:customer:jit1' } })).toBe(1);
  });
});

describe('giải đơn: đăng ký, hết chỗ → danh sách chờ, rút nhường chỗ', () => {
  let t;
  const people = {};
  beforeAll(async () => {
    t = await openTournament({ name: 'PUBQ giải đơn', maxEntries: 2 });
    for (const k of ['a', 'b', 'c', 'd']) people[k] = await customer();
  });

  test('đăng ký → 201, trả chi tiết giải kèm `me` (đã đăng ký, rút được) và số chỗ cập nhật', async () => {
    const res = await register(people.a, t.id);
    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Đã đăng ký');
    expect(res.body.data.registration).toMatchObject({ open: true, needsPartner: false, registered: 1, waitlisted: 0, spotsLeft: 1 });
    expect(res.body.data.me).toMatchObject({ canWithdraw: true, entry: { status: 'registered', waitlistReason: null, waitlistPosition: null, mine: true } });
    expect(res.body.data.me.entry.players).toEqual([{ id: people.a.id, name: people.a.displayName, masked: false }]);
  });

  test('đăng ký lần nữa → 409 ALREADY_REGISTERED; đăng ký ghi nhận người tạo là chính khách', async () => {
    const res = await register(people.a, t.id);
    expect([res.status, res.body.code]).toEqual([409, 'ALREADY_REGISTERED']);
    const row = await ctx.models.TournamentEntry.findOne({ where: { tournamentId: t.id, playerId: people.a.id } });
    expect(row.registeredByRef).toBe(people.a.sub);
  });

  test('người thứ hai đủ chỗ; người thứ ba, thứ tư vào danh sách chờ theo thứ tự (hết chỗ)', async () => {
    expect((await register(people.b, t.id)).body.data.registration).toMatchObject({ registered: 2, spotsLeft: 0 });
    const c = await register(people.c, t.id);
    expect(c.status).toBe(201);
    expect(c.body.data.me.entry).toMatchObject({ status: 'waitlisted', waitlistReason: 'capacity', waitlistPosition: 1 });
    const d = await register(people.d, t.id);
    expect(d.body.data.me.entry).toMatchObject({ status: 'waitlisted', waitlistPosition: 2 });
    expect(d.body.data.registration).toMatchObject({ registered: 2, waitlisted: 2, spotsLeft: 0 });
  });

  test('chi tiết giải: chỉ khách đăng nhập có `me`; người chưa đăng ký → me = null; chưa đăng nhập / nhân viên → không có khoá me', async () => {
    const outsider = await customer();
    expect((await publicDetail(outsider.api, t.id)).me).toBeNull();
    expect((await publicDetail(people.c.api, t.id)).me.entry).toMatchObject({ status: 'waitlisted', waitlistPosition: 1 });
    expect('me' in (await publicDetail(anon, t.id))).toBe(false);
    expect('me' in (await publicDetail(op, t.id))).toBe(false);
  });

  test('rút: người chính thức rút → người chờ đầu tiên được lên chính thức, người sau dịch lên; rút xong me = null', async () => {
    const res = await withdraw(people.a, t.id);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Đã rút khỏi giải');
    expect(res.body.data.me).toBeNull();
    expect(res.body.data.registration).toMatchObject({ registered: 2, waitlisted: 1 });
    expect((await publicDetail(people.c.api, t.id)).me.entry).toMatchObject({ status: 'registered', waitlistPosition: null });
    expect((await publicDetail(people.d.api, t.id)).me.entry).toMatchObject({ status: 'waitlisted', waitlistPosition: 1 });
  });

  test('rút khi chưa đăng ký → 404 NOT_REGISTERED; rút hai lần → lần hai cũng NOT_REGISTERED', async () => {
    for (const who of [await customer(), people.a]) {
      const res = await withdraw(who, t.id);
      expect([res.status, res.body.code]).toEqual([404, 'NOT_REGISTERED']);
    }
  });

  test('đăng ký lại sau khi rút được (dòng cũ dùng lại), vào cuối danh sách chờ', async () => {
    const res = await register(people.a, t.id);
    expect(res.status).toBe(201);
    expect(res.body.data.me.entry).toMatchObject({ status: 'waitlisted', waitlistPosition: 2 });
  });

  test('truyền partner vào giải đơn → 422 PARTNER_NOT_ALLOWED', async () => {
    const who = await customer();
    const res = await register(who, t.id, { partner: { playerId: people.b.id } });
    expect([res.status, res.body.code]).toEqual([422, 'PARTNER_NOT_ALLOWED']);
  });
});

describe('điều kiện đăng ký lấy từ luật của giải (kiểm ở service, không phải ở giao diện)', () => {
  test('chưa có điểm → NEEDS_ASSESSMENT; sai giới tính → NOT_ELIGIBLE; ngoài khoảng trình → NOT_ELIGIBLE', async () => {
    const women = await openTournament({ name: 'PUBQ nữ', genderRule: 'women' });
    const unrated = await customer({ rating: null });
    const man = await customer({ gender: 'male' });
    const woman = await customer({ gender: 'female' });
    expect((await register(unrated, women.id)).body.code).toBe('NEEDS_ASSESSMENT');
    const wrongGender = await register(man, women.id);
    expect([wrongGender.status, wrongGender.body.code]).toEqual([422, 'NOT_ELIGIBLE']);
    expect(wrongGender.body.message).toMatch(/chỉ dành cho nữ/);
    expect((await register(woman, women.id)).status).toBe(201);

    const capped = await openTournament({ name: 'PUBQ trình ≤ 3', ratingRule: { scope: 'player', max: 3.0 } });
    const strong = await customer({ rating: 4.2 });
    const weak = await customer({ rating: 2.6 });
    const over = await register(strong, capped.id);
    expect([over.status, over.body.code]).toEqual([422, 'NOT_ELIGIBLE']);
    expect(over.body.message).toMatch(/vượt mức tối đa/);
    expect((await register(weak, capped.id)).status).toBe(201);
  });

  test('giải nháp / đã huỷ / không tồn tại → 404; đã bốc thăm → 409 INVALID_STATE; rút sau bốc thăm → 409 WITHDRAW_LOCKED', async () => {
    const draft = await createTournament({ name: 'PUBQ nháp' });
    const cancelled = await openTournament({ name: 'PUBQ huỷ' });
    expect((await manager.post(`/v1/tournaments/${cancelled.id}/cancel`).send()).status).toBe(200);
    const who = await customer();
    for (const id of [draft.id, cancelled.id, '00000000-0000-4000-8000-000000000000']) {
      const res = await register(who, id);
      expect([id, res.status, res.body.code]).toEqual([id, 404, 'NOT_FOUND']);
      expect((await withdraw(who, id)).status).toBe(404);
    }
    const drawn = await openTournament({ name: 'PUBQ đã bốc thăm' });
    const four = [];
    for (let i = 0; i < 4; i += 1) {
      const p = await customer({ rating: 3 + i * 0.1 });
      four.push(p);
      expect((await register(p, drawn.id)).status).toBe(201);
    }
    const preview = (await manager.post(`/v1/tournaments/${drawn.id}/draw/preview`).send({ seed: 'self' })).body.data;
    expect((await manager.post(`/v1/tournaments/${drawn.id}/draw`).send({ seed: preview.seed, teams: preview.teams.map((x) => ({ players: x.players.map((y) => y.id) })), groups: preview.groups, bracket: preview.bracket })).status).toBe(200);
    const late = await register(await customer(), drawn.id);
    expect([late.status, late.body.code]).toEqual([409, 'INVALID_STATE']);
    expect(late.body.message).toMatch(/đã bốc thăm/);
    const locked = await withdraw(four[0], drawn.id);
    expect([locked.status, locked.body.code]).toEqual([409, 'WITHDRAW_LOCKED']);
    expect(locked.body.message).toMatch(/liên hệ nhân viên/);
    expect((await publicDetail(four[0].api, drawn.id)).me).toMatchObject({ canWithdraw: false, entry: { status: 'registered' } });
  });

  test('bấm đăng ký hai lần cùng Idempotency-Key → một lần duy nhất, lần hai trả lại đúng kết quả cũ', async () => {
    const t = await openTournament({ name: 'PUBQ idempotent' });
    const who = await customer();
    const first = await who.api.post(`/v1/me/tournaments/${t.id}/entries`, { key: 'idem-self-0001' }).send({});
    const second = await who.api.post(`/v1/me/tournaments/${t.id}/entries`, { key: 'idem-self-0001' }).send({});
    expect([first.status, second.status]).toEqual([201, 201]);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.body.data.registration.registered).toBe(1);
    expect(await ctx.models.TournamentEntry.count({ where: { tournamentId: t.id, status: 'registered' } })).toBe(1);
  });

  test('đăng ký đồng thời vượt sức chứa: đúng sức chứa người được vào, còn lại vào danh sách chờ — không ai bị mất, không vượt chỗ', async () => {
    const t = await openTournament({ name: 'PUBQ đồng thời', maxEntries: 3 });
    // Dựng khách TUẦN TỰ (đây không phải thứ đang được thử); chỉ các lần đăng ký chạy đồng thời.
    const six = [];
    for (let i = 0; i < 6; i += 1) six.push(await customer());
    const results = await Promise.all(six.map((p) => register(p, t.id)));
    expect(results.map((r) => [r.status, r.body.code])).toEqual(Array(6).fill([201, undefined]));
    const counts = { registered: 0, waitlisted: 0 };
    for (const e of await staffEntries(t.id)) counts[e.status] += 1;
    expect(counts).toEqual({ registered: 3, waitlisted: 3 });
  });
});

describe('giải đôi cặp cố định: đăng ký mình + 1 đồng đội, nhận cả hai người cùng lúc', () => {
  let t;
  beforeAll(async () => {
    t = await openTournament({ ...DOUBLES, name: 'PUBQ đôi', maxEntries: 4 });
  });

  test('thiếu đồng đội → 422 PARTNER_REQUIRED; gửi cả playerId lẫn guest hoặc partner rỗng → 422 PARTNER_INVALID', async () => {
    const a = await customer();
    const b = await customer();
    const missing = await register(a, t.id);
    expect([missing.status, missing.body.code]).toEqual([422, 'PARTNER_REQUIRED']);
    const both = await register(a, t.id, { partner: { playerId: b.id, guest: guestBody().partner.guest } });
    expect([both.status, both.body.code]).toEqual([422, 'PARTNER_INVALID']);
    const empty = await register(a, t.id, { partner: {} });
    expect([empty.status, empty.body.code]).toEqual([422, 'PARTNER_INVALID']);
    expect(await ctx.models.TournamentEntry.count({ where: { tournamentId: t.id } })).toBe(0);
  });

  let pair;
  test('chọn đồng đội đã có hồ sơ → 201, CẢ HAI cùng vào danh sách; mỗi người thấy "mình" trong đơn đăng ký', async () => {
    const a = await customer({ name: 'Nguyễn Văn An', visibility: 'public', nickname: 'An Smash' });
    const b = await customer({ name: 'Trần Thị Bích', gender: 'female' });
    pair = { a, b };
    const res = await register(a, t.id, { partner: { playerId: b.id } });
    expect(res.status).toBe(201);
    expect(res.body.data.registration).toMatchObject({ needsPartner: true, registered: 2, waitlisted: 0, spotsLeft: 2 });
    expect(res.body.data.me.entry.players.map((p) => p.name).sort()).toEqual(['Nguyễn Văn An', 'Trần Thị Bích']);
    const rows = await staffEntries(t.id);
    expect(rows).toHaveLength(2);
    expect(rows.every((e) => e.status === 'registered')).toBe(true);
    expect(Object.fromEntries(rows.map((e) => [e.playerId, e.partnerPlayerId]))).toEqual({ [a.id]: b.id, [b.id]: a.id });
    // Đồng đội (không tự bấm gì) cũng thấy đăng ký này ở chi tiết giải.
    const other = await publicDetail(b.api, t.id);
    expect(other.me).toMatchObject({ canWithdraw: true, entry: { status: 'registered', mine: true } });
    // Chỉ MỘT dòng trong danh sách công khai (một cặp), tên theo quyền riêng tư với người ngoài.
    const items = (await anon.get(`/v1/public/tournaments/${t.id}/entries`)).body.data.items;
    expect(items).toHaveLength(1);
    expect(items[0].players).toHaveLength(2);
    expect(items[0].players.filter((p) => !p.masked).map((p) => p.name)).toEqual(['An Smash']);
    expect(items[0].players.filter((p) => p.masked)).toHaveLength(1);
  });

  test('đồng đội: đã đăng ký rồi → 409; là chính mình → 422; hồ sơ hidden coi như không tồn tại → 404; chưa có điểm → 422', async () => {
    const a = await customer();
    const taken = await register(a, t.id, { partner: { playerId: pair.b.id } });
    expect([taken.status, taken.body.code]).toEqual([409, 'ALREADY_REGISTERED']);
    const self = await register(a, t.id, { partner: { playerId: a.id } });
    expect([self.status, self.body.code]).toEqual([422, 'NOT_ELIGIBLE']);
    const hidden = await customer({ visibility: 'hidden' });
    const h = await register(a, t.id, { partner: { playerId: hidden.id } });
    expect([h.status, h.body.code]).toEqual([404, 'NOT_FOUND']);
    const unrated = await customer({ rating: null });
    const u = await register(a, t.id, { partner: { playerId: unrated.id } });
    expect([u.status, u.body.code]).toEqual([422, 'NEEDS_ASSESSMENT']);
    expect((await register(a, t.id, { partner: { playerId: '00000000-0000-4000-8000-000000000000' } })).status).toBe(404);
    // Không cặp nào được ghi nửa vời: vẫn chỉ cặp ban đầu.
    expect(await ctx.models.TournamentEntry.count({ where: { tournamentId: t.id } })).toBe(2);
  });

  test('đôi nam nữ: hai nam bị chặn, một nam một nữ vào được', async () => {
    const mixed = await openTournament({ ...DOUBLES, name: 'PUBQ nam nữ', genderRule: 'mixed' });
    const m1 = await customer({ gender: 'male' });
    const m2 = await customer({ gender: 'male' });
    const f1 = await customer({ gender: 'female' });
    const bad = await register(m1, mixed.id, { partner: { playerId: m2.id } });
    expect([bad.status, bad.body.code]).toEqual([422, 'NOT_ELIGIBLE']);
    expect(bad.body.message).toMatch(/1 nam \+ 1 nữ/);
    expect((await register(m1, mixed.id, { partner: { playerId: f1.id } })).status).toBe(201);
  });

  test('cặp thứ hai đủ chỗ, cặp thứ ba hết chỗ → cả hai người vào danh sách chờ, thứ tự 1; tổng chỗ tính theo người', async () => {
    const second = [await customer(), await customer()];
    expect((await register(second[0], t.id, { partner: { playerId: second[1].id } })).body.data.registration).toMatchObject({ registered: 4, spotsLeft: 0 });
    const third = [await customer(), await customer()];
    const res = await register(third[0], t.id, { partner: { playerId: third[1].id } });
    expect(res.status).toBe(201);
    expect(res.body.data.me.entry).toMatchObject({ status: 'waitlisted', waitlistReason: 'capacity', waitlistPosition: 1 });
    expect(res.body.data.registration).toMatchObject({ registered: 4, waitlisted: 2 });
    pair.third = third;
  });

  test('đồng đội (người được thêm) tự rút → CẢ CẶP rút, cặp chờ được lên chính thức', async () => {
    const res = await withdraw(pair.b, t.id);
    expect(res.status).toBe(200);
    expect(res.body.data.me).toBeNull();
    expect((await publicDetail(pair.a.api, t.id)).me).toBeNull(); // người đăng ký cũng không còn
    const promoted = await publicDetail(pair.third[0].api, t.id);
    expect(promoted.me.entry).toMatchObject({ status: 'registered', waitlistPosition: null });
    expect(promoted.registration).toMatchObject({ registered: 4, waitlisted: 0 });
  });
});

describe('tìm đồng đội (GET /me/partners) — theo quyền riêng tư', () => {
  const found = async (who, search, extra = '') => (await who.api.get(`/v1/me/partners?search=${encodeURIComponent(search)}${extra}`)).body;
  let me;
  beforeAll(async () => {
    me = await customer({ name: 'Zeta Người Tìm' });
    await newPlayer({ name: 'Zeta Công Khai', visibility: 'public', nickname: 'Cú Zeta' });
    await newPlayer({ name: 'Zeta Thành Viên' });
    await newPlayer({ name: 'Zeta Ẩn Danh', visibility: 'hidden' });
    await newPlayer({ name: 'Zeta Chưa Điểm', rating: null });
  });

  test('chỉ người public / members đang hoạt động; không có chính mình, không có hồ sơ hidden; có cờ đã có điểm', async () => {
    const body = await found(me, 'zeta');
    expect(body.success).toBe(true);
    const names = body.data.items.map((i) => i.name);
    expect(names).toEqual(['Zeta Chưa Điểm', 'Zeta Công Khai', 'Zeta Thành Viên']);
    expect(names).not.toContain('Zeta Người Tìm');
    expect(names).not.toContain('Zeta Ẩn Danh');
    expect(Object.fromEntries(body.data.items.map((i) => [i.name, i.rated]))).toEqual({ 'Zeta Chưa Điểm': false, 'Zeta Công Khai': true, 'Zeta Thành Viên': true });
    expect(Object.keys(body.data.items[0]).sort()).toEqual(['gender', 'id', 'name', 'nickname', 'rated']);
    expect(body.data.items.find((i) => i.name === 'Zeta Công Khai').nickname).toBe('Cú Zeta');
  });

  test('tìm được cả theo biệt danh; không phân biệt hoa thường; ký tự đặc biệt không phá câu truy vấn', async () => {
    expect((await found(me, 'cú ze')).data.items.map((i) => i.name)).toEqual(['Zeta Công Khai']);
    expect((await found(me, "100%_'\"\\--")).data.items).toEqual([]);
    expect((await found(me, 'ZETA', '&limit=2')).data.items).toHaveLength(2);
  });

  test('dưới 2 ký tự → 400 (không cho dò cả danh sách); thiếu search → 400', async () => {
    expect((await me.api.get('/v1/me/partners?search=z')).status).toBe(400);
    expect((await me.api.get('/v1/me/partners')).status).toBe(400);
  });

  test('hồ sơ khách (đồng đội chưa có tài khoản) KHÔNG tìm thấy được; hồ sơ đã gộp cũng không', async () => {
    const t = await openTournament({ ...DOUBLES, name: 'PUBQ tìm khách' });
    const owner = await customer();
    expect((await register(owner, t.id, guestBody({ name: 'Zeta Khách Vãng Lai', phone: '0987000111' }))).status).toBe(201);
    expect((await found(me, 'Khách Vãng Lai')).data.items).toEqual([]);
  });
});

describe('đồng đội chưa có tài khoản → hồ sơ khách + điểm tạm chờ nhân viên xác nhận', () => {
  let t;
  let owner;
  beforeAll(async () => {
    t = await openTournament({ ...DOUBLES, name: 'PUBQ khách' });
    owner = await customer({ name: 'Nguyễn Văn Chủ', visibility: 'public', nickname: 'Chủ Đôi' });
  });

  test('đăng ký kèm guest → 201: hồ sơ khách (hidden, có SĐT chuẩn hoá, nguồn online_guest) + điểm tạm theo nhãn; cả hai vào danh sách', async () => {
    const res = await register(owner, t.id, guestBody());
    expect(res.status).toBe(201);
    expect(res.body.data.registration).toMatchObject({ registered: 2, waitlisted: 0 });
    const guest = await ctx.models.Player.findOne({ where: { tenantId: ctx.tenant, contactPhone: '0912345678' } });
    expect(guest).toMatchObject({ displayName: 'Lê Văn Bình', gender: 'male', source: 'online_guest', visibility: 'hidden', externalRef: null, status: 'active', createdByRef: owner.sub });
    // Điểm tạm: nhãn "tb" = 3.25 cho cả hai nội dung, chưa xác nhận.
    const view = (await manager.get(`/v1/players/${guest.id}`)).body.data;
    expect(view).toMatchObject({ contactPhone: '0912345678', source: 'online_guest', visibility: 'hidden' });
    expect(view.ratings.doubles.rating).toBe(3.25);
    expect(view.ratings.singles.rating).toBe(3.25);
    expect(view.flags).toEqual(expect.arrayContaining(['quick', 'unverified']));
    expect(view.latestAssessment).toMatchObject({ source: 'staff_quick', status: 'applied' });
  });

  test('nhân viên thấy đủ cờ chưa xác nhận ở danh sách đăng ký giải, cạnh người đăng ký (đã có điểm thật)', async () => {
    const rows = await staffEntries(t.id);
    expect(rows).toHaveLength(2);
    const guestRow = rows.find((r) => r.name === 'Lê Văn Bình');
    const ownerRow = rows.find((r) => r.name === 'Nguyễn Văn Chủ');
    expect(guestRow.flags).toEqual(expect.arrayContaining(['quick', 'unverified']));
    expect(ownerRow.flags).not.toContain('quick');
    expect(guestRow.status).toBe('registered');
    // Nhân viên biết đăng ký do khách tự bấm (cả hai người của cặp), và thấy SĐT / nguồn của đồng đội khách.
    expect([guestRow.via, ownerRow.via]).toEqual(['self', 'self']);
    expect(guestRow).toMatchObject({ source: 'online_guest', contactPhone: '0912345678' });
    expect(ownerRow).toMatchObject({ source: null, contactPhone: null });
  });

  test('SĐT KHÔNG lộ qua bất kỳ API công khai nào; người ngoài thấy đồng đội khách bị che, người đăng ký thấy tên đầy đủ', async () => {
    const texts = [
      JSON.stringify((await anon.get(`/v1/public/tournaments/${t.id}/entries`)).body),
      JSON.stringify((await anon.get(`/v1/public/tournaments/${t.id}`)).body),
      JSON.stringify((await owner.api.get(`/v1/public/tournaments/${t.id}/entries`)).body),
      JSON.stringify((await owner.api.get(`/v1/public/tournaments/${t.id}`)).body)
    ];
    for (const text of texts) {
      expect(text).not.toContain('0912345678');
      expect(text).not.toContain('contactPhone');
      expect(text).not.toContain('online_guest');
    }
    const outsider = (await anon.get(`/v1/public/tournaments/${t.id}/entries`)).body.data.items[0];
    expect(outsider.players.filter((p) => !p.masked).map((p) => p.name)).toEqual(['Chủ Đôi']);
    expect(outsider.players.find((p) => p.masked)).toMatchObject({ id: null, masked: true });
    expect(JSON.stringify(outsider)).not.toContain('Lê Văn Bình');
    const mine = (await owner.api.get(`/v1/public/tournaments/${t.id}/entries`)).body.data.items[0];
    expect(mine.players.map((p) => p.name).sort()).toEqual(['Lê Văn Bình', 'Nguyễn Văn Chủ']);
  });

  test('hồ sơ khách không lên bảng xếp hạng; không có trong danh sách người chơi mặc định của khách', async () => {
    const board = (await anon.get('/v1/leaderboards/rating?category=MD&limit=100')).body.data;
    expect(JSON.stringify(board)).not.toContain('Lê Văn Bình');
  });

  test('cùng SĐT (viết kiểu khác) ở giải khác → dùng lại ĐÚNG hồ sơ khách đó, không tạo thêm, điểm tạm giữ nguyên dù chọn nhãn khác', async () => {
    const t2 = await openTournament({ ...DOUBLES, name: 'PUBQ khách 2' });
    const another = await customer();
    const res = await register(another, t2.id, guestBody({ phone: '+84 912 345 678', name: 'Tên Khác Hẳn', level: 'kha' }));
    expect(res.status).toBe(201);
    expect(await guestsByPhone('0912345678')).toBe(1);
    const guest = await ctx.models.Player.findOne({ where: { tenantId: ctx.tenant, contactPhone: '0912345678' } });
    expect(guest.displayName).toBe('Lê Văn Bình'); // tên đã ghi giữ nguyên
    const view = (await manager.get(`/v1/players/${guest.id}`)).body.data;
    expect(view.ratings.doubles.rating).toBe(3.25);
    // Cùng giải: hồ sơ khách đó đã có trong giải rồi → không đăng ký trùng.
    const dup = await register(await customer(), t.id, guestBody());
    expect([dup.status, dup.body.code]).toEqual([409, 'ALREADY_REGISTERED']);
  });

  test('thông tin khách sai → 422 INVALID_GUEST (kèm từng trường); nhãn / giới tính lạ bị hợp đồng chặn 400; không tạo gì', async () => {
    const who = await customer();
    const before = await ctx.models.Player.count({ where: { tenantId: ctx.tenant, source: 'online_guest' } });
    const badPhone = await register(who, t.id, guestBody({ phone: '1234567890' })); // đủ dài nhưng không phải số di động VN
    expect([badPhone.status, badPhone.body.code]).toEqual([422, 'INVALID_GUEST']);
    expect(badPhone.body.errors.map((e) => e.field)).toEqual(['guest.phone']);
    const tooShort = await register(who, t.id, guestBody({ phone: '12345' })); // quá ngắn: hợp đồng chặn trước
    expect([tooShort.status, tooShort.body.code]).toEqual([400, 'VALIDATION_FAILED']);
    const badName = await register(who, t.id, guestBody({ name: '12345 <b>' }));
    expect([badName.status, badName.body.errors[0].field]).toEqual([422, 'guest.name']);
    for (const bad of [{ level: 'pro' }, { gender: 'other' }, { name: undefined }, { phone: undefined }]) {
      const res = await register(who, t.id, guestBody(bad));
      expect([JSON.stringify(bad), res.status, res.body.code]).toEqual([JSON.stringify(bad), 400, 'VALIDATION_FAILED']);
    }
    expect(await ctx.models.Player.count({ where: { tenantId: ctx.tenant, source: 'online_guest' } })).toBe(before);
  });

  test('không đủ điều kiện thì KHÔNG tạo hồ sơ rác: người đăng ký chưa có điểm, hoặc cặp sai luật nam nữ', async () => {
    const mixed = await openTournament({ ...DOUBLES, name: 'PUBQ nam nữ khách', genderRule: 'mixed' });
    const man = await customer({ gender: 'male' });
    const clash = await register(man, mixed.id, guestBody({ phone: '0911000001', gender: 'male' }));
    expect([clash.status, clash.body.code]).toEqual([422, 'NOT_ELIGIBLE']);
    expect(await guestsByPhone('0911000001')).toBe(0);
    const unrated = await customer({ rating: null });
    const noRating = await register(unrated, t.id, guestBody({ phone: '0911000002' }));
    expect([noRating.status, noRating.body.code]).toEqual([422, 'NEEDS_ASSESSMENT']);
    expect(await guestsByPhone('0911000002')).toBe(0);
    // Khách nữ vào cặp nam nữ thì được.
    const ok = await register(man, mixed.id, guestBody({ phone: '0911000003', gender: 'female', name: 'Phạm Thị Nữ' }));
    expect(ok.status).toBe(201);
    expect(await guestsByPhone('0911000003')).toBe(1);
  });

  test('giải đơn không nhận guest → 422 PARTNER_NOT_ALLOWED (không tạo hồ sơ)', async () => {
    const single = await openTournament({ name: 'PUBQ đơn khách' });
    const res = await register(await customer(), single.id, guestBody({ phone: '0911000004' }));
    expect([res.status, res.body.code]).toEqual([422, 'PARTNER_NOT_ALLOWED']);
    expect(await guestsByPhone('0911000004')).toBe(0);
  });

  test('mỗi khách tối đa 5 hồ sơ khách MỚI mỗi 24 giờ → lần thứ 6 bị 422 GUEST_LIMIT; dùng lại hồ sơ cũ thì không tính', async () => {
    const spammer = await customer();
    const made = [];
    for (let i = 0; i < 5; i += 1) {
      const tt = await openTournament({ ...DOUBLES, name: `PUBQ giới hạn ${i}` });
      made.push(tt);
      const res = await register(spammer, tt.id, guestBody({ phone: `09220000${i}0`, name: `Khách Số ${String.fromCharCode(65 + i)}` }));
      expect([i, res.status]).toEqual([i, 201]);
    }
    const sixth = await openTournament({ ...DOUBLES, name: 'PUBQ giới hạn 6' });
    const blocked = await register(spammer, sixth.id, guestBody({ phone: '0922000090', name: 'Khách Số G' }));
    expect([blocked.status, blocked.body.code]).toEqual([422, 'GUEST_LIMIT']);
    expect(blocked.body.message).toMatch(/liên hệ nhân viên/);
    expect(await guestsByPhone('0922000090')).toBe(0);
    // Dùng lại một hồ sơ khách đã có (cùng SĐT) vẫn được.
    const reuse = await register(spammer, sixth.id, guestBody({ phone: '09220000 00', name: 'Tên Gì Cũng Được' }));
    expect(reuse.status).toBe(201);
    // Người khác không bị ảnh hưởng.
    const t7 = await openTournament({ ...DOUBLES, name: 'PUBQ giới hạn 7' });
    expect((await register(await customer(), t7.id, guestBody({ phone: '0922000091', name: 'Khách Số H' }))).status).toBe(201);
  });

  test('đồng đội khách + hết chỗ: cả cặp vào danh sách chờ; rút thì nhường chỗ', async () => {
    const small = await openTournament({ ...DOUBLES, name: 'PUBQ khách hết chỗ', maxEntries: 2 });
    const first = await customer();
    expect((await register(first, small.id, guestBody({ phone: '0933000001', name: 'Khách Một' }))).body.data.registration).toMatchObject({ registered: 2 });
    const second = await customer();
    const waiting = await register(second, small.id, guestBody({ phone: '0933000002', name: 'Khách Hai' }));
    expect(waiting.body.data.me.entry).toMatchObject({ status: 'waitlisted', waitlistPosition: 1 });
    expect((await withdraw(first, small.id)).status).toBe(200);
    expect((await publicDetail(second.api, small.id)).me.entry.status).toBe('registered');
  });
});

describe('nhân viên vẫn đăng ký hộ như cũ (không bị đổi hành vi)', () => {
  test('nhân viên đăng ký cặp bằng tournament:operate; khách đăng ký giải đã đủ chỗ vẫn vào danh sách chờ chung một hàng', async () => {
    const t = await openTournament({ ...DOUBLES, name: 'PUBQ nhân viên', maxEntries: 2 });
    const a = await newPlayer();
    const b = await newPlayer();
    expect((await op.post(`/v1/tournaments/${t.id}/entries`).send({ playerId: a.id, partnerPlayerId: b.id })).status).toBe(201);
    const c = await customer();
    const d = await customer();
    const res = await register(c, t.id, { partner: { playerId: d.id } });
    expect(res.body.data.me.entry).toMatchObject({ status: 'waitlisted', waitlistPosition: 1 });
    const staffRow = (await staffEntries(t.id)).find((e) => e.playerId === a.id);
    expect(staffRow.status).toBe('registered');
    expect(staffRow.via).toBe('staff'); // nhân viên nhập → không có chip "Đăng ký online"
    expect((await staffEntries(t.id)).filter((e) => e.via === 'self').map((e) => e.playerId).sort()).toEqual([c.id, d.id].sort());
    // Nhân viên không thể dùng route của khách; khách không dùng được route của nhân viên.
    expect((await op.post(`/v1/me/tournaments/${t.id}/entries`).send({})).status).toBe(403);
    expect((await c.api.post(`/v1/tournaments/${t.id}/entries`).send({ playerId: a.id })).status).toBe(403);
  });
});
