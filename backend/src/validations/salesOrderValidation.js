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

const checkoutRules = [
  param('id').isInt().withMessage('Sales order ID must be an integer'),
  body('paymentMethod').optional().isIn(['cash', 'transfer']),
  body('discountAmount').optional().isFloat({ min: 0 }),
  validate
];

module.exports = {
  createOrderRules,
  addLineRules,
  removeLineRules,
  checkoutRules
};
