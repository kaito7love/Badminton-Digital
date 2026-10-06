// Giờ nhận đặt sân. Lịch hợp lệ phải nằm TRỌN trong khung mở cửa: bắt đầu
// không sớm hơn giờ mở, kết thúc không muộn hơn giờ đóng.
//
// Setting `operating_hours` đã có trong DB từ seeder đầu tiên, nhưng trước đây
// chỉ `peak_start`/`peak_end` được đọc (SettingService.getPeakHours) — `open`
// và `close` là dữ liệu chết, nên booking nhận mọi giờ trong ngày, kể cả
// 02:00 sáng, và widget trang chủ kẹp giờ kết thúc về 23:00 rồi vẫn tính tiền
// theo số giờ khách chọn.
//
// Hàm thuần, không đọc DB: nơi gọi tự nạp setting (SettingService) nên test
// được không cần DB — cùng khuôn với utils/discountPolicy.js.

const { toMinutes } = require('./dateTime');

/** Khung mặc định khi setting thiếu hoặc lưu sai kiểu. */
const DEFAULT_OPERATING_HOURS = Object.freeze({ open: '05:00', close: '23:00' });

const HHMM = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/;

/** "HH:mm"/"HH:mm:ss" hợp lệ → số phút từ 00:00; còn lại → null. */
const minutesOf = (value) => (HHMM.test(String(value ?? '')) ? toMinutes(value) : null);

const hhmm = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

const build = (openMinutes, closeMinutes) => ({
  open: hhmm(openMinutes),
  close: hhmm(closeMinutes),
  openMinutes,
  closeMinutes
});

const FALLBACK = build(toMinutes(DEFAULT_OPERATING_HOURS.open), toMinutes(DEFAULT_OPERATING_HOURS.close));

/**
 * Giá trị `operating_hours` đã lưu → `{ open, close, openMinutes, closeMinutes }`.
 *
 * Thiếu, lưu sai kiểu, hay khung vô nghĩa (đóng trước hoặc đúng lúc mở) thì rơi
 * về mặc định — KHÔNG trả khung rỗng, vì khung rỗng sẽ chặn sạch mọi lịch đặt
 * chỉ vì một ô setting gõ sai.
 */
const normalizeOperatingHours = (stored) => {
  // Dạng mảng theo ngày ([{ day, open, close }]) là thứ trang Cài đặt đang
  // hiển thị. Chưa có đường nào ghi được dạng đó xuống DB, nhưng nếu gặp thì
  // lấy khung RỘNG NHẤT: chặn oan giờ quán thật sự có mở là mất khách, còn
  // nhận thừa vài giờ thì nhân viên vẫn xử lý được ở quầy.
  const entries = Array.isArray(stored) ? stored : [stored];
  const opens = entries.map((e) => minutesOf(e?.open)).filter((m) => m !== null);
  const closes = entries.map((e) => minutesOf(e?.close)).filter((m) => m !== null);
  if (!opens.length || !closes.length) return FALLBACK;

  const openMinutes = Math.min(...opens);
  const closeMinutes = Math.max(...closes);
  if (closeMinutes <= openMinutes) return FALLBACK;
  return build(openMinutes, closeMinutes);
};

/**
 * Lịch có nằm trọn trong giờ mở cửa không.
 *
 * Trả về `null` nếu hợp lệ, hoặc câu thông báo NÊU RÕ khung giờ nhận đặt —
 * khách chỉ đọc "giờ không hợp lệ" thì không biết phải chọn lại thế nào.
 *
 * Định dạng giờ đã do validator ở route lo (`bookingValidation`); giờ không
 * đọc được ở đây được bỏ qua chứ không chặn, để không biến một lỗi định dạng
 * thành thông báo sai nguyên nhân.
 */
const operatingHoursViolation = ({ startTime, endTime, hours }) => {
  const window = normalizeOperatingHours(hours);
  const start = minutesOf(startTime);
  const end = minutesOf(endTime);
  if (start === null || end === null) return null;
  if (start < window.openMinutes || end > window.closeMinutes) {
    return `Quán chỉ nhận đặt sân trong khung ${window.open}–${window.close}`;
  }
  return null;
};

module.exports = {
  DEFAULT_OPERATING_HOURS,
  normalizeOperatingHours,
  operatingHoursViolation
};
