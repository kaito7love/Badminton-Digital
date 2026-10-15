'use strict';

/**
 * Chính sách mật khẩu (R2, báo cáo 33; kế hoạch 37 nhóm B).
 *
 * Theo NIST SP 800-63B: ĐỘ DÀI và danh sách chặn quan trọng hơn quy tắc "phải có chữ hoa/số/ký tự đặc biệt"
 * (quy tắc thành phần khiến người ta đặt `Password1!`). Vì vậy:
 *   - từ 8 đến 72 ký tự (72 BYTE là giới hạn thật của bcrypt: phần dư bị bỏ, hai mật khẩu chung 72 byte đầu
 *     sẽ so khớp nhau);
 *   - không nằm trong danh sách mật khẩu phổ biến / dãy bàn phím (so không phân biệt hoa thường, và so cả
 *     phần gốc sau khi bỏ đuôi số/ký hiệu: `matkhau123` → `matkhau`);
 *   - không phải một ký tự lặp hoặc dãy tăng/giảm liên tiếp;
 *   - không trùng hoặc chứa số điện thoại, phần trước `@` của email, hay họ tên của chính người đặt.
 *
 * Hàm thuần, dùng chung cho đăng ký, đổi/đặt lại mật khẩu, tạo nhân viên và tạo tài khoản khách. Chỉ áp khi ĐẶT
 * mật khẩu — đăng nhập không kiểm, nên mật khẩu đang dùng không bị khoá.
 */

const MIN_LENGTH = 8;
const MAX_BYTES = 72;

// ~200 mục: mật khẩu phổ biến toàn cầu, dãy bàn phím, và những từ Việt/ngành sân cầu lông hay bị chọn.
const COMMON = new Set([
  '123456', '1234567', '12345678', '123456789', '1234567890', '12345', '1234', '111111', '11111111', '000000',
  '00000000', '0123456789', '987654321', '9876543210', '112233', '121212', '123123', '123321', '654321', '666666',
  '696969', '888888', '999999', '1q2w3e4r', '1q2w3e4r5t', '1qaz2wsx', 'q1w2e3r4', 'qazwsx', 'qazwsxedc',
  'zaq12wsx', 'zxcvbnm', 'asdfghjkl', 'asdfgh', 'qwerty', 'qwertyuiop', 'qwerty123', 'qwertyui', 'qwe123',
  'qweasdzxc', 'asdasd', 'abcd1234', 'abc12345', 'abcdefgh', 'abcdefg', 'abc123', 'abcabc', 'aaaaaa', 'aaaaaaaa',
  'password', 'password1', 'password12', 'password123', 'passw0rd', 'p@ssw0rd', 'p@ssword', 'pass1234',
  'passpass', 'passwort', 'motdepasse', 'contrasena', 'matkhau', 'matkhau123', 'matkhaumoi', 'mat khau', 'baomat',
  'taikhoan', 'dangnhap', 'quenmatkhau', 'admin', 'admin123', 'admin1234', 'administrator', 'root', 'toor',
  'user', 'user123', 'test', 'test123', 'test1234', 'guest', 'guest123', 'demo', 'demo123', 'default', 'changeme',
  'change_me', 'letmein', 'welcome', 'welcome1', 'welcome123', 'iloveyou', 'iloveyou1', 'loveyou', 'princess',
  'monkey', 'dragon', 'sunshine', 'master', 'shadow', 'superman', 'batman', 'football', 'baseball', 'soccer',
  'hello', 'hello123', 'freedom', 'whatever', 'trustno1', 'secret', 'login', 'access', 'starwars', 'cheese',
  'computer', 'internet', 'michael', 'jessica', 'charlie', 'donald', 'qwer1234', 'zxcvbn', 'mypassword',
  'badminton', 'badminton123', 'badminton1', 'caulong', 'caulong123', 'sancaulong', 'datsan', 'datsan123',
  'yonex', 'yonex123', 'lining', 'victor', 'racket', 'shuttlecock', 'smash', 'doubles', 'singles',
  'vietnam', 'vietnam123', 'hanoi', 'hanoi123', 'saigon', 'saigon123', 'hochiminh', 'danang', 'haiphong',
  'iloveyou2', 'anhyeuem', 'emyeuanh', 'yeuem', 'yeuanh', 'yeuemnhieu', 'thienthan', 'maiyeu', 'ngaymai',
  '1111', '11111', '111111111', '1111111111', '12341234', '1234abcd', '12qwaszx', '147258369', '159753',
  '741852963', '789456123', '147852369', '123654789', '123456a', '123456aa', 'a123456', 'a1234567', 'a12345678',
  'abc@123', 'abcd@1234', 'admin@123', 'pass@123', 'password@123', 'qwerty@123', 'user@123', 'test@123',
  'welcome@123', 'letmein123', 'princess1', 'sunshine1', 'football1', 'monkey123', 'dragon123', 'master123',
  'employee', 'employee123', 'manager', 'manager123', 'customer', 'customer123', 'khachhang', 'nhanvien',
  'quanly', 'quantri', 'quantrivien'
]);

const stripDiacritics = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/đ/gi, 'd');

const alnumLower = (value) => stripDiacritics(value).toLowerCase().replace(/[^a-z0-9]/g, '');

// `matkhau123!` → `matkhau`; `Password@2026` → `password`
const baseWord = (lower) => lower.replace(/[^a-z]+$/g, '').replace(/^[^a-z]+/g, '');

const isRepeated = (value) => value.length > 0 && new Set(value.split('')).size === 1;

const isSequential = (value) => {
  if (value.length < 6) return false;
  const codes = value.split('').map((c) => c.charCodeAt(0));
  const step = codes[1] - codes[0];
  if (Math.abs(step) !== 1) return false;
  return codes.every((c, i) => i === 0 || c - codes[i - 1] === step);
};

/** Chuẩn hoá số điện thoại về dãy số quốc nội: `+84 912 345 678` → `0912345678`. */
const phoneDigits = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('84') && digits.length >= 11) return `0${digits.slice(2)}`;
  return digits;
};

const personalReason = (password, { phone, email, fullName } = {}) => {
  const compact = alnumLower(password);
  const digitsOnly = String(password).replace(/\D/g, '');

  const phoneNumber = phoneDigits(phone);
  if (phoneNumber.length >= 8) {
    const national = phoneNumber;
    const withoutZero = phoneNumber.replace(/^0/, '');
    if (digitsOnly.includes(national) || (withoutZero.length >= 8 && digitsOnly.includes(withoutZero))) return 'personal';
  }

  const local = alnumLower(String(email || '').split('@')[0]);
  if (local.length >= 4 && compact.includes(local)) return 'personal';

  const name = alnumLower(fullName);
  if (name.length >= 6 && compact.includes(name)) return 'personal';
  // Từng từ trong họ tên chỉ tính khi đủ dài và mật khẩu NGẮN gần như chỉ gồm từ đó.
  const words = stripDiacritics(fullName).toLowerCase().split(/\s+/).filter((w) => w.length >= 5);
  if (words.some((w) => compact === w || compact.replace(/\d+$/, '') === w)) return 'personal';

  return null;
};

/**
 * @returns {{ ok: true } | { ok: false, reason: 'length'|'common'|'simple'|'personal', message: string }}
 */
const checkPassword = (password, context = {}) => {
  if (typeof password !== 'string') return { ok: false, reason: 'length', message: MESSAGES.length };
  if (password.length < MIN_LENGTH || Buffer.byteLength(password, 'utf8') > MAX_BYTES) {
    return { ok: false, reason: 'length', message: MESSAGES.length };
  }

  const lower = password.toLowerCase();
  const compact = alnumLower(password);
  const base = baseWord(lower);
  if (COMMON.has(lower) || COMMON.has(compact) || (base.length >= 4 && COMMON.has(base))) {
    return { ok: false, reason: 'common', message: MESSAGES.common };
  }
  if (isRepeated(compact) || isSequential(compact) || isSequential(lower)) {
    return { ok: false, reason: 'simple', message: MESSAGES.simple };
  }
  if (personalReason(password, context)) return { ok: false, reason: 'personal', message: MESSAGES.personal };

  return { ok: true };
};

const MESSAGES = Object.freeze({
  length: `Mật khẩu phải có từ ${MIN_LENGTH} đến ${MAX_BYTES} ký tự.`,
  common: 'Mật khẩu này quá phổ biến, hãy chọn mật khẩu khác.',
  simple: 'Mật khẩu quá đơn giản (ký tự lặp lại hoặc dãy liên tiếp).',
  personal: 'Mật khẩu không được trùng hoặc chứa số điện thoại, email hay họ tên của bạn.'
});

/** Dùng trong service: ném lỗi 400 nếu mật khẩu không đạt. */
const assertPassword = (password, context = {}) => {
  const result = checkPassword(password, context);
  if (!result.ok) {
    const error = new Error(result.message);
    error.statusCode = 400;
    throw error;
  }
};

module.exports = { checkPassword, assertPassword, MIN_LENGTH, MAX_BYTES, MESSAGES, COMMON };
