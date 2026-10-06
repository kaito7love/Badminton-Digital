const {
  BOOKING_SLOTS,
  SLOT_DURATION_MINUTES,
  slotsWithinHours,
  slotStatus,
  buildScheduleGrid
} = require('../src/utils/scheduleGrid');

/**
 * Lưới "sân × khung giờ" ở trang chủ. Trước đây là HTML ghi cứng: 6 ô dán nhãn
 * "BOOKED" và 8 ô trống bất biến, không hỏi server lần nào — khách thấy sân đỏ
 * thì bỏ qua dù giờ đó đang trống.
 *
 * Trạng thái từng ô phải cùng bộ luật với `BookingService.checkAvailability`:
 * chỉ `pending`/`confirmed` chiếm chỗ, trong giờ mở cửa, giờ treo tường theo
 * múi giờ chi nhánh. Các test dưới đây truyền `dayOffset`/`nowSlot` tường minh
 * nên không phụ thuộc đồng hồ máy chạy test.
 */
const QUAN = { open: '05:00', close: '23:00' };

describe('slotsWithinHours — cột của lưới', () => {
  test('khung 05:00–23:00 bày hết mốc chuẩn', () => {
    expect(slotsWithinHours(QUAN)).toEqual([...BOOKING_SLOTS]);
  });

  test('mỗi ô là một giờ', () => {
    expect(SLOT_DURATION_MINUTES).toBe(60);
  });

  test('giờ mở muộn thì bỏ cột sớm', () => {
    expect(slotsWithinHours({ open: '10:00', close: '23:00' }))
      .toEqual(['10:00', '12:00', '14:00', '16:00', '17:00', '19:00', '20:00', '21:00']);
  });

  test('giờ đóng sớm thì bỏ cột không còn trọn 1 giờ', () => {
    // Đóng 20:00: cột 19:00 kết thúc đúng 20:00 nên giữ, 20:00 thì không.
    expect(slotsWithinHours({ open: '05:00', close: '20:00' }))
      .toEqual(['05:00', '06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '17:00', '19:00']);
  });

  test('setting rác thì rơi về mặc định 05:00–23:00', () => {
    expect(slotsWithinHours(null)).toEqual([...BOOKING_SLOTS]);
    expect(slotsWithinHours('rác')).toEqual([...BOOKING_SLOTS]);
  });

  test('cột lưới luôn là tập con của mốc giờ chuẩn', () => {
    for (const hours of [QUAN, { open: '08:00', close: '20:00' }, { open: '06:00', close: '22:00' }]) {
      for (const slot of slotsWithinHours(hours)) expect(BOOKING_SLOTS).toContain(slot);
    }
  });
});

describe('slotStatus — trạng thái một ô', () => {
  test('không ai giữ chỗ → available', () => {
    expect(slotStatus({ slot: '10:00', busy: [], dayOffset: 1 })).toBe('available');
  });

  test('sân không nhận đặt (bảo trì) → unavailable, kể cả khi trống', () => {
    expect(slotStatus({ slot: '10:00', bookable: false, busy: [], dayOffset: 1 })).toBe('unavailable');
  });

  test('ngày đã qua → mọi ô passed', () => {
    expect(slotStatus({ slot: '10:00', busy: [], dayOffset: -1 })).toBe('passed');
  });

  test('hôm nay: mốc đã tới giờ là passed, chưa tới là available', () => {
    expect(slotStatus({ slot: '10:00', dayOffset: 0, nowSlot: '17:40' })).toBe('passed');
    expect(slotStatus({ slot: '19:00', dayOffset: 0, nowSlot: '17:40' })).toBe('available');
    // Lọc theo GIỜ BẮT ĐẦU, khớp widget đặt sân: đúng giờ là đã qua.
    expect(slotStatus({ slot: '17:00', dayOffset: 0, nowSlot: '17:00' })).toBe('passed');
  });

  test('ngày tương lai thì nowSlot không ảnh hưởng', () => {
    expect(slotStatus({ slot: '05:00', dayOffset: 1, nowSlot: '23:00' })).toBe('available');
  });

  test('đã có lịch trùng → booked', () => {
    // Lịch 09:00–11:00 chiếm cả ô 10:00 (10:00–11:00).
    expect(slotStatus({ slot: '10:00', busy: [[540, 660]], dayOffset: 1 })).toBe('booked');
  });

  test('biên giao nhau: liền kề thì KHÔNG chiếm, chồng 1 phút thì chiếm', () => {
    // Ô 10:00 = [600, 660).
    expect(slotStatus({ slot: '10:00', busy: [[480, 600]], dayOffset: 1 })).toBe('available'); // 08:00–10:00
    expect(slotStatus({ slot: '10:00', busy: [[660, 720]], dayOffset: 1 })).toBe('available'); // 11:00–12:00
    expect(slotStatus({ slot: '10:00', busy: [[599, 600]], dayOffset: 1 })).toBe('available');
    expect(slotStatus({ slot: '10:00', busy: [[659, 700]], dayOffset: 1 })).toBe('booked');
    expect(slotStatus({ slot: '10:00', busy: [[600, 601]], dayOffset: 1 })).toBe('booked');
  });

  test('lịch dài trùm nhiều ô thì ô nào cũng booked', () => {
    const busy = [[480, 780]]; // 08:00–13:00
    for (const slot of ['08:00', '10:00', '12:00']) {
      expect(slotStatus({ slot, busy, dayOffset: 1 })).toBe('booked');
    }
    expect(slotStatus({ slot: '14:00', busy, dayOffset: 1 })).toBe('available');
  });

  test('đã qua được xét TRƯỚC đã đặt — ô quá khứ không tô đỏ "đã đặt"', () => {
    expect(slotStatus({ slot: '10:00', busy: [[540, 660]], dayOffset: 0, nowSlot: '17:40' })).toBe('passed');
  });
});

describe('buildScheduleGrid — lưới hoàn chỉnh', () => {
  const courts = [
    { id: 1, name: 'Sân số 1', bookable: true, note: null },
    { id: 2, name: 'Sân số 2', bookable: true, note: null },
    { id: 3, name: 'Sân bảo trì', bookable: false, note: 'Đang bảo trì, tạm không nhận đặt' }
  ];
  const bookings = [
    { courtId: 1, startTime: '09:00:00', endTime: '11:00:00', status: 'confirmed' },
    { courtId: 2, startTime: '19:00:00', endTime: '21:00:00', status: 'pending' },
    { courtId: 1, startTime: '14:00:00', endTime: '16:00:00', status: 'cancelled' },
    { courtId: 2, startTime: '05:00:00', endTime: '06:00:00', status: 'completed' }
  ];
  const grid = buildScheduleGrid({ courts, bookings, hours: QUAN, dayOffset: 1 });
  const cell = (courtId, time) =>
    grid.courts.find((c) => c.id === courtId).slots.find((s) => s.time === time);

  test('mỗi sân một hàng, mỗi mốc giờ một ô', () => {
    expect(grid.courts).toHaveLength(3);
    expect(grid.slots).toEqual([...BOOKING_SLOTS]);
    for (const court of grid.courts) expect(court.slots).toHaveLength(grid.slots.length);
  });

  test('ô mang kèm giờ kết thúc để giao diện ghi nhãn "10:00–11:00"', () => {
    expect(cell(1, '10:00')).toMatchObject({ time: '10:00', endTime: '11:00' });
    expect(cell(1, '21:00').endTime).toBe('22:00');
  });

  test('lịch confirmed chiếm chỗ đúng sân, đúng ô', () => {
    expect(cell(1, '10:00').status).toBe('booked');
    expect(cell(1, '08:00').status).toBe('available');
    expect(cell(2, '10:00').status).toBe('available');
  });

  test('lịch pending cũng chiếm chỗ', () => {
    expect(cell(2, '19:00').status).toBe('booked');
    expect(cell(2, '20:00').status).toBe('booked');
  });

  test('lịch cancelled nhả chỗ ra, completed cũng không giữ chỗ', () => {
    // Cùng bộ luật với truy vấn trùng lịch của checkAvailability.
    expect(cell(1, '14:00').status).toBe('available');
    expect(cell(2, '05:00').status).toBe('available');
  });

  test('sân bảo trì: cả hàng unavailable và giữ nguyên ghi chú', () => {
    const maint = grid.courts.find((c) => c.id === 3);
    expect(maint.note).toBe('Đang bảo trì, tạm không nhận đặt');
    expect(maint.slots.every((s) => s.status === 'unavailable')).toBe(true);
  });

  test('hôm nay: phần đã qua xám, phần còn lại vẫn tính trùng lịch', () => {
    const homNay = buildScheduleGrid({ courts, bookings, hours: QUAN, dayOffset: 0, nowSlot: '17:40' });
    const at = (courtId, time) =>
      homNay.courts.find((c) => c.id === courtId).slots.find((s) => s.time === time).status;
    expect(at(1, '10:00')).toBe('passed');
    expect(at(2, '19:00')).toBe('booked');
    expect(at(1, '19:00')).toBe('available');
  });

  test('giờ mở cửa hẹp hơn thì lưới hẹp theo', () => {
    const hep = buildScheduleGrid({ courts, bookings, hours: { open: '08:00', close: '20:00' }, dayOffset: 1 });
    expect(hep.slots).toEqual(['08:00', '10:00', '12:00', '14:00', '16:00', '17:00', '19:00']);
  });

  test('không sân nào thì trả lưới rỗng, không văng lỗi', () => {
    const rong = buildScheduleGrid({ courts: [], bookings: [], hours: QUAN, dayOffset: 1 });
    expect(rong.courts).toEqual([]);
    expect(rong.slots.length).toBeGreaterThan(0);
  });

  test('thiếu tham số thì không văng lỗi', () => {
    expect(() => buildScheduleGrid({})).not.toThrow();
  });

  test('mọi ô chỉ mang một trong bốn trạng thái đã định', () => {
    const hopLe = ['available', 'booked', 'passed', 'unavailable'];
    for (const court of grid.courts) {
      for (const slot of court.slots) expect(hopLe).toContain(slot.status);
    }
  });
});
