const { body, validationResult } = require('express-validator');
const { isValidPhone } = require('../utils/phone');
const { checkPassword, MIN_LENGTH, MAX_BYTES, MESSAGES } = require('../utils/passwordPolicy');

// Chính sách mật khẩu (R2). `context` lấy từ body (đăng ký) hoặc từ tài khoản đang đăng nhập (đổi mật khẩu).
const passwordPolicyRule = (value, context) => {
  const result = checkPassword(value, context);
  if (!result.ok) throw new Error(result.message);
  return true;
};

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
  body('newPassword').custom((value, { req }) => {
    // Đổi sang CHÍNH mật khẩu hiện tại không thêm rủi ro mới (và giữ cho request Postman idempotent): chỉ kiểm độ dài.
    if (typeof value === 'string' && value === req.body.oldPassword) {
      if (value.length < MIN_LENGTH || Buffer.byteLength(value, 'utf8') > MAX_BYTES) throw new Error(MESSAGES.length);
      return true;
    }
    const user = req.user || {};
    return passwordPolicyRule(value, { phone: user.phone, email: user.email, fullName: user.fullName });
  }),
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
  // Chưa biết người dùng ở tầng này (token được giải ở service) nên chỉ kiểm độ dài + danh sách phổ biến;
  // phần "trùng SĐT/email/tên" do AuthService.resetPassword kiểm khi đã có user.
  body('newPassword').custom((value) => passwordPolicyRule(value, {})),
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
    .isEmail().withMessage('Email không hợp lệ.')
    .isLength({ max: 255 }).withMessage('Email tối đa 255 ký tự.'),
  body('password').custom((value, { req }) =>
    passwordPolicyRule(value, { phone: req.body.phone, email: req.body.email, fullName: req.body.fullName })),
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
