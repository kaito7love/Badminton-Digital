/**
 * Hiển thị thời gian theo múi giờ CỦA CHI NHÁNH, không theo múi giờ máy người xem.
 *
 * Backend lưu DATETIME theo UTC (config.js đặt `timezone: '+00:00'`), nên chuỗi
 * ISO trả về là một mốc tuyệt đối. Việc còn lại là hiển thị nó theo đồng hồ ở
 * nơi phát sinh giao dịch.
 *
 * Vì sao không để trình duyệt tự chọn: `toLocaleString('vi-VN')` trần không
 * truyền `timeZone` sẽ lấy múi giờ của MÁY ĐANG XEM. Ngồi ở Việt Nam mở báo
 * cáo của chi nhánh bên Mỹ thì mọi mốc giờ hiện ra theo giờ Việt Nam — sai,
 * vì ca làm việc, khung giờ cao điểm và ngày chốt sổ của chi nhánh đó đều
 * chạy theo giờ Mỹ.
 *
 * `timezone` lấy từ `branches.timezone` (chi nhánh đang xem). Bỏ trống thì rơi
 * về giờ Việt Nam — đúng cho toàn bộ chi nhánh hiện tại của chuỗi.
 */

export const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';

const withZone = (options, timezone) => ({ ...options, timeZone: timezone || DEFAULT_TIMEZONE });

/** Ngày + giờ, VD "20/08/2026 18:30". */
export const formatDateTime = (value, timezone, options = {}) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('vi-VN', withZone({
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...options
  }, timezone));
};

/** Chỉ ngày, VD "20/08/2026". */
export const formatDate = (value, timezone, options = {}) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('vi-VN', withZone({
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...options
  }, timezone));
};

/** Chỉ giờ, VD "18:30". */
export const formatTime = (value, timezone, options = {}) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('vi-VN', withZone({ hour: '2-digit', minute: '2-digit', ...options }, timezone));
};

/**
 * Ngày "trần" từ cột DATE của MySQL (VD `bookings.booking_date` = "2026-08-20").
 *
 * TUYỆT ĐỐI không đưa qua đổi múi giờ: đây là giờ treo tường, không phải mốc
 * tuyệt đối. `new Date('2026-08-20')` bị hiểu là nửa đêm UTC, đem hiển thị ở
 * múi giờ âm sẽ lùi thành 19/08 — lịch đặt sân nhảy mất một ngày. Chỉ đảo
 * thứ tự cho đúng định dạng Việt Nam.
 */
export const formatPlainDate = (value) => {
  if (!value) return '—';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : String(value);
};

/**
 * Ngày hôm nay dạng YYYY-MM-DD theo giờ chi nhánh — dùng cho `<input type="date">`
 * và tham số ngày gửi lên API. Cắt chuỗi ISO sẽ ra ngày hôm trước trong khoảng
 * 00:00–07:00 giờ Việt Nam, nên phải đi qua `en-CA` kèm `timeZone`.
 */
export const todayInZone = (timezone) =>
  new Date().toLocaleDateString('en-CA', withZone({}, timezone));
