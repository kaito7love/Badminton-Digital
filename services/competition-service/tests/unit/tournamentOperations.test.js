const { validateStartTime, expectedTime, teamPresent, pickNextMatches, MIN_REST_MINUTES } = require('../../src/modules/tournament/domain/operations');

// Vận hành giải ngày thi đấu (plan 20): giờ dự kiến, điểm danh, chọn trận kế tiếp.

describe('giờ bắt đầu và giờ dự kiến từng lượt', () => {
  test('HH:MM hợp lệ; trống → null; sai dạng → INVALID_TOURNAMENT', () => {
    expect(validateStartTime('08:30')).toBe('08:30');
    expect(validateStartTime('23:59')).toBe('23:59');
    expect(validateStartTime('')).toBeNull();
    expect(validateStartTime(null)).toBeNull();
    for (const bad of ['8:30', '24:00', '08:60', '0830', 830]) {
      expect(() => validateStartTime(bad)).toThrow(expect.objectContaining({ code: 'INVALID_TOURNAMENT' }));
    }
  });
  test('lượt n = giờ bắt đầu + (n − 1) × phút một trận; qua nửa đêm quay vòng; thiếu dữ liệu → null', () => {
    expect(expectedTime('08:30', 1, 15)).toBe('08:30');
    expect(expectedTime('08:30', 4, 15)).toBe('09:15');
    expect(expectedTime('23:30', 3, 20)).toBe('00:10');
    expect(expectedTime(null, 2, 15)).toBeNull();
    expect(expectedTime('08:30', null, 15)).toBeNull();
  });
});

test('đội có mặt khi mọi người trong đội đã điểm danh', () => {
  const checked = new Set(['a', 'b']);
  expect(teamPresent(['a', 'b'], checked)).toBe(true);
  expect(teamPresent(['a', 'c'], checked)).toBe(false);
  expect(teamPresent(['a'], checked)).toBe(true);
  expect(teamPresent([], checked)).toBe(false);
});

describe('trận kế tiếp cho sân vừa trống', () => {
  const now = new Date('2026-10-20T03:00:00Z');
  const ago = (minutes) => new Date(now - minutes * 60000);
  const m = (id, slotNo, players, extra = {}) => ({ id, status: 'scheduled', slotNo, stage: 'group', teamIds: [`${id}A`, `${id}B`], players, ...extra });
  const ids = (list) => list.map((x) => x.id);

  test('lượt sớm hơn trước; bỏ trận chưa đủ đội, đã gọi, có người đang ở sân, có đội đã rút', () => {
    const matches = [
      m('m3', 3, ['e', 'f']),
      m('m1', 1, ['a', 'b']),
      m('m2', 2, ['c', 'd']),
      m('busy', 1, ['g', 'h']),
      m('half', 1, ['i'], { teamIds: ['x', null] }),
      m('called', 1, ['j', 'k'], { status: 'in_play' }),
      m('out', 1, ['l', 'n'], { teamIds: ['gone', 'outB'] })
    ];
    const got = pickNextMatches({ matches, busy: new Set(['h']), lastPlayedAt: new Map(), withdrawn: new Set(['gone']), now });
    expect(ids(got)).toEqual(['m1', 'm2', 'm3']);
    expect(got[0]).toMatchObject({ restMs: Infinity, rested: true });
  });

  test(`cùng lượt: đội nghỉ lâu hơn trước; người vừa đánh chưa đủ ${MIN_REST_MINUTES} phút thì xếp sau cả lượt muộn hơn`, () => {
    const matches = [m('tired', 1, ['a', 'b']), m('rested', 1, ['c', 'd']), m('fresh', 1, ['e', 'f']), m('later', 2, ['g', 'h'])];
    const lastPlayedAt = new Map([
      ['a', ago(2)],
      ['c', ago(30)],
      ['e', ago(10)]
    ]);
    const got = pickNextMatches({ matches, busy: new Set(), lastPlayedAt, now });
    expect(ids(got)).toEqual(['rested', 'fresh', 'later', 'tired']);
    expect(got.find((x) => x.id === 'tired')).toMatchObject({ rested: false, restMs: 2 * 60000 });
  });

  test('không còn trận đã nghỉ đủ thì vẫn đề xuất trận nghỉ chưa đủ (không để sân trống)', () => {
    const got = pickNextMatches({ matches: [m('only', 1, ['a', 'b'])], busy: new Set(), lastPlayedAt: new Map([['a', ago(1)]]), now });
    expect(ids(got)).toEqual(['only']);
  });

  test('trận chưa có lượt (trận thêm tay) xếp sau mọi trận có lượt; vòng bảng trước sơ đồ khi cùng lượt', () => {
    const matches = [m('extra', null, ['a', 'b'], { stage: 'extra' }), m('ko', 5, ['c', 'd'], { stage: 'knockout' }), m('grp', 5, ['e', 'f'])];
    expect(ids(pickNextMatches({ matches, busy: new Set(), lastPlayedAt: new Map(), now }))).toEqual(['grp', 'ko', 'extra']);
  });
});
