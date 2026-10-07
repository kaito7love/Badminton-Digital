const { DomainError } = require('../../../shared/domainError');

// Đồng đội CHƯA CÓ TÀI KHOẢN khi khách đăng ký online (plan 27): khách nhập tên + SĐT + giới tính + nhãn trình, service tạo hồ sơ
// "khách" (source = online_guest, visibility = hidden). Luật thuần ở đây; tạo hồ sơ ở playerService.createGuest.

// Mỗi khách đăng nhập chỉ được tạo tối đa chừng này hồ sơ khách MỚI trong 24 giờ (chống tạo hàng loạt hồ sơ rác / spam).
const MAX_NEW_GUESTS_PER_DAY = 5;

const GUEST_SOURCE = 'online_guest';
const GENDERS = ['male', 'female'];
const NAME_PATTERN = /^[\p{L}][\p{L} .'’-]{0,98}[\p{L}.]$/u;

/** SĐT di động Việt Nam → dạng chuẩn 0xxxxxxxxx (10 số); chấp nhận +84…, 84…, khoảng trắng, dấu chấm / gạch. Sai → null. */
const normalizePhone = (raw) => {
  let digits = String(raw ?? '').replace(/[\s.()-]/g, '');
  if (/^\+84\d{9}$/.test(digits)) digits = `0${digits.slice(3)}`;
  else if (/^84\d{9}$/.test(digits)) digits = `0${digits.slice(2)}`;
  return /^0\d{9}$/.test(digits) ? digits : null;
};

/** Gom khoảng trắng, bỏ khoảng trắng đầu / cuối. */
const cleanName = (raw) => String(raw ?? '').trim().replace(/\s+/g, ' ');

/**
 * Kiểm thông tin đồng đội khách nhập. `levels` = các nhãn trình hợp lệ (cùng 6 nhãn "chấm nhanh").
 * Trả { displayName, contactPhone, gender, level } đã chuẩn hoá hoặc ném INVALID_GUEST (422) với errors[].
 */
const validateGuest = (input, levels) => {
  const errors = [];
  const g = input || {};
  const displayName = cleanName(g.name);
  if (!NAME_PATTERN.test(displayName)) errors.push({ field: 'guest.name', message: 'Họ tên 2–100 ký tự: chữ, khoảng trắng, dấu chấm, gạch nối' });
  const contactPhone = normalizePhone(g.phone);
  if (!contactPhone) errors.push({ field: 'guest.phone', message: 'Số điện thoại di động Việt Nam gồm 10 số (vd 0912 345 678)' });
  if (!GENDERS.includes(g.gender)) errors.push({ field: 'guest.gender', message: 'Chọn giới tính nam hoặc nữ' });
  if (!levels.includes(g.level)) errors.push({ field: 'guest.level', message: `Chọn một trong các mức trình: ${levels.join(', ')}` });
  if (errors.length) throw new DomainError('INVALID_GUEST', 'Thông tin đồng đội chưa đúng', errors);
  return { displayName, contactPhone, gender: g.gender, level: g.level };
};

module.exports = { MAX_NEW_GUESTS_PER_DAY, GUEST_SOURCE, normalizePhone, cleanName, validateGuest };
