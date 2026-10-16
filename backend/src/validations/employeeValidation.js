const { body, param, validationResult } = require('express-validator');
const { errorResponse } = require('../utils/responseHandler');
const { isValidPhone } = require('../utils/phone');
const { checkPassword } = require('../utils/passwordPolicy');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(err => ({ field: err.path, message: err.msg }));
    return errorResponse(res, 'Validation failed', formattedErrors, 400);
  }
  next();
};

const createEmployeeRules = [
  body('password').custom((value, { req }) => {
    const result = checkPassword(value, { phone: req.body.phone, email: req.body.email, fullName: req.body.fullName });
    if (!result.ok) throw new Error(result.message);
    return true;
  }),
  body('email').isEmail().withMessage('Valid email is required')
    .isLength({ max: 255 }).withMessage('Email tối đa 255 ký tự'),
  body('phone').custom((value) => {
    if (!isValidPhone(value)) throw new Error('Số điện thoại không hợp lệ');
    return true;
  }),
  body('fullName').trim().notEmpty().withMessage('Full name is required')
    .isLength({ max: 100 }).withMessage('Họ tên tối đa 100 ký tự'),
  body('position').optional().isString().isLength({ max: 50 }).withMessage('Chức vụ tối đa 50 ký tự'),
  body('shift').optional().isString().isLength({ max: 50 }).withMessage('Ca làm tối đa 50 ký tự'),
  validate
];

const updateEmployeeRules = [
  param('id').isInt({ min: 1, max: 2147483647 }).withMessage('Employee ID must be an integer'),
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
