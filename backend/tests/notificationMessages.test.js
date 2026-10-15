// Kế hoạch 43 — nội dung thông báo cho khách. Hàm thuần, không cần DB.
const { TYPES, slotLabel, buildNotification, normalizeNotificationPolicy } = require('../src/utils/notificationMessages');

const booking = { courtName: 'Sân số 1 (Thường)', bookingDate: '2026-10-16', startTime: '19:00:00', endTime: '20:00:00' };

describe('buildNotification', () => {
  test('slotLabel: tên sân · dd/mm/yyyy · HH:mm–HH:mm', () => {
    expect(slotLabel(booking)).toBe('Sân số 1 (Thường) · 16/10/2026 · 19:00–20:00');
    expect(slotLabel({ ...booking, bookingDate: '2026-10-16T00:00:00.000Z' })).toContain('16/10/2026');
  });

  test.each([
    [TYPES.CONFIRMED, /xác nhận/],
    [TYPES.EXPIRED, /chưa được xác nhận kịp thời/],
    [TYPES.CANCELLED_BY_STAFF, /cửa hàng huỷ/],
    [TYPES.RESCHEDULED, /đã được đổi/]
  ])('%s có tiêu đề + nội dung chứa khung giờ', (type, pattern) => {
    const { title, body } = buildNotification(type, booking);
    expect(title.length).toBeGreaterThan(5);
    expect(`${title} ${body}`).toMatch(pattern);
    expect(body).toContain('16/10/2026 · 19:00–20:00');
    expect(title.length).toBeLessThanOrEqual(160);
    expect(body.length).toBeLessThanOrEqual(500);
  });

  test('đổi lịch nêu cả khung cũ và khung mới', () => {
    const previous = { ...booking, courtName: 'Sân số 2', startTime: '08:00:00', endTime: '09:00:00' };
    const { body } = buildNotification(TYPES.RESCHEDULED, booking, { previous });
    expect(body).toContain('Sân số 2 · 16/10/2026 · 08:00–09:00');
    expect(body).toContain('Sân số 1 (Thường) · 16/10/2026 · 19:00–20:00');
  });

  test('loại lạ → ném lỗi (không âm thầm tạo thông báo rỗng)', () => {
    expect(() => buildNotification('booking.hack', booking)).toThrow();
  });
});

describe('normalizeNotificationPolicy', () => {
  test('mặc định bật; chỉ tắt khi false rõ ràng', () => {
    expect(normalizeNotificationPolicy(undefined)).toEqual({ email: true });
    expect(normalizeNotificationPolicy({})).toEqual({ email: true });
    expect(normalizeNotificationPolicy({ email: false })).toEqual({ email: false });
    expect(normalizeNotificationPolicy({ email: 'false' })).toEqual({ email: false });
    expect(normalizeNotificationPolicy({ email: 'yes' })).toEqual({ email: true });
  });
});
