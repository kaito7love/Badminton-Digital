import { describe, expect, test } from 'vitest';
import { groupMyBookings, isUpcoming } from './groupMyBookings';

const b = (id, status, bookingDate, startTime, endTime) => ({ id, status, bookingDate, startTime, endTime });
const NOW = new Date('2026-10-16T10:00:00');

describe('groupMyBookings', () => {
  const list = [
    b(1, 'cancelled', '2026-10-20', '09:00:00', '10:00:00'),
    b(2, 'confirmed', '2026-10-21', '09:00:00', '10:00:00'),
    b(3, 'pending', '2026-10-17', '18:00:00', '19:00:00'),
    b(4, 'completed', '2026-10-10', '08:00:00', '09:00:00'),
    b(5, 'pending', '2026-10-16', '08:00:00', '09:00:00'), // đã qua giờ kết thúc, chưa ai duyệt
    b(6, 'cancelled', '2026-10-25', '09:00:00', '10:00:00'),
    b(7, 'PENDING', '2026-10-16', '11:00:00', '12:00:00')
  ];

  test('sắp tới = pending/confirmed chưa qua giờ kết thúc, gần nhất trước', () => {
    expect(groupMyBookings(list, NOW).upcoming.map((x) => x.id)).toEqual([7, 3, 2]);
  });

  test('lịch sử = còn lại, mới nhất trước; lịch đã huỷ ở tương lai không lọt vào "sắp tới"', () => {
    expect(groupMyBookings(list, NOW).history.map((x) => x.id)).toEqual([6, 1, 5, 4]);
  });

  test('không mất dòng nào, đầu vào lạ không lỗi', () => {
    const g = groupMyBookings(list, NOW);
    expect(g.upcoming.length + g.history.length).toBe(list.length);
    expect(groupMyBookings(null, NOW)).toEqual({ upcoming: [], history: [] });
  });

  test('isUpcoming: đang diễn ra vẫn tính là sắp tới', () => {
    expect(isUpcoming(b(9, 'confirmed', '2026-10-16', '09:30:00', '10:30:00'), NOW)).toBe(true);
    expect(isUpcoming(b(9, 'confirmed', '2026-10-16', '08:00:00', '10:00:00'), NOW)).toBe(false);
  });
});
