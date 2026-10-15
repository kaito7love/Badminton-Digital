/**
 * Thông điệp lỗi đáng hiển thị từ một lỗi axios: ưu tiên lỗi CỤ THỂ của từng trường mà server trả
 * (`errors[0].msg` của express-validator hoặc `errors[0].message`), rồi mới tới `message` chung
 * ("Dữ liệu đầu vào không hợp lệ.") và cuối cùng là `fallback`.
 */
export function serverMessage(err, fallback = 'Có lỗi xảy ra.') {
  const data = err?.response?.data;
  const first = Array.isArray(data?.errors) ? data.errors[0] : null;
  const detail = first && (first.msg || first.message);
  return detail || data?.message || fallback;
}
