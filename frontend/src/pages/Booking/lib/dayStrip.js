// Dải ngày của trang Đặt sân: hôm nay … ngày cuối được đặt (kế hoạch 29, 14 ngày).
//
// Số học lịch thuần trên chuỗi 'YYYY-MM-DD', không dựng `Date` theo múi giờ máy
// khách: `new Date('2026-10-06')` là nửa đêm UTC và lùi về hôm trước ở múi giờ
// âm. "Hôm nay" và "ngày cuối" do server (theo lịch chi nhánh) quyết định; lúc
// chưa có phản hồi đầu tiên trang dùng `fallbackWindow`.

/** Số ngày của dải (tính cả hôm nay). Khớp BOOKING_WINDOW_DAYS ở backend. */
export const BOOKING_WINDOW_DAYS = 14;

export const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

const parse = (dateString) => {
  const [year, month, day] = String(dateString).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const format = (date) => date.toISOString().slice(0, 10);

/** 'YYYY-MM-DD' cộng `n` ngày. */
export function addDays(dateString, n) {
  const date = parse(dateString);
  date.setUTCDate(date.getUTCDate() + n);
  return format(date);
}

/** Dải mặc định khi chưa biết "hôm nay" của chi nhánh từ server. */
export const fallbackWindow = (today) => ({ today, lastDate: addDays(today, BOOKING_WINDOW_DAYS - 1) });

/**
 * Các ô ngày từ `today` tới `lastDate` (gồm cả hai đầu).
 * @returns {{ date, weekday, day, month, label, isToday }[]}
 */
export function buildDayStrip({ today, lastDate }) {
  const days = [];
  // Chặn vòng lặp vô hạn nếu dữ liệu đầu vào sai: không bao giờ quá dải cho phép.
  for (let i = 0; i < BOOKING_WINDOW_DAYS; i += 1) {
    const date = addDays(today, i);
    if (date > lastDate) break;
    const [, month, day] = date.split('-');
    const weekday = WEEKDAYS[parse(date).getUTCDay()];
    days.push({ date, weekday, day, month, label: `${weekday} ${day}/${month}`, isToday: i === 0 });
  }
  return days;
}

/** 'YYYY-MM-DD' → 'T5 15/10' (cho thanh tóm tắt và hộp xác nhận). */
export function dayLabel(dateString) {
  const [, month, day] = String(dateString).split('-');
  return `${WEEKDAYS[parse(dateString).getUTCDay()]} ${day}/${month}`;
}
