const { body, validationResult } = require('express-validator');
const { isValidPhone } = require('../utils/phone');

// Một ô nhận cả số điện thoại lẫn email. Không ép định dạng ở đây: kiểu nào là
// kiểu nào do AuthService phân biệt, còn báo lỗi thì phải giống hệt nhau cho
// mọi trường hợp sai — nói rõ "email không hợp lệ" là đã tiết lộ hệ thống hiểu
// chuỗi vừa gõ theo kiểu nào.
const validateLogin = [
  body('identifier')
    .if(body('email').not().exists())
    .trim()
    .notEmpty()
    .withMessage('Vui lòng nhập số điện thoại hoặc email.'),
  body('email').optional().trim().notEmpty().withMessage('Vui lòng nhập số điện thoại hoặc email.'),
  body('password').notEmpty().withMessage('Mật khẩu không được để trống.'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Dữ liệu đầu vào không hợp lệ.',
        errors: errors.array()
      });
    }
    next();
  }
];

const validateChangePassword = [
  body('oldPassword').notEmpty().withMessage('Mật khẩu hiện tại không được để trống.'),
  body('newPassword').isLength({ min: 6 }).withMessage('Mật khẩu mới phải có tối thiểu 6 ký tự.'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Dữ liệu đầu vào không hợp lệ.',
        errors: errors.array()
      });
    }
    next();
  }
];

const validateForgotPassword = [
  body('email').isEmail().withMessage('Email không hợp lệ.'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Dữ liệu đầu vào không hợp lệ.',
        errors: errors.array()
      });
    }
    next();
  }
];

const validateResetPassword = [
  body('token').notEmpty().withMessage('Token đặt lại mật khẩu không được để trống.'),
  body('newPassword').isLength({ min: 6 }).withMessage('Mật khẩu mới phải có tối thiểu 6 ký tự.'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Dữ liệu đầu vào không hợp lệ.',
        errors: errors.array()
      });
    }
    next();
  }
];

const validateRegister = [
  body('fullName').trim().notEmpty().withMessage('Vui lòng nhập họ tên.')
    .isLength({ max: 100 }).withMessage('Họ tên tối đa 100 ký tự.'),
  body('phone').custom((value) => {
    if (!isValidPhone(value)) throw new Error('Số điện thoại không hợp lệ.');
    return true;
  }),
  // Email không bắt buộc — nhưng có thì mới nhận được thư đặt lại mật khẩu
  body('email').optional({ nullable: true, checkFalsy: true })
    .isEmail().withMessage('Email không hợp lệ.'),
  body('password').isLength({ min: 6 }).withMessage('Mật khẩu phải có tối thiểu 6 ký tự.'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Dữ liệu đầu vào không hợp lệ.',
        errors: errors.array()
      });
    }
    next();
  }
];

module.exports = {
  validateLogin,
  validateRegister,
  validateChangePassword,
  validateForgotPassword,
  validateResetPassword
};
