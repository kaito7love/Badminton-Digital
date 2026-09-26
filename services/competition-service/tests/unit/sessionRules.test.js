const {
  lateCredit, historyFrom, validateAssignments, isManualEdit, validateCourts, perCourt, discipline
} = require('../../src/modules/session/domain/sessionRules');

// Luật thuần của buổi giao lưu (docs/06 mục 8).

describe('người đến muộn (mục 8.2)', () => {
  test('được tính như đã đánh bằng số trận ít nhất của người đang có mặt', () => {
    expect(lateCredit({ gamesPlayed: 0, presentEffective: [3, 4, 5, 3] })).toBe(3);
  });
  test('đầu buổi (chưa ai đánh) hoặc chưa có ai → 0', () => {
    expect(lateCredit({ presentEffective: [0, 0, 0] })).toBe(0);
    expect(lateCredit({ presentEffective: [] })).toBe(0);
  });
  test('quay lại sau khi rời: bù phần còn thiếu, không bao giờ giảm phần đã bù', () => {
    expect(lateCredit({ gamesPlayed: 2, currentCredit: 1, presentEffective: [6, 7] })).toBe(4);
    expect(lateCredit({ gamesPlayed: 5, currentCredit: 2, presentEffective: [4] })).toBe(2);
  });
});

describe('lịch sử đồng đội / đối thủ trong buổi', () => {
  test('đếm từng cặp, không phân biệt thứ tự', () => {
    const h = historyFrom([
      { sideA: ['a', 'b'], sideB: ['c', 'd'] },
      { sideA: ['b', 'a'], sideB: ['e', 'f'] }
    ]);
    expect(h.partners).toEqual(expect.arrayContaining([['a', 'b', 2], ['c', 'd', 1], ['e', 'f', 1]]));
    expect(h.opponents).toHaveLength(8);
    expect(h.opponents).toEqual(expect.arrayContaining([['a', 'c', 1], ['a', 'e', 1]]));
  });
  test('đánh đơn: không có đồng đội', () => {
    expect(historyFrom([{ sideA: ['a'], sideB: ['b'] }])).toEqual({ partners: [], opponents: [['a', 'b', 1]] });
  });
});

describe('bản xếp sân gửi lên (đổi tay)', () => {
  const ok = [{ court: 'c1', sideA: ['a', 'b'], sideB: ['c', 'd'] }];
  test('hợp lệ → trả danh sách sân + người', () => {
    expect(validateAssignments({ assignments: ok, format: 'doubles' })).toEqual({ courts: ['c1'], players: ['a', 'b', 'c', 'd'] });
  });
  test.each([
    ['rỗng', []],
    ['thiếu người một bên', [{ court: 'c1', sideA: ['a'], sideB: ['c', 'd'] }]],
    ['một người hai chỗ', [{ court: 'c1', sideA: ['a', 'b'], sideB: ['c', 'd'] }, { court: 'c2', sideA: ['a', 'e'], sideB: ['f', 'g'] }]],
    ['một sân hai lần', [{ court: 'c1', sideA: ['a', 'b'], sideB: ['c', 'd'] }, { court: 'c1', sideA: ['e', 'f'], sideB: ['g', 'h'] }]]
  ])('%s → 422 INVALID_ASSIGNMENTS', (_, assignments) => {
    expect(() => validateAssignments({ assignments, format: 'doubles' })).toThrow(expect.objectContaining({ code: 'INVALID_ASSIGNMENTS', status: 422 }));
  });
  test('đánh đơn: mỗi bên 1 người', () => {
    expect(() => validateAssignments({ assignments: ok, format: 'singles' })).toThrow(expect.objectContaining({ code: 'INVALID_ASSIGNMENTS' }));
    expect(validateAssignments({ assignments: [{ court: 'c1', sideA: ['a'], sideB: ['b'] }], format: 'singles' }).players).toEqual(['a', 'b']);
  });
  test('nhận ra đổi tay; đổi chỗ trong cùng đội hay đổi bên không tính', () => {
    const same = [{ court: 'c1', sideA: ['d', 'c'], sideB: ['b', 'a'] }];
    const swapped = [{ court: 'c1', sideA: ['a', 'c'], sideB: ['b', 'd'] }];
    expect(isManualEdit(ok, same)).toBe(false);
    expect(isManualEdit(ok, swapped)).toBe(true);
  });
});

// Thứ tự hàng chờ do thuật toán xếp sân quyết (fillCourts trả `order`) — test ở fillCourts.test.js.
describe('cấu hình buổi', () => {
  test('danh sách sân: 1–32, không trùng, không trống', () => {
    expect(validateCourts(['bd:court:1', 'bd:court:2'])).toHaveLength(2);
    for (const bad of [[], ['a', 'a'], [''], Array.from({ length: 33 }, (_, i) => `c${i}`)]) {
      expect(() => validateCourts(bad)).toThrow(expect.objectContaining({ code: 'INVALID_SESSION' }));
    }
  });
  test('đôi 4 người / sân, đơn 2 người / sân', () => {
    expect([perCourt('doubles'), perCourt('singles'), discipline('singles'), discipline('doubles')]).toEqual([4, 2, 'singles', 'doubles']);
  });
});
