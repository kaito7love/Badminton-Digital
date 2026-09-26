const { createTestContext, STAFF, MANAGER } = require('./helpers');
const { computePeriodRatings } = require('../../src/modules/rating/domain/ratingEngine');
const { pointsFor } = require('../../src/modules/ranking/domain/rankingPoints');

// Trọn ví dụ docs/06 mục 9 bằng API thật: "Đôi nam nữ ghép cặp — trình ≤ 4.0".
// Hơn trăm request tuần tự trên MySQL thật → cho mỗi test tối đa 2 phút.
jest.setTimeout(120000);
const TOUR = 'tournament:read tournament:operate tournament:manage';
let ctx;
let manager;
let employee;
let tid;
const ids = {};
const preRatings = {};

beforeAll(async () => {
  ctx = await createTestContext();
  manager = await ctx.as({ scope: `${MANAGER} ${TOUR}`, sub: 'bd:user:mgr', org: ['bd:branch:1'] });
  employee = await ctx.as({ scope: `${STAFF} tournament:read tournament:operate`, sub: 'bd:user:emp', org: ['bd:branch:1'] });
});
afterAll(() => ctx.close());

const makePlayer = async (key, gender, rating) => {
  const res = await manager.put(`/v1/players/by-ref/bd:customer:${key}`).send({ displayName: `Người ${key}` });
  const id = res.body.data.id;
  await manager.patch(`/v1/players/${id}`).send({ gender });
  if (rating !== null) {
    const adj = await manager.post(`/v1/players/${id}/rating-adjustments`).send({ discipline: 'doubles', newRating: rating, reason: 'Dữ liệu test giải đôi nam nữ' });
    expect(adj.status).toBe(201);
    preRatings[id] = rating;
  }
  ids[key] = id;
  return id;
};

const version = (m) => `"${m.version}"`;
const listMatches = async () => (await manager.get(`/v1/tournaments/${tid}/matches`)).body.data.items;
const sideRating = (m, side) => {
  const team = side === 'A' ? m.teamA : m.teamB;
  return team.players.reduce((s, p) => s + preRatings[p.id], 0) / team.players.length;
};
// Kết quả xác định: đội điểm cao hơn thắng 21 – (8 … 19).
const play = async (m, i = 0) => {
  const aWins = sideRating(m, 'A') >= sideRating(m, 'B');
  const loser = 8 + (i % 12);
  const games = [aWins ? [21, loser] : [loser, 21]];
  const res = await employee.put(`/v1/matches/${m.id}/result`).set('If-Match', version(m)).send({ games });
  expect(res.status).toBe(200);
  return res.body.data;
};

describe('giải đôi nam nữ ghép cặp — trọn vòng đời', () => {
  test('tạo giải: nhân viên thường → 403; quản lý chi nhánh khác → 403; quản lý đúng chi nhánh → 201 nháp', async () => {
    const body = {
      organizerRef: 'bd:branch:1', name: 'Đôi nam nữ ghép cặp — trình ≤ 4.0', startsOn: '2026-10-25', tier: 'open',
      discipline: 'doubles', genderRule: 'mixed', pairingMode: 'random_balanced', format: 'groups_knockout',
      groupCount: 3, advancePerGroup: 2, groupMode: 'seeded', scoring: '1x21', courtCount: 4, matchMinutes: 15,
      ratingRule: { scope: 'player', max: 4.0 }, rated: true, ranked: true
    };
    expect((await employee.post('/v1/tournaments').send(body)).status).toBe(403);
    const other = await ctx.as({ scope: `${MANAGER} ${TOUR}`, org: ['bd:branch:2'] });
    const wrongOrg = await other.post('/v1/tournaments').send(body);
    expect(wrongOrg.status).toBe(403);
    expect(wrongOrg.body.code).toBe('FORBIDDEN_ORGANIZER');
    const res = await manager.post('/v1/tournaments').send(body);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'draft', scoring: { bestOf: 1, points: 21, cap: 30 }, format: 'groups_knockout' });
    tid = res.body.data.id;
    // Chi nhánh khác không thấy giải (404, không lộ tồn tại).
    expect((await other.get(`/v1/tournaments/${tid}`)).status).toBe(404);
    // Chưa mở đăng ký thì không đăng ký được.
    const early = await makePlayer('early', 'male', 3.0);
    expect((await employee.post(`/v1/tournaments/${tid}/entries`).send({ playerId: early })).status).toBe(409);
    expect((await manager.post(`/v1/tournaments/${tid}/open`).send()).body.data.status).toBe('open');
  });

  test('đăng ký 14 nam 12 nữ: 1 nam 4.3 bị từ chối; 2 người chưa có điểm → chấm nhanh rồi đăng ký; trùng → 409', async () => {
    const menRatings = [3.9, 3.8, 3.7, 3.6, 3.5, 3.4, 3.3, 3.2, 3.1, 3.0, 2.9, 2.8];
    const womenRatings = [3.8, 3.6, 3.5, 3.4, 3.2, 3.1, 3.0, 2.9, 2.8, 2.7, 2.6];
    for (const [i, r] of menRatings.entries()) {
      const id = await makePlayer(`m${i}`, 'male', r);
      expect((await employee.post(`/v1/tournaments/${tid}/entries`).send({ playerId: id })).status).toBe(201);
    }
    for (const [i, r] of womenRatings.entries()) {
      const id = await makePlayer(`w${i}`, 'female', r);
      expect((await employee.post(`/v1/tournaments/${tid}/entries`).send({ playerId: id })).status).toBe(201);
    }
    const strong = await makePlayer('strong', 'male', 4.3);
    const rejected = await employee.post(`/v1/tournaments/${tid}/entries`).send({ playerId: strong });
    expect(rejected.status).toBe(422);
    expect(rejected.body.code).toBe('NOT_ELIGIBLE');

    for (const [key, gender] of [['newM', 'male'], ['newW', 'female']]) {
      const id = await makePlayer(key, gender, null);
      const noRating = await employee.post(`/v1/tournaments/${tid}/entries`).send({ playerId: id });
      expect(noRating.status).toBe(422);
      expect(noRating.body.code).toBe('NEEDS_ASSESSMENT');
      await employee.post(`/v1/players/${id}/assessments/quick`).send({ level: 'tb' });
      preRatings[id] = 3.25;
      expect((await employee.post(`/v1/tournaments/${tid}/entries`).send({ playerId: id })).status).toBe(201);
    }
    const dup = await employee.post(`/v1/tournaments/${tid}/entries`).send({ playerId: ids.m0 });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('ALREADY_REGISTERED');

    const entries = (await employee.get(`/v1/tournaments/${tid}/entries`)).body.data.items;
    expect(entries.filter((e) => e.status === 'registered')).toHaveLength(25);
    expect(entries.find((e) => e.playerId === ids.newM).flags).toEqual(expect.arrayContaining(['quick']));
  });

  let proposal;
  test('xem trước bốc thăm: 12 đội nam nữ, 1 nam chờ, 3 bảng × 4, 18 trận / 5 lượt / 75 phút, cân hơn bốc thuần tuý', async () => {
    expect((await employee.post(`/v1/tournaments/${tid}/draw/preview`, { key: false }).send({})).status).toBe(403);
    const res = await manager.post(`/v1/tournaments/${tid}/draw/preview`, { key: false }).send({ seed: 'demo-seed' });
    expect(res.status).toBe(200);
    proposal = res.body.data;
    expect(proposal.teams).toHaveLength(12);
    for (const t of proposal.teams) expect(t.players.map((p) => p.gender).sort()).toEqual(['female', 'male']);
    expect(proposal.waitlist).toHaveLength(1);
    expect(proposal.waitlist[0].reason).toBe('GENDER_IMBALANCE');
    expect(proposal.groups.map((g) => g.teams.length)).toEqual([4, 4, 4]);
    expect(proposal.estimate).toEqual({ matches: 18, slots: 5, minutes: 75 });
    expect(proposal.stats.teamRatingStdDev).toBeLessThan(proposal.stats.baselineRandomStdDev / 3);
    // Cùng seed → cùng đề xuất.
    const again = await manager.post(`/v1/tournaments/${tid}/draw/preview`, { key: false }).send({ seed: 'demo-seed' });
    expect(again.body.data.teams).toEqual(proposal.teams);
  });

  test('xác nhận: bản sai → 422 DRAW_INVALID; đổi tay hai bạn nữ → drawn, 18 trận có lượt, người thừa vào danh sách chờ', async () => {
    const teams = proposal.teams.map((t) => ({ players: t.players.map((p) => p.id) }));
    const bad = teams.map((t) => ({ players: [...t.players] }));
    bad[1].players[0] = bad[0].players[0];
    const invalid = await manager.post(`/v1/tournaments/${tid}/draw`).send({ seed: proposal.seed, teams: bad, groups: proposal.groups });
    expect(invalid.status).toBe(422);
    expect(invalid.body.code).toBe('DRAW_INVALID');

    const femaleIdx = (t) => t.players.findIndex((pid) => proposal.teams.flatMap((x) => x.players).find((p) => p.id === pid).gender === 'female');
    const [t0, t1] = [teams[0], teams[1]];
    const [i0, i1] = [femaleIdx(t0), femaleIdx(t1)];
    [t0.players[i0], t1.players[i1]] = [t1.players[i1], t0.players[i0]];
    const res = await manager.post(`/v1/tournaments/${tid}/draw`).send({ seed: proposal.seed, teams, groups: proposal.groups.map((g) => ({ groupNo: g.groupNo, teams: g.teams })) });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'drawn', stage: 'group', drawSeed: 'demo-seed', progress: { matches: { total: 18, completed: 0 } } });
    const matches = await listMatches();
    expect(matches).toHaveLength(18);
    expect(Math.max(...matches.map((m) => m.slotNo))).toBe(5);
    const entries = (await manager.get(`/v1/tournaments/${tid}/entries`)).body.data.items;
    expect(entries.filter((e) => e.status === 'waitlisted').map((e) => e.waitlistReason)).toEqual(['draw']);
    const drawn = await ctx.models.OutboxEvent.findOne({ where: { aggregateId: tid, type: 'competition.tournament.drawn' } });
    expect(drawn.payload.data).toMatchObject({ seed: 'demo-seed', manualEdits: true, matches: 18 });
  });

  test('ghi kết quả: thiếu If-Match → 412; lệch → 409; 21-20 → 422; kết quả đầu tiên → in_progress; vòng bảng xong', async () => {
    const [first, ...rest] = await listMatches();
    expect((await employee.put(`/v1/matches/${first.id}/result`).send({ games: [[21, 10]] })).status).toBe(412);
    const stale = await employee.put(`/v1/matches/${first.id}/result`).set('If-Match', '"99"').send({ games: [[21, 10]] });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('VERSION_CONFLICT');
    const bad = await employee.put(`/v1/matches/${first.id}/result`).set('If-Match', version(first)).send({ games: [[21, 20]] });
    expect(bad.status).toBe(422);
    expect(bad.body.code).toBe('SCORE_INVALID');
    expect(bad.body.message).toMatch(/21-20 không hợp lệ/);

    await play(first, 0);
    expect((await manager.get(`/v1/tournaments/${tid}`)).body.data.status).toBe('in_progress');
    for (const [i, m] of rest.entries()) await play(m, i + 1);

    const standings = (await manager.get(`/v1/tournaments/${tid}/standings`)).body.data.groups;
    expect(standings).toHaveLength(3);
    for (const g of standings) {
      expect(g.rows.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
      expect(g.rows.reduce((s, r) => s + r.played, 0)).toBe(12);
    }
    const early = await manager.post(`/v1/tournaments/${tid}/finalize`).send();
    expect(early.status).toBe(409);
    expect(early.body.code).toBe('NOT_READY');
  });

  test('sơ đồ loại trực tiếp: 6 đội → sơ đồ 8, 2 bye, nhất – nhì cùng bảng ở hai nửa; người thắng tự đi tiếp', async () => {
    const preview = (await manager.post(`/v1/tournaments/${tid}/knockout/preview`, { key: false }).send()).body.data;
    expect(preview.size).toBe(8);
    expect(preview.positions.filter((p) => p === null)).toHaveLength(2);
    expect(preview.constraintLevel).toBe(2);
    const half = (teamId) => (preview.positions.indexOf(teamId) < 4 ? 0 : 1);
    for (const g of [1, 2, 3]) {
      const [w, r] = Object.values(preview.teams).filter((t) => t.groupNo === g).sort((a, b) => a.groupRank - b.groupRank);
      expect(half(w.id)).not.toBe(half(r.id));
    }
    const locked = await manager.post(`/v1/tournaments/${tid}/knockout`).send({});
    expect(locked.body.data.stage).toBe('knockout');

    let bracket = (await manager.get(`/v1/tournaments/${tid}/bracket`)).body.data.rounds;
    expect(bracket.map((r) => r.matches.length)).toEqual([2, 2, 1]);
    // Bán kết đã có sẵn 2 đội nhận bye ở ô A.
    expect(bracket[1].matches.every((m) => m.teamA && !m.teamB)).toBe(true);
    for (const [i, m] of bracket[0].matches.entries()) await play(m, i);
    bracket = (await manager.get(`/v1/tournaments/${tid}/bracket`)).body.data.rounds;
    expect(bracket[1].matches.every((m) => m.teamA && m.teamB)).toBe(true);

    // Gọi bán kết 1 ra sân → không đổi được người thắng tứ kết đã đưa vào trận đó nữa.
    const semi = bracket[1].matches[0];
    const called = await employee.post(`/v1/matches/${semi.id}/call`).send({ courtRef: 'bd:court:1' });
    expect(called.body.data.status).toBe('in_play');
    const qf = bracket[0].matches.find((m) => m.nextMatchId === semi.id);
    const flip = qf.winnerSide === 'A' ? [[10, 21]] : [[21, 10]];
    const blocked = await employee.put(`/v1/matches/${qf.id}/result`).set('If-Match', version(qf)).send({ games: flip });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('NEXT_MATCH_STARTED');

    for (const m of bracket[1].matches) await play((await employee.get(`/v1/matches/${m.id}`)).body.data);
    bracket = (await manager.get(`/v1/tournaments/${tid}/bracket`)).body.data.rounds;
    await play(bracket[2].matches[0]);
  });

  let preview;
  test('xem trước khi chốt: thứ hạng, điểm trình trước → sau, điểm thành tích (vô địch = 100 × 2 × 0.875 × sức mạnh)', async () => {
    const res = await manager.get(`/v1/tournaments/${tid}/finalize-preview`);
    preview = res.body.data;
    expect(preview.ready).toBe(true);
    expect(preview.placements.map((p) => p.label).slice(0, 2)).toEqual(['Vô địch', 'Á quân']);
    expect(preview.placements.filter((p) => p.label === 'Vòng bảng')).toHaveLength(6);
    expect(preview.ratingChanges).toHaveLength(24);
    expect(preview.rankingEligible).toBe(true);
    const inTeams = new Set(preview.placements.flatMap((p) => p.players.map((x) => x.id)));
    const avg = [...inTeams].reduce((s, pid) => s + preRatings[pid], 0) / inTeams.size;
    const champion = preview.rankingPoints.filter((r) => r.placement === 'Vô địch');
    expect(champion).toHaveLength(2);
    const expected = pointsFor({ placement: { from: 1, reachedKnockout: true, wins: 0 }, format: 'groups_knockout', tier: 'open', teams: 12, avgRating: avg }).points;
    for (const c of champion) expect(c.points).toBe(expected);
    expect(expected).toBe(Math.round(100 * 2 * 0.875 * Math.round((avg / 3.5) * 1000) / 1000));
  });

  let finalized;
  test('chốt hai request song song → đúng một thành công; DB khớp tính tay (điểm trình, điểm BXH, thống kê)', async () => {
    const results = await Promise.all([manager.post(`/v1/tournaments/${tid}/finalize`).send(), manager.post(`/v1/tournaments/${tid}/finalize`).send()]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    finalized = results.find((r) => r.status === 200).body.data;
    expect(finalized.tournament.status).toBe('finalized');

    const { RatingChange, PlayerRating, RankingResult } = ctx.models;
    expect(await RatingChange.count({ where: { contextId: tid, reason: 'tournament' } })).toBe(24);
    expect(await RankingResult.count({ where: { tournamentId: tid } })).toBe(24);

    // Tính độc lập bằng engine từ điểm trước giải + các trận lấy qua API.
    const matches = (await listMatches()).filter((m) => m.status === 'completed');
    const players = Object.entries(preRatings).map(([playerId, rating]) => ({ playerId, rating, ratedMatches: 0, lastMatchAt: null }));
    const expected = computePeriodRatings({
      players,
      matches: matches.map((m) => ({ matchId: m.id, sideA: m.teamA.players.map((p) => p.id), sideB: m.teamB.players.map((p) => p.id), games: m.games, outcome: m.outcome, winnerSide: m.winnerSide, completedAt: m.completedAt }))
    }).changes;
    expect(expected).toHaveLength(24);
    for (const c of expected) {
      const row = await PlayerRating.findOne({ where: { playerId: c.playerId, discipline: 'doubles' } });
      expect(Number(row.rating)).toBeCloseTo(c.after, 3);
      expect(row.ratedMatches).toBe(c.ratedMatchesAdded);
    }
    const champion = finalized.placements.find((p) => p.from === 1);
    const statsRes = await manager.get(`/v1/players/${champion.players[0].id}/stats?discipline=doubles`);
    const stats = statsRes.body.data.items[0];
    const championMatches = matches.filter((m) => [...m.teamA.players, ...m.teamB.players].some((p) => p.id === champion.players[0].id));
    expect(stats).toMatchObject({ tournaments: 1, titles: 1, matches: championMatches.length, context: 'tournament' });
    expect(stats.wins + stats.losses).toBe(stats.matches);
    const ev = await ctx.models.OutboxEvent.findOne({ where: { aggregateId: tid, type: 'competition.tournament.finalized' } });
    expect(ev.payload.data.rankingPoints).toHaveLength(24);
  });

  test('BXH thành tích XD, đồng đội, đối đầu, giải của tôi / trận của tôi', async () => {
    const board = (await manager.get('/v1/leaderboards/points?category=XD')).body.data;
    const champion = finalized.placements.find((p) => p.from === 1);
    const runner = finalized.placements.find((p) => p.from === 2);
    expect(board.items.slice(0, 2).map((r) => r.player.id).sort()).toEqual(champion.players.map((p) => p.id).sort());
    expect(board.items[0].rank).toBe(1);
    // Cùng điểm, cùng số kết quả → người điểm trình cao hơn xếp trên; bằng cả điểm trình mới đồng hạng (docs/05 mục 3.2).
    expect(board.items[0].rating).toBeGreaterThanOrEqual(board.items[1].rating);
    expect(board.items[1].rank).toBe(board.items[0].rating === board.items[1].rating ? 1 : 2);
    expect(board.items[0].results[0]).toMatchObject({ placement: 'Vô địch', tournament: 'Đôi nam nữ ghép cặp — trình ≤ 4.0' });
    expect(board.items.find((r) => r.player.id === runner.players[0].id).points).toBeLessThan(board.items[0].points);

    const [a, b] = champion.players.map((p) => p.id);
    const partners = (await manager.get(`/v1/players/${a}/partners`)).body.data.items;
    expect(partners[0]).toMatchObject({ playerId: b, wins: expect.any(Number) });
    const opponent = runner.players[0].id;
    const h2h = (await manager.get(`/v1/players/${a}/head-to-head/${opponent}`)).body.data;
    expect(h2h.matches).toBeGreaterThanOrEqual(1);
    expect(h2h.wins).toBeGreaterThanOrEqual(1);

    const key = Object.keys(ids).find((k) => ids[k] === a);
    const me = await ctx.as({ scope: 'rating:self ranking:read', sub: `bd:user:${key}`, player: `bd:customer:${key}`, name: `Người ${key}` });
    const mine = (await me.get('/v1/me/tournaments')).body.data.items;
    expect(mine[0]).toMatchObject({ entryStatus: 'registered', placement: { label: 'Vô địch' }, upcomingMatches: 0 });
    const history = (await me.get('/v1/me/matches')).body.data;
    expect(history.total).toBe(mine[0].playedMatches);
    const ranking = (await me.get(`/v1/players/${a}/ranking`)).body.data;
    expect(ranking.points.XD).toMatchObject({ rank: 1 });
  });

  test('huỷ chốt → điểm về như trước giải, điểm BXH bị thu hồi, thống kê về 0; chốt lại; có người đổi điểm sau đó → không huỷ chốt được', async () => {
    const undo = await manager.post(`/v1/tournaments/${tid}/unfinalize`).send();
    expect(undo.status).toBe(200);
    expect(undo.body.data.tournament.status).toBe('in_progress');
    const { PlayerRating } = ctx.models;
    for (const [pid, before] of Object.entries(preRatings)) {
      const row = await PlayerRating.findOne({ where: { playerId: pid, discipline: 'doubles' } });
      expect(Number(row.rating)).toBeCloseTo(before, 3);
      expect(row.ratedMatches).toBe(0);
    }
    expect((await manager.get('/v1/leaderboards/points?category=XD')).body.data.total).toBe(0);
    const champion = finalized.placements.find((p) => p.from === 1).players[0].id;
    const stats = (await manager.get(`/v1/players/${champion}/stats`)).body.data.items[0];
    expect(stats).toMatchObject({ matches: 0, tournaments: 0, titles: 0 });

    expect((await manager.post(`/v1/tournaments/${tid}/finalize`).send()).status).toBe(200);
    await manager.post(`/v1/players/${champion}/rating-adjustments`).send({ discipline: 'doubles', newRating: 3.95, reason: 'Điều chỉnh sau giải để test chặn huỷ chốt' });
    const blocked = await manager.post(`/v1/tournaments/${tid}/unfinalize`).send();
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('ROLLBACK_BLOCKED');
    expect(blocked.body.errors).toHaveLength(1);
  });
});

describe('giải đơn vòng tròn — rút lui sau bốc thăm', () => {
  test('rút lui → trận chưa đánh thành W.O. cho đối thủ; W.O. không tính điểm trình, không vào thống kê', async () => {
    const res = await manager.post('/v1/tournaments').send({
      organizerRef: 'bd:branch:1', name: 'Đơn nam CLB', startsOn: '2026-11-01', tier: 'club', discipline: 'singles',
      genderRule: 'men', format: 'round_robin', scoring: '1x21', courtCount: 2
    });
    const sid = res.body.data.id;
    await manager.post(`/v1/tournaments/${sid}/open`).send();
    const singles = [];
    for (const [i, r] of [3.4, 3.2, 3.0, 2.8].entries()) {
      const pr = await manager.put(`/v1/players/by-ref/bd:customer:s${i}`).send({ displayName: `Đơn ${i}` });
      await manager.patch(`/v1/players/${pr.body.data.id}`).send({ gender: 'male' });
      await manager.post(`/v1/players/${pr.body.data.id}/rating-adjustments`).send({ discipline: 'singles', newRating: r, reason: 'Dữ liệu test giải đơn' });
      await employee.post(`/v1/tournaments/${sid}/entries`).send({ playerId: pr.body.data.id });
      singles.push(pr.body.data.id);
    }
    const prop = (await manager.post(`/v1/tournaments/${sid}/draw/preview`, { key: false }).send({ seed: 'x' })).body.data;
    await manager.post(`/v1/tournaments/${sid}/draw`).send({ seed: prop.seed, teams: prop.teams.map((t) => ({ players: t.players.map((p) => p.id) })), groups: prop.groups });
    const entries = (await manager.get(`/v1/tournaments/${sid}/entries`)).body.data.items;
    const quitter = entries.find((e) => e.playerId === singles[3]);
    const del = await employee.delete(`/v1/tournaments/${sid}/entries/${quitter.id}`);
    expect(del.status).toBe(200);
    const list = (await manager.get(`/v1/tournaments/${sid}/matches`)).body.data.items;
    const quitterMatches = list.filter((m) => [...m.teamA.players, ...m.teamB.players].some((p) => p.id === singles[3]));
    expect(quitterMatches.every((m) => m.status === 'completed' && m.outcome === 'walkover')).toBe(true);
    for (const m of list.filter((x) => x.status === 'scheduled')) {
      const r = await employee.put(`/v1/matches/${m.id}/result`).set('If-Match', `"${m.version}"`).send({ games: [[21, 15]] });
      expect(r.status).toBe(200);
    }
    const fin = await manager.post(`/v1/tournaments/${sid}/finalize`).send();
    expect(fin.status).toBe(200);
    expect(fin.body.data.rankingEligible).toBe(true);
    // Mỗi người còn lại đánh thật 2 trận (trận W.O. không tính điểm trình / thống kê).
    const row = await ctx.models.PlayerRating.findOne({ where: { playerId: singles[0], discipline: 'singles' } });
    expect(row.ratedMatches).toBe(2);
    const stats = (await manager.get(`/v1/players/${singles[0]}/stats?discipline=singles`)).body.data.items[0];
    expect(stats.matches).toBe(2);
    expect(fin.body.data.placements.find((p) => p.players[0].id === singles[3]).from).toBe(4);
  });
});
