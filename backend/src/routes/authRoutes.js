const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const AuthController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');
const {
  validateLogin,
  validateRegister,
  validateChangePassword,
  validateForgotPassword,
  validateResetPassword
} = require('../validations/authValidation');

// Tạo response chuẩn dùng chung cho mọi limiter — chỉ khác windowMs/limit.
const makeLimiter = (windowMs, limit) => rateLimit({
  windowMs,
  limit,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    data: null,
    message: 'Quá nhiều yêu cầu, vui lòng thử lại sau ít phút.',
    errors: null
  }
});

// Chống dò mật khẩu/spam reset: giới hạn theo IP, không giới hạn theo tài
// khoản (tránh bị lợi dụng để tự khoá tài khoản người khác — "denial of
// service" ngược lại chính người dùng thật).
const authLimiter = makeLimiter(15 * 60 * 1000, 10);

// Chống spam tạo tài khoản hàng loạt — ngưỡng thấp hơn vì tần suất đăng ký
// thật của 1 IP trong 1 giờ gần như không bao giờ vượt quá 5.
const registerLimiter = makeLimiter(60 * 60 * 1000, 5);

// Refresh token gọi lại nhiều lần là bình thường (mỗi tab/thiết bị tự làm
// mới access token ngầm mỗi ~15 phút), nên ngưỡng cao hơn hẳn — chỉ chặn
// khi có dấu hiệu lạm dụng thật sự (dò refresh token, vòng lặp lỗi client).
const refreshLimiter = makeLimiter(15 * 60 * 1000, 30);

// Đăng ký chỉ mở cho khách hàng tự tạo tài khoản. Tài khoản nhân viên vẫn phải
// do admin tạo qua /employees — không để ai tự nâng quyền cho mình ở đây.
router.post('/register', registerLimiter, validateRegister, AuthController.register);
router.post('/login', authLimiter, validateLogin, AuthController.login);
router.post('/refresh-token', refreshLimiter, AuthController.refreshToken);
router.post('/forgot-password', authLimiter, validateForgotPassword, AuthController.forgotPassword);
router.post('/reset-password', authLimiter, validateResetPassword, AuthController.resetPassword);
router.get('/me', authMiddleware, AuthController.getProfile);
router.post('/logout', authMiddleware, AuthController.logout);
router.put('/change-password', authMiddleware, validateChangePassword, AuthController.changePassword);

module.exports = router;
