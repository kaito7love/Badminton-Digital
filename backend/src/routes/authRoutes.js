const express = require('express');
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

// Đăng ký chỉ mở cho khách hàng tự tạo tài khoản. Tài khoản nhân viên vẫn phải
// do admin tạo qua /employees — không để ai tự nâng quyền cho mình ở đây.
router.post('/register', validateRegister, AuthController.register);
router.post('/login', validateLogin, AuthController.login);
router.post('/refresh-token', AuthController.refreshToken);
router.post('/forgot-password', validateForgotPassword, AuthController.forgotPassword);
router.post('/reset-password', validateResetPassword, AuthController.resetPassword);
router.get('/me', authMiddleware, AuthController.getProfile);
router.post('/logout', authMiddleware, AuthController.logout);
router.put('/change-password', authMiddleware, validateChangePassword, AuthController.changePassword);

module.exports = router;
