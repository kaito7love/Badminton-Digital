const crypto = require('crypto');
const { createTestContext, STAFF, MANAGER } = require('./helpers');

// Gộp hồ sơ khi người chơi đã có trận / giải / buổi giao lưu (docs/05 mục 4). Bước 2
// mới chuyển điểm + bài chấm + sổ điểm; test thật ở bước 3 phát hiện trận, đăng ký giải,
// điểm BXH thành tích, điểm danh giao lưu vẫn nằm ở hồ sơ nguồn → sửa + test ở đây.
jest.setTimeout(120000);

const ALL = 'tournament:read tournament:operate tournament:manage session:read session:operate';
let ctx;
let manager;

beforeAll(async () => {
  ctx = await createTestContext();
  manager = await ctx.as({ scope: `${MANAGER} ${ALL}`, sub: 'bd:user:mgr', org: ['bd:branch:1'] });
});
afterAll(() => ctx.close());

let seq = 0;
const player = async ({ rating = null, discipline = 'singles', gender = 'male', ref } = {}) => {
  seq += 1;
  const res = await manager.put(`/v1/players/by-ref/${ref || `bd:customer:mg${seq}`}`).send({ displayName: `Gộp ${seq}` });
  const id = res.body.data.id;
  await manager.patch(`/v1/players/${id}`).send({ gender });
  if (rating !== null) await manager.post(`/v1/players/${id}/rating-adjustments`).send({ discipline, newRating: rating, reason: 'Dữ liệu test gộp hồ sơ' });
  return id;
};
const openTournament = async () => {
  const t = (await manager.post('/v1/tournaments').send({
    organizerRef: 'bd:branch:1', name: `Giải gộp ${seq}`, startsOn: '2026-11-22', tier: 'club', discipline: 'singles', genderRule: 'men', format: 'round_robin', scoring: '1x21'
  })).body.data;
  await manager.post(`/v1/tournaments/${t.id}/open`).send();
  return t.id;
};
const drawAndPlay = async (tid) => {
  const p = (await manager.post(`/v1/tournaments/${tid}/draw/preview`, { key: false }).send({ seed: 'm' })).body.data;
  expect((await manager.post(`/v1/tournaments/${tid}/draw`).send({ seed: p.seed, teams: p.teams.map((x) => ({ players: x.players.map((y) => y.id) })), groups: p.groups, bracket: p.bracket })).status).toBe(200);
  for (const m of (await manager.get(`/v1/tournaments/${tid}/matches`)).body.data.items) {
    expect((await manager.put(`/v1/matches/${m.id}/result`).set('If-Match', `"${m.version}"`).send({ games: [[21, 15]] })).status).toBe(200);
  }
  expect((await manager.post(`/v1/tournaments/${tid}/finalize`).send()).status).toBe(200);
};
const event = (type, data, id = crypto.randomUUID()) => ({ specversion: '1.0', id, type, source: 'badminton-digital-core', time: new Date().toISOString(), data });

describe('gộp hồ sơ đã có lịch sử thi đấu', () => {
  test('khách vãng lai đã đánh giải đã chốt → trận, đăng ký, đội, điểm BXH, thống kê chuyển sang tài khoản', async () => {
    const walkIn = await player({ rating: 3.6 });
    const others = [await player({ rating: 3.4 }), await player({ rating: 3.2 }), await player({ rating: 3.0 })];
    const account = await player({ rating: 3.3, discipline: 'doubles' });
    const tid = await openTournament();
    for (const pid of [walkIn, ...others]) await manager.post(`/v1/tournaments/${tid}/entries`).send({ playerId: pid });
    await drawAndPlay(tid);
    const before = (await manager.get(`/v1/players/${walkIn}/matches`)).body.data;
    expect(before.total).toBe(3);

    const res = await manager.post(`/v1/players/${account}/merge`).send({ sourcePlayerId: walkIn });
    expect(res.status).toBe(200);
    expect(res.body.data.merged).toMatchObject({ matches: 3, tournaments: 1, rankingResults: 1, sessions: 0 });

    const { MatchParticipant, TournamentEntry, TournamentTeam, RankingResult } = ctx.models;
    expect(await MatchParticipant.count({ where: { playerId: walkIn } })).toBe(0);
    expect(await MatchParticipant.count({ where: { playerId: account } })).toBe(3);
    expect(await TournamentEntry.count({ where: { tournamentId: tid, playerId: account } })).toBe(1);
    expect(await TournamentTeam.count({ where: { tournamentId: tid, player1Id: account } })).toBe(1);
    expect(await RankingResult.count({ where: { playerId: walkIn } })).toBe(0);
    expect((await manager.get(`/v1/players/${account}/matches`)).body.data.total).toBe(3);
    const stats = (await manager.get(`/v1/players/${account}/stats?discipline=singles`)).body.data.items.find((x) => x.context === 'tournament');
    expect(stats).toMatchObject({ matches: 3, tournaments: 1 });
    const board = (await manager.get('/v1/leaderboards/points?category=MS')).body.data.items.map((r) => r.player.id);
    expect(board).toContain(account);
    expect(board).not.toContain(walkIn);
  });

  test('hai hồ sơ cùng một giải → 409 MERGE_CONFLICT, không đổi gì; một bên rút trước bốc thăm → gộp được', async () => {
    const a = await player({ rating: 3.5 });
    const b = await player({ rating: 3.1 });
    const tid = await openTournament();
    const entries = [];
    for (const pid of [a, b]) entries.push((await manager.post(`/v1/tournaments/${tid}/entries`).send({ playerId: pid })).body.data.items.find((e) => e.playerId === pid));
    const res = await manager.post(`/v1/players/${a}/merge`).send({ sourcePlayerId: b });
    expect([res.status, res.body.code]).toEqual([409, 'MERGE_CONFLICT']);
    expect((await ctx.models.Player.findByPk(b)).status).toBe('active');
    const rating = await ctx.models.PlayerRating.findOne({ where: { playerId: b, discipline: 'singles' } });
    expect(Number(rating.rating)).toBe(3.1);

    expect((await manager.delete(`/v1/tournaments/${tid}/entries/${entries[1].id}`)).status).toBe(200);
    const ok = await manager.post(`/v1/players/${a}/merge`).send({ sourcePlayerId: b });
    expect(ok.status).toBe(200);
    const left = await ctx.models.TournamentEntry.findAll({ where: { tournamentId: tid } });
    expect(left.map((e) => [e.playerId, e.status])).toEqual([[a, 'registered']]);
  });

  test('buổi giao lưu: cùng đang có mặt → 409; một bên rời buổi → gộp hai dòng điểm danh làm một', async () => {
    const a = await player({ rating: 3.2, discipline: 'doubles' });
    const b = await player({ rating: 3.0, discipline: 'doubles' });
    const rest = [];
    for (const r of [3.1, 2.9, 2.8, 2.7, 2.6, 2.5]) rest.push(await player({ rating: r, discipline: 'doubles' }));
    const s = (await manager.post('/v1/sessions').send({ organizerRef: 'bd:branch:1', name: 'Buổi gộp', courtRefs: ['c1', 'c2'] })).body.data;
    for (const pid of [a, b, ...rest]) await manager.post(`/v1/sessions/${s.id}/players`).send({ playerId: pid });
    // Hai hồ sơ không chung sân (đổi tay để chắc chắn), rồi chấm cả hai trận.
    const p = (await manager.post(`/v1/sessions/${s.id}/fill-courts/preview`).send({ seed: 'g' })).body.data;
    const ids = [a, b, ...rest];
    const assignments = [
      { court: 'c1', sideA: [ids[0], ids[2]], sideB: [ids[3], ids[4]] },
      { court: 'c2', sideA: [ids[1], ids[5]], sideB: [ids[6], ids[7]] }
    ];
    const filled = (await manager.post(`/v1/sessions/${s.id}/fill-courts`).send({ seed: p.seed, assignments })).body.data;
    for (const m of filled.matches) await manager.put(`/v1/matches/${m.id}/result`).set('If-Match', `"${m.version}"`).send({ games: [[21, 18]] });

    const conflict = await manager.post(`/v1/players/${a}/merge`).send({ sourcePlayerId: b });
    expect([conflict.status, conflict.body.code]).toEqual([409, 'MERGE_CONFLICT']);
    expect((await manager.delete(`/v1/sessions/${s.id}/players/${b}`)).status).toBe(200);
    const res = await manager.post(`/v1/players/${a}/merge`).send({ sourcePlayerId: b });
    expect(res.status).toBe(200);
    expect(res.body.data.merged).toMatchObject({ matches: 1, sessions: 1 });
    const roster = (await manager.get(`/v1/sessions/${s.id}/players`)).body.data.items;
    expect(roster.filter((r) => [a, b].includes(r.playerId))).toEqual([expect.objectContaining({ playerId: a, status: 'present', gamesPlayed: 2 })]);
    const closed = await manager.post(`/v1/sessions/${s.id}/close`).send();
    expect(closed.status).toBe(200);
    const stats = (await manager.get(`/v1/players/${a}/stats?discipline=doubles`)).body.data.items.find((x) => x.context === 'session');
    expect(stats.matches).toBe(2);
  });

  test('sự kiện bd.customer.merged bị chặn → trả lỗi, không ghi inbox; xử lý xong gửi lại cùng id → thành công', async () => {
    const a = await player({ rating: 3.4, ref: 'bd:customer:ev-account' });
    const b = await player({ rating: 3.0, ref: 'bd:customer:ev-walkin' });
    const tid = await openTournament();
    const entries = [];
    for (const pid of [a, b]) entries.push((await manager.post(`/v1/tournaments/${tid}/entries`).send({ playerId: pid })).body.data.items.find((e) => e.playerId === pid));
    const ev = event('bd.customer.merged', { sourceRef: 'bd:customer:ev-walkin', targetRef: 'bd:customer:ev-account' });
    const first = await ctx.sendEvent(ev);
    expect([first.status, first.body.code]).toEqual([409, 'MERGE_CONFLICT']);
    expect(await ctx.models.InboxEvent.count({ where: { eventId: ev.id } })).toBe(0);
    await manager.delete(`/v1/tournaments/${tid}/entries/${entries[1].id}`);
    const again = await ctx.sendEvent(ev);
    expect([again.status, again.body.data.status]).toEqual([200, 'processed']);
    expect((await ctx.models.Player.findByPk(b)).status).toBe('merged');
  });
});
