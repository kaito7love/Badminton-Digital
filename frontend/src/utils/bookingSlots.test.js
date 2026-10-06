import { describe, test, expect, vi, afterEach } from 'vitest';
import { TIME_SLOTS, DURATIONS, FALLBACK_HOURS, addHours, durationsFor, openSlotsFor } from './bookingSlots';

/**
 * Widget đặt sân chỉ được chào những mốc giờ và số giờ chơi mà server sẽ nhận
 * (`backend/src/utils/operatingHours.js`). Mốc "hiện tại" luôn ghim bằng
 * `vi.setSystemTime` với một mốc UTC tường minh nên test không phụ thuộc múi
 * giờ máy chạy test.
 */
const ghimThoiGian = (isoUtc) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(isoUtc));
};

afterEach(() => {
  vi.useRealTimers();
});

const VN = 'Asia/Ho_Chi_Minh';
const QUAN = { open: '05:00', close: '23:00' };
const MAI = '2026-10-08';

describe('addHours — giờ kết thúc, không kẹp', () => {
  test('cộng đúng số giờ chơi', () => {
    expect(addHours('05:00', '1')).toBe('06:00');
    expect(addHours('19:00', '3')).toBe('22:00');
    expect(addHours('21:00', '2')).toBe('23:00');
  });

  test('vượt 23:00 thì TRẢ ĐÚNG con số vượt, không kẹp về 23:00', () => {
    // Bản trước kẹp `Math.min(h + hours, 23)`: chọn "21:00 + 3 giờ" gửi lên
    // 21:00–23:00 (2 giờ) nhưng nhãn ghi "(3 giờ)" và tạm tính thu tiền 3 giờ.
    // Kẹp im lặng là cái đã che mất sai lệch đó, nên bỏ.
    expect(addHours('21:00', '3')).toBe('24:00');
    expect(addHours('22:00', '2')).toBe('24:00');
  });
});

describe('durationsFor — số giờ chơi không được vượt giờ đóng cửa', () => {
  test('mốc sớm thì chọn được cả 1, 2, 3 giờ', () => {
    expect(durationsFor('05:00', QUAN)).toEqual(DURATIONS);
    expect(durationsFor('20:00', QUAN)).toEqual(['1', '2', '3']);
  });

  test('21:00 chỉ còn 1 và 2 giờ — "không thể đặt quá 23h"', () => {
    expect(durationsFor('21:00', QUAN)).toEqual(['1', '2']);
  });

  test('22:00 chỉ còn 1 giờ', () => {
    expect(durationsFor('22:00', QUAN)).toEqual(['1']);
  });

  test('đúng giờ đóng thì không còn số giờ nào', () => {
    expect(durationsFor('23:00', QUAN)).toEqual([]);
  });

  test('giờ đóng sớm hơn thì danh sách hẹp theo', () => {
    expect(durationsFor('19:00', { open: '06:00', close: '21:00' })).toEqual(['1', '2']);
    expect(durationsFor('20:00', { open: '06:00', close: '21:00' })).toEqual(['1']);
  });

  test('không truyền giờ mở cửa thì dùng mặc định 05:00–23:00', () => {
    expect(durationsFor('21:00')).toEqual(['1', '2']);
    expect(FALLBACK_HOURS).toEqual({ open: '05:00', close: '23:00' });
  });
});

describe('openSlotsFor — mốc giờ widget chào bán', () => {
  test('ngày mai: đủ mọi mốc từ 05:00, vì khung quán là 05:00–23:00', () => {
    ghimThoiGian('2026-10-06T10:40:00Z');
    expect(openSlotsFor({ date: MAI, hours: QUAN, timezone: VN })).toEqual(TIME_SLOTS);
    expect(TIME_SLOTS[0]).toBe('05:00');
  });

  test('giờ mở cửa muộn hơn thì bỏ các mốc sớm', () => {
    ghimThoiGian('2026-10-06T10:40:00Z');
    expect(openSlotsFor({ date: MAI, hours: { open: '08:00', close: '23:00' }, timezone: VN }))
      .toEqual(['08:00', '10:00', '12:00', '14:00', '16:00', '17:00', '19:00', '20:00', '21:00']);
  });

  test('giờ đóng sớm thì bỏ mốc không còn đủ 1 giờ', () => {
    ghimThoiGian('2026-10-06T10:40:00Z');
    // Đóng 20:00: mốc 19:00 còn đủ 1 giờ nên giữ, 21:00 thì không.
    expect(openSlotsFor({ date: MAI, hours: { open: '05:00', close: '20:00' }, timezone: VN }))
      .toEqual(['05:00', '06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '17:00', '19:00']);
  });

  test('hôm nay 17h40: chỉ còn các mốc buổi tối', () => {
    ghimThoiGian('2026-10-06T10:40:00Z');
    expect(openSlotsFor({ date: '2026-10-06', hours: QUAN, timezone: VN }))
      .toEqual(['19:00', '20:00', '21:00']);
  });

  test('hôm nay 04h30 (quán chưa mở): vẫn chào trọn ngày từ 05:00', () => {
    // 05/10 21:30 UTC = 06/10 04:30 giờ Việt Nam.
    ghimThoiGian('2026-10-05T21:30:00Z');
    expect(openSlotsFor({ date: '2026-10-06', hours: QUAN, timezone: VN })).toEqual(TIME_SLOTS);
  });

  test('hôm nay sau 21:00: hết mốc, widget phải mời chọn ngày khác', () => {
    // 06/10 14:00 UTC = 21:00 giờ Việt Nam.
    ghimThoiGian('2026-10-06T14:00:00Z');
    expect(openSlotsFor({ date: '2026-10-06', hours: QUAN, timezone: VN })).toEqual([]);
  });

  test('tính theo giờ CHI NHÁNH, không theo giờ máy khách', () => {
    ghimThoiGian('2026-10-06T10:40:00Z');
    // Cùng một thời điểm, hai chi nhánh khác múi giờ thấy hai danh sách khác
    // nhau: Việt Nam đã 17:40 nên chỉ còn 19:00 và 21:00; New York mới 06:40
    // sáng nên chỉ hai mốc 05:00/06:00 là đã qua.
    expect(openSlotsFor({ date: '2026-10-06', hours: QUAN, timezone: 'Asia/Ho_Chi_Minh' }))
      .toEqual(['19:00', '20:00', '21:00']);
    expect(openSlotsFor({ date: '2026-10-06', hours: QUAN, timezone: 'America/New_York' }))
      .toEqual(['08:00', '10:00', '12:00', '14:00', '16:00', '17:00', '19:00', '20:00', '21:00']);
  });

  test('mọi mốc được chào đều có ít nhất một số giờ chơi hợp lệ', () => {
    ghimThoiGian('2026-10-06T10:40:00Z');
    for (const hours of [QUAN, { open: '06:00', close: '22:00' }, { open: '08:00', close: '20:00' }]) {
      for (const slot of openSlotsFor({ date: MAI, hours, timezone: VN })) {
        expect(durationsFor(slot, hours).length).toBeGreaterThan(0);
      }
    }
  });

  test('không có khung nào vượt giờ đóng cửa — bất biến chính của "không đặt quá 23h"', () => {
    ghimThoiGian('2026-10-06T10:40:00Z');
    for (const hours of [QUAN, { open: '05:00', close: '20:00' }, { open: '07:00', close: '21:30' }]) {
      for (const slot of openSlotsFor({ date: MAI, hours, timezone: VN })) {
        for (const d of durationsFor(slot, hours)) {
          expect(slot >= hours.open).toBe(true);
          expect(addHours(slot, d) <= hours.close).toBe(true);
        }
      }
    }
  });

  test('mọi mốc giờ các lối tắt ở trang chủ điền sẵn đều là mốc thật', () => {
    // `startBookingFromCard` ở HomePage.jsx điền sẵn các giờ này từ lưới giờ
    // tham khảo và thẻ sân. Mốc nào không nằm trong TIME_SLOTS sẽ bị effect
    // "kéo về tập đang chào" đẩy sang mốc khác — khách bấm 12:00 mà nhận 05:00.
    for (const t of ['08:00', '12:00', '16:00', '17:00', '20:00']) {
      expect(TIME_SLOTS).toContain(t);
    }
  });

  test('nhận danh sách mốc giờ từ server, không dùng hằng số cứng', () => {
    // `/public/courts` công bố danh sách chuẩn; widget phải đi theo nó để ô
    // khách bấm trên lưới lịch luôn là một lựa chọn thật của widget.
    ghimThoiGian('2026-10-06T10:40:00Z');
    expect(openSlotsFor({ date: MAI, hours: QUAN, timezone: VN, slots: ['07:00', '13:00'] }))
      .toEqual(['07:00', '13:00']);
    // Danh sách của server vẫn chịu đủ hai lớp lọc: giờ mở cửa và đã-qua.
    expect(openSlotsFor({ date: MAI, hours: { open: '10:00', close: '23:00' }, timezone: VN, slots: ['07:00', '13:00'] }))
      .toEqual(['13:00']);
    expect(openSlotsFor({ date: '2026-10-06', hours: QUAN, timezone: VN, slots: ['07:00', '13:00'] }))
      .toEqual([]);
  });

  test('thiếu tham số thì dùng mặc định, không văng lỗi', () => {
    ghimThoiGian('2026-10-06T10:40:00Z');
    expect(() => openSlotsFor()).not.toThrow();
    expect(openSlotsFor({ date: MAI })).toEqual(TIME_SLOTS);
  });
});
