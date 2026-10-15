// Mở sân từ một booking có đúng ngày/giờ không (báo cáo 40, F4; kế hoạch 42). Hàm thuần, không đọc DB.
//
//  - khác ngày hôm nay (theo lịch + múi giờ CHI NHÁNH) → WRONG_DAY: chặn cứng, không có cách vượt;
//  - cùng ngày nhưng sớm hơn giờ bắt đầu quá EARLY_MINUTES hoặc đã qua giờ kết thúc → TIME_MISMATCH:
//    nhân viên xác nhận rồi gọi lại với `acknowledgeTimeMismatch`.
const { zonedTimeToUtc, localDateString, DEFAULT_TIMEZONE } = require('./dateTime');

const EARLY_MINUTES = 60;

const at = (bookingDate, time, timezone) => {
  const [year, month, day] = String(bookingDate).slice(0, 10).split('-').map(Number);
  const [hour, minute, second] = String(time).split(':').map(Number);
  return zonedTimeToUtc(year, month, day, hour || 0, minute || 0, second || 0, timezone);
};

const label = (bookingDate) => {
  const [y, m, d] = String(bookingDate).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

/** @returns {null | { code: 'WRONG_DAY' | 'TIME_MISMATCH', message: string }} */
const openWindowViolation = ({ bookingDate, startTime, endTime, now = new Date(), timezone = DEFAULT_TIMEZONE }) => {
  const tz = timezone || DEFAULT_TIMEZONE;
  const date = String(bookingDate).slice(0, 10);
  const today = localDateString(now, tz);
  if (date !== today) {
    return {
      code: 'WRONG_DAY',
      message: `Lịch này đặt cho ngày ${label(date)}, ${date > today ? 'chưa tới' : 'đã qua'} ngày chơi — hãy dùng đúng lịch hoặc mở sân không kèm lịch.`
    };
  }
  const starts = at(date, startTime, tz).getTime();
  const ends = at(date, endTime, tz).getTime();
  const t = now.getTime();
  if (t < starts - EARLY_MINUTES * 60000 || t > ends) {
    const hhmm = (v) => String(v).slice(0, 5);
    return {
      code: 'TIME_MISMATCH',
      message: `Lịch này đặt khung ${hhmm(startTime)}–${hhmm(endTime)}, hiện chưa/không còn trong khung giờ đó. Vẫn mở sân theo lịch này?`
    };
  }
  return null;
};

module.exports = { EARLY_MINUTES, openWindowViolation };
