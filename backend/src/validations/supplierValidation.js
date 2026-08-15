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

const createSupplierRules = [
  body('name').trim().notEmpty().withMessage('Supplier name is required'),
  body('phone').optional().trim(),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid email'),
  body('address').optional().trim(),
  body('taxCode').optional().trim(),
  body('note').optional().trim(),
  validate
];

const updateSupplierRules = [
  param('id').isInt().withMessage('Supplier ID must be an integer'),
  body('name').optional().trim().notEmpty(),
  body('phone').optional().trim(),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid email'),
  body('address').optional().trim(),
  body('taxCode').optional().trim(),
  body('note').optional().trim(),
  validate
];

module.exports = {
  createSupplierRules,
  updateSupplierRules
};
