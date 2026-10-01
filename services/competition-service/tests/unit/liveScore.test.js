const { liveState, addRally, undoRally, MAX_RALLIES } = require('../../src/modules/match/domain/liveScore');
const { PRESETS, validateResult } = require('../../src/modules/match/domain/badmintonScore');
const { createRng } = require('../../src/modules/matchmaking/domain/seededRandom');

// Bấm điểm trực tiếp (docs/06 mục 1.5): chuỗi pha cầu → tỉ số.

const S21 = PRESETS['1x21'];
const S3x21 = PRESETS['3x21'];

// Chuỗi pha cầu cho MỘT game kết thúc đúng ở a–b: hai đội đổi nhau ghi điểm (không ai dẫn 2)
// tới khi đội thua đủ điểm, rồi đội thắng ghi nốt.
const game = (a, b) => {
  const [w, l, W, L] = a > b ? [a, b, 'A', 'B'] : [b, a, 'B', 'A'];
  return (W + L).repeat(l) + W.repeat(w - l);
};
const state = (rallies, scoring = S21, firstServer = 'A') => liveState({ rallies, firstServer, scoring });

describe('hết game, hết trận theo luật của trận', () => {
  test('21–19: xong game và xong trận (1 game)', () => {
    const s = state(game(21, 19));
    expect(s).toMatchObject({ games: [[21, 19]], current: null, decided: true, winnerSide: 'A', server: null, serveFrom: null, gameNo: 1 });
  });
  test('20–20 chưa xong; phải tới 22–20', () => {
    expect(state('AB'.repeat(20)).decided).toBe(false);
    expect(state('AB'.repeat(20) + 'A')).toMatchObject({ current: [21, 20], decided: false });
    expect(state('AB'.repeat(20) + 'AA')).toMatchObject({ games: [[22, 20]], decided: true });
  });
  test('29–29 → 30–29 là xong (chạm trần 30)', () => {
    expect(state('AB'.repeat(29)).current).toEqual([29, 29]);
    expect(state('AB'.repeat(29) + 'B')).toMatchObject({ games: [[29, 30]], decided: true, winnerSide: 'B' });
  });
  test('không có trần: 30–30 vẫn đánh tiếp, 32–30 mới xong', () => {
    const noCap = { bestOf: 1, points: 21, cap: null };
    expect(state('AB'.repeat(30), noCap).decided).toBe(false);
    expect(state('AB'.repeat(30) + 'AA', noCap)).toMatchObject({ games: [[32, 30]], decided: true });
  });
  test('đánh 3 game: 1–1 thì sang game 3, đội thắng game 2 giao trước', () => {
    const s = state(game(21, 15) + game(18, 21), S3x21);
    expect(s).toMatchObject({ games: [[21, 15], [18, 21]], current: [0, 0], gameNo: 3, gamesWon: [1, 1], decided: false, server: 'B', serveFrom: 'right' });
    expect(state(game(21, 15) + game(18, 21) + game(21, 17), S3x21)).toMatchObject({ gamesWon: [2, 1], decided: true, winnerSide: 'A', gameNo: 3 });
  });
  test('đánh 3 game: 2–0 là xong, không có game 3', () => {
    expect(state(game(21, 10) + game(21, 12), S3x21)).toMatchObject({ games: [[21, 10], [21, 12]], decided: true, gameNo: 2 });
  });
  test('các luật khác: 3 × 15 (trần 21), 1 × 31 (trần 40)', () => {
    expect(state(game(15, 13), PRESETS['3x15'])).toMatchObject({ games: [[15, 13]], decided: false, gameNo: 2 });
    expect(state('AB'.repeat(20) + 'A', PRESETS['3x15'])).toMatchObject({ games: [[21, 20]] });
    expect(state('AB'.repeat(39) + 'A', PRESETS['1x31'])).toMatchObject({ games: [[40, 39]], decided: true });
  });
});

describe('đội giao và ô giao', () => {
  test('điểm đầu: đội chọn giao trước, ô phải (0 điểm là chẵn)', () => {
    expect(state('', S21, 'B')).toMatchObject({ server: 'B', serveFrom: 'right', current: [0, 0], gameNo: 1, decided: false });
  });
  test('đội thắng pha trước giao; điểm của đội giao chẵn → ô phải, lẻ → ô trái', () => {
    expect(state('A')).toMatchObject({ server: 'A', serveFrom: 'left' });
    expect(state('AA')).toMatchObject({ server: 'A', serveFrom: 'right' });
    expect(state('AAB')).toMatchObject({ server: 'B', serveFrom: 'left' });
    expect(state('AABB')).toMatchObject({ server: 'B', serveFrom: 'right', current: [2, 2] });
  });
});

describe('bấm thêm / hoàn tác', () => {
  test('bấm thêm nối đúng ký tự', () => {
    expect(addRally({ rallies: 'AB', scoring: S21 }, 'A')).toBe('ABA');
  });
  test('đã đủ điểm thắng trận thì không bấm thêm được (409 MATCH_DECIDED)', () => {
    expect(() => addRally({ rallies: game(21, 19), scoring: S21 }, 'B')).toThrow(expect.objectContaining({ code: 'MATCH_DECIDED', status: 409 }));
  });
  test('side lạ → INVALID_SIDE', () => {
    expect(() => addRally({ rallies: '', scoring: S21 }, 'C')).toThrow(expect.objectContaining({ code: 'INVALID_SIDE' }));
  });
  test('hoàn tác qua ranh giới game: 21–19 → 20–19 game 1', () => {
    const back = state(undoRally(game(21, 19)), S3x21);
    expect(back).toMatchObject({ games: [], current: [20, 19], gameNo: 1, decided: false });
  });
  test('hoàn tác khi chưa có điểm nào → 409 NOTHING_TO_UNDO', () => {
    expect(() => undoRally('')).toThrow(expect.objectContaining({ code: 'NOTHING_TO_UNDO', status: 409 }));
  });
  test(`chuỗi không phình vô hạn: quá ${MAX_RALLIES} pha cầu → LIVE_TOO_LONG`, () => {
    const endless = { bestOf: 1, points: 50, cap: null };
    expect(() => addRally({ rallies: 'AB'.repeat(MAX_RALLIES / 2), scoring: endless }, 'A')).toThrow(expect.objectContaining({ code: 'LIVE_TOO_LONG' }));
  });
});

describe('khớp luật kiểm tỉ số khi xác nhận (badmintonScore)', () => {
  test('300 trận bấm ngẫu nhiên tới khi xong: tỉ số luôn hợp lệ và cùng đội thắng', () => {
    const rng = createRng('live-score-property');
    for (let i = 0; i < 300; i += 1) {
      const scoring = Object.values(PRESETS)[i % 4];
      const bias = 0.3 + rng.next() * 0.4;
      let rallies = '';
      while (!state(rallies, scoring).decided) rallies = addRally({ rallies, scoring }, rng.next() < bias ? 'A' : 'B');
      const s = state(rallies, scoring);
      const checked = validateResult({ games: s.games }, scoring);
      expect(checked.winnerSide).toBe(s.winnerSide);
      expect(s.games.reduce((n, [a, b]) => n + a + b, 0)).toBe(rallies.length);
    }
  });
});
