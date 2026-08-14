'use strict';

// `toISOString()` luôn trả về giờ UTC. Sân bóng chạy theo giờ địa phương (+07),
// nên cắt chuỗi ISO ra để lấy "hôm nay" sẽ lệch 7 tiếng: từ 00:00 tới 07:00 sáng
// giờ Việt Nam, UTC vẫn còn là ngày hôm trước. Các hàm dưới đây luôn tính theo
// giờ của máy chạy server, khớp với cách nhân viên nhìn vào lịch.

const pad = (n) => String(n).padStart(2, '0');

/** Ngày địa phương dạng YYYY-MM-DD — so được trực tiếp với cột DATE của MySQL. */
const localDateString = (date = new Date()) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Giờ địa phương dạng HH:mm:ss — so được với cột TIME của MySQL. */
const localTimeString = (date = new Date()) =>
  `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

/** Mốc 00:00:00.000 giờ địa phương của ngày chứa `date`. */
const startOfLocalDay = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

/** Mốc 23:59:59.999 giờ địa phương của ngày chứa `date`. */
const endOfLocalDay = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

module.exports = { localDateString, localTimeString, startOfLocalDay, endOfLocalDay };
