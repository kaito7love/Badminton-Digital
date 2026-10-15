const { body, validationResult } = require('express-validator');
const { errorResponse } = require('../utils/responseHandler');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(err => ({ field: err.path, message: err.msg }));
    return errorResponse(res, 'Validation failed', formattedErrors, 400);
  }
  next();
};

// Khoá cài đặt mà code thật sự đọc (SettingService, discountPolicy, operatingHours...). `PUT /settings` trước
// đây nhận khoá tuỳ ý — admin gõ nhầm khoá thì lưu im lặng một giá trị chẳng ai đọc (R12, báo cáo 33).
const KNOWN_KEYS = ['pricing', 'operating_hours', 'branding', 'discount_policy', 'store_info', 'booking_policy'];

const MAX_KEYS = 20;
const MAX_BYTES = 4096;
const MAX_STRING = 200;
const MAX_DEPTH = 3;
const MAX_AMOUNT = 1e9;

// Giao diện Cài đặt còn gửi nhiều hình dạng khác nhau (xem SettingService.getPeakHours), nên chỉ kiểm KIỂU:
// không ép tên trường, nhưng những tên trường đã có nghĩa cố định thì giá trị phải đúng nghĩa đó.
const TIME_KEYS = new Set(['open', 'close', 'peak_start', 'peak_end', 'peakStartTime', 'peakEndTime']);
const HOUR_KEYS = new Set(['peakStartHour', 'peakEndHour']);
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
// Tên trường mang nghĩa tiền: peakPricePerHour, offpeakPrice, depositAmount, extraCost...
const looksLikeAmount = (key) => /price|perhour$|amount$|cost$/i.test(key);

/** Trả về chuỗi mô tả lỗi, hoặc null nếu hợp lệ. Đệ quy tới MAX_DEPTH tầng. */
const checkValue = (key, value, depth) => {
  if (value === null || typeof value === 'boolean') return null;
  if (typeof value === 'string') {
    if (value.length > MAX_STRING) return `${key} tối đa ${MAX_STRING} ký tự`;
    if (TIME_KEYS.has(key) && !TIME_RE.test(value)) return `${key} phải là giờ dạng HH:mm`;
    // Ô nhập số của giao diện có thể gửi chuỗi số ("180000") — chấp nhận, nhưng "abc" thì không.
    if (looksLikeAmount(key) && !(value.trim() !== '' && Number.isFinite(Number(value)))) return `${key} phải là số`;
    return null;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return `${key} phải là số hữu hạn`;
    if (HOUR_KEYS.has(key) && (value < 0 || value > 24)) return `${key} phải trong khoảng 0–24`;
    if (looksLikeAmount(key) && (value < 0 || value > MAX_AMOUNT)) return `${key} phải trong khoảng 0–${MAX_AMOUNT}`;
    return null;
  }
  if (depth >= MAX_DEPTH) return `${key} lồng quá sâu`;
  if (Array.isArray(value)) {
    if (value.length > MAX_KEYS) return `${key} tối đa ${MAX_KEYS} phần tử`;
    for (const item of value) {
      const err = checkValue(key, item, depth + 1);
      if (err) return err;
    }
    return null;
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') return `Khoá ${k} không được phép`;
      const err = checkValue(k, v, depth + 1);
      if (err) return err;
    }
    return null;
  }
  return `${key} có kiểu dữ liệu không được hỗ trợ`;
};

/** Hợp lệ khi là object phẳng/lồng nông, không quá lớn, giá trị đúng kiểu. */
const validateSettingObject = (value) => {
  // Cho phép cả mảng: một số bản cài cũ lưu `operating_hours` dạng [{ day, open, close }] (giao diện Cài đặt còn
  // dựng mặc định theo dạng này) — chặn mảng sẽ làm nút "Lưu" của họ hỏng.
  if (value === null || typeof value !== 'object') throw new Error('Giá trị cài đặt phải là object hoặc mảng');
  if (Object.keys(value).length > MAX_KEYS) throw new Error(`Tối đa ${MAX_KEYS} trường`);
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > MAX_BYTES) throw new Error(`Giá trị cài đặt tối đa ${MAX_BYTES} byte`);
  const err = checkValue('value', value, 0);
  if (err) throw new Error(err);
  return true;
};

// `PUT /settings/pricing|operating-hours|branding`: toàn bộ body là giá trị.
const settingBodyRules = [
  body().custom((_, { req }) => validateSettingObject(req.body)),
  validate
];

const updateSettingRules = [
  body('key').trim().notEmpty().withMessage('Setting key is required')
    .isIn(KNOWN_KEYS).withMessage(`Khoá cài đặt phải là một trong: ${KNOWN_KEYS.join(', ')}`),
  body('value').exists().withMessage('Setting value is required'),
  // Trần giảm giá tay của nhân viên: lưu sai kiểu là trần mất tác dụng, nên chặn
  // ngay ở đây thay vì để SettingService.getDiscountPolicy lặng lẽ về mặc định.
  body('value.employeeMaxPercent')
    .if(body('key').equals('discount_policy'))
    .isFloat({ min: 0, max: 100 }).withMessage('Trần giảm giá của nhân viên phải là số từ 0 đến 100'),
  // Chính sách giữ chỗ (kế hoạch 42): số nguyên không âm; 0 = tắt trần / tắt tự huỷ.
  body('value.maxActivePerCustomer').if(body('key').equals('booking_policy')).optional()
    .isInt({ min: 0, max: 1000 }).withMessage('Trần lịch đang giữ mỗi khách phải là số nguyên từ 0 đến 1000 (0 = không giới hạn)'),
  body('value.pendingExpiryHours').if(body('key').equals('booking_policy')).optional()
    .isInt({ min: 0, max: 1440 }).withMessage('Số giờ tự huỷ lịch chưa duyệt phải là số nguyên từ 0 đến 1440 (0 = tắt)'),
  body('value.pendingExpireBeforeStartMinutes').if(body('key').equals('booking_policy')).optional()
    .isInt({ min: 0, max: 1440 }).withMessage('Số phút trước giờ chơi phải là số nguyên từ 0 đến 1440'),
  body('value').custom((value) => validateSettingObject(value)),
  validate
];

module.exports = {
  updateSettingRules,
  settingBodyRules,
  validateSettingObject,
  KNOWN_KEYS
};
