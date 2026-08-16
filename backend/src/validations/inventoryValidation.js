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

const createAdjustmentRules = [
  body('extraId').optional({ nullable: true }).isInt(),
  body('productVariantId').optional({ nullable: true }).isInt(),
  body('type').isIn(['adjustment_in', 'adjustment_out', 'damaged', 'lost']).withMessage('Invalid adjustment type'),
  body('quantity').isInt({ min: 1 }).withMessage('quantity must be at least 1'),
  body('note').trim().notEmpty().withMessage('note (lý do điều chỉnh) is required'),
  validate
];

module.exports = {
  createAdjustmentRules
};
