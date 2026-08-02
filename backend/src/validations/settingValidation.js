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

const updateSettingRules = [
  body('key').trim().notEmpty().withMessage('Setting key is required'),
  body('value').exists().withMessage('Setting value is required'),
  validate
];

module.exports = {
  updateSettingRules
};
