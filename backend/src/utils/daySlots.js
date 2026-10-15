'use strict';

// Lưới "sân × giờ" của một ngày cho trang Đặt sân công khai (kế hoạch 29).
//
// Hàm thuần, không đọc DB: nơi gọi (PublicCatalogService.getDayAvailability)
// nạp sân, lịch và setting rồi đưa vào đây — cùng khuôn với utils/operatingHours.js
// để test được mà không cần DB.
//
// Thứ tự ưu tiên của trạng thái ô GIỐNG HỆT BookingService.checkAvailability,
// để lưới không nói khác với nút "Đặt sân" lúc bấm thật:
//   bảo trì → đã qua → đã kín → trống
// Chỗ DUY NHẤT lưới chặt hơn server là "đã qua": ô đã BẮT ĐẦU là `passed`, trong
// khi server chỉ từ chối khung đã ĐÓNG hẳn (BookingService.hasSlotPassed). Cố
// ý, cùng lý do với `openSlotsFor` ở frontend (utils/bookingSlots.js): mời khách
// đặt khung 16:00 lúc 17:40 là mời họ trả tiền cho 20 phút; còn luật rộng hơn
// ở server là để quầy mở sân cho khách vừa bước vào giữa khung giờ.

const { toMinutes, zonedTimeToUtc, DEFAULT_TIMEZONE } = require('./dateTime');

/** Một ô lưới dài bao nhiêu phút (quyết định ngày 14/10/2026: 60 phút). */
const SLOT_MINUTES = 60;

/**
 * Số ngày lịch (tính cả hôm nay) khách được xem và đặt trước: hôm nay …
 * hôm nay + 13. Khớp dải 14 ngày của bản mẫu đã duyệt.
 */
const BOOKING_WINDOW_DAYS = 14;

/**
 * Khách đặt tối đa bao nhiêu giờ liền cho MỘT lượt (R15, báo cáo 33). Trang Đặt sân đã giới hạn 3 giờ ở giao
 * diện (`MAX_BOOKING_HOURS` trong frontend/src/pages/Booking/lib/daySelection.js — giữ hai nơi KHỚP nhau);
 * server áp lại vì API gọi thẳng không đi qua giao diện. Nhân viên không bị giới hạn (giải đấu, sự kiện).
 */
const CUSTOMER_MAX_BOOKING_HOURS = 3;

const SLOT_STATES = Object.freeze({
  FREE: 'free',
  BOOKED: 'booked',
  PASSED: 'passed',
  MAINTENANCE: 'maintenance'
});

const pad = (n) => String(n).padStart(2, '0');

/** Số phút từ 00:00 → "HH:mm". */
const hhmm = (minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

/**
 * "YYYY-MM-DD" cộng `n` ngày → "YYYY-MM-DD". Số học lịch thuần, không dính
 * múi giờ hay DST của máy chạy server.
 */
const addDays = (dateString, n) => {
  const [year, month, day] = String(dateString).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + n)).toISOString().slice(0, 10);
};

/** Chuỗi đúng dạng YYYY-MM-DD và là ngày có thật (không có 2026-02-30). */
const isRealDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value)) && addDays(value, 0) === value;

/** Ngày đầu / ngày cuối khách được xem, theo "hôm nay" của chi nhánh. */
const bookingWindow = (today) => ({ first: today, last: addDays(today, BOOKING_WINDOW_DAYS - 1) });

/**
 * Các ô của MỘT sân trong MỘT ngày.
 *
 * @param {object} p
 * @param {string} p.date          YYYY-MM-DD, theo lịch của chi nhánh
 * @param {number} p.openMinutes   giờ mở cửa, số phút từ 00:00
 * @param {number} p.closeMinutes  giờ đóng cửa
 * @param {number} p.peakStartHour giờ bắt đầu cao điểm
 * @param {number} p.peakEndHour   giờ kết thúc cao điểm
 * @param {{start:number,end:number}[]} p.busy khoảng đã có lịch, số phút
 * @param {boolean} p.bookable     sân đang `active`
 * @param {string} p.timezone      múi giờ chi nhánh
 * @param {Date} p.now
 */
const buildCourtSlots = ({
  date,
  openMinutes,
  closeMinutes,
  peakStartHour,
  peakEndHour,
  busy = [],
  bookable = true,
  timezone = DEFAULT_TIMEZONE,
  now = new Date()
}) => {
  const [year, month, day] = date.split('-').map(Number);
  // Cùng quy tắc priceCalculator.peakWindows: khung cao điểm rỗng / ngược thì
  // không có giờ cao điểm nào.
  const hasPeak = Number(peakEndHour) > Number(peakStartHour);
  const peakFrom = Number(peakStartHour) * 60;
  const peakTo = Number(peakEndHour) * 60;

  const slots = [];
  for (let start = openMinutes; start + SLOT_MINUTES <= closeMinutes; start += SLOT_MINUTES) {
    const end = start + SLOT_MINUTES;

    let state;
    if (!bookable) {
      state = SLOT_STATES.MAINTENANCE;
    } else {
      const startsAt = zonedTimeToUtc(year, month, day, Math.floor(start / 60), start % 60, 0, timezone);
      if (startsAt.getTime() < now.getTime()) state = SLOT_STATES.PASSED;
      else if (busy.some((b) => b.start < end && b.end > start)) state = SLOT_STATES.BOOKED;
      else state = SLOT_STATES.FREE;
    }

    slots.push({
      start: hhmm(start),
      end: hhmm(end),
      state,
      peak: hasPeak && start < peakTo && end > peakFrom
    });
  }
  return slots;
};

/**
 * Ghép sân + lịch của một ngày thành payload công khai.
 *
 * Trường trả ra là một danh sách đóng: lịch chỉ đóng góp khoảng giờ (start/end),
 * KHÔNG bao giờ mã lịch, mã khách hay trạng thái duyệt — người lạ không cần
 * biết ai đã đặt gì, chỉ cần biết ô nào kín.
 *
 * @param {object} p
 * @param {string} p.date
 * @param {{id:number,name:string}} p.branch
 * @param {object[]} p.courts   đầu ra của PublicCatalogService.courtCatalog().courts
 * @param {{courtId:number,startTime:string,endTime:string}[]} p.bookings
 * @param {{open:string,close:string}} p.operatingHours
 * @param {{peakStartHour:number,peakEndHour:number}} p.peakHours
 * @param {string} p.timezone
 * @param {string} p.today      hôm nay theo lịch chi nhánh
 * @param {Date} p.now
 */
const buildDayAvailability = ({
  date,
  branch,
  courts,
  bookings,
  operatingHours,
  peakHours,
  timezone,
  today,
  now
}) => {
  const busyByCourt = new Map();
  for (const booking of bookings) {
    const list = busyByCourt.get(booking.courtId) || [];
    list.push({ start: toMinutes(booking.startTime), end: toMinutes(booking.endTime) });
    busyByCourt.set(booking.courtId, list);
  }

  const openMinutes = toMinutes(operatingHours.open);
  const closeMinutes = toMinutes(operatingHours.close);

  return {
    branch: { id: branch.id, name: branch.name },
    date,
    today,
    lastBookableDate: bookingWindow(today).last,
    operatingHours: { open: operatingHours.open, close: operatingHours.close },
    peakHours: { peakStartHour: peakHours.peakStartHour, peakEndHour: peakHours.peakEndHour },
    courts: courts.map((court) => ({
      id: court.id,
      name: court.name,
      bookable: court.bookable,
      note: court.note,
      peakPricePerHour: court.peakPricePerHour,
      offpeakPricePerHour: court.offpeakPricePerHour,
      slots: buildCourtSlots({
        date,
        openMinutes,
        closeMinutes,
        peakStartHour: peakHours.peakStartHour,
        peakEndHour: peakHours.peakEndHour,
        busy: busyByCourt.get(court.id) || [],
        bookable: court.bookable,
        timezone,
        now
      })
    }))
  };
};

module.exports = {
  SLOT_MINUTES,
  BOOKING_WINDOW_DAYS,
  CUSTOMER_MAX_BOOKING_HOURS,
  SLOT_STATES,
  addDays,
  isRealDate,
  bookingWindow,
  buildCourtSlots,
  buildDayAvailability
};
