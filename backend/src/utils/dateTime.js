'use strict';

// `toISOString()` luôn trả về giờ UTC. Sân bóng chạy theo giờ địa phương của
// từng chi nhánh, nên cắt chuỗi ISO ra để lấy "hôm nay" sẽ lệch múi giờ: từ
// 00:00 tới 07:00 sáng giờ Việt Nam, UTC vẫn còn là ngày hôm trước. Các hàm
// dưới đây nhận tham số `timezone` (mặc định 'Asia/Ho_Chi_Minh' nếu chỗ gọi
// chưa truyền) và dùng Intl.DateTimeFormat để tính đúng theo múi giờ của
// chi nhánh, thay vì luôn đọc theo múi giờ của máy chạy server.

const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';

const pad = (n) => String(n).padStart(2, '0');

// Dựng Intl.DateTimeFormat tốn hơn nhiều so với format, và mỗi lần tính tiền
// sân gọi hàm dưới đây vài chục lần — giữ lại một bộ format cho mỗi múi giờ.
const formatters = new Map();
const formatterFor = (timezone) => {
  if (!formatters.has(timezone)) {
    formatters.set(timezone, new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }));
  }
  return formatters.get(timezone);
};

/** Lấy các thành phần ngày/giờ của `date` theo múi giờ chỉ định. */
const getZonedParts = (date, timezone) => {
  const dtf = formatterFor(timezone);
  const parts = dtf.formatToParts(date).reduce((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === '24' ? '0' : parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
};

/**
 * Trả về Date (mốc UTC thật) ứng với giờ địa phương year-month-day hour:minute:second
 * trong múi giờ `timezone`. Dùng kỹ thuật "đoán rồi hiệu chỉnh": đoán mốc UTC bằng
 * cách coi giờ địa phương như UTC, xem giờ địa phương thật tại mốc đoán đó lệch bao
 * nhiêu, rồi cộng độ lệch vào — đủ chính xác cho mọi múi giờ kể cả có DST.
 */
const zonedTimeToUtc = (year, month, day, hour, minute, second, timezone) => {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const zoned = getZonedParts(new Date(utcGuess), timezone);
  const asIfUtc = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute, zoned.second);
  const offset = utcGuess - asIfUtc;
  return new Date(utcGuess + offset);
};

/** Ngày địa phương dạng YYYY-MM-DD — so được trực tiếp với cột DATE của MySQL. */
const localDateString = (date = new Date(), timezone = DEFAULT_TIMEZONE) => {
  const { year, month, day } = getZonedParts(date, timezone);
  return `${year}-${pad(month)}-${pad(day)}`;
};

/** Giờ địa phương dạng HH:mm:ss — so được với cột TIME của MySQL. */
const localTimeString = (date = new Date(), timezone = DEFAULT_TIMEZONE) => {
  const { hour, minute, second } = getZonedParts(date, timezone);
  return `${pad(hour)}:${pad(minute)}:${pad(second)}`;
};

/** Mốc 00:00:00.000 giờ địa phương của ngày chứa `date`. */
const startOfLocalDay = (date = new Date(), timezone = DEFAULT_TIMEZONE) => {
  const { year, month, day } = getZonedParts(date, timezone);
  return zonedTimeToUtc(year, month, day, 0, 0, 0, timezone);
};

/** Mốc 23:59:59.999 giờ địa phương của ngày chứa `date`. */
const endOfLocalDay = (date = new Date(), timezone = DEFAULT_TIMEZONE) => {
  const { year, month, day } = getZonedParts(date, timezone);
  const end = zonedTimeToUtc(year, month, day, 23, 59, 59, timezone);
  end.setUTCMilliseconds(999);
  return end;
};

/**
 * Lệch múi giờ (phút) của `timezone` tại thời điểm `date` so với UTC — dùng để
 * dịch cột DATETIME (lưu theo UTC, xem `config.js`) sang giờ địa phương ngay
 * trong câu SQL (VD `DATE_ADD(created_at, INTERVAL n MINUTE)` trước khi
 * `DATE_FORMAT` để GROUP BY theo đúng ngày địa phương). Không cần bảng
 * `mysql.time_zone` vì chỉ cộng một số phút cố định, không gọi CONVERT_TZ
 * theo tên múi giờ.
 */
const getUtcOffsetMinutes = (date = new Date(), timezone = DEFAULT_TIMEZONE) => {
  const zoned = getZonedParts(date, timezone);
  const asIfUtc = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute, zoned.second);
  return Math.round((asIfUtc - date.getTime()) / 60000);
};

/**
 * "H:mm" | "HH:mm:ss" -> số phút từ 00:00. Dùng để so hai giờ bằng số thay
 * vì so chuỗi — so chuỗi sai với giờ 1 chữ số ("9:00" >= "10:00" là true
 * theo thứ tự từ điển, dù 9:00 sớm hơn 10:00 thật).
 */
const toMinutes = (t) => {
  const [h, m] = String(t).split(':');
  return Number(h) * 60 + Number(m);
};

/**
 * Múi giờ có giờ mùa hè (DST) không — so lệch UTC tại 1/1 và 1/7 của một
 * năm cố định, khác nhau nghĩa là có DST. Dùng để chặn báo cáo theo kỳ
 * (`ReportService.shiftToLocal`) áp một offset cố định cho chi nhánh ở
 * vùng DST — offset đó chỉ đúng nửa năm, sai nửa năm còn lại, và sai lệch
 * âm thầm ra số liệu chứ không báo lỗi.
 */
const hasDst = (timezone = DEFAULT_TIMEZONE) => {
  const jan = getUtcOffsetMinutes(new Date(Date.UTC(2026, 0, 1, 12)), timezone);
  const jul = getUtcOffsetMinutes(new Date(Date.UTC(2026, 6, 1, 12)), timezone);
  return jan !== jul;
};

module.exports = {
  getZonedParts,
  zonedTimeToUtc,
  localDateString,
  localTimeString,
  startOfLocalDay,
  endOfLocalDay,
  getUtcOffsetMinutes,
  toMinutes,
  hasDst,
  DEFAULT_TIMEZONE
};
