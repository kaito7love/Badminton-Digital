import { describe, expect, test } from 'vitest';
import fixture from './day.fixture.json';
import { courtTitle, dayStatus, hourHeaders, priceLine, slotLabel, slotPrice } from './gridModel';

const clone = (value) => JSON.parse(JSON.stringify(value));
const setAll = (day, state) => {
  day.courts.forEach((c) => c.slots.forEach((slot) => { slot.state = state; }));
  return day;
};

describe('hourHeaders', () => {
  test('lấy từ sân đặt được, một cột mỗi ô, kèm cờ cao điểm', () => {
    const headers = hourHeaders(fixture);
    expect(headers).toHaveLength(fixture.courts[0].slots.length);
    expect(headers[0]).toEqual({ start: '05:00', label: '05', peak: false });
    expect(headers.some((h) => h.peak)).toBe(true);
  });

  test('ngày không có sân thì rỗng', () => {
    expect(hourHeaders({ courts: [] })).toEqual([]);
    expect(hourHeaders(null)).toEqual([]);
  });
});

describe('dayStatus', () => {
  test('ok khi còn ít nhất một ô trống', () => {
    expect(dayStatus(fixture)).toBe('ok');
  });

  test('over khi mọi ô của sân đặt được đã qua (hôm nay hết giờ)', () => {
    expect(dayStatus(setAll(clone(fixture), 'passed'))).toBe('over');
  });

  test('full khi hết ô trống nhưng chưa phải hết giờ', () => {
    const day = clone(fixture);
    day.courts.filter((c) => c.bookable).forEach((c) => c.slots.forEach((slot, i) => { slot.state = i % 2 ? 'booked' : 'passed'; }));
    expect(dayStatus(day)).toBe('full');
  });

  test('no-courts khi chi nhánh không có sân hoặc toàn sân bảo trì', () => {
    expect(dayStatus({ courts: [] })).toBe('no-courts');
    const maintenanceOnly = clone(fixture);
    maintenanceOnly.courts.forEach((c) => { c.bookable = false; });
    expect(dayStatus(maintenanceOnly)).toBe('no-courts');
  });

  test('sân bảo trì không làm ngày "còn trống"', () => {
    const day = clone(fixture);
    day.courts.filter((c) => c.bookable).forEach((c) => c.slots.forEach((slot) => { slot.state = 'booked'; }));
    expect(dayStatus(day)).toBe('full');
  });
});

describe('slotLabel / slotPrice / priceLine', () => {
  const c = { id: 2, name: 'Sân số 2', peakPricePerHour: 90000, offpeakPricePerHour: 60000 };

  test('ô trống giờ thường và giờ cao điểm kèm giá', () => {
    expect(slotLabel(c, { start: '10:00', state: 'free', peak: false })).toBe('Sân số 2, 10:00, trống, 60.000đ');
    expect(slotLabel(c, { start: '18:00', state: 'free', peak: true })).toBe('Sân số 2, 18:00, trống, giờ cao điểm, 90.000đ');
  });

  test('ô kín, đã qua, bảo trì: không rao giá', () => {
    expect(slotLabel(c, { start: '18:00', state: 'booked', peak: true })).toBe('Sân số 2, 18:00, đã kín');
    expect(slotLabel(c, { start: '09:00', state: 'passed', peak: false })).toBe('Sân số 2, 09:00, đã qua');
    expect(slotLabel(c, { start: '09:00', state: 'maintenance', peak: false })).toBe('Sân số 2, 09:00, bảo trì');
  });

  test('ô đang chọn', () => {
    expect(slotLabel(c, { start: '18:00', state: 'free', peak: true }, { selected: true })).toBe(
      'Sân số 2, 18:00, đang chọn, giờ cao điểm, 90.000đ'
    );
  });

  test('giá theo cờ cao điểm của ô', () => {
    expect(slotPrice(c, { peak: true })).toBe(90000);
    expect(slotPrice(c, { peak: false })).toBe(60000);
    expect(priceLine(c)).toBe('60k / 90k');
  });
});

describe('courtTitle — tách loại sân trong ngoặc', () => {
  test('có loại trong ngoặc', () => {
    expect(courtTitle({ name: 'Sân số 1 (Thường)' })).toEqual({ title: 'Sân số 1', kind: 'Thường' });
    expect(courtTitle({ name: 'Sân VIP (Thảm Yonex)' })).toEqual({ title: 'Sân VIP', kind: 'Thảm Yonex' });
  });

  test('không có ngoặc thì giữ nguyên tên', () => {
    expect(courtTitle({ name: 'Sân A' })).toEqual({ title: 'Sân A', kind: '' });
  });

  test('chạy được trên mọi sân của mẫu thật', () => {
    for (const c of fixture.courts) {
      const { title } = courtTitle(c);
      expect(title.length).toBeGreaterThan(0);
      expect(title).not.toMatch(/[()]/);
    }
  });
});
