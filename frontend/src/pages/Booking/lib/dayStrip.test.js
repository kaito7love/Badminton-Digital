import { describe, expect, test } from 'vitest';
import {
  BOOKING_WINDOW_DAYS,
  addDays,
  advanceLimitMessage,
  buildDayStrip,
  dayLabel,
  dayMonth,
  fallbackWindow,
  isBeyondWindow
} from './dayStrip';

describe('dayStrip', () => {
  test('addDays qua ranh giới tháng, năm, năm nhuận và lùi ngày', () => {
    expect(addDays('2026-10-14', 13)).toBe('2026-10-27');
    expect(addDays('2026-12-25', 13)).toBe('2027-01-07');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  test('dải mặc định là 14 ngày tính cả hôm nay', () => {
    expect(BOOKING_WINDOW_DAYS).toBe(14);
    expect(fallbackWindow('2026-10-14')).toEqual({ today: '2026-10-14', lastDate: '2026-10-27' });
  });

  test('dải ngày: 14 ô, ô đầu là hôm nay, ô cuối là ngày cuối được đặt', () => {
    const strip = buildDayStrip(fallbackWindow('2026-10-14'));
    expect(strip).toHaveLength(14);
    expect(strip[0]).toMatchObject({ date: '2026-10-14', isToday: true, weekday: 'T4', label: 'T4 14/10' });
    expect(strip[13].date).toBe('2026-10-27');
    expect(strip.filter((d) => d.isToday)).toHaveLength(1);
  });

  test('thứ trong tuần đúng, không dính múi giờ máy chạy test', () => {
    // 14/10/2026 là thứ Tư; 18/10/2026 là Chủ nhật; 19/10/2026 là thứ Hai.
    const strip = buildDayStrip(fallbackWindow('2026-10-14'));
    const byDate = Object.fromEntries(strip.map((d) => [d.date, d.weekday]));
    expect(byDate['2026-10-14']).toBe('T4');
    expect(byDate['2026-10-18']).toBe('CN');
    expect(byDate['2026-10-19']).toBe('T2');
  });

  test('theo ngày cuối server trả: ngắn hơn thì dải ngắn hơn, không vượt 14', () => {
    expect(buildDayStrip({ today: '2026-10-14', lastDate: '2026-10-16' })).toHaveLength(3);
    expect(buildDayStrip({ today: '2026-10-14', lastDate: '2027-01-01' })).toHaveLength(14);
  });

  test('qua ranh giới năm', () => {
    const strip = buildDayStrip(fallbackWindow('2026-12-25'));
    expect(strip[7].date).toBe('2027-01-01');
    expect(strip[7].label).toMatch(/01\/01$/);
  });

  test('dayLabel', () => {
    expect(dayLabel('2026-10-15')).toBe('T5 15/10');
    expect(dayLabel('2026-10-18')).toBe('CN 18/10');
  });

  test('isBeyondWindow: ngày cuối còn hợp lệ, ngày kế tiếp thì không (biên giống server)', () => {
    const { lastDate } = fallbackWindow('2026-10-14');
    expect(lastDate).toBe('2026-10-27');
    expect(isBeyondWindow('2026-10-27', lastDate)).toBe(false);
    expect(isBeyondWindow('2026-10-28', lastDate)).toBe(true);
    expect(isBeyondWindow('2026-10-14', lastDate)).toBe(false);
    expect(isBeyondWindow('2026-10-28T00:00:00.000Z', lastDate)).toBe(true);
    expect(isBeyondWindow('', lastDate)).toBe(false);
    expect(isBeyondWindow(undefined, lastDate)).toBe(false);
  });

  test('advanceLimitMessage: đúng câu server trả khi khách đặt quá 14 ngày', () => {
    // Giữ nguyên văn với BookingService.advanceBookingViolation; nếu một bên đổi chữ, test này đỏ.
    expect(advanceLimitMessage('2026-10-27')).toBe(
      'Chỉ nhận đặt trước tối đa 14 ngày (đến 27/10/2026), vui lòng chọn ngày sớm hơn'
    );
  });

  test('dayMonth', () => {
    expect(dayMonth('2026-10-27')).toBe('27/10');
    expect(dayMonth('2027-01-07')).toBe('07/01');
  });
});
