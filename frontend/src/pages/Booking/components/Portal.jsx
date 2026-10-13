import { createPortal } from 'react-dom';

/**
 * Dựng `children` thẳng dưới `document.body`.
 *
 * Cần cho mọi thứ `fixed` của trang Đặt sân (thanh tóm tắt trên điện thoại, hộp
 * xác nhận): `<main>` của CustomerLayout là `relative z-10` nên tạo một ngữ cảnh
 * xếp lớp riêng, và chân trang (`relative z-10`, nằm sau) vẽ đè lên mọi phần tử
 * `fixed` nằm trong `<main>` bất kể `z-index` của chúng. Đo thật: ở 768 px chân
 * trang che mất nửa nút "Đặt sân", và hộp xác nhận không phủ tới chân trang.
 *
 * Ngoài trình duyệt (react-dom/server khi test) không có `document` nên dựng
 * tại chỗ, để test đọc được nội dung.
 */
export default function Portal({ children }) {
  if (typeof document === 'undefined') return children;
  return createPortal(children, document.body);
}
