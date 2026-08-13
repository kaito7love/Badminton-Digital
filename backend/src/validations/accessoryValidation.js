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

const createAccessoryRules = [
  body('name').trim().notEmpty().withMessage('Accessory name is required'),
  body('price').isNumeric().withMessage('Price must be a number'),
  body('stockQuantity').optional().isInt({ min: 0 }).withMessage('Stock quantity must be non-negative'),
  body('lowStockThreshold').optional().isInt({ min: 0 }),
  validate
];

const updateAccessoryRules = [
  param('id').isInt().withMessage('Accessory ID must be an integer'),
  body('name').optional().trim().notEmpty(),
  body('price').optional().isNumeric(),
  body('stockQuantity').optional().isInt({ min: 0 }),
  body('lowStockThreshold').optional().isInt({ min: 0 }),
  validate
];

const addSessionExtraRules = [
  param('sessionId').isInt().withMessage('Session ID must be an integer'),
  body('extraId').isInt().withMessage('Extra ID is required'),
  body('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
  validate
];

const returnSessionExtraRules = [
  param('sessionId').isInt().withMessage('Session ID must be an integer'),
  body('extraId').isInt().withMessage('Extra ID is required'),
  body('returnQuantity').isInt({ min: 1 }).withMessage('Return quantity must be at least 1'),
  validate
];

module.exports = {
  createAccessoryRules,
  updateAccessoryRules,
  addSessionExtraRules,
  returnSessionExtraRules
};
