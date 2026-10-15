import { describe, expect, test } from 'vitest';
import { applyRead, applyReadAll, badgeText, bellLabel, notificationTarget, relativeTime, typeIcon } from './notificationView';

const NOW = new Date('2026-10-16T10:00:00Z');
const ago = (ms) => new Date(NOW.getTime() - ms).toISOString();

describe('relativeTime', () => {
  test.each([
    [10 * 1000, 'Vừa xong'],
    [5 * 60 * 1000, '5 phút trước'],
    [3 * 3600 * 1000, '3 giờ trước'],
    [2 * 24 * 3600 * 1000, '2 ngày trước']
  ])('%i ms → %s', (ms, expected) => {
    expect(relativeTime(ago(ms), NOW)).toBe(expected);
  });

  test('quá 7 ngày hiện ngày đầy đủ; đầu vào lạ → rỗng; thời điểm tương lai không âm', () => {
    expect(relativeTime('2026-09-01T12:00:00Z', NOW)).toMatch(/^\d{2}\/\d{2}\/2026$/);
    expect(relativeTime('không phải ngày', NOW)).toBe('');
    expect(relativeTime(new Date(NOW.getTime() + 60000).toISOString(), NOW)).toBe('Vừa xong');
  });
});

describe('badgeText / bellLabel', () => {
  test('rỗng khi 0, số khi ít, 99+ khi nhiều', () => {
    expect(badgeText(0)).toBe('');
    expect(badgeText(undefined)).toBe('');
    expect(badgeText(7)).toBe('7');
    expect(badgeText(100)).toBe('99+');
  });
  test('nhãn cho trình đọc màn hình', () => {
    expect(bellLabel(0)).toBe('Thông báo');
    expect(bellLabel(3)).toBe('Thông báo, 3 chưa đọc');
  });
});

describe('applyRead / applyReadAll', () => {
  const state = { items: [{ id: 1, readAt: null }, { id: 2, readAt: '2026-10-15T00:00:00Z' }, { id: 3, readAt: null }], unreadCount: 2 };

  test('đánh dấu một dòng chưa đọc: giảm 1', () => {
    const next = applyRead(state, 1, 'T');
    expect(next.unreadCount).toBe(1);
    expect(next.items[0].readAt).toBe('T');
    expect(state.items[0].readAt).toBeNull(); // không đổi bản gốc
  });

  test('dòng đã đọc / id lạ: giữ nguyên', () => {
    expect(applyRead(state, 2)).toBe(state);
    expect(applyRead(state, 99)).toBe(state);
  });

  test('đọc hết: về 0', () => {
    const next = applyReadAll(state, 'T');
    expect(next.unreadCount).toBe(0);
    expect(next.items.every((n) => n.readAt)).toBe(true);
    expect(next.items[1].readAt).toBe('2026-10-15T00:00:00Z');
  });
});

describe('typeIcon / notificationTarget', () => {
  test('mỗi loại một biểu tượng, loại lạ dùng chuông; đích luôn là Lịch đặt của tôi', () => {
    expect(typeIcon('booking.expired')).toBe('⌛');
    expect(typeIcon('x')).toBe('🔔');
    expect(notificationTarget({ type: 'booking.confirmed' })).toBe('/my-bookings');
  });
});
