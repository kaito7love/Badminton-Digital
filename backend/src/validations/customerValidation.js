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

// Tính duy nhất của SĐT do unique index (phone) toàn hệ thống đảm nhiệm — 1
// khách hàng dùng chung 1 hồ sơ ở mọi chi nhánh.
// Tạo hồ sơ có chủ đích từ màn Khách hàng thì SĐT là bắt buộc: đó là thứ duy
// nhất nhận ra khách ở lần ghé sau, và cũng là danh tính để họ đăng nhập đặt
// sân online. Khách vãng lai không chịu đưa số vẫn mở sân được bình thường —
// đường đó đi qua resolveWalkIn chứ không qua đây.
const createCustomerRules = [
  body('fullName').trim().notEmpty().withMessage('Vui lòng nhập họ tên khách hàng'),
  body('phone').custom((value) => {
    if (!isValidPhone(value)) throw new Error('Số điện thoại không hợp lệ');
    return true;
  }),
  body('email').optional({ nullable: true, checkFalsy: true }).isEmail().withMessage('Email không hợp lệ'),
  // Có mật khẩu nghĩa là nhân viên tạo luôn tài khoản đăng nhập cho khách
  body('password').optional({ nullable: true, checkFalsy: true })
    .isLength({ min: 6 }).withMessage('Mật khẩu phải có tối thiểu 6 ký tự'),
  validate
];

const updateCustomerRules = [
  param('id').isInt().withMessage('Customer ID must be an integer'),
  body('fullName').optional().trim().notEmpty().withMessage('Full name cannot be empty'),
  body('phone').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 20 }).withMessage('Phone number must be at most 20 characters'),
  body('email').optional({ nullable: true, checkFalsy: true }).isEmail().withMessage('Invalid email address'),
  validate
];

// Gộp hồ sơ tại quầy (`:id`) vào hồ sơ của tài khoản khách tự đăng ký cùng số.
// Điều kiện nghiệp vụ do CustomerService.assertMergeable kiểm.
const mergeIntoAccountRules = [
  param('id').isInt({ min: 1 }).withMessage('Customer ID must be an integer'),
  body('accountCustomerId').isInt({ min: 1 }).withMessage('accountCustomerId phải là mã hồ sơ của tài khoản'),
  validate
];

module.exports = {
  createCustomerRules,
  updateCustomerRules,
  mergeIntoAccountRules
};
