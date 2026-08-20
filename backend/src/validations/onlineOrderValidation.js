const { body, param, validationResult } = require('express-validator');
const { errorResponse } = require('../utils/responseHandler');
const { isValidPhone } = require('../utils/phone');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map((err) => ({ field: err.path, message: err.msg }));
    return errorResponse(res, 'Validation failed', formattedErrors, 400);
  }
  next();
};

// Trần 50 dòng: giỏ hàng thật của một khách không bao giờ tới đó, còn một
// request 10.000 dòng thì đủ để giữ transaction mở rất lâu.
const placeOrderRules = [
  body('branchId').isInt({ min: 1 }).withMessage('Vui lòng chọn chi nhánh nhận hàng'),
  body('items').isArray({ min: 1, max: 50 }).withMessage('Giỏ hàng đang trống'),
  body('items.*.variantId').isInt({ min: 1 }).withMessage('Sản phẩm không hợp lệ'),
  body('items.*.quantity').isInt({ min: 1, max: 99 }).withMessage('Số lượng mỗi sản phẩm từ 1 đến 99'),
  body('contactName').trim().notEmpty().withMessage('Vui lòng nhập tên người nhận').isLength({ max: 100 }),
  body('contactPhone').custom((value) => {
    if (!isValidPhone(value)) throw new Error('Số điện thoại người nhận không hợp lệ');
    return true;
  }),
  body('customerNote').optional({ nullable: true }).isLength({ max: 500 }).withMessage('Ghi chú tối đa 500 ký tự'),
  body('paymentMethod').optional().isIn(['cash', 'transfer']).withMessage('Phương thức thanh toán không hợp lệ'),
  body('voucherCode').optional({ nullable: true }).trim().isLength({ max: 32 }).withMessage('Mã giảm giá không hợp lệ'),
  validate
];

const orderIdRules = [
  param('id').isInt({ min: 1 }).withMessage('Mã đơn hàng không hợp lệ'),
  validate
];

module.exports = { placeOrderRules, orderIdRules };
