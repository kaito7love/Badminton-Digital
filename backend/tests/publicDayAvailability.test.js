// Mô hình giả: test này không cần DB, chỉ cần đếm truy vấn và kiểm tra ai được
// đọc cột nào. Phần "lưới khớp với /public/availability ở mọi ô" cần MySQL thật
// và được đo riêng (xem kế hoạch 29, mục 10).
jest.mock('../src/models', () => ({
  Booking: { findAll: jest.fn() },
  Branch: { findOne: jest.fn() },
  Court: { findAll: jest.fn() },
  Setting: { findOne: jest.fn() },
  Customer: {},
  User: {},
  Product: {},
  ProductCategory: {},
  ProductVariant: {},
  ProductStock: {},
  sequelize: {}
}));

const { Op } = require('sequelize');
const { Booking, Branch, Court, Setting } = require('../src/models');
const PublicCatalogService = require('../src/services/PublicCatalogService');

// 06/10/2026 10:40 UTC = 17:40 giờ Việt Nam
const NOW = new Date(Date.UTC(2026, 9, 6, 10, 40, 0));

const makeCourts = (n, { maintenanceIds = [] } = {}) =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `Sân số ${i + 1}`,
    status: maintenanceIds.includes(i + 1) ? 'maintenance' : 'active',
    peakPricePerHour: '90000.00',
    offpeakPricePerHour: '60000.00'
  }));

const setup = ({ courts = makeCourts(4), bookings = [], branch = { id: 1, name: 'Chi nhánh chính', timezone: 'Asia/Ho_Chi_Minh' } } = {}) => {
  Branch.findOne.mockResolvedValue(branch);
  Court.findAll.mockResolvedValue(courts);
  Booking.findAll.mockResolvedValue(bookings);
  Setting.findOne.mockImplementation(async ({ where }) => {
    const values = {
      operating_hours: { open: '05:00', close: '23:00', peak_start: '17:00', peak_end: '21:00' }
    };
    return values[where.key] ? { value: values[where.key] } : null;
  });
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('PublicCatalogService.getDayAvailability', () => {
  test('một truy vấn lịch cho cả chi nhánh trong ngày, không tăng theo số sân hay số ô', async () => {
    setup({ courts: makeCourts(2) });
    await PublicCatalogService.getDayAvailability({ date: '2026-10-07', now: NOW });
    const small = { courts: Court.findAll.mock.calls.length, bookings: Booking.findAll.mock.calls.length };

    jest.clearAllMocks();
    setup({ courts: makeCourts(12), bookings: Array.from({ length: 40 }, (_, i) => ({ courtId: (i % 12) + 1, startTime: '08:00:00', endTime: '09:00:00' })) });
    await PublicCatalogService.getDayAvailability({ date: '2026-10-07', now: NOW });
    const big = { courts: Court.findAll.mock.calls.length, bookings: Booking.findAll.mock.calls.length };

    expect(small).toEqual({ courts: 1, bookings: 1 });
    expect(big).toEqual(small);
  });

  test('chỉ lấy ba cột và đúng bộ lọc: chi nhánh, ngày, lịch đang chiếm chỗ', async () => {
    setup();
    await PublicCatalogService.getDayAvailability({ date: '2026-10-07', now: NOW });

    const [query] = Booking.findAll.mock.calls[0];
    // Tên khách, mã khách, mã lịch không bao giờ rời DB.
    expect(query.attributes).toEqual(['courtId', 'startTime', 'endTime']);
    expect(query.where.branchId).toBe(1);
    expect(query.where.bookingDate).toBe('2026-10-07');
    // Cùng tập trạng thái với BookingService.checkAvailability: huỷ/đã chơi không chiếm chỗ.
    expect(query.where.status[Op.in]).toEqual(['pending', 'confirmed']);
  });

  test('ô kín, ô bảo trì và giá lấy đúng từ lịch, sân và setting', async () => {
    setup({
      courts: makeCourts(3, { maintenanceIds: [3] }),
      bookings: [{ courtId: 2, startTime: '18:00:00', endTime: '20:00:00' }]
    });
    const day = await PublicCatalogService.getDayAvailability({ date: '2026-10-07', now: NOW });

    expect(day.branch).toEqual({ id: 1, name: 'Chi nhánh chính' });
    expect(day.operatingHours).toEqual({ open: '05:00', close: '23:00' });
    expect(day.peakHours).toEqual({ peakStartHour: 17, peakEndHour: 21 });
    expect(day.today).toBe('2026-10-06');
    expect(day.lastBookableDate).toBe('2026-10-19');

    const [c1, c2, c3] = day.courts;
    expect(c1.offpeakPricePerHour).toBe(60000);
    expect(c1.slots.every((s) => s.state === 'free')).toBe(true);
    expect(c2.slots.filter((s) => s.state === 'booked').map((s) => s.start)).toEqual(['18:00', '19:00']);
    expect(c3).toMatchObject({ bookable: false, note: 'Đang bảo trì, tạm không nhận đặt' });
    expect(c3.slots.every((s) => s.state === 'maintenance')).toBe(true);
  });

  test('hôm nay và ngày cuối của dải đều hợp lệ', async () => {
    setup();
    await expect(PublicCatalogService.getDayAvailability({ date: '2026-10-06', now: NOW })).resolves.toMatchObject({ date: '2026-10-06' });
    await expect(PublicCatalogService.getDayAvailability({ date: '2026-10-19', now: NOW })).resolves.toMatchObject({ date: '2026-10-19' });
  });

  test('ngày đã qua hoặc quá dải 14 ngày → 400 tiếng Việt', async () => {
    setup();
    await expect(PublicCatalogService.getDayAvailability({ date: '2026-10-05', now: NOW })).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/đã qua/)
    });
    await expect(PublicCatalogService.getDayAvailability({ date: '2026-10-20', now: NOW })).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringMatching(/tối đa 14 ngày/)
    });
    // Bị từ chối thì chưa đụng tới bảng lịch.
    expect(Booking.findAll).not.toHaveBeenCalled();
  });

  test('"hôm nay" theo lịch chi nhánh, không theo UTC của máy chủ', async () => {
    // 23:30 UTC ngày 06/10 = 06:30 ngày 07/10 giờ Việt Nam: hôm nay đã là 07/10.
    const lateUtc = new Date(Date.UTC(2026, 9, 6, 23, 30, 0));
    setup();
    await expect(PublicCatalogService.getDayAvailability({ date: '2026-10-06', now: lateUtc })).rejects.toMatchObject({ statusCode: 400 });
    const day = await PublicCatalogService.getDayAvailability({ date: '2026-10-07', now: lateUtc });
    expect(day.today).toBe('2026-10-07');
    // 06:30: ô 05:00 và 06:00 đã bắt đầu, ô 07:00 còn.
    const states = Object.fromEntries(day.courts[0].slots.map((s) => [s.start, s.state]));
    expect(states['05:00']).toBe('passed');
    expect(states['06:00']).toBe('passed');
    expect(states['07:00']).toBe('free');
  });

  test('chi nhánh không tồn tại hoặc ngưng hoạt động → 404', async () => {
    setup();
    Branch.findOne.mockResolvedValue(null);
    await expect(PublicCatalogService.getDayAvailability({ date: '2026-10-07', branchId: 99, now: NOW })).rejects.toMatchObject({ statusCode: 404 });
  });

  test('getCourts sau khi tách courtCatalog vẫn trả đúng dạng cũ', async () => {
    setup({ courts: makeCourts(2, { maintenanceIds: [2] }) });
    const data = await PublicCatalogService.getCourts();
    expect(Object.keys(data).sort()).toEqual(['branch', 'courts', 'operatingHours', 'peakHours']);
    expect(data.courts[1]).toEqual({
      id: 2,
      name: 'Sân số 2',
      peakPricePerHour: 90000,
      offpeakPricePerHour: 60000,
      bookable: false,
      note: 'Đang bảo trì, tạm không nhận đặt'
    });
  });
});
