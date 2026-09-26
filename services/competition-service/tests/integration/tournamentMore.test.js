const { createTestContext, STAFF, MANAGER } = require('./helpers');

// Các nhánh còn lại của module tournament (docs/06): loại trực tiếp có hạt giống +
// tranh hạng 3, cặp cố định + tổng trình, giới hạn số người + danh sách chờ, mở lại
// đăng ký, huỷ giải, khoá sửa, BXH thành tích 6 kết quả / 52 tuần, quyền.
jest.setTimeout(120000);

const TOUR = 'tournament:read tournament:operate tournament:manage';
let ctx;
let manager;
let employee;

beforeAll(async () => {
  ctx = await createTestContext();
  manager = await ctx.as({ scope: `${MANAGER} ${TOUR}`, sub: 'bd:user:mgr', org: ['bd:branch:1'] });
  employee = await ctx.as({ scope: `${STAFF} tournament:read tournament:operate`, sub: 'bd:user:emp', org: ['bd:branch:1'] });
});
afterAll(() => ctx.close());

let seq = 0;
const player = async (gender, rating, discipline = 'doubles') => {
  seq += 1;
  const res = await manager.put(`/v1/players/by-ref/bd:customer:x${seq}`).send({ displayName: `Người x${seq}` });
  await manager.patch(`/v1/players/${res.body.data.id}`).send({ gender });
  await manager.post(`/v1/players/${res.body.data.id}/rating-adjustments`).send({ discipline, newRating: rating, reason: 'Dữ liệu test bổ sung giải' });
  return res.body.data.id;
};
const create = async (extra) => {
  const res = await manager.post('/v1/tournaments').send({
    organizerRef: 'bd:branch:1', name: `Giải ${seq}`, startsOn: '2026-11-15', tier: 'club', discipline: 'doubles',
    genderRule: 'open', format: 'round_robin', scoring: '1x21', ...extra
  });
  expect(res.status).toBe(201);
  await manager.post(`/v1/tournaments/${res.body.data.id}/open`).send();
  return res.body.data.id;
};
const confirmPreview = async (tid, seed = 's') => {
  const p = (await manager.post(`/v1/tournaments/${tid}/draw/preview`, { key: false }).send({ seed })).body.data;
  const res = await manager.post(`/v1/tournaments/${tid}/draw`).send({ seed: p.seed, teams: p.teams.map((t) => ({ players: t.players.map((x) => x.id) })), groups: p.groups, bracket: p.bracket });
  expect(res.status).toBe(200);
  return p;
};
const playAll = async (tid, filter = () => true) => {
  for (;;) {
    const open = (await manager.get(`/v1/tournaments/${tid}/matches`)).body.data.items.filter((m) => m.status === 'scheduled' && m.teamA && m.teamB && filter(m));
    if (!open.length) return;
    for (const m of open) {
      const r = await employee.put(`/v1/matches/${m.id}/result`).set('If-Match', `"${m.version}"`).send({ games: [[21, 12]] });
      expect(r.status).toBe(200);
    }
  }
};

describe('thể thức loại trực tiếp có hạt giống + tranh hạng 3', () => {
  test('6 đơn → sơ đồ 8, hạt giống 1–2 nhận bye; tranh hạng 3 cho thứ hạng 3 và 4 riêng', async () => {
    const tid = await create({ discipline: 'singles', genderRule: 'men', format: 'knockout', thirdPlaceMatch: true });
    const ids = [];
    for (const r of [4.0, 3.8, 3.6, 3.4, 3.2, 3.0]) {
      ids.push(await player('male', r, 'singles'));
      await employee.post(`/v1/tournaments/${tid}/entries`).send({ playerId: ids[ids.length - 1] });
    }
    const p = await confirmPreview(tid, 'ko');
    expect(p.bracket).toHaveLength(8);
    expect(p.bracket.filter((x) => x === null)).toHaveLength(2);
    const rounds = (await manager.get(`/v1/tournaments/${tid}/bracket`)).body.data.rounds;
    expect(rounds.map((r) => r.matches.length)).toEqual([2, 2, 2]); // tứ kết 2 · bán kết 2 · chung kết + tranh hạng 3
    const byeHolders = rounds[1].matches.map((m) => m.teamA.players[0].id).sort();
    expect(byeHolders).toEqual([ids[0], ids[1]].sort());
    await playAll(tid);
    const fin = await manager.post(`/v1/tournaments/${tid}/finalize`).send();
    expect(fin.status).toBe(200);
    expect(fin.body.data.placements.slice(0, 4).map((x) => [x.from, x.label])).toEqual([[1, 'Vô địch'], [2, 'Á quân'], [3, 'Hạng 3'], [4, 'Hạng 4']]);
    expect(fin.body.data.placements.slice(4).map((x) => [x.from, x.to])).toEqual([[5, 8], [5, 8]]);
  });
});

describe('cặp cố định', () => {
  test('bắt buộc đồng đội; tổng trình cặp > trần → 422; bốc thăm không được đổi cặp', async () => {
    const tid = await create({ pairingMode: 'fixed', ratingRule: { scope: 'team_sum', max: 7.0 } });
    const [a, b, c, d, e, f] = [await player('male', 3.6), await player('male', 3.5), await player('male', 3.4), await player('male', 3.3), await player('male', 3.0), await player('male', 3.0)];
    const noPartner = await employee.post(`/v1/tournaments/${tid}/entries`).send({ playerId: a });
    expect(noPartner.body.code).toBe('PARTNER_REQUIRED');
    const tooStrong = await employee.post(`/v1/tournaments/${tid}/entries`).send({ playerId: a, partnerPlayerId: b });
    expect(tooStrong.status).toBe(422);
    expect(tooStrong.body.message).toMatch(/7.1/);
    expect((await employee.post(`/v1/tournaments/${tid}/entries`).send({ playerId: a, partnerPlayerId: c })).status).toBe(201);
    expect((await employee.post(`/v1/tournaments/${tid}/entries`).send({ playerId: b, partnerPlayerId: d })).status).toBe(201);
    expect((await employee.post(`/v1/tournaments/${tid}/entries`).send({ playerId: e, partnerPlayerId: f })).status).toBe(201);
    const p = (await manager.post(`/v1/tournaments/${tid}/draw/preview`, { key: false }).send({})).body.data;
    expect(p.teams).toHaveLength(3);
    const swapped = p.teams.map((t) => ({ players: t.players.map((x) => x.id) }));
    [swapped[0].players[1], swapped[1].players[1]] = [swapped[1].players[1], swapped[0].players[1]];
    const res = await manager.post(`/v1/tournaments/${tid}/draw`).send({ seed: p.seed, teams: swapped, groups: p.groups });
    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/cặp cố định/);
  });
});

describe('giới hạn số người, danh sách chờ, mở lại, huỷ, khoá sửa', () => {
  test('quá số người → chờ; người đăng ký rút → người chờ sớm nhất được lên', async () => {
    const tid = await create({ maxEntries: 4, discipline: 'singles', genderRule: 'women' });
    const ps = [];
    for (let i = 0; i < 5; i += 1) ps.push(await player('female', 3 + i / 10, 'singles'));
    for (const pid of ps) await employee.post(`/v1/tournaments/${tid}/entries`).send({ playerId: pid });
    let entries = (await employee.get(`/v1/tournaments/${tid}/entries`)).body.data.items;
    expect(entries.map((e) => [e.status, e.waitlistReason])).toEqual([...Array(4).fill(['registered', null]), ['waitlisted', 'capacity']]);
    const res = await employee.delete(`/v1/tournaments/${tid}/entries/${entries[0].id}`);
    expect(res.status).toBe(200);
    entries = res.body.data.items;
    expect(entries.find((e) => e.playerId === ps[4]).status).toBe('registered');
    expect(entries.find((e) => e.playerId === ps[0]).status).toBe('withdrawn');
  });

  test('đã có người đăng ký thì không đổi luật điểm; mở lại đăng ký sau bốc thăm; huỷ giải', async () => {
    const tid = await create({ discipline: 'singles' });
    // Tạo người chơi TRƯỚC rồi mới dựng request: supertest mở server tạm ngay lúc .post(),
    // chờ tạo người chơi giữa chừng thì server tạm đã đóng (ECONNREFUSED).
    for (let i = 0; i < 4; i += 1) {
      const pid = await player('male', 3 + i / 10, 'singles');
      await employee.post(`/v1/tournaments/${tid}/entries`).send({ playerId: pid });
    }
    const detail = (await manager.get(`/v1/tournaments/${tid}`)).body.data;
    const locked = await manager.patch(`/v1/tournaments/${tid}`).set('If-Match', `"${detail.version}"`).send({ scoring: '3x21' });
    expect(locked.status).toBe(409);
    expect(locked.body.code).toBe('LOCKED_AFTER_ENTRIES');
    const renamed = await manager.patch(`/v1/tournaments/${tid}`).set('If-Match', `"${detail.version}"`).send({ name: 'Giải đổi tên' });
    expect(renamed.body.data.name).toBe('Giải đổi tên');
    const stale = await manager.patch(`/v1/tournaments/${tid}`).set('If-Match', `"${detail.version}"`).send({ name: 'Lần hai' });
    expect(stale.status).toBe(409);

    await confirmPreview(tid);
    const reopened = await manager.post(`/v1/tournaments/${tid}/reopen`).send();
    expect(reopened.body.data).toMatchObject({ status: 'open', stage: null, progress: { matches: { total: 0 } } });
    await confirmPreview(tid, 'lan-2');
    const cancelled = await manager.post(`/v1/tournaments/${tid}/cancel`).send();
    expect(cancelled.body.data.status).toBe('cancelled');
    const matches = (await manager.get(`/v1/tournaments/${tid}/matches`)).body.data.items;
    expect(matches.every((m) => m.status === 'cancelled')).toBe(true);
    expect((await manager.post(`/v1/tournaments/${tid}/finalize`).send()).status).toBe(409);
  });

  test('gợi ý thể thức qua API; khách hàng / chi nhánh khác không nhập được tỉ số; huỷ được trận vòng tròn chưa đánh', async () => {
    const advice = await employee.post('/v1/tournaments/advice', { key: false }).send({ teams: 12, courts: 4 });
    expect(advice.body.data).toMatchObject({ format: 'groups_knockout', groupCount: 3, estimate: { matches: 23 } });
    const tid = await create({ discipline: 'singles' });
    // Tạo người chơi TRƯỚC rồi mới dựng request: supertest mở server tạm ngay lúc .post(),
    // chờ tạo người chơi giữa chừng thì server tạm đã đóng (ECONNREFUSED).
    for (let i = 0; i < 4; i += 1) {
      const pid = await player('male', 3 + i / 10, 'singles');
      await employee.post(`/v1/tournaments/${tid}/entries`).send({ playerId: pid });
    }
    await confirmPreview(tid);
    const [m] = (await manager.get(`/v1/tournaments/${tid}/matches`)).body.data.items;
    const customer = await ctx.as({ scope: 'rating:self ranking:read', player: 'bd:customer:x1', name: 'Khách' });
    expect((await customer.put(`/v1/matches/${m.id}/result`).set('If-Match', `"${m.version}"`).send({ games: [[21, 5]] })).status).toBe(403);
    const otherBranch = await ctx.as({ scope: `${MANAGER} ${TOUR}`, org: ['bd:branch:9'] });
    expect((await otherBranch.put(`/v1/matches/${m.id}/result`).set('If-Match', `"${m.version}"`).send({ games: [[21, 5]] })).status).toBe(404);
    const cancelled = await manager.post(`/v1/matches/${m.id}/cancel`).send();
    expect(cancelled.body.data.status).toBe('cancelled');
  });
});

describe('BXH thành tích: 6 kết quả tốt nhất trong 52 tuần', () => {
  test('kết quả thứ 7, kết quả hết hạn, kết quả bị thu hồi không được tính', async () => {
    const pid = await player('female', 3.5);
    const { RankingResult } = ctx.models;
    const now = Date.now();
    const DAY = 24 * 3600 * 1000;
    const row = (points, extra = {}) => ({
      tenantId: ctx.tenant, playerId: pid, category: 'WD', tournamentId: '00000000-0000-7000-8000-000000000001', tournamentName: 'Fixture',
      placementFrom: 1, placementTo: 1, placementLabel: 'Vô địch', basePoints: 100, tierFactor: 1, sizeFactor: 1, strengthFactor: 1,
      points, awardedAt: new Date(now - 10 * DAY), expiresAt: new Date(now + 300 * DAY), ...extra
    });
    await RankingResult.bulkCreate([
      ...[100, 90, 80, 70, 60, 50, 40].map((p) => row(p)),
      row(500, { expiresAt: new Date(now - DAY) }),
      row(400, { revokedAt: new Date() })
    ]);
    const board = (await manager.get('/v1/leaderboards/points?category=WD')).body.data;
    const mine = board.items.find((r) => r.player.id === pid);
    expect(mine).toMatchObject({ points: 450, countedResults: 6 });
    expect(mine.results.map((r) => r.points)).toEqual([100, 90, 80, 70, 60, 50]);
  });
});
