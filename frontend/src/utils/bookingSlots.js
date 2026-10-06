import { wallClockPassed } from './datetime';

/**
 * Các mốc giờ và số giờ chơi mà widget đặt sân ở trang chủ được phép chào bán.
 *
 * Tách khỏi `HomePage.jsx` để test được chính logic này, chứ không phải một bản
 * sao của nó. Luật cuối cùng vẫn do server chốt
 * (`backend/src/utils/operatingHours.js` + `BookingService.checkAvailability`);
 * ở đây chỉ là không chào bán thứ server sẽ từ chối.
 *
 * So sánh bằng CHUỖI "HH:mm" được vì mọi mốc đều đệm 0 — cùng cách
 * `wallClockPassed` làm.
 */

// Phải phủ MỌI mốc giờ mà các lối tắt ở trang chủ điền sẵn (lưới giờ tham khảo
// và thẻ sân gọi `startBookingFromCard` với 08:00, 12:00, 16:00, 17:00, 20:00).
// Mốc nào không có ở đây sẽ bị effect "kéo về tập đang chào" của HomePage đẩy
// sang mốc khác — khách bấm 12:00 mà nhận 05:00.
// `/public/courts` công bố danh sách này (backend utils/scheduleGrid.js
// #BOOKING_SLOTS) và `openSlotsFor` nhận nó qua tham số `slots`; hằng số dưới
// đây chỉ là bản dự phòng khi server chưa trả lời. Hai danh sách phải khớp —
// đổi một bên thì đổi cả bên kia.
export const TIME_SLOTS = [
  '05:00', '06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '17:00', '19:00', '20:00', '21:00'
];

export const DURATIONS = ['1', '2', '3'];

/** Dùng khi chưa tải xong `/public/courts`. Trùng mặc định của backend. */
export const FALLBACK_HOURS = Object.freeze({ open: '05:00', close: '23:00' });

/**
 * Giờ kết thúc của một khung đặt. KHÔNG kẹp về 23:00 như bản trước:
 * `Math.min(h + hours, 23)` làm chọn "21:00 + 3 giờ" gửi lên 21:00–23:00
 * (2 giờ) nhưng nhãn vẫn ghi "(3 giờ)" và tạm tính vẫn tính tiền 3 giờ. Giờ
 * chặn từ gốc bằng `durationsFor`, nên không còn gì phải kẹp.
 */
export const addHours = (hhmm, hours) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return `${String(h + Number(hours)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/** Số giờ chơi hợp lệ cho một mốc giờ: kết thúc không được vượt giờ đóng cửa. */
export const durationsFor = (slot, hours = FALLBACK_HOURS) =>
  DURATIONS.filter((d) => addHours(slot, d) <= hours.close);

/**
 * Mốc giờ còn chào bán, lọc hai lớp:
 *
 * (a) trong giờ mở cửa — mốc sớm hơn giờ mở, hoặc chẳng còn đủ 1 giờ trước giờ
 *     đóng, thì không phải hàng để bán;
 * (b) của HÔM NAY mà đã trôi qua thì bỏ. Trước đây danh sách mốc giờ là cố định
 *     nên 21h tối khách vẫn chọn được "06:00 hôm nay", qua được cả bước kiểm
 *     khung giờ, rồi mới lãnh lỗi ở bước bấm xác nhận.
 *
 * (b) lọc theo GIỜ BẮT ĐẦU, chặt hơn luật của server
 * (`BookingService.hasSlotPassed` chỉ chặn khung giờ đã ĐÓNG hẳn) — có chủ
 * đích, đừng nới ra cho "khớp":
 *   · chặt hơn thì an toàn, trang chủ không bao giờ chào thứ server từ chối;
 *   · mời khách đặt khung 16:00 lúc đã 17:40 là mời họ trả tiền cho 20 phút;
 *   · còn luật rộng hơn ở server là để quầy mở sân cho khách vừa bước vào giữa
 *     khung giờ — việc của nhân viên, không phải của widget này.
 */
export const openSlotsFor = ({ date, hours = FALLBACK_HOURS, timezone, slots = TIME_SLOTS } = {}) =>
  slots.filter(
    (t) => t >= hours.open && durationsFor(t, hours).length > 0 && !wallClockPassed(date, t, timezone)
  );
