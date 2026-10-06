const BookingService = require('../src/services/BookingService');
const { localDateString, localTimeString } = require('../src/utils/dateTime');

/**
 * `BookingService.hasSlotPassed` quyết định "khung giờ này đã qua chưa" cho CẢ
 * hai đường: `/public/availability` mà trang chủ gọi, và `POST /bookings` lúc
 * bấm đặt thật — cả hai đều đi qua `checkAvailability`.
 *
 * Test ở đây luôn truyền `now` dựng bằng `Date.UTC(...)` và truyền múi giờ
 * tường minh, nên kết quả không phụ thuộc múi giờ của máy chạy test (runner CI
 * chạy UTC, máy dev chạy giờ Việt Nam — cùng lớp lỗi đã sửa ở dateTime.test.js).
 */
describe('hasSlotPassed — khung giờ tính theo đồng hồ chi nhánh', () => {
  const VN = 'Asia/Ho_Chi_Minh';
  // 06/10/2026 10:40 UTC = 17:40 giờ Việt Nam.
  const now = new Date(Date.UTC(2026, 9, 6, 10, 40, 0));
  const passed = (bookingDate, endTime, timezone = VN) =>
    BookingService.hasSlotPassed({ bookingDate, endTime, timezone, now });

  test('mốc neo của bộ test đúng là 06/10/2026 17:40 giờ Việt Nam', () => {
    expect(localDateString(now, VN)).toBe('2026-10-06');
    expect(localTimeString(now, VN)).toBe('17:40:00');
  });

  test('ngày đã qua → đã hết, bất kể giờ nào trong ngày', () => {
    expect(passed('2026-09-29', '11:00')).toBe(true);
    expect(passed('2026-10-05', '23:00')).toBe(true);
  });

  test('ngày mai trở đi → còn đặt được, kể cả khung giờ sáng sớm', () => {
    expect(passed('2026-10-07', '07:00')).toBe(false);
    expect(passed('2026-11-20', '09:00')).toBe(false);
  });

  test('hôm nay: khung giờ đã đóng → đã hết', () => {
    // Đúng ca khách gặp: 17h40 vẫn chọn được "06:00 hôm nay" trên widget.
    expect(passed('2026-10-06', '08:00')).toBe(true);
    expect(passed('2026-10-06', '01:00')).toBe(true);
  });

  test('hôm nay: khung giờ còn chưa đóng → còn đặt được', () => {
    expect(passed('2026-10-06', '19:00')).toBe(false);
    expect(passed('2026-10-06', '23:00')).toBe(false);
  });

  test('biên: kết thúc đúng lúc này là đã hết, sau một phút là còn', () => {
    expect(passed('2026-10-06', '17:40')).toBe(true);
    expect(passed('2026-10-06', '17:41')).toBe(false);
  });

  test('khung giờ đã BẮT ĐẦU nhưng chưa đóng vẫn đặt được', () => {
    // Có chủ đích: khách tới quầy lúc 17:40 vẫn vào khung 17:00–19:00, tiền sân
    // tính theo giờ chơi thực tế. Chặn ở đây sẽ làm hỏng việc của quầy.
    expect(passed('2026-10-06', '19:00')).toBe(false);
  });

  test('cùng một thời điểm, hai chi nhánh khác múi giờ trả lời khác nhau', () => {
    // 06/10 10:40 UTC: ở Việt Nam đã là 17:40 (khung 16:00 đóng rồi), còn ở
    // New York mới 06:40 sáng (khung 16:00 còn nguyên).
    expect(passed('2026-10-06', '16:00', 'Asia/Ho_Chi_Minh')).toBe(true);
    expect(passed('2026-10-06', '16:00', 'America/New_York')).toBe(false);
  });

  test('chi nhánh phía đông Việt Nam: ngày đã sang nhưng Việt Nam thì chưa', () => {
    // 06/10 17:00 UTC = 07/10 00:00 giờ Việt Nam, nhưng đã là 07/10 04:00 ở
    // Auckland — khung 02:00 ngày 07/10 ở Auckland đã đóng.
    const khuya = new Date(Date.UTC(2026, 9, 6, 17, 0, 0));
    const check = (tz) =>
      BookingService.hasSlotPassed({ bookingDate: '2026-10-07', endTime: '02:00', timezone: tz, now: khuya });
    expect(check('Pacific/Auckland')).toBe(true);
    expect(check('Asia/Ho_Chi_Minh')).toBe(false);
  });

  test('nhận cả HH:mm và HH:mm:ss (cột TIME của MySQL trả về dạng thứ hai)', () => {
    expect(passed('2026-10-06', '08:00:00')).toBe(true);
    expect(passed('2026-10-06', '19:00:00')).toBe(false);
  });

  test('nhận chuỗi ngày có đuôi giờ, chỉ lấy phần ngày', () => {
    expect(passed('2026-10-06T00:00:00.000Z', '08:00')).toBe(true);
    expect(passed('2026-10-07T00:00:00.000Z', '08:00')).toBe(false);
  });

  test('thiếu múi giờ thì rơi về giờ Việt Nam, không rơi về giờ máy chủ', () => {
    for (const tz of [undefined, null, '']) {
      expect(BookingService.hasSlotPassed({ bookingDate: '2026-10-06', endTime: '08:00', timezone: tz, now })).toBe(true);
      expect(BookingService.hasSlotPassed({ bookingDate: '2026-10-06', endTime: '19:00', timezone: tz, now })).toBe(false);
    }
  });

  test('mặc định `now` là hiện tại: hôm qua đã hết, sang năm thì chưa', () => {
    const homQua = localDateString(new Date(Date.now() - 24 * 3600 * 1000), VN);
    expect(BookingService.hasSlotPassed({ bookingDate: homQua, endTime: '23:00', timezone: VN })).toBe(true);
    expect(BookingService.hasSlotPassed({ bookingDate: '2099-01-01', endTime: '07:00', timezone: VN })).toBe(false);
  });
});

/**
 * Thông điệp từ chối đi thẳng ra toast trên trang chủ của khách
 * (`HomePage.handleQuickBooking` hiển thị `message` mà API trả về), nên không
 * được có câu tiếng Anh nào lọt vào.
 */
describe('UNAVAILABLE — thông điệp khách đọc phải là tiếng Việt', () => {
  const DAU_TIENG_VIET = /[àáâãèéêìíòóôõùúăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹý]/i;

  test('mọi lý do từ chối đều có thông điệp tiếng Việt', () => {
    const messages = BookingService.UNAVAILABLE;
    expect(Object.keys(messages).sort()).toEqual(
      ['ALREADY_BOOKED', 'COURT_INACTIVE', 'COURT_MAINTENANCE', 'COURT_NOT_FOUND', 'SLOT_PASSED']
    );
    for (const [reason, message] of Object.entries(messages)) {
      expect(typeof message).toBe('string');
      expect(message.trim().length).toBeGreaterThan(0);
      // Có dấu tiếng Việt là bằng chứng chắc nhất cho "không phải câu tiếng Anh".
      expect(DAU_TIENG_VIET.test(message)).toBe(true);
    }
  });

  test('câu tiếng Anh cũ không còn quay lại', () => {
    const all = Object.values(BookingService.UNAVAILABLE).join(' | ');
    expect(all).not.toMatch(/already booked/i);
    expect(all).not.toMatch(/Selected court/i);
  });
});
