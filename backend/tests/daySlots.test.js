const BookingService = require('../src/services/BookingService');
const {
  BOOKING_WINDOW_DAYS,
  SLOT_STATES,
  addDays,
  isRealDate,
  bookingWindow,
  buildCourtSlots,
  buildDayAvailability
} = require('../src/utils/daySlots');

/**
 * Lưới sân × giờ của trang Đặt sân. Mọi test truyền `now` dựng bằng Date.UTC(...)
 * và múi giờ tường minh, nên kết quả không phụ thuộc múi giờ của máy chạy test
 * (runner CI chạy UTC, máy dev chạy giờ Việt Nam).
 */
const VN = 'Asia/Ho_Chi_Minh';
// 06/10/2026 10:40 UTC = 17:40 giờ Việt Nam — cùng mốc neo với bookingPastSlot.test.js.
const NOW = new Date(Date.UTC(2026, 9, 6, 10, 40, 0));
const OPEN = 5 * 60;
const CLOSE = 23 * 60;
const m = (hhmm) => {
  const [h, min] = hhmm.split(':').map(Number);
  return h * 60 + min;
};

const slotsOf = (overrides = {}) =>
  buildCourtSlots({
    date: '2026-10-07',
    openMinutes: OPEN,
    closeMinutes: CLOSE,
    peakStartHour: 17,
    peakEndHour: 21,
    busy: [],
    bookable: true,
    timezone: VN,
    now: NOW,
    ...overrides
  });
const stateAt = (slots, start) => slots.find((s) => s.start === start).state;

describe('daySlots — số học ngày', () => {
  test('addDays qua ranh giới tháng, năm và năm nhuận', () => {
    expect(addDays('2026-10-06', 13)).toBe('2026-10-19');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  test('isRealDate: đúng dạng VÀ là ngày có thật', () => {
    expect(isRealDate('2026-10-06')).toBe(true);
    expect(isRealDate('2028-02-29')).toBe(true);
    expect(isRealDate('2026-02-30')).toBe(false);
    expect(isRealDate('2026-13-01')).toBe(false);
    expect(isRealDate('26-10-06')).toBe(false);
    expect(isRealDate('2026-10-06T00:00:00')).toBe(false);
    expect(isRealDate('')).toBe(false);
  });

  test('dải ngày khách được xem: hôm nay + 13, tính cả hôm nay là 14 ngày', () => {
    expect(BOOKING_WINDOW_DAYS).toBe(14);
    expect(bookingWindow('2026-10-06')).toEqual({ first: '2026-10-06', last: '2026-10-19' });
    expect(bookingWindow('2026-12-25').last).toBe('2027-01-07');
  });
});

describe('buildCourtSlots — các ô của một sân', () => {
  test('phủ trọn giờ mở cửa, mỗi ô 60 phút: 05:00–23:00 là 18 ô', () => {
    const slots = slotsOf();
    expect(slots).toHaveLength(18);
    expect(slots[0]).toMatchObject({ start: '05:00', end: '06:00' });
    expect(slots[17]).toMatchObject({ start: '22:00', end: '23:00' });
  });

  test('giờ mở lệch giờ chẵn: ô cuối không vượt giờ đóng cửa', () => {
    const slots = slotsOf({ openMinutes: m('05:30'), closeMinutes: m('22:30') });
    expect(slots).toHaveLength(17);
    expect(slots[0].start).toBe('05:30');
    expect(slots[16]).toMatchObject({ start: '21:30', end: '22:30' });
  });

  test('khung giờ mở cửa hẹp hơn một ô thì không có ô nào', () => {
    expect(slotsOf({ openMinutes: m('10:00'), closeMinutes: m('10:30') })).toEqual([]);
  });

  test('cờ cao điểm theo khung 17:00–21:00, biên đúng giờ', () => {
    const slots = slotsOf();
    const peak = (start) => slots.find((s) => s.start === start).peak;
    expect(peak('16:00')).toBe(false); // 16:00–17:00 chỉ chạm biên, không vào cao điểm
    expect(peak('17:00')).toBe(true);
    expect(peak('20:00')).toBe(true);
    expect(peak('21:00')).toBe(false);
  });

  test('khung cao điểm rỗng hoặc ngược thì không có ô cao điểm nào', () => {
    expect(slotsOf({ peakStartHour: 21, peakEndHour: 17 }).some((s) => s.peak)).toBe(false);
    expect(slotsOf({ peakStartHour: 17, peakEndHour: 17 }).some((s) => s.peak)).toBe(false);
  });

  test('lịch kín chồng lên đúng những ô nó chạm vào', () => {
    const slots = slotsOf({ busy: [{ start: m('18:00'), end: m('20:00') }] });
    expect(stateAt(slots, '17:00')).toBe('free');
    expect(stateAt(slots, '18:00')).toBe('booked');
    expect(stateAt(slots, '19:00')).toBe('booked');
    expect(stateAt(slots, '20:00')).toBe('free');
  });

  test('lịch chạm biên (kết thúc đúng lúc ô bắt đầu) không làm kín ô liền kề', () => {
    const slots = slotsOf({ busy: [{ start: m('10:00'), end: m('11:00') }] });
    expect(stateAt(slots, '09:00')).toBe('free');
    expect(stateAt(slots, '10:00')).toBe('booked');
    expect(stateAt(slots, '11:00')).toBe('free');
  });

  test('lịch lệch nửa giờ làm kín mọi ô nó chạm vào, kể cả chỉ một phần', () => {
    const slots = slotsOf({ busy: [{ start: m('18:30'), end: m('19:30') }] });
    expect(stateAt(slots, '17:00')).toBe('free');
    expect(stateAt(slots, '18:00')).toBe('booked');
    expect(stateAt(slots, '19:00')).toBe('booked');
    expect(stateAt(slots, '20:00')).toBe('free');
  });

  test('lịch ngắn nằm gọn trong một ô vẫn làm kín cả ô', () => {
    const slots = slotsOf({ busy: [{ start: m('09:15'), end: m('09:45') }] });
    expect(stateAt(slots, '09:00')).toBe('booked');
    expect(stateAt(slots, '08:00')).toBe('free');
    expect(stateAt(slots, '10:00')).toBe('free');
  });

  test('sân bảo trì: mọi ô là bảo trì, dù có lịch hay đã qua', () => {
    const slots = slotsOf({
      date: '2026-10-06',
      bookable: false,
      busy: [{ start: m('18:00'), end: m('19:00') }]
    });
    expect(new Set(slots.map((s) => s.state))).toEqual(new Set([SLOT_STATES.MAINTENANCE]));
  });
});

describe('buildCourtSlots — ô đã qua (đồng hồ chi nhánh)', () => {
  test('hôm nay lúc 17:40: ô 17:00 đã bắt đầu → đã qua, ô 18:00 còn', () => {
    const slots = slotsOf({ date: '2026-10-06' });
    expect(stateAt(slots, '05:00')).toBe('passed');
    expect(stateAt(slots, '16:00')).toBe('passed');
    expect(stateAt(slots, '17:00')).toBe('passed');
    expect(stateAt(slots, '18:00')).toBe('free');
    expect(stateAt(slots, '22:00')).toBe('free');
  });

  test('ngày đã qua: tất cả đã qua; ngày mai: không ô nào', () => {
    expect(new Set(slotsOf({ date: '2026-10-05' }).map((s) => s.state))).toEqual(new Set(['passed']));
    expect(slotsOf({ date: '2026-10-07' }).some((s) => s.state === 'passed')).toBe(false);
  });

  test('biên: đúng giờ bắt đầu thì ô còn đặt được, một giây sau là đã qua', () => {
    const at18 = new Date(Date.UTC(2026, 9, 6, 11, 0, 0)); // 18:00:00 VN
    const after = new Date(Date.UTC(2026, 9, 6, 11, 0, 1));
    expect(stateAt(slotsOf({ date: '2026-10-06', now: at18 }), '18:00')).toBe('free');
    expect(stateAt(slotsOf({ date: '2026-10-06', now: at18 }), '17:00')).toBe('passed');
    expect(stateAt(slotsOf({ date: '2026-10-06', now: after }), '18:00')).toBe('passed');
  });

  test('ô đã qua thắng ô đã kín (cùng thứ tự với checkAvailability)', () => {
    const slots = slotsOf({
      date: '2026-10-06',
      busy: [{ start: m('09:00'), end: m('10:00') }, { start: m('19:00'), end: m('20:00') }]
    });
    expect(stateAt(slots, '09:00')).toBe('passed');
    expect(stateAt(slots, '19:00')).toBe('booked');
  });

  test('theo múi giờ chi nhánh, không theo máy chạy test: cùng một mốc UTC, hai chi nhánh', () => {
    // 10:40 UTC = 17:40 ở Việt Nam, 06:40 ở New York (UTC−4 tháng 10).
    const vn = slotsOf({ date: '2026-10-06', timezone: VN });
    const ny = slotsOf({ date: '2026-10-06', timezone: 'America/New_York' });
    expect(stateAt(vn, '12:00')).toBe('passed');
    expect(stateAt(ny, '12:00')).toBe('free');
    expect(stateAt(ny, '06:00')).toBe('passed');
    expect(stateAt(ny, '07:00')).toBe('free');
  });
});

describe('buildCourtSlots — chỉ chặt hơn server đúng một bậc', () => {
  // Lưới coi ô đã BẮT ĐẦU là "đã qua"; server (hasSlotPassed) chỉ từ chối khung
  // đã ĐÓNG hẳn. Hai luật phải khớp đúng quan hệ: server đã từ chối thì lưới
  // chắc chắn đã qua; lưới đã qua mà server còn nhận thì chỉ vì ô đang chạy dở.
  test('quét nhiều mốc `now` × mọi ô của hôm nay', () => {
    const date = '2026-10-06';
    const nowsUtc = [];
    for (let minute = 0; minute < 24 * 60; minute += 7) {
      nowsUtc.push(new Date(Date.UTC(2026, 9, 5, 17, 0, 0) + minute * 60000)); // phủ cả ngày 06/10 giờ VN
    }
    for (const now of nowsUtc) {
      for (const slot of slotsOf({ date, now })) {
        const serverPassed = BookingService.hasSlotPassed({ bookingDate: date, endTime: slot.end, timezone: VN, now });
        if (serverPassed) expect(slot.state).toBe('passed');
        if (slot.state === 'passed' && !serverPassed) {
          // Ô đang chạy dở: đã bắt đầu, chưa kết thúc.
          const startsAt = Date.UTC(2026, 9, 6, 0, 0, 0) - 7 * 3600000 + m(slot.start) * 60000;
          const endsAt = startsAt + 60 * 60000;
          expect(startsAt).toBeLessThan(now.getTime());
          expect(endsAt).toBeGreaterThan(now.getTime());
        }
      }
    }
  });
});

describe('buildDayAvailability — payload công khai', () => {
  const branch = { id: 1, name: 'Chi nhánh chính', timezone: VN, address: 'không được lộ' };
  const courts = [
    { id: 1, name: 'Sân số 1', peakPricePerHour: 90000, offpeakPricePerHour: 60000, bookable: true, note: null },
    { id: 2, name: 'Sân số 2', peakPricePerHour: 90000, offpeakPricePerHour: 60000, bookable: true, note: null },
    { id: 3, name: 'Sân số 3', peakPricePerHour: 90000, offpeakPricePerHour: 60000, bookable: false, note: 'Đang bảo trì, tạm không nhận đặt' }
  ];
  const build = (bookings) =>
    buildDayAvailability({
      date: '2026-10-07',
      branch,
      courts,
      bookings,
      operatingHours: { open: '05:00', close: '23:00', openMinutes: 300, closeMinutes: 1380 },
      peakHours: { peakStartHour: 17, peakEndHour: 21 },
      timezone: VN,
      today: '2026-10-06',
      now: NOW
    });

  test('gộp lịch theo từng sân; sân khác không bị ảnh hưởng', () => {
    const day = build([
      { courtId: 1, startTime: '18:00:00', endTime: '20:00:00' },
      { courtId: 2, startTime: '08:00:00', endTime: '09:00:00' }
    ]);
    const booked = (id) => day.courts.find((c) => c.id === id).slots.filter((s) => s.state === 'booked').map((s) => s.start);
    expect(booked(1)).toEqual(['18:00', '19:00']);
    expect(booked(2)).toEqual(['08:00']);
    expect(booked(3)).toEqual([]);
    expect(day.courts.find((c) => c.id === 3).slots.every((s) => s.state === 'maintenance')).toBe(true);
  });

  test('danh sách trường đóng: không lộ mã lịch, mã khách, trạng thái duyệt hay địa chỉ', () => {
    const day = build([
      // Dòng lịch dù có mang thêm trường nội bộ cũng không được lọt ra ngoài.
      { id: 991, courtId: 1, customerId: 77, customerName: 'Nguyễn Văn Bí Mật', status: 'confirmed', startTime: '18:00:00', endTime: '19:00:00' }
    ]);

    expect(Object.keys(day).sort()).toEqual(
      ['branch', 'courts', 'date', 'lastBookableDate', 'operatingHours', 'peakHours', 'today'].sort()
    );
    expect(Object.keys(day.branch).sort()).toEqual(['id', 'name']);
    expect(Object.keys(day.operatingHours).sort()).toEqual(['close', 'open']);
    expect(Object.keys(day.courts[0]).sort()).toEqual(
      ['bookable', 'id', 'name', 'note', 'offpeakPricePerHour', 'peakPricePerHour', 'slots'].sort()
    );
    expect(Object.keys(day.courts[0].slots[0]).sort()).toEqual(['end', 'peak', 'start', 'state']);

    const json = JSON.stringify(day);
    expect(json).not.toMatch(/Bí Mật|customer|991|status|confirmed|address/i);
  });

  test('mốc cuối của dải ngày đi kèm để trang dựng dải ngày không cần tự tính', () => {
    const day = build([]);
    expect(day.today).toBe('2026-10-06');
    expect(day.lastBookableDate).toBe('2026-10-19');
  });
});
