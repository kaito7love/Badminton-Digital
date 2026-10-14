// Khoá tiêu điểm trong hộp thoại: hộp khai báo `aria-modal`, nên Tab / Shift+Tab
// không được chạy ra phần trang phía sau.

/** Các phần tử nhận tiêu điểm được trong hộp. */
export const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Phần tử phải nhận tiêu điểm khi người dùng bấm Tab (hoặc Shift+Tab); `null`
 * nghĩa là để trình duyệt tự đi tiếp vì vẫn còn nằm trong hộp.
 *
 *  · tiêu điểm đang ở ngoài hộp (vd bấm vào nền)  → kéo vào đầu / cuối hộp
 *  · Tab ở phần tử cuối                           → quay lại phần tử đầu
 *  · Shift+Tab ở phần tử đầu                      → nhảy tới phần tử cuối
 */
export function trapTarget(items, active, shift) {
  if (!items || items.length === 0) return null;
  const first = items[0];
  const last = items[items.length - 1];
  const index = items.indexOf(active);
  if (index === -1) return shift ? last : first;
  if (shift && active === first) return last;
  if (!shift && active === last) return first;
  return null;
}
