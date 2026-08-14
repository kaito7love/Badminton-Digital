const bcrypt = require("bcrypt");
const { User, Role, Employee, Customer } = require("../models");
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  generateResetToken,
  decodeResetToken,
  verifyResetToken,
} = require("../utils/jwt");
const { sendPasswordResetEmail } = require("../utils/mailer");

class AuthService {
  static async login({ email, password }) {
    const user = await User.findOne({
      where: { email },
      include: [{ model: Role, as: "role" }],
    });

    if (!user) {
      const error = new Error("Email hoặc mật khẩu không chính xác.");
      error.statusCode = 401;
      throw error;
    }

    if (!user.isActive) {
      const error = new Error("Tài khoản đã bị vô hiệu hóa.");
      error.statusCode = 403;
      throw error;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      const error = new Error("Email hoặc mật khẩu không chính xác.");
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
      role: user.role ? user.role.name : null,
    };

    return {
      user: userData,
      accessToken,
      refreshToken,
    };
  }

  static async refreshAccessToken(refreshTokenInput) {
    if (!refreshTokenInput) {
      const error = new Error("Refresh Token không được để trống.");
      error.statusCode = 400;
      throw error;
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(refreshTokenInput);
    } catch (err) {
      const error = new Error("Refresh Token không hợp lệ hoặc đã hết hạn.");
      error.statusCode = 401;
      throw error;
    }

    const user = await User.findByPk(decoded.id, {
      include: [{ model: Role, as: "role" }],
    });

    if (!user || user.refreshToken !== refreshTokenInput || !user.isActive) {
      const error = new Error(
        "Refresh Token không hợp lệ hoặc tài khoản đã bị khóa.",
      );
      error.statusCode = 401;
      throw error;
    }

    const newAccessToken = generateAccessToken(user);
    return { accessToken: newAccessToken };
  }

  static async getProfile(userId) {
    const user = await User.findByPk(userId, {
      attributes: { exclude: ["passwordHash", "refreshToken"] },
      include: [
        { model: Role, as: "role", attributes: ["id", "name", "description"] },
        { model: Employee, as: "employee" },
        { model: Customer, as: "customer" },
      ],
    });

    if (!user) {
      const error = new Error("Người dùng không tồn tại.");
      error.statusCode = 404;
      throw error;
    }

    return user;
  }

  static async logout(userId) {
    const user = await User.findByPk(userId);
    if (user) {
      user.refreshToken = null;
      await user.save();
    }
    return { message: 'Đăng xuất thành công.' };
  }

  static async changePassword(userId, { oldPassword, newPassword }) {
    const user = await User.findByPk(userId);
    if (!user) {
      const error = new Error("Người dùng không tồn tại.");
      error.statusCode = 404;
      throw error;
    }

    const isMatch = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isMatch) {
      const error = new Error("Mật khẩu hiện tại không chính xác.");
      error.statusCode = 400;
      throw error;
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();

    return { message: "Đổi mật khẩu thành công." };
  }

  static async forgotPassword(email) {
    // Trả cùng một thông điệp dù email có tồn tại hay không, tránh lộ danh sách email
    const genericMessage =
      "Nếu email tồn tại trong hệ thống, link đặt lại mật khẩu đã được gửi tới hộp thư của bạn.";

    const user = await User.findOne({ where: { email } });
    if (!user || !user.isActive) {
      return { message: genericMessage };
    }

    const token = generateResetToken(user);
    const baseUrl = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/+$/, "");
    const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;

    await sendPasswordResetEmail({
      to: user.email,
      fullName: user.fullName,
      resetUrl,
    });

    return { message: genericMessage };
  }

  static async resetPassword({ token, newPassword }) {
    const invalidTokenError = () => {
      const error = new Error("Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.");
      error.statusCode = 400;
      return error;
    };

    const decoded = decodeResetToken(token);
    if (!decoded || !decoded.id || decoded.type !== "password_reset") {
      throw invalidTokenError();
    }

    const user = await User.findByPk(decoded.id);
    if (!user || !user.isActive) {
      throw invalidTokenError();
    }

    try {
      verifyResetToken(token, user);
    } catch (err) {
      throw invalidTokenError();
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.refreshToken = null; // đăng xuất mọi phiên đang mở
    await user.save();

    return { message: "Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại." };
  }
}

module.exports = AuthService;
