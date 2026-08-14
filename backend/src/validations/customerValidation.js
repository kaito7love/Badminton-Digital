const { body, param, validationResult } = require('express-validator');
const { errorResponse } = require('../utils/responseHandler');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(err => ({ field: err.path, message: err.msg }));
    return errorResponse(res, 'Validation failed', formattedErrors, 400);
  }
  next();
};

// Số điện thoại là tuỳ chọn: khách vãng lai chưa để lại số vẫn là khách hàng,
// chỉ là hồ sơ thiếu thông tin. Tính duy nhất do (branch_id, phone) đảm nhiệm.
const createCustomerRules = [
  body('fullName').trim().notEmpty().withMessage('Full name is required'),
  body('phone').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 20 }).withMessage('Phone number must be at most 20 characters'),
  body('email').optional({ nullable: true, checkFalsy: true }).isEmail().withMessage('Invalid email address'),
  validate
];

const updateCustomerRules = [
  param('id').isInt().withMessage('Customer ID must be an integer'),
  body('fullName').optional().trim().notEmpty().withMessage('Full name cannot be empty'),
  body('phone').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 20 }).withMessage('Phone number must be at most 20 characters'),
  body('email').optional({ nullable: true, checkFalsy: true }).isEmail().withMessage('Invalid email address'),
  validate
];

module.exports = {
  createCustomerRules,
  updateCustomerRules
};
