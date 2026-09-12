const { body, param, validationResult } = require('express-validator');
const { errorResponse } = require('../utils/responseHandler');
const { isValidPhone } = require('../utils/phone');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(err => ({ field: err.path, message: err.msg }));
    return errorResponse(res, 'Validation failed', formattedErrors, 400);
  }
  next();
};

const createEmployeeRules = [
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('phone').custom((value) => {
    if (!isValidPhone(value)) throw new Error('Số điện thoại không hợp lệ');
    return true;
  }),
  body('fullName').trim().notEmpty().withMessage('Full name is required'),
  body('position').optional().isString(),
  body('shift').optional().isString(),
  validate
];

const updateEmployeeRules = [
  param('id').isInt().withMessage('Employee ID must be an integer'),
  // Email là danh tính đăng nhập và là nơi nhận link đặt lại mật khẩu: đổi được
  // qua API này thì chiếm được tài khoản. Trang Nhân viên không gửi email khi sửa.
  body('email').not().exists().withMessage('Không thể đổi email đăng nhập qua API sửa nhân viên.'),
  body('phone').optional({ nullable: true, checkFalsy: true }).custom((value) => {
    if (!isValidPhone(value)) throw new Error('Số điện thoại không hợp lệ');
    return true;
  }),
  body('position').optional().isString(),
  body('shift').optional().isString(),
  validate
];

module.exports = {
  createEmployeeRules,
  updateEmployeeRules
};
