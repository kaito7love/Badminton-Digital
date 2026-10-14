// Từ dữ liệu của `GET /public/availability/day` ra những thứ trang cần để vẽ:
// hàng tiêu đề giờ, tình trạng cả ngày, nhãn trợ năng và giá của từng ô.

import { formatVnd } from '../../../utils/shop';

const STATE_WORD = {
  free: 'trống',
  booked: 'đã kín',
  passed: 'đã qua',
  maintenance: 'bảo trì'
};

/**
 * Hàng tiêu đề giờ của lưới desktop: lấy từ một sân đặt được (mọi sân cùng
 * giờ mở cửa); chưa có sân nào đặt được thì lấy sân đầu tiên.
 */
export function hourHeaders(day) {
  const courts = day?.courts || [];
  const source = courts.find((c) => c.bookable) || courts[0];
  return (source?.slots || []).map((slot) => ({
    start: slot.start,
    label: slot.start.slice(0, 2),
    peak: slot.peak
  }));
}

/**
 * Tình trạng của cả ngày — quyết định trang vẽ lưới hay vẽ thông báo:
 *  · 'no-courts' : chi nhánh chưa có sân nào, hoặc toàn sân bảo trì
 *  · 'over'      : mọi ô của sân đặt được đã qua (hôm nay hết giờ nhận đặt)
 *  · 'full'      : còn giờ nhưng không còn ô trống
 *  · 'ok'        : có ít nhất một ô trống
 */
export function dayStatus(day) {
  const bookable = (day?.courts || []).filter((c) => c.bookable);
  if (bookable.length === 0) return 'no-courts';
  const cells = bookable.flatMap((c) => c.slots);
  if (cells.length === 0 || cells.every((slot) => slot.state === 'passed')) return 'over';
  if (cells.some((slot) => slot.state === 'free')) return 'ok';
  return 'full';
}

/** Giá một giờ của ô (theo cờ cao điểm server tính). */
export const slotPrice = (court, slot) => (slot.peak ? court.peakPricePerHour : court.offpeakPricePerHour);

/**
 * Nhãn đọc cho trình đọc màn hình, VD "Sân số 2, 18:00, trống, giờ cao điểm,
 * 90.000đ" hoặc "Sân số 2, 18:00, đã kín".
 */
export function slotLabel(court, slot, { selected = false } = {}) {
  const parts = [court.name, slot.start];
  if (selected) parts.push('đang chọn');
  else parts.push(STATE_WORD[slot.state] || slot.state);
  if (slot.state === 'free') {
    if (slot.peak) parts.push('giờ cao điểm');
    parts.push(formatVnd(slotPrice(court, slot)));
  }
  return parts.join(', ');
}

/** "60k / 90k" (giờ thường / giờ cao điểm) — dòng phụ dưới tên sân. */
export function priceLine(court) {
  const k = (n) => `${Math.round(n / 1000)}k`;
  return `${k(court.offpeakPricePerHour)} / ${k(court.peakPricePerHour)}`;
}

/**
 * Tên sân của server có thể kèm loại trong ngoặc ('Sân số 1 (Thường)',
 * 'Sân VIP (Thảm Yonex)'). Tách ra để cột tên sân hiện tên ở dòng trên và loại
 * ở dòng phụ, như bản mẫu đã duyệt.
 */
export function courtTitle(court) {
  const match = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(String(court.name || ''));
  return match ? { title: match[1], kind: match[2] } : { title: court.name, kind: '' };
}
