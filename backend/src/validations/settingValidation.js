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
  // Trần giảm giá tay của nhân viên: lưu sai kiểu là trần mất tác dụng, nên chặn
  // ngay ở đây thay vì để SettingService.getDiscountPolicy lặng lẽ về mặc định.
  body('value.employeeMaxPercent')
    .if(body('key').equals('discount_policy'))
    .isFloat({ min: 0, max: 100 }).withMessage('Trần giảm giá của nhân viên phải là số từ 0 đến 100'),
  validate
];

module.exports = {
  updateSettingRules
};
