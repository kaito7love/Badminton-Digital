const { body, validationResult } = require('express-validator');

const validateLogin = [
  body('email').isEmail().withMessage('Email không hợp lệ.'),
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

module.exports = {
  validateLogin,
  validateChangePassword
};
