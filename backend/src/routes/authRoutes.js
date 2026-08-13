const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');
const { validateLogin, validateChangePassword } = require('../validations/authValidation');

router.post('/login', validateLogin, AuthController.login);
router.post('/refresh-token', AuthController.refreshToken);
router.get('/me', authMiddleware, AuthController.getProfile);
router.post('/logout', authMiddleware, AuthController.logout);
router.put('/change-password', authMiddleware, validateChangePassword, AuthController.changePassword);

module.exports = router;
