// Chọn khung giờ trên lưới sân × giờ của trang Đặt sân (kế hoạch 29).
//
// Toàn bộ là hàm thuần: nhận dữ liệu của `GET /public/availability/day` và trả
// về trạng thái mới, không đụng React, DOM hay đồng hồ. Trang chỉ việc gọi và vẽ.
//
// Dạng dữ liệu (đúng như server trả):
//   day.courts[] = { id, name, bookable, peakPricePerHour, offpeakPricePerHour,
//                    slots: [{ start: '18:00', end: '19:00', state, peak }] }
//   state ∈ 'free' | 'booked' | 'passed' | 'maintenance'
//
// Lựa chọn là `{ courtId, startTime, endTime }` (chuỗi 'HH:mm') — cùng dạng với
// thân `POST /bookings`, và độc lập với thứ tự ô trong mảng nên sống sót qua
// những lần tải lại lưới.

/** Số giờ tối đa một lần đặt (quyết định ngày 14/10/2026). */
export const MAX_BOOKING_HOURS = 3;

const isFree = (slot) => slot.state === 'free';

/** Các ô của sân nằm trọn trong [startTime, endTime). So chuỗi đúng vì 'HH:mm' đã đệm 0. */
export const slotsBetween = (court, startTime, endTime) =>
  (court?.slots || []).filter((slot) => slot.start >= startTime && slot.end <= endTime);

/** Ô này có nằm trong lựa chọn không. */
export const isSelected = (selection, court, slot) =>
  Boolean(selection) &&
  selection.courtId === court.id &&
  slot.start >= selection.startTime &&
  slot.end <= selection.endTime;

const single = (court, slot) => ({ courtId: court.id, startTime: slot.start, endTime: slot.end });

/**
 * Khách chạm vào một ô.
 *
 *  · Ô không trống (kín / đã qua / bảo trì): không đổi gì.
 *  · Chưa có lựa chọn, hoặc đang chọn ở sân khác, hoặc đang có một KHOẢNG
 *    (nhiều giờ): ô vừa chạm thành lựa chọn mới (1 giờ).
 *  · Đang chọn đúng 1 ô và chạm lại chính ô đó: bỏ chọn.
 *  · Đang chọn 1 ô và chạm một ô khác cùng sân: kéo thành khoảng từ ô này tới ô
 *    kia (theo cả hai chiều). Quá `maxHours` thì giữ nguyên và báo; giữa chừng
 *    có ô không trống thì chọn lại từ ô vừa chạm và báo.
 *
 * @returns {{ selection: object|null, hint: object|null }}
 *   `hint` là dữ liệu có cấu trúc, đổi ra chữ bằng `hintText`.
 */
export function tapSlot({ selection, court, slot, maxHours = MAX_BOOKING_HOURS }) {
  if (!isFree(slot)) return { selection, hint: null };

  if (!selection || selection.courtId !== court.id) {
    return { selection: single(court, slot), hint: null };
  }

  const current = slotsBetween(court, selection.startTime, selection.endTime);
  if (current.length !== 1) return { selection: single(court, slot), hint: null };
  if (current[0].start === slot.start) return { selection: null, hint: null };

  const [first, last] = current[0].start < slot.start ? [current[0], slot] : [slot, current[0]];
  const range = slotsBetween(court, first.start, last.end);

  if (range.length > maxHours) {
    return { selection, hint: { type: 'too-long', hours: range.length, max: maxHours } };
  }
  if (range.some((cell) => !isFree(cell))) {
    return {
      selection: single(court, slot),
      hint: { type: 'blocked', from: first.start, to: last.end, restartAt: slot.start }
    };
  }
  return { selection: { courtId: court.id, startTime: first.start, endTime: last.end }, hint: null };
}

/** Câu nhắc (tiếng Việt) cho `hint` của `tapSlot`. */
export function hintText(hint) {
  if (!hint) return '';
  if (hint.type === 'too-long') {
    return `Mỗi lần đặt tối đa ${hint.max} giờ. Bạn đang chọn ${hint.hours} giờ.`;
  }
  if (hint.type === 'blocked') {
    return `Giữa ${hint.from} và ${hint.to} có khung không đặt được, đã chọn lại từ ${hint.restartAt}.`;
  }
  return '';
}

/**
 * Sau khi lưới tải lại (đổi focus, 30 giây một lần, sau lỗi 409): lựa chọn có
 * còn nguyên không?
 *
 * Khung đang chọn mà người khác vừa đặt thì phải bỏ chọn và nói rõ vì sao —
 * chứ không để khách bấm "Đặt sân" rồi mới lãnh 409.
 *
 * @returns {{ selection: object|null, lost: null|'booked'|'passed'|'maintenance'|'gone' }}
 */
export function reconcileSelection(selection, day) {
  if (!selection) return { selection: null, lost: null };
  const court = day?.courts?.find((c) => c.id === selection.courtId);
  const cells = slotsBetween(court, selection.startTime, selection.endTime);
  const whole =
    cells.length > 0 && cells[0].start === selection.startTime && cells[cells.length - 1].end === selection.endTime;
  if (!whole) return { selection: null, lost: 'gone' };
  const bad = cells.find((cell) => !isFree(cell));
  if (bad) return { selection: null, lost: bad.state };
  return { selection, lost: null };
}

/** Câu báo (tiếng Việt) cho `lost` của `reconcileSelection`. */
export function lostText(lost) {
  switch (lost) {
    case 'booked':
      return 'Khung giờ bạn chọn vừa có người đặt. Mời bạn chọn khung khác.';
    case 'passed':
      return 'Khung giờ bạn chọn đã qua. Mời bạn chọn khung khác.';
    case 'maintenance':
      return 'Sân bạn chọn vừa chuyển sang bảo trì. Mời bạn chọn sân khác.';
    case 'gone':
      return 'Khung giờ bạn chọn không còn trên lưới. Mời bạn chọn lại.';
    default:
      return '';
  }
}

/**
 * Tóm tắt lựa chọn cho thanh dưới: số giờ, tách giờ thường / giờ cao điểm và
 * tạm tính. Cờ cao điểm lấy từ chính các ô server trả (`slot.peak`), trang
 * không tự suy luận giờ cao điểm.
 */
export function summarize(court, selection) {
  if (!court || !selection) return null;
  const cells = slotsBetween(court, selection.startTime, selection.endTime);
  if (cells.length === 0) return null;
  const peakHours = cells.filter((cell) => cell.peak).length;
  const offpeakHours = cells.length - peakHours;
  return {
    courtId: court.id,
    courtName: court.name,
    startTime: selection.startTime,
    endTime: selection.endTime,
    label: `${selection.startTime}–${selection.endTime}`,
    hours: cells.length,
    offpeakHours,
    peakHours,
    total: offpeakHours * court.offpeakPricePerHour + peakHours * court.peakPricePerHour
  };
}

/** Thân `POST /bookings` cho lựa chọn hiện tại. */
export const bookingPayload = (date, selection) => ({
  courtId: selection.courtId,
  bookingDate: date,
  startTime: selection.startTime,
  endTime: selection.endTime
});
