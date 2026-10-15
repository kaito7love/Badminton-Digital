// Hàm thuần cho chuông thông báo của khách (kế hoạch 43) — không đọc context/DOM nên test được trực tiếp.

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "Vừa xong" · "5 phút trước" · "3 giờ trước" · "2 ngày trước" · sau 7 ngày thì "dd/mm/yyyy". */
export function relativeTime(iso, now = new Date()) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Math.max(0, now.getTime() - then);
  if (diff < MINUTE) return 'Vừa xong';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} phút trước`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} giờ trước`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} ngày trước`;
  const d = new Date(then);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Chữ trong chấm đỏ: rỗng khi 0, "99+" khi nhiều. */
export function badgeText(count) {
  const n = Number(count) || 0;
  if (n <= 0) return '';
  return n > 99 ? '99+' : String(n);
}

const ICONS = {
  'booking.confirmed': '✅',
  'booking.expired': '⌛',
  'booking.cancelled_by_staff': '❌',
  'booking.rescheduled': '🔄'
};

export const typeIcon = (type) => ICONS[type] || '🔔';

/** Bấm vào thông báo thì tới đâu: lịch đặt của tôi (mọi loại hiện tại đều về lịch đặt). */
export const notificationTarget = () => '/my-bookings';

/** Nhãn đọc cho trình đọc màn hình: "Thông báo, 3 chưa đọc". */
export const bellLabel = (count) => {
  const n = Number(count) || 0;
  return n > 0 ? `Thông báo, ${n} chưa đọc` : 'Thông báo';
};

/** Cập nhật lạc quan sau khi đánh dấu một dòng đã đọc (id không có hoặc đã đọc thì giữ nguyên). */
export function applyRead(state, id, readAt = new Date().toISOString()) {
  const target = state.items.find((n) => n.id === id);
  if (!target || target.readAt) return state;
  return {
    items: state.items.map((n) => (n.id === id ? { ...n, readAt } : n)),
    unreadCount: Math.max(0, state.unreadCount - 1)
  };
}

export function applyReadAll(state, readAt = new Date().toISOString()) {
  return { items: state.items.map((n) => (n.readAt ? n : { ...n, readAt })), unreadCount: 0 };
}
