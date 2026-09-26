const { validateResult, validateScoring, gameError, PRESETS } = require('../../src/modules/match/domain/badmintonScore');
const { linesForMatch, accumulate } = require('../../src/modules/match/domain/matchStats');
const { computeStandings } = require('../../src/modules/tournament/domain/standings');
const { computePlacements } = require('../../src/modules/tournament/domain/placements');
const { planBracket } = require('../../src/modules/tournament/domain/bracketPlan');
const { advise } = require('../../src/modules/tournament/domain/formatAdvisor');
const { checkPlayer, checkPair, validateRatingRule } = require('../../src/modules/tournament/domain/eligibility');
const { buildTeams, buildStructure, validateDraw } = require('../../src/modules/tournament/domain/draw');
const { assertAction, canDo } = require('../../src/modules/tournament/domain/stateMachine');
const { pointsFor, categoryFor, basePoints } = require('../../src/modules/ranking/domain/rankingPoints');

const S21 = PRESETS['3x21'];

describe('luật tỉ số (docs/06 mục 1.4)', () => {
  test.each([['21-19', [21, 19]], ['22-20', [22, 20]], ['29-27', [29, 27]], ['30-28', [30, 28]], ['30-29', [30, 29]], ['21-0', [21, 0]]])('%s hợp lệ', (_, g) => {
    expect(gameError(g, S21)).toBeNull();
  });
  test.each([['21-20', [21, 20]], ['23-20', [23, 20]], ['31-29', [31, 29]], ['20-18', [20, 18]], ['21-21', [21, 21]]])('%s không hợp lệ', (_, g) => {
    expect(gameError(g, S21)).not.toBeNull();
  });

  test('cả trận: 2–1 hợp lệ; game sau khi đã thắng 2–0 bị chặn; chưa đủ game bị chặn', () => {
    expect(validateResult({ games: [[21, 17], [18, 21], [30, 29]] }, S21)).toMatchObject({ winnerSide: 'A', outcome: 'normal', summary: { gamesA: 2, gamesB: 1 } });
    expect(() => validateResult({ games: [[21, 10], [21, 12], [21, 5]] }, S21)).toThrow(/đã phân thắng bại/);
    expect(() => validateResult({ games: [[21, 10]] }, S21)).toThrow(/chưa kết thúc/);
    expect(() => validateResult({ games: [[21, 20]] }, S21)).toThrow(/21-20 không hợp lệ/);
    expect(() => validateResult({ games: [[21, 10], [21, 12]], winnerSide: 'B' }, S21)).toThrow(/không khớp/);
  });

  test('W.O. không có tỉ số; bỏ cuộc giữa trận cần bên thắng và trận chưa phân thắng bại', () => {
    expect(validateResult({ outcome: 'walkover', winnerSide: 'B' }, S21)).toMatchObject({ games: [], winnerSide: 'B' });
    expect(() => validateResult({ outcome: 'walkover', games: [[21, 5]], winnerSide: 'A' }, S21)).toThrow();
    expect(validateResult({ outcome: 'retired', games: [[21, 15]], winnerSide: 'A' }, S21)).toMatchObject({ outcome: 'retired' });
    expect(() => validateResult({ outcome: 'retired', games: [[21, 15], [21, 10]], winnerSide: 'A' }, S21)).toThrow(/đã phân thắng bại/);
  });

  test('1 game 21 và 3 game 15 (trần 21); luật tuỳ chỉnh sai bị chặn', () => {
    expect(validateResult({ games: [[21, 18]] }, PRESETS['1x21']).winnerSide).toBe('A');
    expect(gameError([21, 20], PRESETS['3x15'])).toBeNull(); // 15 điểm, trần 21: 21-20 là điểm vàng
    expect(gameError([17, 15], PRESETS['3x15'])).toBeNull();
    expect(() => validateScoring({ bestOf: 2, points: 21 })).toThrow();
    expect(() => validateScoring({ bestOf: 3, points: 21, cap: 22 })).toThrow();
  });
});

describe('thống kê trận', () => {
  test('dòng theo từng người; W.O. không vào thống kê; chuỗi + 5 trận gần nhất', () => {
    const m = (id, side, won, at, games = [[21, 15], [21, 18]]) => ({
      id, status: 'completed', outcome: 'normal', winnerSide: won ? side : side === 'A' ? 'B' : 'A', games, discipline: 'doubles', contextType: 'tournament', completedAt: new Date(at)
    });
    const lines = [
      ...linesForMatch(m('1', 'A', true, '2026-09-01'), [{ playerId: 'p', side: 'A' }]),
      ...linesForMatch(m('2', 'A', false, '2026-09-02', [[15, 21], [18, 21]]), [{ playerId: 'p', side: 'A' }]),
      ...linesForMatch(m('3', 'B', true, '2026-09-03', [[15, 21], [18, 21]]), [{ playerId: 'p', side: 'B' }]),
      ...linesForMatch(m('4', 'A', true, '2026-09-04'), [{ playerId: 'p', side: 'A' }]),
      ...linesForMatch({ ...m('5', 'A', true, '2026-09-05'), outcome: 'walkover', games: [] }, [{ playerId: 'p', side: 'A' }])
    ];
    const s = accumulate(lines);
    expect(s).toMatchObject({ matches: 4, wins: 3, losses: 1, streak: 2, last5: ['W', 'L', 'W', 'W'] });
    expect(s.gamesWon).toBe(6);
    expect(s.pointsWon).toBe(42 + 33 + 42 + 42);
  });
});

describe('bảng xếp hạng trong bảng (docs/06 mục 6)', () => {
  const match = (a, b, winner, games) => ({ status: 'completed', teamAId: a, teamBId: b, winnerSide: winner, outcome: 'normal', games });

  test('hai đội bằng số trận thắng → đối đầu trực tiếp', () => {
    const rows = computeStandings({
      teamIds: ['X', 'Y', 'Z'],
      bestOf: 1,
      matches: [match('X', 'Y', 'B', [[15, 21]]), match('X', 'Z', 'A', [[21, 5]]), match('Y', 'Z', 'B', [[19, 21]])]
    });
    // X, Y, Z đều thắng 1 → ≥ 3 đội: hiệu số game bằng nhau (0) → hiệu số điểm: X +10, Y +4, Z −14
    expect(rows.map((r) => r.teamId)).toEqual(['X', 'Y', 'Z']);
  });

  test('đúng hai đội bằng số trận thắng → đội thắng trận đối đầu xếp trên dù hiệu số kém hơn', () => {
    const rows = computeStandings({
      teamIds: ['A', 'B', 'C', 'D'],
      bestOf: 1,
      matches: [
        match('A', 'B', 'B', [[19, 21]]),
        match('A', 'C', 'A', [[21, 0]]),
        match('A', 'D', 'A', [[21, 0]]),
        match('B', 'C', 'A', [[21, 19]]),
        match('B', 'D', 'B', [[19, 21]]),
        match('C', 'D', 'A', [[21, 19]])
      ]
    });
    // A: 2 thắng (hiệu số +40), B: 2 thắng (+2) → B thắng đối đầu nên B xếp trên A
    expect(rows.slice(0, 2).map((r) => r.teamId)).toEqual(['B', 'A']);
  });

  test('W.O. tính thắng đủ số game, không có điểm số; bỏ cuộc giữa trận cộng game còn thiếu', () => {
    const rows = computeStandings({
      teamIds: ['A', 'B'],
      bestOf: 3,
      matches: [
        { status: 'completed', teamAId: 'A', teamBId: 'B', winnerSide: 'A', outcome: 'walkover', games: [] },
        { status: 'completed', teamAId: 'A', teamBId: 'B', winnerSide: 'B', outcome: 'retired', games: [[21, 18]] }
      ]
    });
    const a = rows.find((r) => r.teamId === 'A');
    expect(a).toMatchObject({ wins: 1, gamesWon: 3, gamesLost: 2, pointsWon: 21, pointsLost: 18 });
  });
});

describe('sơ đồ + thứ hạng chung cuộc', () => {
  test('6 đội đi tiếp → sơ đồ 8, 2 bye; người thắng / người thua bán kết đi đúng ô', () => {
    const plan = planBracket({ positions: ['A1', null, 'B2', 'C2', 'B1', null, 'C1', 'A2'], thirdPlace: true });
    const byKey = Object.fromEntries(plan.matches.map((m) => [m.key, m]));
    expect(Object.keys(byKey).sort()).toEqual(['R1M2', 'R1M4', 'R2M1', 'R2M2', 'R3M1', 'TP']);
    expect(byKey.R2M1.teamA).toBe('A1');
    expect(byKey.R2M2.teamA).toBe('B1');
    expect(byKey.R1M2).toMatchObject({ nextKey: 'R2M1', nextSlot: 'B', label: 'Tứ kết' });
    expect(byKey.R2M1).toMatchObject({ nextKey: 'R3M1', nextSlot: 'A', loserNextKey: 'TP', loserNextSlot: 'A', label: 'Bán kết' });
    expect(byKey.R3M1.label).toBe('Chung kết');
  });

  test('thứ hạng: vô địch 1, á quân 2, thua bán kết 3–4, thua tứ kết 5–8, bị loại vòng bảng xếp sau', () => {
    const ko = (key, round, a, b, winner, extra = {}) => ({ id: key, stage: 'knockout', roundNo: round, teamAId: a, teamBId: b, winnerSide: winner, status: 'completed', outcome: 'normal', games: [[21, 10]], ...extra });
    const knockoutMatches = [
      ko('q1', 1, 'B2', 'C2', 'A'),
      ko('q2', 1, 'C1', 'A2', 'A'),
      ko('s1', 2, 'A1', 'B2', 'A'),
      ko('s2', 2, 'B1', 'C1', 'B'),
      ko('f', 3, 'A1', 'C1', 'B')
    ];
    const groupStandings = [
      [{ teamId: 'A1', rank: 1, played: 3, wins: 3, gameDiff: 3, pointDiff: 20 }, { teamId: 'A2', rank: 2, played: 3, wins: 2, gameDiff: 1, pointDiff: 5 }, { teamId: 'A3', rank: 3, played: 3, wins: 1, gameDiff: -1, pointDiff: -4 }],
      [{ teamId: 'B1', rank: 1, played: 3, wins: 3, gameDiff: 3, pointDiff: 25 }, { teamId: 'B2', rank: 2, played: 3, wins: 2, gameDiff: 1, pointDiff: 2 }, { teamId: 'B3', rank: 3, played: 3, wins: 1, gameDiff: -1, pointDiff: -2 }]
    ];
    const places = computePlacements({
      format: 'groups_knockout', teamIds: ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2'], groupStandings, knockoutMatches, allMatches: knockoutMatches, knockoutRounds: 3
    });
    const by = Object.fromEntries(places.map((p) => [p.teamId, p]));
    expect([by.C1.from, by.C1.label]).toEqual([1, 'Vô địch']);
    expect([by.A1.from, by.A1.label]).toEqual([2, 'Á quân']);
    expect([by.B2.from, by.B2.to, by.B1.from]).toEqual([3, 4, 3]);
    expect([by.C2.from, by.C2.to, by.A2.from]).toEqual([5, 8, 5]);
    // Bị loại vòng bảng: sau 6 đội vào vòng trong, theo hạng trong bảng rồi tỉ lệ thắng / hiệu số
    expect([by.B3.from, by.A3.from]).toEqual([7, 8]);
    expect(by.B3.reachedKnockout).toBe(false);
  });
});

describe('gợi ý thể thức', () => {
  test('12 đội, 4 sân → 3 bảng × 4, đi tiếp 2 / bảng, 23 trận (18 vòng bảng + 5 loại trực tiếp)', () => {
    expect(advise({ teams: 12, courts: 4, matchMinutes: 15 })).toMatchObject({
      format: 'groups_knockout', groupCount: 3, groupSizes: [4, 4, 4], advancePerGroup: 2, estimate: { matches: 23 }
    });
  });
  test('5 đội → vòng tròn (10 trận); 40 đội → loại trực tiếp (39 trận)', () => {
    expect(advise({ teams: 5 })).toMatchObject({ format: 'round_robin', estimate: { matches: 10 } });
    expect(advise({ teams: 40, courts: 6 })).toMatchObject({ format: 'knockout', estimate: { matches: 39 } });
  });
});

describe('điểm BXH thành tích (docs/05 mục 3.2)', () => {
  test('ví dụ tài liệu: 183, 42, 170', () => {
    expect(pointsFor({ placement: { from: 1, reachedKnockout: true, wins: 4 }, format: 'groups_knockout', tier: 'open', teams: 16, avgRating: 3.2 }).points).toBe(183);
    expect(pointsFor({ placement: { from: 2, reachedKnockout: true, wins: 2 }, format: 'knockout', tier: 'club', teams: 8, avgRating: 2.8 }).points).toBe(42);
    expect(pointsFor({ placement: { from: 1, reachedKnockout: true, wins: 5 }, format: 'groups_knockout', tier: 'open', teams: 12, avgRating: 3.4 }).points).toBe(170);
  });
  test('đội bị loại vòng bảng nhận "còn lại" (8 + 4 × số trận thắng, tối đa 19) dù số thứ tự nhỏ', () => {
    expect(basePoints({ from: 7, reachedKnockout: false, format: 'groups_knockout', wins: 1 })).toBe(12);
    expect(basePoints({ from: 7, reachedKnockout: false, format: 'groups_knockout', wins: 5 })).toBe(19);
    expect(basePoints({ from: 7, reachedKnockout: false, format: 'round_robin', wins: 1 })).toBe(32);
  });
  test('hạng mục theo nội dung + thành phần đội', () => {
    expect(categoryFor({ discipline: 'doubles', genderRule: 'mixed', genders: ['male', 'female'] })).toBe('XD');
    expect(categoryFor({ discipline: 'doubles', genderRule: 'open', genders: ['female', 'female'] })).toBe('WD');
    expect(categoryFor({ discipline: 'singles', genderRule: 'open', genders: ['male'] })).toBe('MS');
  });
});

describe('điều kiện đăng ký + máy trạng thái', () => {
  const t = { discipline: 'doubles', genderRule: 'mixed', ratingRule: { scope: 'player', max: 4.0 } };
  const p = (gender) => ({ id: gender, displayName: `Người ${gender}`, gender, status: 'active' });
  test('chưa có điểm → NEEDS_ASSESSMENT; vượt trần trình → NOT_ELIGIBLE', () => {
    expect(() => checkPlayer({ tournament: t, player: p('male'), rating: null })).toThrow(expect.objectContaining({ code: 'NEEDS_ASSESSMENT' }));
    expect(() => checkPlayer({ tournament: t, player: p('male'), rating: { pairingRating: 4.3 } })).toThrow(expect.objectContaining({ code: 'NOT_ELIGIBLE' }));
    expect(() => checkPlayer({ tournament: t, player: p('male'), rating: { pairingRating: 3.9 } })).not.toThrow();
  });
  test('cặp cố định: tổng trình cặp', () => {
    const fixed = { discipline: 'doubles', genderRule: 'open', ratingRule: { scope: 'team_sum', max: 7.0 } };
    expect(() => checkPair({ tournament: fixed, a: p('a'), b: p('b'), ratingA: { pairingRating: 3.6 }, ratingB: { pairingRating: 3.5 } })).toThrow(/7.1/);
    expect(() => validateRatingRule({ scope: 'team_sum', max: 7 }, { pairingMode: 'random_balanced', discipline: 'doubles' })).toThrow();
  });
  test('máy trạng thái', () => {
    expect(canDo('open', 'register')).toBe(true);
    expect(canDo('drawn', 'register')).toBe(false);
    expect(() => assertAction({ status: 'finalized' }, 'cancel')).toThrow(expect.objectContaining({ status: 409 }));
  });
});

describe('bốc thăm (hàm thuần)', () => {
  const tournament = { discipline: 'doubles', genderRule: 'mixed', pairingMode: 'random_balanced', format: 'groups_knockout', groupMode: 'seeded', groupCount: null, courtCount: 4, matchMinutes: 15, thirdPlaceMatch: false };
  const entries = Array.from({ length: 25 }, (_, i) => ({
    playerId: `00000000-0000-7000-8000-${String(i).padStart(12, '0')}`,
    gender: i < 13 ? 'male' : 'female',
    pairingRating: 2.5 + ((i * 7) % 15) / 10,
    registeredAt: new Date(Date.UTC(2026, 8, 1, 0, i))
  }));

  test('ví dụ 06 §9: 13 nam 12 nữ → 12 đội, 1 nam chờ, 3 bảng × 4, 18 trận, 5 lượt, 75 phút', () => {
    const teams = buildTeams({ tournament, entries, seed: 's' });
    expect(teams.teams).toHaveLength(12);
    expect(teams.waitlist).toEqual([{ playerId: entries[12].playerId, reason: 'GENDER_IMBALANCE' }]);
    const structure = buildStructure({ tournament, teams: teams.teams, seed: 's' });
    expect(structure.groups.map((g) => g.teams.length)).toEqual([4, 4, 4]);
    expect(structure.estimate).toEqual({ matches: 18, slots: 5, minutes: 75 });
    expect(() => validateDraw({ tournament, entries, teams: teams.teams, groups: structure.groups })).not.toThrow();
  });

  test('bản chỉnh tay sai (một người ở hai đội / đội toàn nam / thiếu người) bị chặn', () => {
    const { teams } = buildTeams({ tournament, entries, seed: 's' });
    const { groups } = buildStructure({ tournament, teams, seed: 's' });
    const dup = teams.map((x) => ({ players: [...x.players] }));
    dup[1].players[0] = dup[0].players[0];
    expect(() => validateDraw({ tournament, entries, teams: dup, groups })).toThrow(expect.objectContaining({ code: 'DRAW_INVALID' }));
    const twoMen = teams.map((x) => ({ players: [...x.players] }));
    [twoMen[0].players[1], twoMen[1].players[0]] = [twoMen[1].players[0], twoMen[0].players[1]];
    expect(() => validateDraw({ tournament, entries, teams: twoMen, groups })).toThrow(/1 nam \+ 1 nữ/);
    expect(() => validateDraw({ tournament, entries, teams: teams.slice(0, 10), groups })).toThrow();
  });
});
