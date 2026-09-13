/**
 * Price Calculator Helper
 */

const { getZonedParts, zonedTimeToUtc, DEFAULT_TIMEZONE } = require('./dateTime');

const HOUR_MS = 3600 * 1000;

/** Tiền sân thu tại quầy làm tròn tới 1.000đ. */
const roundToThousand = (amount) => Math.round(amount / 1000) * 1000;

/**
 * Khung cao điểm [bắt đầu, kết thúc) của từng ngày địa phương mà khoảng
 * [start, end) chạm tới, quy về mốc UTC bằng `zonedTimeToUtc` nên đúng cả ở múi
 * giờ có DST. Mỗi ngày một khung: số vòng lặp bằng số ngày.
 *
 * Khung qua nửa đêm (giờ bắt đầu >= giờ kết thúc) không có giờ cao điểm nào —
 * giữ đúng hành vi của cách tính cũ.
 */
const peakWindows = (start, end, peakStartHour, peakEndHour, timezone) => {
  const windows = [];
  if (!(peakEndHour > peakStartHour)) return windows;

  let { year, month, day } = getZonedParts(start, timezone);
  for (;;) {
    const windowStart = zonedTimeToUtc(year, month, day, peakStartHour, 0, 0, timezone);
    if (windowStart >= end) break;
    windows.push([windowStart, zonedTimeToUtc(year, month, day, peakEndHour, 0, 0, timezone)]);
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    year = next.getUTCFullYear();
    month = next.getUTCMonth() + 1;
    day = next.getUTCDate();
  }
  return windows;
};

/**
 * Calculate court fee based on start time, end time, and court rates.
 * @param {Date} startTime
 * @param {Date} endTime
 * @param {number} peakRate - Court peak price per hour
 * @param {number} offpeakRate - Court offpeak price per hour
 * @param {number} peakStartHour - Default 17 (17:00)
 * @param {number} peakEndHour - Default 22 (22:00)
 * @param {string} timezone - Múi giờ CỦA CHI NHÁNH, mặc định Asia/Ho_Chi_Minh
 * @returns {{ durationSeconds: number, courtFee: number, rawFee: number }}
 *   `courtFee` đã làm tròn nghìn; `rawFee` chưa làm tròn, để cộng dồn nhiều đoạn
 *   (chuyển sân) rồi mới làm tròn một lần.
 *
 * "Cao điểm 17:00–22:00" là giờ treo tường tại chi nhánh, nên phải đọc giờ
 * theo múi giờ chi nhánh chứ không phải `getHours()` (giờ của máy chạy
 * server). Trước đây dùng `getHours()` nên chỉ đúng khi server tình cờ chạy
 * cùng múi giờ với chi nhánh: một phiên 18:00 giờ VN đọc trên server Mỹ ra
 * 6 giờ sáng và bị tính giá thấp điểm — thu thiếu tiền khách mà không ai
 * hay. Sau khi DATETIME chuyển sang lưu UTC (migration 20260821400001) thì
 * việc chốt múi giờ ở đây càng bắt buộc.
 *
 * Tính theo phần giao nhau giữa phiên và khung cao điểm, không chia lát 5 phút
 * như trước: cách cũ xếp cả lát vào giá của phút đầu lát (lệch vài nghìn đồng
 * quanh mốc 17:00/22:00) và lặp 8.640 lần cho một phiên bị bỏ quên 30 ngày.
 */
const calculateCourtFee = (
  startTime,
  endTime,
  peakRate,
  offpeakRate,
  peakStartHour = 17,
  peakEndHour = 22,
  timezone = DEFAULT_TIMEZONE
) => {
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (!(end > start)) {
    return { durationSeconds: 0, courtFee: 0, rawFee: 0 };
  }

  const totalMs = end - start;
  const peakMs = peakWindows(start, end, Number(peakStartHour), Number(peakEndHour), timezone || DEFAULT_TIMEZONE)
    .reduce((sum, [windowStart, windowEnd]) => sum + Math.max(0, Math.min(end, windowEnd) - Math.max(start, windowStart)), 0);
  const rawFee = (peakMs * Number(peakRate) + (totalMs - peakMs) * Number(offpeakRate)) / HOUR_MS;

  return {
    durationSeconds: Math.floor(totalMs / 1000),
    courtFee: roundToThousand(rawFee),
    rawFee
  };
};

/**
 * Tiền sân của cả một phiên tính tới `endTime`, kể cả phiên đã chuyển sân.
 *
 * Mỗi lần chuyển sân, `CourtService.transferCourt` chốt tiền đoạn vừa chơi theo
 * giá sân cũ vào `accruedCourtFee` (chưa làm tròn) và dời `billedFrom` tới lúc
 * chuyển. Ở đây chỉ còn tính đoạn cuối theo giá sân hiện tại rồi cộng lại. Trước
 * đây checkout tính toàn bộ từ `startTime` theo giá sân đích: chơi 2 giờ sân
 * thường rồi chuyển sang VIP là bị tính cả 2 giờ đó theo giá VIP.
 *
 * Checkout, xem trước số tiền (`GET /sessions/:id`) và đóng sân cùng gọi hàm này,
 * nên số xem trước và số trên hoá đơn luôn cùng một cách tính.
 */
const calculateSessionCourtFee = (session, court, endTime, { peakStartHour, peakEndHour, timezone } = {}) => {
  const startTime = new Date(session.startTime);
  const segmentStart = session.billedFrom ? new Date(session.billedFrom) : startTime;
  const lastSegment = calculateCourtFee(
    segmentStart,
    endTime,
    court.peakPricePerHour,
    court.offpeakPricePerHour,
    peakStartHour,
    peakEndHour,
    timezone
  );
  const rawFee = (Number(session.accruedCourtFee) || 0) + lastSegment.rawFee;

  return {
    durationSeconds: Math.max(0, Math.floor((new Date(endTime) - startTime) / 1000)),
    courtFee: roundToThousand(rawFee),
    rawFee
  };
};

/**
 * Calculate invoice total amounts
 */
const calculateInvoiceTotals = (courtFee = 0, sessionExtras = [], discountInput = 0, isDiscountPercent = false) => {
  const numCourtFee = Number(courtFee) || 0;

  const extrasFee = sessionExtras.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0;
    const price = item.unitPrice != null ? Number(item.unitPrice)
                : (item.Extra?.price != null ? Number(item.Extra.price) : 0);
    return sum + (qty * price);
  }, 0);

  const totalBeforeDiscount = numCourtFee + extrasFee;

  let discountAmount = 0;
  if (isDiscountPercent) {
    discountAmount = (totalBeforeDiscount * (Number(discountInput) || 0)) / 100;
  } else {
    discountAmount = Number(discountInput) || 0;
  }

  // VND không có đơn vị lẻ dưới 1đ: 7% của 151.500đ ra 10.605đ chứ không phải 10.605,0đ lẻ.
  discountAmount = Math.round(Math.min(totalBeforeDiscount, Math.max(0, discountAmount)));
  const totalAmount = Math.max(0, totalBeforeDiscount - discountAmount);

  return {
    courtFee: numCourtFee,
    extrasFee,
    totalBeforeDiscount,
    discountAmount,
    totalAmount
  };
};

module.exports = {
  calculateCourtFee,
  calculateSessionCourtFee,
  calculateInvoiceTotals
};
