const bcrypt = require("bcrypt");
const { User, Role, Employee, Customer, Branch, sequelize } = require("../models");
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  hashRefreshToken,
  refreshTokenMatches,
  generateResetToken,
  decodeResetToken,
  verifyResetToken,
} = require("../utils/jwt");
const { sendPasswordResetEmail } = require("../utils/mailer");
const CustomerService = require("./CustomerService");
const { normalizePhone, looksLikePhone, isValidPhone } = require("../utils/phone");
const { assertNotLockedDemoAccount } = require("../utils/demoMode");
const { assertPassword } = require("../utils/passwordPolicy");

// Hash giả (cost 10 như hash thật, sinh một lần lúc nạp module) để đường "không có tài khoản" của `login`
// cũng tốn một lần bcrypt.compare — xem R5.
// R3: sau khi xoay, token CŨ vẫn được nhận access token mới trong chừng này mili giây — hai tab/luồng SSE
// refresh cùng lúc không đá nhau ra khỏi phiên (xem refreshAccessToken).
const REFRESH_GRACE_MS = 30 * 1000;

const TIMING_DUMMY_HASH = bcrypt.hashSync(require("crypto").randomBytes(16).toString("hex"), 10);

// Model User mặc định không nạp passwordHash/refreshToken (defaultScope). Chỉ
// các hàm ở file này thật sự cần so mật khẩu, so refresh token hay ký reset
// token mới gọi User.scope("withSecrets").

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

    const user = await User.scope("withSecrets").findOne({
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

    // Mật khẩu không phải chuỗi (object/mảng từ body JSON) coi như sai thay vì để bcrypt ném lỗi → 500.
    const candidate = typeof password === "string" ? password : "";

    // R5 (báo cáo 33): không có tài khoản thì vẫn tốn đúng MỘT lần bcrypt.compare — nếu trả lỗi ngay thì
    // thời gian phản hồi (≈6 ms so với ≈70 ms) cho biết số điện thoại/email nào đã đăng ký.
    if (!user) {
      await bcrypt.compare(candidate, TIMING_DUMMY_HASH);
      throw rejectCredentials();
    }

    const isMatch = await bcrypt.compare(candidate, user.passwordHash);
    if (!isMatch) throw rejectCredentials();

    // R6: chỉ báo "bị vô hiệu hóa" khi người gọi đã chứng minh biết mật khẩu — trước đó, ai cũng dò được
    // tài khoản nào đang bị khoá chỉ bằng mật khẩu bất kỳ.
    if (!user.isActive) {
      const error = new Error("Tài khoản đã bị vô hiệu hóa.");
      error.statusCode = 403;
      throw error;
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Update trực tiếp, không qua `user.save()`: model có `version: true`
    // (optimistic locking), nên hai lần đăng nhập cùng tài khoản chạy song
    // song (2 tab, 2 thiết bị) sẽ khiến request thứ hai ném OptimisticLockError
    // không được bắt -> lọt ra HTTP 500. Không có lý do nghiệp vụ để coi đăng
    // nhập đồng thời là xung đột cần chặn — "ai lưu sau thắng" là đúng cho
    // refresh token.
    await User.update(
      { refreshToken: hashRefreshToken(refreshToken), previousRefreshToken: null, previousRefreshExpiresAt: null },
      { where: { id: user.id } }
    );

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

    const user = await User.scope("withSecrets").findByPk(decoded.id, {
      include: [{ model: Role, as: "role" }],
    });

    const reject = () => {
      const error = new Error("Refresh Token không hợp lệ hoặc tài khoản đã bị khóa.");
      error.statusCode = 401;
      return error;
    };
    if (!user || !user.isActive) throw reject();

    // R3 — xoay vòng: mỗi lần refresh thành công cấp refresh token MỚI, token cũ chuyển sang `previous_*`.
    if (refreshTokenMatches(refreshTokenInput, user.refreshToken)) {
      const newRefreshToken = generateRefreshToken(user);
      // So-và-đổi (compare-and-swap) trên chính hash vừa đọc: hai request cùng token chỉ MỘT bên xoay được.
      const [rotated] = await User.update(
        {
          refreshToken: hashRefreshToken(newRefreshToken),
          previousRefreshToken: user.refreshToken,
          previousRefreshExpiresAt: new Date(Date.now() + REFRESH_GRACE_MS),
        },
        { where: { id: user.id, refreshToken: user.refreshToken } }
      );
      if (rotated === 1) {
        return { accessToken: generateAccessToken(user), refreshToken: newRefreshToken };
      }
      // Thua cuộc đua: một request khác vừa xoay. Token ta đưa giờ là `previous` → xét ân hạn bên dưới.
      const fresh = await User.scope("withSecrets").findByPk(decoded.id, { include: [{ model: Role, as: "role" }] });
      if (!fresh || !fresh.isActive) throw reject();
      return AuthService.acceptPreviousRefreshToken(refreshTokenInput, fresh, reject);
    }

    return AuthService.acceptPreviousRefreshToken(refreshTokenInput, user, reject);
  }

  /**
   * Ân hạn: token ngay trước lần xoay gần nhất còn được đổi lấy access token mới trong REFRESH_GRACE_MS. Chỉ
   * cấp access token, KHÔNG xoay tiếp và KHÔNG trả refresh token — bên thắng cuộc đã giữ token mới trong
   * localStorage dùng chung của trình duyệt; quá ân hạn hoặc không khớp thì 401.
   */
  static acceptPreviousRefreshToken(refreshTokenInput, user, reject) {
    const withinGrace = user.previousRefreshExpiresAt && new Date(user.previousRefreshExpiresAt).getTime() > Date.now();
    if (withinGrace && refreshTokenMatches(refreshTokenInput, user.previousRefreshToken)) {
      return { accessToken: generateAccessToken(user) };
    }
    throw reject();
  }

  static async getProfile(userId) {
    const user = await User.findByPk(userId, {
      attributes: { exclude: ["passwordHash", "refreshToken", "previousRefreshToken", "previousRefreshExpiresAt", "tokenVersion"] },
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

    // Hồ sơ của tài khoản đăng ký trùng số với một hồ sơ tại quầy chưa gộp thì
    // chưa mang số/email — hiện của tài khoản thay vào (xem register).
    CustomerService.withAccountContact(user.customer, user);

    return user;
  }

  static async logout(userId) {
    // R4: tăng token_version để access token đang lưu ở máy khách cũng mất hiệu lực ngay (không chờ hết 15 phút);
    // R3: xoá cả `previous_*` — logout xong thì token cũ không còn ân hạn.
    await User.update(
      {
        refreshToken: null,
        previousRefreshToken: null,
        previousRefreshExpiresAt: null,
        tokenVersion: sequelize.literal('token_version + 1'),
      },
      { where: { id: userId } }
    );
    return { message: 'Đăng xuất thành công.' };
  }

  static async changePassword(userId, { oldPassword, newPassword }) {
    // Kèm role để access token mới mang đúng `role` như khi đăng nhập.
    const user = await User.scope("withSecrets").findByPk(userId, {
      include: [{ model: Role, as: "role" }],
    });
    if (!user) {
      const error = new Error("Người dùng không tồn tại.");
      error.statusCode = 404;
      throw error;
    }
    // Bản demo công khai: tài khoản in trên trang đăng nhập dùng chung cho mọi
    // người xem — đổi được mật khẩu là khoá người xem sau ra ngoài.
    assertNotLockedDemoAccount(user);

    const isMatch = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isMatch) {
      const error = new Error("Mật khẩu hiện tại không chính xác.");
      error.statusCode = 400;
      throw error;
    }

    // R2: lớp thứ hai sau validator (đã biết user nên kiểm được "trùng SĐT/email/tên"). Đổi sang chính mật khẩu
    // hiện tại không thêm rủi ro mới nên không kiểm lại.
    if (newPassword !== oldPassword) {
      assertPassword(newPassword, { phone: user.phone, email: user.email, fullName: user.fullName });
    }

    // Đổi mật khẩu phải thu hồi mọi phiên cũ (R1, báo cáo 33): mỗi user chỉ có
    // MỘT cột refreshToken nên ghi refresh token mới vào đây là vô hiệu refresh
    // token của mọi thiết bị khác. Thiết bị đang đổi nhận cặp token mới để giữ
    // phiên (giao diện hứa "vẫn giữ nguyên phiên đăng nhập này").
    //
    // Update trực tiếp, không qua `user.save()`: cùng lý do với `login` — model có
    // `version: true`, save() ném OptimisticLockError (→ 500) khi chạm một lần
    // đăng nhập/refresh đồng thời.
    //
    // R4: đồng thời tăng token_version — access token của các thiết bị khác (còn hạn ≤ 15 phút) mất hiệu lực
    // NGAY; thiết bị đang đổi nhận access token mang version mới nên không bị ảnh hưởng.
    const nextVersion = (Number(user.tokenVersion) || 0) + 1;
    const tokenSubject = { id: user.id, email: user.email, role: user.role, tokenVersion: nextVersion };
    const accessToken = generateAccessToken(tokenSubject);
    const refreshToken = generateRefreshToken(user);
    await User.update(
      {
        passwordHash: await bcrypt.hash(newPassword, 10),
        refreshToken: hashRefreshToken(refreshToken),
        previousRefreshToken: null,
        previousRefreshExpiresAt: null,
        tokenVersion: nextVersion,
      },
      { where: { id: user.id } }
    );

    return { message: "Đổi mật khẩu thành công.", accessToken, refreshToken };
  }

  static async forgotPassword(email) {
    // Trả cùng một thông điệp dù email có tồn tại hay không, tránh lộ danh sách email
    const genericMessage =
      "Nếu email tồn tại trong hệ thống, link đặt lại mật khẩu đã được gửi tới hộp thư của bạn.";

    // Cần passwordHash: reset token được ký bằng secret gắn với mật khẩu hiện tại.
    const user = await User.scope("withSecrets").findOne({ where: { email } });
    if (!user || !user.isActive) {
      return { message: genericMessage };
    }

    const token = generateResetToken(user);
    // RENDER_EXTERNAL_URL do Render tự đặt — bản demo không phải khai FRONTEND_URL.
    const baseUrl = (process.env.FRONTEND_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:5173").replace(/\/+$/, "");
    const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;

    // Lỗi gửi mail KHÔNG được vọt ra ngoài thành 5xx.
    //
    // Email không tồn tại thì hàm này đã return 200 ở trên; nếu email có thật
    // mà khâu gửi mail ném lỗi (chưa cấu hình SMTP, hoặc nhà cung cấp mail
    // chập chờn) thì client nhận 500. Chênh lệch 500-với-200 đó đủ để dò ra
    // email nào đã đăng ký — đúng thứ mà `genericMessage` ở trên được dựng ra
    // để giấu. Nuốt lỗi tại đây và vẫn trả cùng một thông điệp, sự cố gửi mail
    // ghi vào log máy chủ cho người vận hành.
    try {
      await sendPasswordResetEmail({
        to: user.email,
        fullName: user.fullName,
        resetUrl,
      });
    } catch (err) {
      console.error(
        `[forgotPassword] Không gửi được email đặt lại mật khẩu cho userId=${user.id}:`,
        err.message
      );
    }

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

    const user = await User.scope("withSecrets").findByPk(decoded.id);
    if (!user || !user.isActive) {
      throw invalidTokenError();
    }

    try {
      verifyResetToken(token, user);
    } catch (err) {
      throw invalidTokenError();
    }
    assertNotLockedDemoAccount(user);
    // R2: validator chưa biết user (token được giải ở đây) nên phần "trùng SĐT/email/tên" kiểm tại đây.
    assertPassword(newPassword, { phone: user.phone, email: user.email, fullName: user.fullName });

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.refreshToken = null; // đăng xuất mọi phiên đang mở
    user.previousRefreshToken = null; // R3: không còn ân hạn cho token cũ
    user.previousRefreshExpiresAt = null;
    user.tokenVersion = (Number(user.tokenVersion) || 0) + 1; // R4: access token đang lưu mất hiệu lực ngay
    await user.save();

    return { message: "Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại." };
  }

  /**
   * Khách tự đăng ký bằng số điện thoại.
   *
   * Tài khoản luôn nhận một hồ sơ khách hàng mới. Số đã có hồ sơ tại quầy thì
   * hồ sơ đó KHÔNG được gắn tự động — lý do ở ngay chỗ tạo hồ sơ bên dưới.
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

      // Không tự gắn hồ sơ tại quầy cùng số vào tài khoản mới: hệ thống chưa
      // xác minh được người đăng ký có đúng là chủ số không. Gắn luôn là trao
      // lịch sử chơi, tổng chi tiêu và mọi buổi quầy nhập số đó về sau cho bất
      // kỳ ai biết số. Hồ sơ cũ để nguyên; nhân viên xác minh rồi gộp tại quầy
      // (CustomerService.mergeIntoAccount).
      //
      // customers.phone là unique, nên hồ sơ của tài khoản chỉ mang số khi chưa
      // hồ sơ đang hoạt động nào giữ số đó. Số chỉ còn nằm trên hồ sơ đã xoá thì
      // nhả ra cho tài khoản mới (DATA-01). Response giống hệt nhau trong mọi
      // trường hợp — đăng ký không trả lời được câu "số này từng ra quầy chưa".
      const phoneHeld = await Customer.findOne({
        where: { phone: normalizedPhone },
        transaction,
      });
      if (!phoneHeld) {
        await CustomerService.releaseDeletedPhoneHolder(normalizedPhone, { transaction });
      }

      const customer = await Customer.create(
        {
          userId: user.id,
          fullName: String(fullName).trim(),
          phone: phoneHeld ? null : normalizedPhone,
          email: normalizedEmail,
        },
        { transaction }
      );

      await transaction.commit();

      const accessToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);
      await User.update(
        { refreshToken: hashRefreshToken(refreshToken) },
        { where: { id: user.id } }
      );

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
