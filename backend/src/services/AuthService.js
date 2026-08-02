const bcrypt = require('bcrypt');
const { User, Role, Employee, Customer } = require('../models');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/jwt');

class AuthService {
  static async login({ email, password }) {
    const user = await User.findOne({
      where: { email },
      include: [{ model: Role, as: 'role' }]
    });

    if (!user) {
      const error = new Error('Email hoặc mật khẩu không chính xác.');
      error.statusCode = 401;
      throw error;
    }

    if (!user.isActive) {
      const error = new Error('Tài khoản đã bị vô hiệu hóa.');
      error.statusCode = 403;
      throw error;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      const error = new Error('Email hoặc mật khẩu không chính xác.');
      error.statusCode = 401;
      throw error;
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    user.refreshToken = refreshToken;
    await user.save();

    const userData = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      role: user.role ? user.role.name : null
    };

    return {
      user: userData,
      accessToken,
      refreshToken
    };
  }

  static async refreshAccessToken(refreshTokenInput) {
    if (!refreshTokenInput) {
      const error = new Error('Refresh Token không được để trống.');
      error.statusCode = 400;
      throw error;
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(refreshTokenInput);
    } catch (err) {
      const error = new Error('Refresh Token không hợp lệ hoặc đã hết hạn.');
      error.statusCode = 401;
      throw error;
    }

    const user = await User.findByPk(decoded.id, {
      include: [{ model: Role, as: 'role' }]
    });

    if (!user || user.refreshToken !== refreshTokenInput || !user.isActive) {
      const error = new Error('Refresh Token không hợp lệ hoặc tài khoản đã bị khóa.');
      error.statusCode = 401;
      throw error;
    }

    const newAccessToken = generateAccessToken(user);
    return { accessToken: newAccessToken };
  }

  static async getProfile(userId) {
    const user = await User.findByPk(userId, {
      attributes: { exclude: ['passwordHash', 'refreshToken'] },
      include: [
        { model: Role, as: 'role', attributes: ['id', 'name', 'description'] },
        { model: Employee, as: 'employee' },
        { model: Customer, as: 'customer' }
      ]
    });

    if (!user) {
      const error = new Error('Người dùng không tồn tại.');
      error.statusCode = 404;
      throw error;
    }

    return user;
  }

  static async changePassword(userId, { oldPassword, newPassword }) {
    const user = await User.findByPk(userId);
    if (!user) {
      const error = new Error('Người dùng không tồn tại.');
      error.statusCode = 404;
      throw error;
    }

    const isMatch = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isMatch) {
      const error = new Error('Mật khẩu hiện tại không chính xác.');
      error.statusCode = 400;
      throw error;
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();

    return { message: 'Đổi mật khẩu thành công.' };
  }
}

module.exports = AuthService;
