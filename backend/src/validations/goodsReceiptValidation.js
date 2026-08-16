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

const createGoodsReceiptRules = [
  body('supplierId').optional({ nullable: true }).isInt().withMessage('Supplier ID must be an integer'),
  body('note').optional().trim(),
  body('items').isArray({ min: 1 }).withMessage('Goods receipt must have at least 1 line item'),
  body('items.*.extraId').optional({ nullable: true }).isInt().withMessage('extraId must be an integer'),
  body('items.*.productVariantId').optional({ nullable: true }).isInt().withMessage('productVariantId must be an integer'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('quantity must be at least 1'),
  body('items.*.unitCost').isFloat({ min: 0 }).withMessage('unitCost must be a non-negative number'),
  validate
];

const getGoodsReceiptRules = [
  param('id').isInt().withMessage('Goods receipt ID must be an integer'),
  validate
];

module.exports = {
  createGoodsReceiptRules,
  getGoodsReceiptRules
};
