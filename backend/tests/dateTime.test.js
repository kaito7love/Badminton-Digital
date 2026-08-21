const { localDateString, localTimeString, startOfLocalDay, endOfLocalDay, getUtcOffsetMinutes, DEFAULT_TIMEZONE } = require('../src/utils/dateTime');

/**
 * Các hàm trong dateTime.js làm việc theo MÚI GIỜ TRUYỀN VÀO (mặc định
 * Asia/Ho_Chi_Minh), hoàn toàn không phụ thuộc múi giờ của máy chạy test.
 *
 * Vì vậy test ở đây phải:
 *   - dựng mốc thời gian bằng `Date.UTC(...)` để ghim đúng một thời điểm tuyệt
 *     đối, thay vì `new Date(y, m, d, ...)` (đọc theo giờ máy);
 *   - và kiểm kết quả bằng chính `localDateString`/`localTimeString`, thay vì
 *     `getHours()`/`getMinutes()` (cũng đọc theo giờ máy).
 *
 * Bản trước dùng getHours() nên fail trên máy đặt UTC — chạy đúng ở máy dev
 * giờ Việt Nam nhưng đỏ trên CI (runner ubuntu-latest chạy UTC).
 */
describe('dateTime — mốc thời gian theo giờ địa phương', () => {
  test('localDateString lấy ngày theo giờ địa phương, không theo UTC', () => {
    // 14/08 18:30 UTC = 15/08 01:30 giờ Việt Nam. Cắt chuỗi ISO sẽ ra ngày 14,
    // còn hàm này phải trả về đúng ngày 15 mà nhân viên đang thấy trên đồng hồ.
    const d = new Date(Date.UTC(2026, 7, 14, 18, 30, 0));
    expect(localDateString(d)).toBe('2026-08-15');
  });

  test('localDateString đệm 0 cho tháng và ngày một chữ số', () => {
    // 04/01 18:00 UTC = 05/01 01:00 giờ Việt Nam.
    expect(localDateString(new Date(Date.UTC(2026, 0, 4, 18, 0, 0)))).toBe('2026-01-05');
  });

  test('localTimeString trả về HH:mm:ss so được với cột TIME', () => {
    // 15/08 02:05:03 UTC = 09:05:03 giờ Việt Nam.
    expect(localTimeString(new Date(Date.UTC(2026, 7, 15, 2, 5, 3)))).toBe('09:05:03');
  });

  test('startOfLocalDay và endOfLocalDay bọc trọn một ngày địa phương', () => {
    const giua = new Date(Date.UTC(2026, 7, 15, 6, 45, 12)); // 13:45 giờ Việt Nam
    const dau = startOfLocalDay(giua);
    const cuoi = endOfLocalDay(giua);

    expect(localTimeString(dau)).toBe('00:00:00');
    expect(localTimeString(cuoi)).toBe('23:59:59');
    expect(dau <= giua && giua <= cuoi).toBe(true);
    expect(localDateString(dau)).toBe('2026-08-15');
    expect(localDateString(cuoi)).toBe('2026-08-15');
  });

  test('không làm thay đổi Date được truyền vào', () => {
    const goc = new Date(Date.UTC(2026, 7, 15, 6, 45, 12));
    const truoc = goc.getTime();
    startOfLocalDay(goc);
    endOfLocalDay(goc);
    expect(goc.getTime()).toBe(truoc);
  });

  test('nhận múi giờ khác — chi nhánh không nằm ở Việt Nam vẫn cắt ngày đúng', () => {
    // 15/08 20:00 UTC: ở Việt Nam (+07) đã sang 16/08 03:00, còn ở New York
    // (-04) vẫn là 15/08 16:00.
    const d = new Date(Date.UTC(2026, 7, 15, 20, 0, 0));
    expect(localDateString(d, DEFAULT_TIMEZONE)).toBe('2026-08-16');
    expect(localDateString(d, 'America/New_York')).toBe('2026-08-15');
    expect(localTimeString(d, 'America/New_York')).toBe('16:00:00');
  });
});

/**
 * `getUtcOffsetMinutes` dùng để dịch cột DATETIME (lưu UTC) sang giờ chi nhánh
 * ngay trong câu SQL khi GROUP BY báo cáo. Không phụ thuộc múi giờ máy chủ —
 * các ca dưới đây cũng viết sao cho chạy đúng ở mọi máy.
 */
describe('dateTime.getUtcOffsetMinutes', () => {
  const d = new Date(Date.UTC(2026, 7, 20, 13, 0, 0));

  test('Việt Nam là UTC+7 nên lệch đúng 420 phút', () => {
    expect(getUtcOffsetMinutes(d, DEFAULT_TIMEZONE)).toBe(420);
  });

  test('múi giờ phía tây UTC cho độ lệch âm', () => {
    // New York mùa hè là UTC-4.
    expect(getUtcOffsetMinutes(d, 'America/New_York')).toBe(-240);
  });

  test('cộng độ lệch vào mốc UTC thì ra đúng giờ treo tường của chi nhánh', () => {
    // Mô phỏng đúng việc SQL làm: DATE_ADD(cột_utc, INTERVAL offset MINUTE).
    const sauKhiDich = new Date(d.getTime() + getUtcOffsetMinutes(d, DEFAULT_TIMEZONE) * 60000);
    expect(sauKhiDich.toISOString().slice(11, 19)).toBe(localTimeString(d, DEFAULT_TIMEZONE));
  });
});
