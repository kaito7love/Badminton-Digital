/**
 * Quy tắc mật khẩu phía giao diện — PHẢI khớp backend/src/utils/passwordPolicy.js (R2, kế hoạch 37 nhóm B).
 * Giao diện chỉ kiểm phần rẻ và chắc chắn (độ dài theo BYTE UTF-8, vì bcrypt chỉ dùng 72 byte đầu); danh sách
 * mật khẩu phổ biến và "trùng SĐT/email/tên" do server kiểm và trả thông điệp cụ thể để hiển thị.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;
export const PASSWORD_HINT = `Tối thiểu ${PASSWORD_MIN_LENGTH} ký tự`;
export const PASSWORD_LENGTH_ERROR = `Mật khẩu phải có từ ${PASSWORD_MIN_LENGTH} đến ${PASSWORD_MAX_BYTES} ký tự.`;

const utf8Length = (value) => new TextEncoder().encode(String(value)).length;

/** Trả về thông điệp lỗi, hoặc null nếu độ dài hợp lệ. */
export function passwordLengthError(value) {
  const text = typeof value === 'string' ? value : '';
  if (text.length < PASSWORD_MIN_LENGTH || utf8Length(text) > PASSWORD_MAX_BYTES) return PASSWORD_LENGTH_ERROR;
  return null;
}
