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

const createEmployeeRules = [
  body('username').trim().notEmpty().withMessage('Username is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('fullName').trim().notEmpty().withMessage('Full name is required'),
  body('position').optional().isString(),
  body('shift').optional().isString(),
  validate
];

const updateEmployeeRules = [
  param('id').isInt().withMessage('Employee ID must be an integer'),
  body('position').optional().isString(),
  body('shift').optional().isString(),
  validate
];

module.exports = {
  createEmployeeRules,
  updateEmployeeRules
};
