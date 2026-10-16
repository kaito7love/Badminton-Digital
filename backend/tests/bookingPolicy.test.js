// Kế hoạch 42 (F3, F4) — các hàm thuần của chính sách giữ chỗ và cửa sổ mở sân. Không cần DB.
const {
  DEFAULT_BOOKING_POLICY, MIN_HOLD_MINUTES, normalizeBookingPolicy, activeBookingLimitViolation, pendingExpiryAt
} = require('../src/utils/bookingPolicy');
const { openWindowViolation } = require('../src/utils/bookingOpenWindow');

const T = (s) => new Date(s);

describe('normalizeBookingPolicy', () => {
  test('thiếu / sai kiểu / ngoài miền → mặc định từng trường', () => {
    expect(normalizeBookingPolicy(undefined)).toEqual(DEFAULT_BOOKING_POLICY);
    expect(normalizeBookingPolicy({ maxActivePerCustomer: 'abc', pendingExpiryHours: -1, pendingExpireBeforeStartMinutes: 1.5 }))
      .toEqual(DEFAULT_BOOKING_POLICY);
    expect(normalizeBookingPolicy({ maxActivePerCustomer: null, pendingExpiryHours: '', pendingExpireBeforeStartMinutes: 99999 }))
      .toEqual(DEFAULT_BOOKING_POLICY);
  });

  test('giá trị hợp lệ được giữ, kể cả chuỗi số và 0 (= tắt)', () => {
    expect(normalizeBookingPolicy({ maxActivePerCustomer: '8', pendingExpiryHours: 0, pendingExpireBeforeStartMinutes: 30 }))
      .toEqual({ maxActivePerCustomer: 8, pendingExpiryHours: 0, pendingExpireBeforeStartMinutes: 30 });
  });
});

describe('activeBookingLimitViolation', () => {
  test('đủ trần thì có câu thông báo nêu số', () => {
    expect(activeBookingLimitViolation({ activeCount: 5, limit: 5 })).toMatch(/đang giữ 5 lịch.*tối đa 5/);
    expect(activeBookingLimitViolation({ activeCount: 9, limit: 5 })).not.toBeNull();
  });
  test('còn chỗ hoặc trần 0 (không giới hạn) → null', () => {
    expect(activeBookingLimitViolation({ activeCount: 4, limit: 5 })).toBeNull();
    expect(activeBookingLimitViolation({ activeCount: 500, limit: 0 })).toBeNull();
  });
});

describe('pendingExpiryAt — max(đặt+15p, min(đặt+24h, bắt đầu−60p))', () => {
  const created = T('2026-10-16T00:00:00Z');

  test('đặt xa giờ chơi: hết hạn sau 24 giờ', () => {
    const startAt = T('2026-10-20T10:00:00Z');
    expect(pendingExpiryAt({ createdAt: created, startAt }).toISOString()).toBe('2026-10-17T00:00:00.000Z');
  });

  test('đặt cho giờ chơi trong ngày: hết hạn 60 phút trước giờ bắt đầu', () => {
    const startAt = T('2026-10-16T10:00:00Z');
    expect(pendingExpiryAt({ createdAt: created, startAt }).toISOString()).toBe('2026-10-16T09:00:00.000Z');
  });

  test('đặt gấp (30 phút nữa là chơi): vẫn được giữ tối thiểu 15 phút', () => {
    const startAt = T('2026-10-16T00:30:00Z');
    expect(pendingExpiryAt({ createdAt: created, startAt }).toISOString()).toBe('2026-10-16T00:15:00.000Z');
    expect(MIN_HOLD_MINUTES).toBe(15);
  });

  test('pendingExpiryHours = 0 → tắt tự huỷ', () => {
    const policy = { ...DEFAULT_BOOKING_POLICY, pendingExpiryHours: 0 };
    expect(pendingExpiryAt({ createdAt: created, startAt: T('2026-10-20T10:00:00Z'), policy })).toBeNull();
  });
});

describe('openWindowViolation (F4) — giờ Việt Nam', () => {
  const booking = { bookingDate: '2026-10-16', startTime: '09:00:00', endTime: '10:00:00', timezone: 'Asia/Ho_Chi_Minh' };
  // 09:00 VN = 02:00Z
  const at = (utc) => openWindowViolation({ ...booking, now: T(utc) });

  test('đúng ngày, trong khung → hợp lệ; sớm hơn đúng 60 phút vẫn hợp lệ', () => {
    expect(at('2026-10-16T02:30:00Z')).toBeNull();
    expect(at('2026-10-16T01:00:00Z')).toBeNull(); // 08:00 VN
  });

  test('cùng ngày nhưng sớm hơn 60 phút hoặc đã qua giờ kết thúc → TIME_MISMATCH', () => {
    expect(at('2026-10-15T23:30:00Z')).toMatchObject({ code: 'TIME_MISMATCH' }); // 06:30 VN
    expect(at('2026-10-16T03:30:00Z')).toMatchObject({ code: 'TIME_MISMATCH' }); // 10:30 VN
    expect(at('2026-10-16T03:30:00Z').message).toMatch(/09:00–10:00/);
  });

  test('khác ngày → WRONG_DAY, nêu ngày của lịch', () => {
    const tomorrow = openWindowViolation({ ...booking, bookingDate: '2026-10-17', now: T('2026-10-16T02:30:00Z') });
    expect(tomorrow).toMatchObject({ code: 'WRONG_DAY' });
    expect(tomorrow.message).toMatch(/17\/10\/2026.*chưa tới/);
    const yesterday = openWindowViolation({ ...booking, bookingDate: '2026-10-15', now: T('2026-10-16T02:30:00Z') });
    expect(yesterday.message).toMatch(/15\/10\/2026.*đã qua/);
  });

  test('"hôm nay" theo múi giờ chi nhánh, không theo UTC máy chủ', () => {
    // 20:00Z ngày 15 = 03:00 ngày 16 giờ VN: lịch ngày 16 là hôm nay nhưng còn xa giờ chơi → TIME_MISMATCH, không phải WRONG_DAY.
    expect(at('2026-10-15T20:00:00Z')).toMatchObject({ code: 'TIME_MISMATCH' });
  });
});
