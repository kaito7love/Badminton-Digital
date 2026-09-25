const { createTestContext } = require('./helpers');

// Endpoint tính toán không trạng thái (docs/02 mục 2.4) — qua HTTP thật, response
// được kiểm theo OpenAPI.
let ctx;
let api;
beforeAll(async () => {
  ctx = await createTestContext();
  api = await ctx.as({ scope: 'matchmaking:compute' });
});
afterAll(() => ctx.close());

const post = (path, body) => api.post(path, { key: false }).send(body);

describe('matchmaking API', () => {
  test('teams: ví dụ 8 người → 4 đội 3.40, có seed để kiểm chứng', async () => {
    const players = [4.6, 4.1, 3.8, 3.5, 3.3, 3.0, 2.7, 2.2].map((rating, i) => ({ id: `p${i}`, rating }));
    const res = await post('/v1/matchmaking/teams', { players, seed: 'demo', tolerance: 0 });
    expect(res.status).toBe(200);
    expect(res.body.data.teams.map((t) => t.teamRating)).toEqual([3.4, 3.4, 3.4, 3.4]);
    expect(res.body.data.seed).toBe('demo');
    const again = await post('/v1/matchmaking/teams', { players, seed: 'demo', tolerance: 0 });
    expect(again.body.data.teams).toEqual(res.body.data.teams);
  });

  test('teams mixed thiếu giới tính → 422 INVALID_PLAYERS (lỗi nghiệp vụ, tiếng Việt)', async () => {
    const res = await post('/v1/matchmaking/teams', { mode: 'mixed', players: [{ id: 'a', rating: 3 }, { id: 'b', rating: 3 }] });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INVALID_PLAYERS');
    expect(res.body.message).toMatch(/giới tính/);
  });

  test('groups + round-robin + schedule nối nhau như khi bốc thăm giải', async () => {
    const teams = Array.from({ length: 12 }, (_, i) => ({ id: `T${i + 1}`, rating: 4 - i * 0.1 }));
    const groups = await post('/v1/matchmaking/groups', { teams, groupCount: 3, mode: 'seeded', seed: 'g' });
    expect(groups.status).toBe(200);
    const matches = [];
    for (const g of groups.body.data.groups) {
      const rr = await post('/v1/matchmaking/round-robin', { teamIds: g.teams.map((t) => t.id) });
      rr.body.data.rounds.forEach((r) => r.matches.forEach(([a, b], k) => matches.push({ id: `${g.groupNo}-${r.round}-${k}`, teams: [a, b], groupNo: g.groupNo, round: r.round })));
    }
    const schedule = await post('/v1/matchmaking/schedule', { matches, courts: 4, matchMinutes: 15 });
    expect(schedule.body.data.estimate).toEqual({ matches: 18, slots: 5, minutes: 75 });
  });

  test('bracket + session-round', async () => {
    const bracket = await post('/v1/matchmaking/bracket', { mode: 'seeded', entrants: ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id })), seed: 'b' });
    expect(bracket.body.data).toMatchObject({ size: 8, rounds: 3 });
    expect(bracket.body.data.firstRound.filter((m) => m.bye)).toHaveLength(3);
    const round = await post('/v1/matchmaking/session-round', {
      courts: ['c1', 'c2'],
      players: Array.from({ length: 9 }, (_, i) => ({ id: `s${i}`, rating: 2.5 + i * 0.2, gamesPlayed: 0 })),
      seed: 's'
    });
    expect(round.body.data.assignments).toHaveLength(2);
    expect(round.body.data.waiting).toHaveLength(1);
  });

  test('thiếu scope matchmaking:compute → 403', async () => {
    const other = await ctx.as({ scope: 'rating:read' });
    expect((await other.post('/v1/matchmaking/teams', { key: false }).send({ players: [] })).status).toBe(403);
  });
});
