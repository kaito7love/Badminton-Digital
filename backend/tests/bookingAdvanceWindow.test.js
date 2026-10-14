// Mô hình giả: phần createBooking chỉ cần biết ai bị chặn và chặn trước khi đụng
// tới kiểm tra khung giờ hay ghi lịch. Phần đo trên API thật nằm ở kế hoạch 29, mục 12.
jest.mock('../src/models', () => ({
  Booking: { create: jest.fn() },
  Branch: { findByPk: jest.fn() },
  Court: { findByPk: jest.fn() },
  Customer: {},
  User: {},
  sequelize: { transaction: jest.fn() }
}));
jest.mock('../src/services/AuditService', () => ({ record: jest.fn() }));
jest.mock('../src/services/CustomerService', () => ({ resolveWalkIn: jest.fn() }));

const { Booking, Branch, Court, sequelize } = require('../src/models');
const BookingService = require('../src/services/BookingService');

const VN = 'Asia/Ho_Chi_Minh';
// 06/10/2026 10:40 UTC = 17:40 giờ Việt Nam → hôm nay 2026-10-06, hạn cuối 2026-10-19.
const NOW = new Date(Date.UTC(2026, 9, 6, 10, 40, 0));

describe('BookingService.advanceBookingViolation', () => {
  const check = (bookingDate, timezone = VN, now = NOW) =>
    BookingService.advanceBookingViolation({ bookingDate, timezone, now });

  test('hôm nay và ngày cuối của dải (hôm nay + 13) đều hợp lệ', () => {
    expect(check('2026-10-06')).toBeNull();
    expect(check('2026-10-19')).toBeNull();
  });

  test('ngày thứ 15 trở đi bị chặn, thông điệp nêu rõ ngày cuối', () => {
    const message = check('2026-10-20');
    expect(message).toMatch(/tối đa 14 ngày/);
    expect(message).toMatch(/19\/10\/2026/);
  });

  test('nhận cả chuỗi ngày có đuôi giờ, chỉ lấy phần ngày', () => {
    expect(check('2026-10-19T00:00:00.000Z')).toBeNull();
    expect(check('2026-10-20T00:00:00.000Z')).not.toBeNull();
  });

  test('"hôm nay" theo lịch chi nhánh, không theo UTC của máy chủ', () => {
    // 23:30 UTC ngày 06/10 = 06:30 ngày 07/10 giờ Việt Nam → hạn cuối dịch sang 20/10.
    const lateUtc = new Date(Date.UTC(2026, 9, 6, 23, 30, 0));
    expect(check('2026-10-20', VN, lateUtc)).toBeNull();
    expect(check('2026-10-21', VN, lateUtc)).not.toBeNull();
    // Cùng mốc đó ở New York (19:30 ngày 06/10) hạn cuối vẫn là 19/10.
    expect(check('2026-10-20', 'America/New_York', lateUtc)).not.toBeNull();
  });

  test('thiếu múi giờ thì rơi về giờ Việt Nam', () => {
    for (const tz of [undefined, null, '']) {
      expect(check('2026-10-19', tz)).toBeNull();
      expect(check('2026-10-20', tz)).not.toBeNull();
    }
  });
});

describe('BookingService.createBooking — dải đặt trước theo vai', () => {
  let transaction;
  let availability;

  const customer = { id: 7, role: { name: 'customer' }, customer: { id: 70 } };
  const employee = { id: 8, role: { name: 'employee' } };
  const admin = { id: 9, role: { name: 'admin' } };
  const payload = (bookingDate) => ({ courtId: 1, bookingDate, startTime: '18:00', endTime: '19:00' });

  beforeEach(() => {
    jest.clearAllMocks();
    // Chỉ giả `Date`: để nguyên microtask/timer thật cho các `await` trong service.
    jest.useFakeTimers({
      now: NOW,
      doNotFake: [
        'hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame',
        'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval',
        'clearInterval', 'setTimeout', 'clearTimeout'
      ]
    });
    transaction = { LOCK: { UPDATE: 'UPDATE' }, commit: jest.fn(), rollback: jest.fn() };
    sequelize.transaction.mockResolvedValue(transaction);
    Court.findByPk.mockResolvedValue({ id: 1, branchId: 1 });
    Branch.findByPk.mockResolvedValue({ id: 1, timezone: VN });
    Booking.create.mockImplementation(async (values) => ({ id: 500, ...values, toJSON: () => values }));
    availability = jest
      .spyOn(BookingService, 'checkAvailability')
      .mockResolvedValue({ available: true, reason: null, message: null, conflictBookingId: null });
  });

  afterEach(() => {
    jest.useRealTimers();
    availability.mockRestore();
  });

  test('khách đặt ngày thứ 15 → 400, chặn trước khi kiểm khung giờ hay ghi lịch', async () => {
    await expect(BookingService.createBooking(payload('2026-10-20'), { actor: customer, branchId: 1 })).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/tối đa 14 ngày/)
    });
    expect(availability).not.toHaveBeenCalled();
    expect(Booking.create).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalledTimes(1);
    expect(transaction.commit).not.toHaveBeenCalled();
  });

  test('khách đặt đúng ngày cuối của dải → được', async () => {
    const booking = await BookingService.createBooking(payload('2026-10-19'), { actor: customer, branchId: 1 });
    expect(booking.status).toBe('pending');
    expect(Booking.create).toHaveBeenCalledTimes(1);
    expect(transaction.commit).toHaveBeenCalledTimes(1);
  });

  test('nhân viên và quản trị đặt xa hơn dải vẫn được (giải đấu, sự kiện)', async () => {
    for (const actor of [employee, admin]) {
      Booking.create.mockClear();
      await BookingService.createBooking(
        { ...payload('2026-12-31'), customerId: 70 },
        { actor, branchId: 1 }
      );
      expect(Booking.create).toHaveBeenCalledTimes(1);
    }
    // Nhân viên không tốn thêm truy vấn lấy múi giờ chi nhánh.
    expect(Branch.findByPk).not.toHaveBeenCalled();
  });
});
