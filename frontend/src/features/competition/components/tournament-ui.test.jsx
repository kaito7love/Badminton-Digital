import React from 'react';
import { describe, test, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { filterPeople } from './PersonPicker';
import BracketView from './BracketView';
import { buildOptions } from '../pages/tournaments/TabRegistration';
import { FILTERS, defaultFilter, sortMatches } from '../pages/tournaments/TabSchedule';
import { computeCourtUsage } from '../hooks/useCourtUsage';

describe('PersonPicker.filterPeople', () => {
  const people = [
    { id: 1, label: 'Nguyễn Văn A', note: 'đang ở giải khác' },
    { id: 2, label: 'Nguyễn Thị B', note: '' },
    { id: 3, label: 'Trần C', note: '' }
  ];
  test('gõ không dấu vẫn ra; người đang bận xếp cuối', () => {
    expect(filterPeople(people, 'nguyen').map((x) => x.id)).toEqual([2, 1]);
  });
  test('giới hạn số dòng', () => {
    expect(filterPeople(people, '', 2)).toHaveLength(2);
  });
});

describe('TabRegistration.buildOptions', () => {
  const people = [
    { id: 'a', displayName: 'Bình', gender: 'male', ratings: { singles: { pairingRating: 3.5, level: 'B' } } },
    { id: 'b', displayName: 'An', gender: 'female', ratings: {} },
    { id: 'c', displayName: 'Cường', gender: 'male', ratings: { singles: { pairingRating: 2, level: 'C' } } }
  ];
  test('bỏ người đã đăng ký, sắp theo tên, ghi điểm / "chưa có điểm", gắn ghi chú bận', () => {
    const out = buildOptions(people, new Set(['c']), 'singles', new Map([['a', 'đang đánh buổi X']]));
    expect(out.map((x) => x.id)).toEqual(['b', 'a']);
    expect(out[0]).toMatchObject({ rated: false, sub: 'nữ · chưa có điểm', note: '' });
    expect(out[1].rated).toBe(true);
    expect(out[1].sub).toMatch(/^nam · /);
    expect(out[1].note).toBe('đang đánh buổi X');
  });
});

describe('TabSchedule', () => {
  const ms = [
    { id: 1, status: 'completed', slotNo: 2 }, { id: 2, status: 'scheduled', slotNo: 1, groupNo: 2 },
    { id: 3, status: 'in_play', slotNo: 1, groupNo: 1 }, { id: 4, status: 'cancelled' }
  ];
  test('bộ lọc và sắp xếp theo lượt rồi bảng', () => {
    expect(ms.filter(FILTERS.sap[1]).map((m) => m.id)).toEqual([2]);
    expect(ms.filter(FILTERS.dang[1]).map((m) => m.id)).toEqual([3]);
    expect(ms.filter(FILTERS.xong[1]).map((m) => m.id)).toEqual([1, 4]);
    expect(sortMatches(ms).map((m) => m.id)).toEqual([3, 2, 1, 4]);
  });
  test('mặc định "Sắp tới" khi còn trận chưa xong, không thì "Tất cả"', () => {
    expect(defaultFilter(ms)).toBe('sap');
    expect(defaultFilter([{ status: 'completed' }])).toBe('all');
    expect(defaultFilter([])).toBe('all');
  });
});

describe('computeCourtUsage', () => {
  const sessions = [{ name: 'Giao lưu T4', courtRefs: ['bd:court:1'] }];
  const tours = [
    { id: 't1', name: 'Mở', status: 'open', courtRefs: ['bd:court:1', 'bd:court:2'] },
    { id: 't2', name: 'Đang đánh', status: 'in_progress', courtRefs: ['bd:court:2'] },
    { id: 't3', name: 'Xong', status: 'finalized', courtRefs: ['bd:court:3'] },
    { id: 't4', name: 'Không sân', status: 'open' }
  ];
  test('buổi giao lưu và giải đang đánh là bận thật; giải còn mở chỉ ghi chú; giải xong không tính', () => {
    const u = computeCourtUsage(sessions, tours);
    expect(u.get('bd:court:1')).toMatchObject({ live: true });
    expect(u.get('bd:court:2')).toMatchObject({ live: true });
    expect(u.get('bd:court:2').label).toMatch(/đang đánh/);
    expect(u.has('bd:court:3')).toBe(false);
  });
  test('giải mở chọn sân chưa ai dùng: chỉ ghi chú (live=false); bỏ qua giải đang sửa', () => {
    const u = computeCourtUsage([], tours);
    expect(u.get('bd:court:1')).toMatchObject({ live: false });
    expect(computeCourtUsage([], tours, 't2').get('bd:court:2')).toMatchObject({ live: false });
  });
});

describe('BracketView (render phía server)', () => {
  const t = (n) => ({ players: [{ name: n }] });
  const rounds = [
    { roundNo: 1, matches: [
      { id: 'm1', roundNo: 1, bracketPos: 1, status: 'completed', games: [[21, 10]], winnerSide: 'A', teamA: t('An'), teamB: t('Bình') },
      { id: 'm2', roundNo: 1, bracketPos: 2, status: 'scheduled', games: [], teamA: t('Cường'), teamB: t('Dũng') }
    ] },
    { roundNo: 2, matches: [{ id: 'm3', roundNo: 2, bracketPos: 1, status: 'scheduled', games: [], teamA: t('An'), teamB: null }] }
  ];
  test('vẽ tên đội và ô sơ đồ, có nút phóng / thu', () => {
    const html = renderToStaticMarkup(<BracketView rounds={rounds} title="Giải thử" />);
    for (const name of ['An', 'Bình', 'Cường', 'Dũng']) expect(html).toContain(name);
    expect(html).toContain('bkp');
    expect(html).toContain('Vừa màn hình');
  });
  test('tools=false ẩn nút phóng / thu (màn TV)', () => {
    expect(renderToStaticMarkup(<BracketView rounds={rounds} tools={false} />)).not.toContain('Vừa màn hình');
  });
  test('không có trận thì không vẽ gì', () => {
    expect(renderToStaticMarkup(<BracketView rounds={[]} />)).toBe('');
  });
});
