const bcrypt = require("bcrypt");
const { User, Role, Employee, Customer, Branch, sequelize } = require("../models");
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  generateResetToken,
  decodeResetToken,
  verifyResetToken,
} = require("../utils/jwt");
const { sendPasswordResetEmail } = require("../utils/mailer");
const { normalizePhone, looksLikePhone, isValidPhone } = require("../utils/phone");

class AuthService {
  /**
   * `identifier` nhận cả số điện thoại lẫn email trong cùng một ô. Khách đặt
   * sân online hầu như chỉ có số điện thoại, còn nhân viên đã quen dùng email —
   * bắt họ chọn tab trước khi gõ là thêm một bước không cần thiết.
   *
   * Tham số `email` vẫn được chấp nhận để không phá các chỗ gọi cũ.
   */
  static async login({ identifier, email, password }) {
    const rawIdentity = String(identifier || email || "").trim();
    if (!rawIdentity) {
      const error = new Error("Vui lòng nhập số điện thoại hoặc email.");
      error.statusCode = 400;
      throw error;
    }

    const where = looksLikePhone(rawIdentity)
      ? { phone: normalizePhone(rawIdentity) }
      : { email: rawIdentity.toLowerCase() };

    const user = await User.findOne({
      where,
      include: [{ model: Role, as: "role" }],
    });

    // Thông báo giống hệt nhau cho "không có tài khoản" và "sai mật khẩu":
    // phân biệt hai trường hợp là chỉ đường cho người dò xem số nào đã đăng ký.
    const rejectCredentials = () => {
      const error = new Error(
        "Số điện thoại/email hoặc mật khẩu không chính xác."
      );
      error.statusCode = 401;
      return error;
    };

    if (!user) throw rejectCredentials();

    if (!user.isActive) {
      const error = new Error("Tài khoản đã bị vô hiệu hóa.");
      error.statusCode = 403;
      throw error;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) throw rejectCredentials();

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Update trực tiếp, không qua `user.save()`: model có `version: true`
    // (optimistic locking), nên hai lần đăng nhập cùng tài khoản chạy song
    // song (2 tab, 2 thiết bị) sẽ khiến request thứ hai ném OptimisticLockError
    // không được bắt -> lọt ra HTTP 500. Không có lý do nghiệp vụ để coi đăng
    // nhập đồng thời là xung đột cần chặn — "ai lưu sau thắng" là đúng cho
    // refresh token.
    await User.update({ refreshToken }, { where: { id: user.id } });
    user.refreshToken = refreshToken;

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
        {
          model: Employee,
          as: "employee",
          include: [{ model: Branch, as: "branch", attributes: ["id", "name", "code"] }],
        },
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

  /**
   * Khách tự đăng ký bằng số điện thoại.
   *
   * Điểm mấu chốt: rất nhiều khách đã có hồ sơ trong hệ thống từ những lần ra
   * chơi tại quầy. Nếu đăng ký mà tạo hồ sơ mới thì lịch sử chơi và mức chi
   * tiêu tích luỹ của họ bị bỏ lại ở hồ sơ cũ. Nên ở đây tìm theo SĐT trước:
   * có hồ sơ chưa gắn tài khoản nào thì gắn vào, chỉ khi không có mới tạo mới.
   */
  static async register({ fullName, phone, email = null, password }) {
    const normalizedPhone = normalizePhone(phone);
    if (!isValidPhone(normalizedPhone)) {
      const error = new Error("Số điện thoại không hợp lệ.");
      error.statusCode = 400;
      throw error;
    }

    const normalizedEmail = email ? String(email).trim().toLowerCase() : null;

    const transaction = await sequelize.transaction();
    try {
      const takenPhone = await User.findOne({
        where: { phone: normalizedPhone },
        transaction,
      });
      if (takenPhone) {
        const error = new Error(
          "Số điện thoại này đã có tài khoản. Bạn hãy đăng nhập hoặc dùng chức năng quên mật khẩu."
        );
        error.statusCode = 409;
        throw error;
      }

      if (normalizedEmail) {
        const takenEmail = await User.findOne({
          where: { email: normalizedEmail },
          transaction,
        });
        if (takenEmail) {
          const error = new Error("Email này đã được dùng cho tài khoản khác.");
          error.statusCode = 409;
          throw error;
        }
      }

      const customerRole = await Role.findOne({
        where: { name: "customer" },
        transaction,
      });
      if (!customerRole) {
        const error = new Error("Hệ thống chưa cấu hình vai trò khách hàng.");
        error.statusCode = 500;
        throw error;
      }

      const user = await User.create(
        {
          roleId: customerRole.id,
          email: normalizedEmail,
          phone: normalizedPhone,
          passwordHash: await bcrypt.hash(password, 10),
          fullName: String(fullName).trim(),
          isActive: true,
        },
        { transaction }
      );

      // Gộp với hồ sơ cũ nếu khách từng ra chơi tại quầy — ở bất kỳ chi nhánh
      // nào, vì hồ sơ khách hàng giờ dùng chung toàn chuỗi.
      const existing = await Customer.findOne({
        where: { phone: normalizedPhone, userId: null },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      let customer;
      let mergedHistory = false;
      if (existing) {
        customer = await existing.update(
          { userId: user.id, fullName: String(fullName).trim() },
          { transaction }
        );
        mergedHistory = true;
      } else {
        customer = await Customer.create(
          {
            userId: user.id,
            fullName: String(fullName).trim(),
            phone: normalizedPhone,
            email: normalizedEmail,
          },
          { transaction }
        );
      }

      await transaction.commit();

      const accessToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);
      user.refreshToken = refreshToken;
      await user.save();

      return {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          phone: user.phone,
          avatarUrl: user.avatarUrl,
          role: customerRole.name,
        },
        customerId: customer.id,
        mergedHistory,
        accessToken,
        refreshToken,
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}

module.exports = AuthService;
