'use strict';

// Số điện thoại giờ là danh tính đăng nhập, nên phải quy về một dạng duy nhất
// trước khi lưu và trước khi tra. Cùng một người có thể gõ "0903 333 333",
// "+84903333333" hay "0903-333-333"; nếu lưu nguyên văn thì họ tự tạo ra ba
// tài khoản khác nhau và không đăng nhập lại được bằng cách mình vừa gõ.

/**
 * Quy về dạng nội địa chỉ gồm chữ số: bỏ mọi ký tự phân cách, đổi tiền tố
 * quốc tế +84 / 0084 / 84 thành 0. Trả về null nếu không có gì.
 */
const normalizePhone = (value) => {
  if (value === null || value === undefined) return null;
  let digits = String(value).replace(/[^\d+]/g, '');
  if (!digits) return null;

  if (digits.startsWith('+84')) digits = `0${digits.slice(3)}`;
  else if (digits.startsWith('0084')) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith('84') && digits.length >= 11) digits = `0${digits.slice(2)}`;

  digits = digits.replace(/\D/g, '');
  return digits || null;
};

/** Số di động/cố định Việt Nam sau chuẩn hoá: bắt đầu bằng 0, dài 9–11 chữ số. */
const isValidPhone = (value) => {
  const normalized = normalizePhone(value);
  return !!normalized && /^0\d{8,10}$/.test(normalized);
};

/**
 * Người dùng gõ gì vào ô đăng nhập? Chuỗi có '@' chắc chắn là email; chuỗi chỉ
 * gồm chữ số và ký tự phân cách số thì coi là điện thoại. Nhờ vậy nhân viên
 * giữ nguyên thói quen gõ email, khách gõ số, không ai phải chọn tab nào.
 */
const looksLikePhone = (value) => {
  const raw = String(value || '').trim();
  if (!raw || raw.includes('@')) return false;
  return /^[\d+][\d\s.\-()]*$/.test(raw);
};

module.exports = { normalizePhone, isValidPhone, looksLikePhone };
