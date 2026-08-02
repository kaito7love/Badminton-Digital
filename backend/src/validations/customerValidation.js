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

const createCustomerRules = [
  body('fullName').trim().notEmpty().withMessage('Full name is required'),
  body('phone').trim().notEmpty().withMessage('Phone number is required'),
  body('email').optional({ nullable: true }).isEmail().withMessage('Invalid email address'),
  validate
];

const updateCustomerRules = [
  param('id').isInt().withMessage('Customer ID must be an integer'),
  body('fullName').optional().trim().notEmpty().withMessage('Full name cannot be empty'),
  body('phone').optional().trim().notEmpty().withMessage('Phone number cannot be empty'),
  body('email').optional({ nullable: true }).isEmail().withMessage('Invalid email address'),
  validate
];

module.exports = {
  createCustomerRules,
  updateCustomerRules
};
