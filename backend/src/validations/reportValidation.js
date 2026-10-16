const { query, validationResult } = require('express-validator');
const { errorResponse } = require('../utils/responseHandler');

// Báo cáo nhận `period`, `from`, `to` từ query string. Trước đây ngày sai định dạng ("abc", "2026-13-45")
// đi thẳng vào SQL và trả 500 (R11, báo cáo 33) — kiểm ở cửa vào để trả 400 có thông điệp rõ.
const PERIODS = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'];
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const isRealDate = (value) => {
  if (!DATE_ONLY.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

const dateRule = (name) => query(name).optional({ checkFalsy: true }).custom((value) => {
  if (typeof value !== 'string' || !isRealDate(value)) throw new Error(`${name} phải là ngày hợp lệ dạng YYYY-MM-DD`);
  return true;
});

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return errorResponse(res, 'Validation failed', errors.array().map((e) => ({ field: e.path, message: e.msg })), 400);
  }
  next();
};

const reportRangeRules = [
  query('period').optional({ checkFalsy: true }).isIn(PERIODS).withMessage(`period phải là một trong: ${PERIODS.join(', ')}`),
  dateRule('from'),
  dateRule('to'),
  query('to').custom((to, { req }) => {
    const { from } = req.query;
    if (typeof from === 'string' && typeof to === 'string' && isRealDate(from) && isRealDate(to) && from > to) {
      throw new Error('from không được sau to');
    }
    return true;
  }),
  validate
];

module.exports = { reportRangeRules, isRealDate, PERIODS };
