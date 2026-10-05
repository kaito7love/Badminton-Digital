import { describe, test, expect } from 'vitest';
import { backTarget, confirmMode, gameBreakOf, gamesLine, holdsCourt, loadFlip, midChangeHalf, notScorable, saveFlip, sidesOf, statusLine } from './liveScoring';
import { boardLabel, recentResults, resultLine } from './board';

const live = (over = {}) => ({
  matchId: 'm', revision: 3, rallies: 'AAB', firstServer: 'A', games: [], current: [2, 1], gameNo: 1, gamesWon: [0, 0],
  server: 'B', serveFrom: 'left', endsSwapped: false, decided: false, winnerSide: null, ...over
});
const bo3 = { scoring: { bestOf: 3, points: 21 } };
const bo1 = { scoring: { bestOf: 1, points: 21 } };

describe('sidesOf — hai nửa đi theo bên sân', () => {
  test('mặc định A trái, B phải; đổi sân (endsSwapped) thì đảo', () => {
    expect(sidesOf(live())).toEqual(['A', 'B']);
    expect(sidesOf(live({ endsSwapped: true }))).toEqual(['B', 'A']);
  });
  test('nút "Đổi bên" chồng lên đổi sân: lật hai lần = về chỗ cũ', () => {
    expect(sidesOf(live(), true)).toEqual(['B', 'A']);
    expect(sidesOf(live({ endsSwapped: true }), true)).toEqual(['A', 'B']);
  });
  test('chưa có tỉ số vẫn trả mặc định', () => {
    expect(sidesOf(null)).toEqual(['A', 'B']);
  });
});

describe('statusLine / gamesLine', () => {
  test('trận 3 game: game đang đánh + ván theo trái-phải', () => {
    const l = live({ games: [[21, 18]], gameNo: 2, gamesWon: [1, 0] });
    expect(statusLine(bo3, l)).toBe('Trận 3 game × 21 · Game 2/3 · Ván 1–0');
    expect(statusLine(bo3, l, ['B', 'A'])).toBe('Trận 3 game × 21 · Game 2/3 · Ván 0–1');
  });
  test('trận 1 game không có "Ván"; đủ điểm thắng ghi rõ', () => {
    expect(statusLine(bo1, live())).toBe('Trận 1 game × 21 · Game 1');
    expect(statusLine(bo1, live({ decided: true, games: [[21, 5]], current: null }))).toBe('Trận 1 game × 21 · Đủ điểm thắng');
  });
  test('chưa có live chỉ có tiêu đề luật', () => {
    expect(statusLine(bo3, null)).toBe('Trận 3 game × 21');
  });
  test('gamesLine nối các game đã xong', () => {
    expect(gamesLine(live({ games: [[21, 18], [15, 21]] }))).toBe('21–18, 15–21');
    expect(gamesLine(null)).toBe('');
  });
});

describe('gameBreakOf — nghỉ giữa game, khoá tới khi bấm "Tiếp tục"', () => {
  const after1 = live({ games: [[21, 18]], gameNo: 2, gamesWon: [1, 0], current: [0, 0], rallies: 'A'.repeat(21) });
  test('vừa hết game 1, game 2 chưa có điểm → có khung', () => {
    expect(gameBreakOf(after1, 0)).toEqual({ endedNo: 1, nextNo: 2, score: [21, 18], winnerSide: 'A' });
  });
  test('đã bấm "Tiếp tục" (acked = 1) → hết khung', () => {
    expect(gameBreakOf(after1, 1)).toBeNull();
  });
  test('đã có điểm ở game mới → không còn khung', () => {
    expect(gameBreakOf({ ...after1, current: [1, 0] }, 0)).toBeNull();
  });
  test('đầu trận, đã đủ điểm thắng hay chưa có live → không khung', () => {
    expect(gameBreakOf(live({ current: [0, 0] }), 0)).toBeNull();
    expect(gameBreakOf(live({ decided: true, current: null, games: [[21, 1]] }), 0)).toBeNull();
    expect(gameBreakOf(null, 0)).toBeNull();
  });
  test('đội B thắng game → winnerSide B', () => {
    expect(gameBreakOf({ ...after1, games: [[10, 21]] }, 0).winnerSide).toBe('B');
  });
});

describe('midChangeHalf — đổi sân giữa game quyết định', () => {
  const decider = (cur, over = {}) => live({ gameNo: 3, games: [[21, 10], [10, 21]], gamesWon: [1, 1], current: cur, ...over });
  test('game 3 của trận 3 game: chạm 11 (game 21) thì nhắc', () => {
    expect(midChangeHalf(bo3, decider([10, 9]))).toBeNull();
    expect(midChangeHalf(bo3, decider([11, 9]))).toBe(11);
    expect(midChangeHalf(bo3, decider([5, 12]))).toBe(11);
  });
  test('game 15 → 8; game 31 → 16', () => {
    expect(midChangeHalf({ scoring: { bestOf: 3, points: 15 } }, decider([8, 0]))).toBe(8);
    expect(midChangeHalf({ scoring: { bestOf: 3, points: 31 } }, decider([15, 0]))).toBeNull();
    expect(midChangeHalf({ scoring: { bestOf: 3, points: 31 } }, decider([16, 0]))).toBe(16);
  });
  test('trận 1 game không đổi sân; game 1-2 của trận 3 game không nhắc; đã xong không nhắc', () => {
    expect(midChangeHalf(bo1, live({ current: [15, 3] }))).toBeNull();
    expect(midChangeHalf(bo3, live({ current: [15, 3], gameNo: 2 }))).toBeNull();
    expect(midChangeHalf(bo3, decider(null, { decided: true }))).toBeNull();
  });
});

describe('holdsCourt / confirmMode / notScorable / backTarget', () => {
  test('đang 1–0 hoặc 1–1 chưa xong → chưa nhả sân; trận 1 game không bao giờ', () => {
    expect(holdsCourt(bo3, live({ gamesWon: [1, 0] }))).toBe(true);
    expect(holdsCourt(bo3, live({ gamesWon: [0, 0] }))).toBe(false);
    expect(holdsCourt(bo1, live({ gamesWon: [1, 0] }))).toBe(false);
    expect(holdsCourt(bo3, live({ gamesWon: [2, 0], decided: true }))).toBe(false);
  });
  test('người chơi ở trận tính điểm phải chờ nhân viên xác nhận', () => {
    expect(confirmMode({ isStaff: true, rated: true })).toBe('confirm');
    expect(confirmMode({ isStaff: false, rated: true })).toBe('wait-staff');
    expect(confirmMode({ isStaff: false, rated: false })).toBe('confirm');
  });
  test('lý do không bấm điểm được theo trạng thái trận', () => {
    expect(notScorable({ status: 'in_play' })).toBeNull();
    expect(notScorable({ status: 'completed' })).toMatch(/kết quả/);
    expect(notScorable({ status: 'cancelled' })).toMatch(/huỷ/);
    expect(notScorable({ status: 'ended' })).toMatch(/kết thúc/);
    expect(notScorable({ status: 'scheduled' })).toMatch(/chưa được gọi/);
  });
  test('nơi quay về theo giải / buổi', () => {
    expect(backTarget({ contextType: 'tournament', contextId: 't1' })).toEqual({ to: '/competition/tournaments/t1', label: '← Về giải đấu' });
    expect(backTarget({ contextType: 'session', contextId: 's1' }).label).toBe('← Về buổi giao lưu');
  });
  test('không có localStorage (môi trường node) thì không lỗi', () => {
    expect(loadFlip('x')).toBe(false);
    expect(() => saveFlip('x', true)).not.toThrow();
  });
});

describe('board — kết quả gần đây', () => {
  const t = (n) => ({ players: [{ name: n }] });
  const m = (id, over = {}) => ({ id, status: 'completed', completedAt: '2026-10-05T10:00:00Z', winnerSide: 'A', teamA: t('An'), teamB: t('Bình'), games: [[21, 10]], outcome: 'normal', ...over });
  test('chỉ trận xong, mới nhất trước, cắt theo giới hạn; trận không có giờ xếp cuối', () => {
    const ms = [m(1, { completedAt: '2026-10-05T09:00:00Z' }), m(2, { completedAt: '2026-10-05T11:00:00Z' }), m(3, { status: 'scheduled' }), m(4, { completedAt: null })];
    expect(recentResults(ms, 3).map((x) => x.id)).toEqual([2, 1, 4]);
    expect(recentResults(ms, 1).map((x) => x.id)).toEqual([2]);
  });
  test('dòng kết quả: thường, W.O., bỏ cuộc giữa trận', () => {
    expect(resultLine(m(1))).toBe('An thắng Bình · 21–10');
    expect(resultLine(m(1, { winnerSide: 'B' }))).toBe('Bình thắng An · 21–10');
    expect(resultLine(m(1, { outcome: 'walkover', games: [] }))).toMatch(/W\.O\./);
    expect(resultLine(m(1, { outcome: 'retired' }))).toMatch(/không đánh tiếp được/);
  });
  test('nhãn trận cho TV', () => {
    expect(boardLabel({ stage: 'group', groupNo: 2, slotNo: 3 })).toBe('Bảng 2 · lượt 3');
    expect(boardLabel({ stage: 'knockout', label: 'Bán kết' })).toBe('Bán kết');
    expect(boardLabel({ stage: 'knockout', roundNo: 2 })).toBe('Vòng 2');
  });
});
