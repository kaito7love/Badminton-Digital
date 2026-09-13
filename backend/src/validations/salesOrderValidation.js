const { body, param, validationResult } = require('express-validator');
const { errorResponse } = require('../utils/responseHandler');
const { DISCOUNT_REASON_MAX_LENGTH } = require('../utils/discountPolicy');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(err => ({ field: err.path, message: err.msg }));
    return errorResponse(res, 'Validation failed', formattedErrors, 400);
  }
  next();
};

const createOrderRules = [
  body('customerId').optional({ nullable: true }).isInt(),
  validate
];

const addLineRules = [
  param('id').isInt().withMessage('Sales order ID must be an integer'),
  body('variantId').isInt().withMessage('variantId is required'),
  body('quantity').isInt({ min: 1 }).withMessage('quantity must be at least 1'),
  validate
];

const removeLineRules = [
  param('id').isInt().withMessage('Sales order ID must be an integer'),
  param('lineId').isInt().withMessage('Line ID must be an integer'),
  validate
];

const applyVoucherRules = [
  param('id').isInt().withMessage('Sales order ID must be an integer'),
  body('voucherCode').optional({ nullable: true }).trim().isLength({ max: 32 }).withMessage('Mã giảm giá không hợp lệ'),
  validate
];

const checkoutRules = [
  param('id').isInt().withMessage('Sales order ID must be an integer'),
  body('paymentMethod').optional().isIn(['cash', 'transfer']),
  body('discountAmount').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('Số tiền giảm giá phải là số không âm').toFloat(),
  body('discountReason')
    .optional({ nullable: true })
    .isString().withMessage('Lý do giảm giá không hợp lệ')
    .trim()
    .isLength({ max: DISCOUNT_REASON_MAX_LENGTH }).withMessage(`Lý do giảm giá tối đa ${DISCOUNT_REASON_MAX_LENGTH} ký tự`),
  validate
];

module.exports = {
  createOrderRules,
  addLineRules,
  removeLineRules,
  applyVoucherRules,
  checkoutRules
};
