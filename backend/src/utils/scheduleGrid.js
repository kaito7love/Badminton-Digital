// Lưới "sân × khung giờ" cho trang chủ công khai.
//
// Trước đây lưới đó là HTML ghi cứng: 6 ô dán nhãn "BOOKED" và 8 ô "available"
// bất biến, không hỏi server lần nào. Khách thấy Sân 01 lúc 10:00 đỏ thì bỏ
// qua, dù giờ đó đang trống — mất khách vì chính trang web của quán nói sai.
//
// Trạng thái từng ô tính ở đây, không ở giao diện: cùng bộ luật với
// `BookingService.checkAvailability` (chỉ `pending`/`confirmed` chiếm chỗ, giờ
// mở cửa từ `operating_hours`, giờ treo tường theo `branches.timezone`), nên
// lưới không thể nói khác lúc khách bấm đặt thật.
//
// Hàm thuần, không đọc DB: nơi gọi tự nạp sân/lịch/setting
// (PublicCatalogService), nên test được không cần DB.

const { toMinutes } = require('./dateTime');
const { normalizeOperatingHours } = require('./operatingHours');

/**
 * Các mốc giờ chuẩn của hệ thống — dùng cho cả lưới này và widget đặt sân ở
 * trang chủ (trả kèm trong `/public/courts`). Một danh sách duy nhất để lưới và
 * widget không bao giờ lệch nhau: ô khách bấm trên lưới phải là một lựa chọn
 * thật trong widget.
 */
const BOOKING_SLOTS = Object.freeze([
  '05:00', '06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '17:00', '19:00', '20:00', '21:00'
]);

/** Mỗi ô lưới là một khung 1 giờ — cùng đơn vị với giá hiển thị trên ô. */
const SLOT_DURATION_MINUTES = 60;

const hhmm = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * Các mốc giờ lưới bày ra: nằm trong giờ mở cửa và còn đủ trọn 1 giờ trước giờ
 * đóng. Khung giờ đã qua KHÔNG bị loại khỏi đây — chúng vẫn là cột của lưới,
 * chỉ mang trạng thái `passed`, để khách nhìn thấy cả ngày thay vì thấy bảng
 * teo dần theo buổi.
 */
const slotsWithinHours = (hours, slots = BOOKING_SLOTS) => {
  const window = normalizeOperatingHours(hours);
  return slots.filter((slot) => {
    const start = toMinutes(slot);
    return start >= window.openMinutes && start + SLOT_DURATION_MINUTES <= window.closeMinutes;
  });
};

/**
 * Khoảng đã bị chiếm của một sân, dạng [bắt đầu, kết thúc) tính bằng phút.
 * Chỉ nhận lịch `pending`/`confirmed` — giống điều kiện truy vấn trùng lịch ở
 * `checkAvailability`; `cancelled` nhả chỗ ra, `completed` là phiên đã chơi
 * xong và cũng không giữ chỗ nữa.
 */
const BUSY_STATUSES = ['pending', 'confirmed'];

const busyIntervalsByCourt = (bookings = []) => {
  const map = new Map();
  for (const booking of bookings) {
    if (!BUSY_STATUSES.includes(String(booking.status))) continue;
    const list = map.get(booking.courtId) || [];
    list.push([toMinutes(booking.startTime), toMinutes(booking.endTime)]);
    map.set(booking.courtId, list);
  }
  return map;
};

/**
 * Trạng thái một ô lưới. Thứ tự kiểm cố tình giống thứ tự khách quan tâm:
 * sân có nhận đặt không → giờ đó còn tới được không → có ai giữ chỗ chưa.
 *
 * `nowSlot` là giờ hiện tại ở chi nhánh dạng "HH:mm", hoặc null khi ngày đang
 * xem không phải hôm nay (ngày tương lai thì không mốc nào "đã qua", ngày đã
 * qua thì mọi mốc đều vậy — nơi gọi quyết định bằng `dayOffset`).
 */
const slotStatus = ({ slot, bookable = true, busy = [], dayOffset = 0, nowSlot = null }) => {
  if (!bookable) return 'unavailable';
  if (dayOffset < 0) return 'passed';
  // Lọc theo GIỜ BẮT ĐẦU, khớp với widget đặt sân: ô đánh `available` luôn là
  // lựa chọn widget thật sự chào bán (xem frontend utils/bookingSlots.js).
  if (dayOffset === 0 && nowSlot && slot <= nowSlot) return 'passed';

  const start = toMinutes(slot);
  const end = start + SLOT_DURATION_MINUTES;
  // Cùng phép giao nhau với truy vấn trùng lịch: start < busyEnd && end > busyStart.
  const taken = busy.some(([busyStart, busyEnd]) => start < busyEnd && end > busyStart);
  return taken ? 'booked' : 'available';
};

/**
 * Lưới hoàn chỉnh cho một chi nhánh trong một ngày.
 *
 * `courts` là dạng đã rút gọn công khai (`PublicCatalogService.getCourts`):
 * { id, name, bookable, note, peakPricePerHour, offpeakPricePerHour }.
 */
const buildScheduleGrid = ({ courts = [], bookings = [], hours, dayOffset = 0, nowSlot = null, slots }) => {
  const gridSlots = slotsWithinHours(hours, slots);
  const busyMap = busyIntervalsByCourt(bookings);

  return {
    slots: gridSlots,
    slotDurationMinutes: SLOT_DURATION_MINUTES,
    courts: courts.map((court) => ({
      id: court.id,
      name: court.name,
      bookable: court.bookable !== false,
      note: court.note ?? null,
      slots: gridSlots.map((slot) => ({
        time: slot,
        endTime: hhmm(toMinutes(slot) + SLOT_DURATION_MINUTES),
        status: slotStatus({
          slot,
          bookable: court.bookable !== false,
          busy: busyMap.get(court.id) || [],
          dayOffset,
          nowSlot
        })
      }))
    }))
  };
};

module.exports = {
  BOOKING_SLOTS,
  SLOT_DURATION_MINUTES,
  BUSY_STATUSES,
  slotsWithinHours,
  slotStatus,
  buildScheduleGrid
};
