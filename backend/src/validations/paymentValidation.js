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

const checkoutRules = [
  body('sessionId').isInt().withMessage('Session ID is required and must be an integer'),
  body('paymentMethod').isIn(['cash', 'transfer']).withMessage('Payment method must be cash or transfer'),
  body('discountAmount').optional().isNumeric().withMessage('Discount amount must be a number'),
  body('isDiscountPercent').optional().isBoolean(),
  validate
];

module.exports = {
  checkoutRules
};
