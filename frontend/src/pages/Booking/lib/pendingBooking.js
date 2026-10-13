// Lựa chọn dở dang của khách chưa đăng nhập: cất lại khi họ rẽ sang /login và
// dựng lại khi quay về /dat-san (kế hoạch 29).
//
// Khoá RIÊNG, không dùng `pending_booking` của ô đặt nhanh ở Trang chủ: hai bên
// lưu hai dạng dữ liệu khác nhau, dùng chung khoá thì trang này sẽ đọc nhầm của
// trang kia (và ngược lại) sau khi đăng nhập.
//
// `storage` truyền vào (sessionStorage ngoài trình duyệt, một Map giả khi test) và
// mọi thao tác đều nuốt lỗi: chế độ riêng tư hay bị chặn lưu trữ không được làm
// trang đặt sân vỡ.

export const PENDING_KEY = 'pending_booking_datsan';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Cất lựa chọn. Trả `true` nếu cất được. */
export function savePending(storage, { branchId, date, selection }) {
  try {
    storage.setItem(
      PENDING_KEY,
      JSON.stringify({
        branchId: branchId == null ? null : Number(branchId),
        date,
        courtId: selection.courtId,
        startTime: selection.startTime,
        endTime: selection.endTime
      })
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Lấy lựa chọn đã cất ra VÀ xoá khỏi kho (đọc một lần, như Trang chủ làm).
 *
 * Trả `null` khi: không có gì, dữ liệu hỏng, hoặc ngày đã ra ngoài dải còn đặt
 * được — chọn khung 23h50 rồi đăng nhập xong sau nửa đêm là dựng lại khung của
 * hôm qua, và lựa chọn đó không được gửi thẳng lên API.
 *
 * @param {{ today: string, lastDate: string }} window dải ngày hợp lệ (từ server)
 * @returns {{ branchId: number|null, date: string, selection: object }|null}
 */
export function takePending(storage, { today, lastDate }) {
  let raw = null;
  try {
    raw = storage.getItem(PENDING_KEY);
    storage.removeItem(PENDING_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;

  const { branchId, date, courtId, startTime, endTime } = data;
  if (!DATE.test(String(date)) || !TIME.test(String(startTime)) || !TIME.test(String(endTime))) return null;
  if (!Number.isInteger(courtId) || endTime <= startTime) return null;
  if (date < today || date > lastDate) return null;

  return {
    branchId: Number.isInteger(branchId) ? branchId : null,
    date,
    selection: { courtId, startTime, endTime }
  };
}

/** Xoá lựa chọn đã cất (vd khách bỏ dở). */
export function clearPending(storage) {
  try {
    storage.removeItem(PENDING_KEY);
  } catch {
    // không có gì để làm
  }
}
