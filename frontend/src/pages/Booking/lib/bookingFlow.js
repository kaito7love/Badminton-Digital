// Hai quyết định "đặt thật" của trang Đặt sân, tách khỏi React để test được bằng
// kho giả và hàm gọi API giả (kế hoạch 29, bước 4):
//   · confirmBooking : khách bấm nút chính trong hộp xác nhận thì làm gì
//   · resumePending  : trang vừa mở (thường sau khi đăng nhập), có lựa chọn dở dang không

import { savePending, takePending, clearPending } from './pendingBooking';
import { bookingPayload } from './daySelection';
import { classifyBookingError } from './bookingError';

/**
 * Nút chính của hộp xác nhận.
 *
 * @param {object} p
 * @param {'guest'|'customer'|'staff'} p.mode
 * @param {string} p.date          YYYY-MM-DD
 * @param {number|string|null} p.branchId
 * @param {{courtId:number,startTime:string,endTime:string}} p.selection
 * @param {(payload:object)=>Promise<{data?:{data?:object}}>} p.createBooking
 * @param {object} p.storage       sessionStorage hoặc kho giả
 * @returns {Promise<
 *   {type:'blocked'} |
 *   {type:'login', saved:boolean} |
 *   {type:'created', booking:object|null} |
 *   {type:'failed', kind:string, message:string, refreshGrid:boolean}
 * >}
 */
export async function confirmBooking({ mode, date, branchId, selection, createBooking, storage }) {
  // Nhân viên đặt lịch ở Quản Lý Đặt Sân; hộp xác nhận không có nút chính cho họ,
  // đây là chốt lần hai nếu có đường nào gọi nhầm.
  if (mode === 'staff') return { type: 'blocked' };

  // Chưa đăng nhập: cất lựa chọn rồi để trang đưa khách sang /login. Cất không
  // được (kho bị chặn) thì vẫn đi tiếp — khách đăng nhập xong chọn lại, không
  // bị kẹt ở một nút không làm gì.
  if (mode === 'guest') {
    return { type: 'login', saved: savePending(storage, { branchId, date, selection }) };
  }

  try {
    const res = await createBooking(bookingPayload(date, selection));
    return { type: 'created', booking: res?.data?.data ?? null };
  } catch (error) {
    return { type: 'failed', ...classifyBookingError(error) };
  }
}

/**
 * Trang vừa mở: có lựa chọn cất trước khi sang /login để dựng lại không.
 *
 *  · chưa đăng nhập      : để nguyên (khách có thể quay lại từ trang đăng nhập), chưa đọc
 *  · đã đăng nhập nhưng không phải khách hàng: bỏ — lựa chọn đó không dùng được cho họ
 *  · khách hàng          : lấy ra (và xoá khỏi kho); hết hạn / hỏng thì không có gì
 *
 * @param {{ today: string, lastDate: string }} window dải ngày hợp lệ
 * @returns {{type:'none'}|{type:'resume', branchId:number|null, date:string, selection:object}}
 */
export function resumePending({ storage, mode, window }) {
  if (mode === 'guest') return { type: 'none' };
  if (mode !== 'customer') {
    clearPending(storage);
    return { type: 'none' };
  }
  const pending = takePending(storage, window);
  return pending ? { type: 'resume', ...pending } : { type: 'none' };
}
