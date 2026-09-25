const { createTestContext, STAFF } = require('./helpers');

// BXH trình độ (docs/05 mục 3.1). Bước 1 chưa có giải nên dữ liệu trận được dựng
// thẳng trong DB (rated_matches, last_match_at) — đúng những gì chốt giải sẽ ghi.
let ctx;
let ids;
const DAY = 24 * 60 * 60 * 1000;

beforeAll(async () => {
  ctx = await createTestContext();
  const { Player, PlayerRating } = ctx.models;
  const now = Date.now();
  const make = async (key, { gender = 'male', rating, matches = 10, verified = false, lastDays = 10, visibility = 'members', home = 'bd:branch:1', birthYear = 1995, nickname = null }) => {
    const p = await Player.create({ tenantId: ctx.tenant, externalRef: `bd:customer:${key}`, displayName: `Người ${key}`, gender, visibility, homeOrganizerRef: home, birthYear, nickname });
    await PlayerRating.create({
      tenantId: ctx.tenant, playerId: p.id, discipline: 'doubles', rating, ratedMatches: matches, verified,
      lastMatchAt: lastDays === null ? null : new Date(now - lastDays * DAY)
    });
    return p.id;
  };
  ids = {
    top: await make('top', { rating: 4.6, visibility: 'public', nickname: 'Top Một' }),
    tieA: await make('tieA', { rating: 3.9, matches: 20 }),
    tieB: await make('tieB', { rating: 3.9, matches: 20 }),
    fewer: await make('fewer', { rating: 3.9, matches: 8 }),
    q2: await make('q2', { rating: 3.2, home: 'bd:branch:2', birthYear: 1975 }),
    verifiedNoMatches: await make('vnm', { rating: 4.0, matches: 0, verified: true, lastDays: null }),
    tooFew: await make('few', { rating: 4.2, matches: 3 }),
    stale: await make('stale', { rating: 4.4, lastDays: 400 }),
    hidden: await make('hidden', { rating: 4.5, visibility: 'hidden' }),
    woman: await make('woman', { gender: 'female', rating: 3.7 })
  };
});
afterAll(() => ctx.close());

const board = async (claims, query) => (await ctx.as(claims)).get(`/v1/leaderboards/rating?${query}`);

describe('BXH trình độ', () => {
  test('điều kiện lên bảng + sắp xếp + đồng hạng (1, 2, 2, 4, 5)', async () => {
    const res = await board({ scope: STAFF }, 'category=MD');
    expect(res.status).toBe(200);
    const rows = res.body.data.items;
    const idsOnBoard = rows.map((r) => r.player.id);
    expect(idsOnBoard).toEqual([ids.top, ids.tieA, ids.tieB, ids.fewer, ids.q2].filter((id) => idsOnBoard.includes(id)));
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 2, 4, 5]);
    // Không lên bảng: < 5 trận, không có trận trong 12 tháng, ẩn, xác nhận nhưng chưa từng đánh, sai giới.
    for (const key of ['tooFew', 'stale', 'hidden', 'verifiedNoMatches', 'woman']) expect(idsOnBoard).not.toContain(ids[key]);
    expect(res.body.data.label).toBe('Đôi nam');
  });

  test('người xem chưa đăng nhập: dòng của người "members" bị che tên, số hạng giữ nguyên', async () => {
    const res = await board({ scope: 'ranking:read', sub: 'anonymous' }, 'category=MD');
    const [first, second] = res.body.data.items;
    expect(first).toMatchObject({ rank: 1, player: { id: ids.top, name: 'Top Một', masked: false } });
    expect(second).toMatchObject({ rank: 2, player: { id: null, name: 'Thành viên', masked: true } });
  });

  test('thành viên đã đăng nhập thấy tên đầy đủ và dòng của chính mình', async () => {
    const res = await board({ scope: 'ranking:read', sub: 'bd:user:tieA', player: 'bd:customer:tieA' }, 'category=MD');
    const me = res.body.data.items.find((r) => r.isMe);
    expect(me).toMatchObject({ rank: 2, player: { name: 'Người tieA', masked: false } });
  });

  test('lọc theo chi nhánh / nhóm tuổi → xếp hạng lại trong phạm vi lọc', async () => {
    const byBranch = await board({ scope: STAFF }, 'category=MD&organizerRef=bd:branch:2');
    expect(byBranch.body.data.items).toEqual([expect.objectContaining({ rank: 1, player: expect.objectContaining({ id: ids.q2 }) })]);
    const byAge = await board({ scope: STAFF }, 'category=MD&ageGroup=45-54');
    expect(byAge.body.data.items.map((r) => r.player.id)).toEqual([ids.q2]);
  });

  test('vị trí của một người: đủ điều kiện → hạng; chưa đủ → vị trí dự kiến', async () => {
    const staff = await ctx.as({ scope: STAFF });
    const ranked = await staff.get(`/v1/players/${ids.fewer}/ranking`);
    expect(ranked.body.data.rating.MD).toMatchObject({ eligible: true, rank: 4, total: 5, projectedRank: null });
    const pending = await staff.get(`/v1/players/${ids.tooFew}/ranking`);
    expect(pending.body.data.rating.MD).toMatchObject({ eligible: false, rank: null, projectedRank: 2 });
  });

  test('ảnh chụp hằng ngày → mũi tên lên / xuống so với 7 ngày trước', async () => {
    const { LeaderboardSnapshot } = ctx.models;
    const weekAgo = new Date(Date.now() + 420 * 60000 - 7 * DAY).toISOString().slice(0, 10);
    await LeaderboardSnapshot.bulkCreate([
      { tenantId: ctx.tenant, kind: 'rating', category: 'MD', scope: 'all', snapshotDate: weekAgo, playerId: ids.top, rank: 3, value: 4.4 },
      { tenantId: ctx.tenant, kind: 'rating', category: 'MD', scope: 'all', snapshotDate: weekAgo, playerId: ids.q2, rank: 2, value: 3.5 }
    ]);
    const res = await board({ scope: STAFF }, 'category=MD');
    const byId = Object.fromEntries(res.body.data.items.map((r) => [r.player.id, r]));
    expect(byId[ids.top].movement).toBe(2); // 3 → 1
    expect(byId[ids.q2].movement).toBe(-3); // 2 → 5
    expect(byId[ids.tieA].movement).toBeNull(); // không có trong ảnh chụp
  });

  test('job ảnh chụp ghi bảng toàn chuỗi + từng chi nhánh', async () => {
    const result = await ctx.built.modules.ranking.service.dailySnapshot(new Date());
    expect(result.rows).toBeGreaterThan(0);
    const { LeaderboardSnapshot } = ctx.models;
    const scopes = await LeaderboardSnapshot.findAll({ where: { tenantId: ctx.tenant, snapshotDate: result.date, category: 'MD' } });
    expect(new Set(scopes.map((s) => s.scope))).toEqual(new Set(['all', 'org:bd:branch:1', 'org:bd:branch:2']));
  });

  test('hồ sơ ẩn: không mở được qua /public (404), nhân viên vẫn xem được', async () => {
    const pub = await (await ctx.as({ scope: 'ranking:read', sub: 'bd:user:x', player: 'bd:customer:x' })).get(`/v1/players/${ids.hidden}/public`);
    expect(pub.status).toBe(404);
    const staffView = await (await ctx.as({ scope: STAFF })).get(`/v1/players/${ids.hidden}`);
    expect(staffView.status).toBe(200);
    const topPublic = await (await ctx.as({ scope: 'ranking:read', sub: 'anonymous' })).get(`/v1/players/${ids.top}/public`);
    expect(topPublic.status).toBe(200);
    expect(topPublic.body.data).toMatchObject({ name: 'Top Một', ratings: { doubles: { rating: 4.6 } } });
    expect(topPublic.body.data.externalRef).toBeUndefined();
  });
});
