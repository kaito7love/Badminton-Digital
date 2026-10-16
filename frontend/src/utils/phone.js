// Chuẩn hoá SĐT phía giao diện, khớp với backend/src/utils/phone.js (kế hoạch 42, F5): dùng để tra khách có sẵn
// theo SĐT nhân viên vừa gõ. Nguồn sự thật vẫn là backend — hàm này chỉ để tra cứu và gợi ý.

/** "+84 903-333-333" | "0084903333333" | "84903333333" → "0903333333". Không có chữ số thì null. */
export const normalizePhone = (value) => {
  if (value === null || value === undefined) return null;
  let digits = String(value).replace(/[^\d+]/g, '');
  if (!digits) return null;
  if (digits.startsWith('+84')) digits = `0${digits.slice(3)}`;
  else if (digits.startsWith('0084')) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith('84') && digits.length >= 11) digits = `0${digits.slice(2)}`;
  digits = digits.replace(/\D/g, '');
  return digits || null;
};

/** Số Việt Nam sau chuẩn hoá: bắt đầu bằng 0, dài 9–11 chữ số. */
export const isValidPhone = (value) => {
  const normalized = normalizePhone(value);
  return !!normalized && /^0\d{8,10}$/.test(normalized);
};

/** So hai tên không phân biệt hoa thường và khoảng trắng thừa (Unicode NFC). */
export const sameName = (a, b) => {
  const norm = (v) => String(v || '').trim().replace(/\s+/g, ' ').normalize('NFC').toLowerCase();
  return norm(a) === norm(b);
};
