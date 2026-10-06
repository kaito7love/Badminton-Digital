import { describe, test, expect, vi, afterEach } from 'vitest';
import { todayInZone, nowTimeInZone, wallClockPassed } from './datetime';

/**
 * `wallClockPassed` trả lời "mốc giờ treo tường ở chi nhánh này đã qua chưa" —
 * widget đặt sân ở trang chủ dùng nó để quyết định còn chào bán mốc giờ nào.
 *
 * Mốc "hiện tại" luôn được ghim bằng `vi.setSystemTime` với một mốc UTC tường
 * minh, nên test không phụ thuộc múi giờ của máy chạy test.
 */
const ghimThoiGian = (isoUtc) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(isoUtc));
};

afterEach(() => {
  vi.useRealTimers();
});

describe('wallClockPassed — mốc giờ đã qua theo đồng hồ chi nhánh', () => {
  const VN = 'Asia/Ho_Chi_Minh';

  test('ghim đúng 06/10/2026 17:40 giờ Việt Nam', () => {
    ghimThoiGian('2026-10-06T10:40:00Z');
    expect(todayInZone(VN)).toBe('2026-10-06');
    expect(nowTimeInZone(VN)).toBe('17:40');
  });

  test('ngày đã qua → đã hết; ngày mai → còn', () => {
    ghimThoiGian('2026-10-06T10:40:00Z');
    expect(wallClockPassed('2026-09-29', '11:00', VN)).toBe(true);
    expect(wallClockPassed('2026-10-05', '23:00', VN)).toBe(true);
    expect(wallClockPassed('2026-10-07', '07:00', VN)).toBe(false);
  });

  test('hôm nay: mốc đã đóng thì hết, chưa đóng thì còn', () => {
    ghimThoiGian('2026-10-06T10:40:00Z');
    // Đúng ca khách gặp: 17h40 widget vẫn chào "06:00 hôm nay".
    expect(wallClockPassed('2026-10-06', '08:00', VN)).toBe(true);
    expect(wallClockPassed('2026-10-06', '17:00', VN)).toBe(true);
    expect(wallClockPassed('2026-10-06', '19:00', VN)).toBe(false);
    expect(wallClockPassed('2026-10-06', '23:00', VN)).toBe(false);
  });

  test('biên: đóng đúng lúc này là hết, sau một phút là còn', () => {
    ghimThoiGian('2026-10-06T10:40:00Z');
    expect(wallClockPassed('2026-10-06', '17:40', VN)).toBe(true);
    expect(wallClockPassed('2026-10-06', '17:41', VN)).toBe(false);
  });

  test('so theo giờ CHI NHÁNH, không theo giờ máy khách', () => {
    ghimThoiGian('2026-10-06T10:40:00Z');
    // Cùng một thời điểm: Việt Nam 17:40 (khung 16:00 đã đóng), New York 06:40
    // sáng (khung 16:00 còn nguyên). Khách đi công tác mở trang vẫn phải thấy
    // đúng lịch của quán, không phải lịch theo đồng hồ điện thoại họ đang cầm.
    expect(wallClockPassed('2026-10-06', '16:00', 'Asia/Ho_Chi_Minh')).toBe(true);
    expect(wallClockPassed('2026-10-06', '16:00', 'America/New_York')).toBe(false);
  });

  test('thiếu múi giờ thì rơi về giờ Việt Nam', () => {
    ghimThoiGian('2026-10-06T10:40:00Z');
    expect(wallClockPassed('2026-10-06', '08:00')).toBe(true);
    expect(wallClockPassed('2026-10-06', '19:00')).toBe(false);
  });

  test('qua nửa đêm giờ Việt Nam là sang ngày mới, không cắt chuỗi ISO', () => {
    // 06/10 17:00 UTC = 07/10 00:00 giờ Việt Nam. Cắt chuỗi ISO sẽ vẫn thấy
    // ngày 06 và coi mọi khung giờ ngày 07 là "tương lai xa".
    ghimThoiGian('2026-10-06T17:00:00Z');
    expect(todayInZone(VN)).toBe('2026-10-07');
    expect(wallClockPassed('2026-10-06', '23:00', VN)).toBe(true);
    expect(wallClockPassed('2026-10-07', '08:00', VN)).toBe(false);
  });

  test('nhận HH:mm:ss và chuỗi ngày có đuôi giờ', () => {
    ghimThoiGian('2026-10-06T10:40:00Z');
    expect(wallClockPassed('2026-10-06', '08:00:00', VN)).toBe(true);
    expect(wallClockPassed('2026-10-06T00:00:00.000Z', '08:00', VN)).toBe(true);
    expect(wallClockPassed('2026-10-07T00:00:00.000Z', '08:00', VN)).toBe(false);
  });

  test('đúng nửa đêm giờ chi nhánh: 00:00, KHÔNG phải 24:00', () => {
    // 06/10 17:00 UTC = 07/10 00:00 giờ Việt Nam. Hệ đếm giờ nào trả "24:00" ở
    // đây sẽ làm 00h05 sáng coi mọi mốc giờ trong ngày là đã qua — widget trống
    // trơn suốt đêm. Vì thế `nowTimeInZone` ghim `hourCycle: 'h23'`.
    ghimThoiGian('2026-10-06T17:00:00Z');
    expect(nowTimeInZone(VN)).toBe('00:00');
    expect(wallClockPassed('2026-10-07', '06:00', VN)).toBe(false);
    expect(wallClockPassed('2026-10-07', '21:00', VN)).toBe(false);
  });

  test('thiếu dữ liệu thì không coi là đã qua (không chặn oan)', () => {
    ghimThoiGian('2026-10-06T10:40:00Z');
    expect(wallClockPassed(null, '08:00', VN)).toBe(false);
    expect(wallClockPassed('2026-10-06', null, VN)).toBe(false);
    expect(wallClockPassed(undefined, undefined, VN)).toBe(false);
  });
});

/**
 * Lọc đúng như widget đặt sân ở `HomePage.jsx`: một mốc giờ còn được chào bán
 * khi CHÍNH GIỜ BẮT ĐẦU của nó chưa trôi qua — chặt hơn luật của server (chỉ
 * chặn khung giờ đã đóng hẳn) và đó là chủ đích, xem comment ở `openSlots`.
 */
describe('danh sách mốc giờ widget chào bán', () => {
  const TIME_SLOTS = ['06:00', '08:00', '10:00', '14:00', '16:00', '17:00', '19:00', '21:00'];
  const VN = 'Asia/Ho_Chi_Minh';
  const openSlots = (date) => TIME_SLOTS.filter((t) => !wallClockPassed(date, t, VN));

  test('17h40 hôm nay: chỉ còn 19:00 và 21:00', () => {
    ghimThoiGian('2026-10-06T10:40:00Z');
    expect(openSlots('2026-10-06')).toEqual(['19:00', '21:00']);
  });

  test('ngày mai thì còn nguyên cả 8 mốc', () => {
    ghimThoiGian('2026-10-06T10:40:00Z');
    expect(openSlots('2026-10-07')).toEqual(TIME_SLOTS);
  });

  test('sáng sớm hôm nay cũng còn nguyên cả 8 mốc', () => {
    // 05/10 22:30 UTC = 06/10 05:30 giờ Việt Nam.
    ghimThoiGian('2026-10-05T22:30:00Z');
    expect(openSlots('2026-10-06')).toEqual(TIME_SLOTS);
  });

  test('mốc đang diễn ra cũng bị bỏ: 16h01 thì 16:00 không còn được chào', () => {
    // 06/10 09:01 UTC = 16:01 giờ Việt Nam. Server vẫn nhận khung 16:00–18:00
    // (quầy cần thế), nhưng trang chủ không mời khách trả tiền cho phần đã mất.
    ghimThoiGian('2026-10-06T09:01:00Z');
    expect(openSlots('2026-10-06')).toEqual(['17:00', '19:00', '21:00']);
  });

  test('đúng 21:00 thì mốc 21:00 cũng hết, không còn mốc nào', () => {
    // 06/10 14:00 UTC = 21:00 giờ Việt Nam.
    ghimThoiGian('2026-10-06T14:00:00Z');
    expect(openSlots('2026-10-06')).toEqual([]);
  });

  test('qua 21:00 hôm nay thì không còn mốc nào — widget phải mời chọn ngày khác', () => {
    // 06/10 16:10 UTC = 23:10 giờ Việt Nam.
    ghimThoiGian('2026-10-06T16:10:00Z');
    expect(openSlots('2026-10-06')).toEqual([]);
  });
});
