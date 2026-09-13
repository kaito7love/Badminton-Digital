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

const checkoutRules = [
  body('sessionId').isInt().withMessage('Session ID is required and must be an integer'),
  body('paymentMethod').isIn(['cash', 'transfer']).withMessage('Payment method must be cash or transfer'),
  body('discountAmount').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('Số tiền giảm giá phải là số không âm').toFloat(),
  // `.toBoolean(true)`: chỉ true / "true" / "1" mới là giảm theo %. Trước đây
  // controller đọc `req.body.isDiscountPercent || false` — chuỗi "false" là
  // truthy nên bị hiểu thành giảm theo %.
  body('isDiscountPercent')
    .optional({ nullable: true })
    .isBoolean().withMessage('isDiscountPercent phải là true hoặc false')
    .toBoolean(true)
    .custom((isPercent, { req }) => {
      if (isPercent === true && Number(req.body.discountAmount) > 100) {
        throw new Error('Giảm theo % tối đa 100');
      }
      return true;
    }),
  body('discountReason')
    .optional({ nullable: true })
    .isString().withMessage('Lý do giảm giá không hợp lệ')
    .trim()
    .isLength({ max: DISCOUNT_REASON_MAX_LENGTH }).withMessage(`Lý do giảm giá tối đa ${DISCOUNT_REASON_MAX_LENGTH} ký tự`),
  // Mốc `checkoutPreview.endTime` của GET /sessions/:id — xem PaymentService.resolveCheckoutEndTime.
  body('endTime').optional({ nullable: true }).isISO8601().withMessage('endTime phải là mốc thời gian ISO 8601'),
  validate
];

const webhookRules = [
  body('provider').trim().notEmpty().withMessage('Provider is required'),
  body('providerReference').trim().notEmpty().withMessage('Provider reference is required'),
  body('invoiceNo').trim().notEmpty().withMessage('Invoice number is required'),
  // Số tiền thật đã về tài khoản — đối chiếu với số tiền của giao dịch trước khi
  // đánh dấu đã trả. Thiếu trường này thì chuyển 1.000đ kèm đúng nội dung cũng
  // "trả" được một hoá đơn 1 triệu.
  body('amount').isInt({ min: 1 }).withMessage('amount (số tiền VND đã nhận) là bắt buộc và phải là số nguyên dương').toInt(),
  body('status').equals('paid').withMessage('Only paid webhook status is supported'),
  validate
];

const voidInvoiceRules = [
  param('id').isInt().withMessage('Invoice ID must be an integer'),
  body('reason').trim().notEmpty().withMessage('Lý do huỷ hoá đơn là bắt buộc'),
  validate
];

module.exports = {
  checkoutRules,
  webhookRules,
  voidInvoiceRules
};
