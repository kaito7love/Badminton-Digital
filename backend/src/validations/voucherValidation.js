const { body, param, validationResult } = require('express-validator');
const { errorResponse } = require('../utils/responseHandler');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map((err) => ({ field: err.path, message: err.msg }));
    return errorResponse(res, 'Validation failed', formattedErrors, 400);
  }
  next();
};

// Giới hạn độ dài phải khớp schema (`code` VARCHAR(32), `description`
// VARCHAR(255)) — thiếu ràng buộc này thì chuỗi dài rơi thẳng xuống MySQL và
// bật lên thành HTTP 500 "Data too long for column", thay vì 400 báo cho admin
// biết phải sửa gì.
const createVoucherRules = [
  body('code').trim().notEmpty().withMessage('Mã giảm giá là bắt buộc')
    .isLength({ max: 32 }).withMessage('Mã giảm giá tối đa 32 ký tự'),
  body('description').optional({ nullable: true }).isLength({ max: 255 }).withMessage('Mô tả tối đa 255 ký tự'),
  body('discountType').isIn(['percent', 'flat']).withMessage('discountType phải là percent hoặc flat'),
  body('discountValue').isFloat({ min: 0 }).withMessage('discountValue phải là số không âm'),
  body('maxDiscountAmount').optional({ nullable: true }).isFloat({ min: 0 }),
  body('minOrderAmount').optional().isFloat({ min: 0 }),
  body('startsAt').optional({ nullable: true }).isISO8601(),
  body('endsAt').optional({ nullable: true }).isISO8601(),
  body('usageLimit').optional({ nullable: true }).isInt({ min: 1 }),
  body('perCustomerLimit').optional({ nullable: true }).isInt({ min: 1 }),
  body('isActive').optional().isBoolean(),
  validate
];

const updateVoucherRules = [
  param('id').isInt().withMessage('Voucher ID phải là số nguyên'),
  body('code').optional().trim().notEmpty().isLength({ max: 32 }).withMessage('Mã giảm giá tối đa 32 ký tự'),
  body('description').optional({ nullable: true }).isLength({ max: 255 }).withMessage('Mô tả tối đa 255 ký tự'),
  body('discountType').optional().isIn(['percent', 'flat']),
  body('discountValue').optional().isFloat({ min: 0 }),
  body('maxDiscountAmount').optional({ nullable: true }).isFloat({ min: 0 }),
  body('minOrderAmount').optional().isFloat({ min: 0 }),
  body('startsAt').optional({ nullable: true }).isISO8601(),
  body('endsAt').optional({ nullable: true }).isISO8601(),
  body('usageLimit').optional({ nullable: true }).isInt({ min: 1 }),
  body('perCustomerLimit').optional({ nullable: true }).isInt({ min: 1 }),
  body('isActive').optional().isBoolean(),
  validate
];

const voucherIdRules = [param('id').isInt().withMessage('Voucher ID phải là số nguyên'), validate];

const previewVoucherRules = [
  body('code').trim().notEmpty().withMessage('Vui lòng nhập mã giảm giá'),
  body('orderAmount').isFloat({ min: 0 }).withMessage('orderAmount phải là số không âm'),
  validate
];

module.exports = {
  createVoucherRules,
  updateVoucherRules,
  voucherIdRules,
  previewVoucherRules
};
