const AuthService = require('../services/AuthService');

class AuthController {
  static async login(req, res, next) {
    try {
      const { email, password } = req.body;
      const result = await AuthService.login({ email, password });

      res.status(200).json({
        success: true,
        data: result,
        message: 'Đăng nhập thành công.',
        errors: null
      });
    } catch (error) {
      next(error);
    }
  }

  static async refreshToken(req, res, next) {
    try {
      const { refreshToken } = req.body;
      const result = await AuthService.refreshAccessToken(refreshToken);

      res.status(200).json({
        success: true,
        data: result,
        message: 'Cấp lại Access Token thành công.',
        errors: null
      });
    } catch (error) {
      next(error);
    }
  }

  static async getProfile(req, res, next) {
    try {
      const user = await AuthService.getProfile(req.user.id);

      res.status(200).json({
        success: true,
        data: user,
        message: 'Lấy thông tin người dùng thành công.',
        errors: null
      });
    } catch (error) {
      next(error);
    }
  }

  static async logout(req, res, next) {
    try {
      await AuthService.logout(req.user.id);
      res.status(200).json({
        success: true,
        data: null,
        message: 'Đăng xuất thành công.',
        errors: null
      });
    } catch (error) {
      next(error);
    }
  }

  static async changePassword(req, res, next) {
    try {
      const { oldPassword, newPassword } = req.body;
      const result = await AuthService.changePassword(req.user.id, { oldPassword, newPassword });

      res.status(200).json({
        success: true,
        data: null,
        message: result.message,
        errors: null
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AuthController;
