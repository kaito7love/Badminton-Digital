const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// Không có giá trị dự phòng hardcode — thiếu hoặc yếu là lỗi cấu hình
// nghiêm trọng (ai biết chuỗi mặc định có thể tự ký token admin giả), nên
// server phải dừng ngay lúc khởi động thay vì chạy ngầm với secret yếu.
const REQUIRED_SECRET_MIN_LENGTH = 32;

// Chuỗi mẫu từng nằm trong `.env.example` và `backend/README.md`. Ai đọc repo
// cũng biết, nên dài bao nhiêu cũng không được coi là secret — copy nguyên
// `.env.example` lên server là ai cũng ký được token admin.
const KNOWN_PLACEHOLDER_SECRETS = new Set([
  'thay_bang_chuoi_ngau_nhien_rieng_cho_access_token_32ky_tu',
  'thay_bang_chuoi_ngau_nhien_rieng_cho_refresh_token_32ky_tu',
  'change_me',
  'change_me_too'
]);

/** Danh sách lỗi cấu hình secret, rỗng là hợp lệ. Hàm thuần để test không phải nạp lại module. */
const findJwtSecretProblems = (env) => {
  const problems = [];
  for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    const value = env[key];
    if (!value || value.length < REQUIRED_SECRET_MIN_LENGTH) {
      problems.push(`Thiếu hoặc ${key} quá ngắn (cần tối thiểu ${REQUIRED_SECRET_MIN_LENGTH} ký tự).`);
    } else if (KNOWN_PLACEHOLDER_SECRETS.has(value)) {
      problems.push(`${key} vẫn là chuỗi mẫu công khai trong repo — sinh chuỗi ngẫu nhiên mới.`);
    }
  }
  // Dùng chung một secret thì refresh token (sống 7 ngày) cũng qua được bước
  // kiểm access token.
  if (env.JWT_ACCESS_SECRET && env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    problems.push('JWT_ACCESS_SECRET và JWT_REFRESH_SECRET phải khác nhau.');
  }
  return problems;
};

const secretProblems = findJwtSecretProblems(process.env);
if (secretProblems.length) {
  throw new Error(
    `Cấu hình JWT không an toàn — kiểm tra lại file .env trước khi khởi động server:\n- ${secretProblems.join('\n- ')}\n` +
    `Sinh secret: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
  );
}

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const JWT_ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES || '15m';
const JWT_REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES || '7d';
const JWT_RESET_EXPIRES = process.env.JWT_RESET_EXPIRES || '15m';

// Secret của reset token gắn với passwordHash hiện tại: đổi mật khẩu xong là
// mọi token cũ tự hết hiệu lực, nên link reset chỉ dùng được đúng một lần.
const resetTokenSecret = (user) => {
  // User nạp theo default scope không có passwordHash. Ký tiếp với "undefined"
  // thì mọi link đặt lại mật khẩu đều hỏng âm thầm — báo lỗi ngay thay vào đó.
  if (!user.passwordHash) {
    throw new Error('resetTokenSecret: user thiếu passwordHash — nạp bằng User.scope("withSecrets").');
  }
  return `${JWT_ACCESS_SECRET}.${user.passwordHash}`;
};

const generateAccessToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role ? user.role.name : undefined
    },
    JWT_ACCESS_SECRET,
    { expiresIn: JWT_ACCESS_EXPIRES }
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    {
      id: user.id
    },
    JWT_REFRESH_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRES }
  );
};

const verifyAccessToken = (token) => {
  return jwt.verify(token, JWT_ACCESS_SECRET);
};

const verifyRefreshToken = (token) => {
  return jwt.verify(token, JWT_REFRESH_SECRET);
};

// DB chỉ giữ sha256 của refresh token: bản dump DB hay backup lọt ra ngoài không
// còn chứa token dùng được ngay. Token đủ ngẫu nhiên (có chữ ký HMAC) nên sha256
// không cần salt như mật khẩu.
const hashRefreshToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

const refreshTokenMatches = (token, storedHash) => {
  if (!token || !storedHash) return false;
  const expected = Buffer.from(hashRefreshToken(token), 'hex');
  const stored = Buffer.from(String(storedHash), 'hex');
  // Token thô lưu từ trước khi đổi sang hash không phải chuỗi hex 64 ký tự →
  // độ dài lệch → không khớp, người dùng chỉ phải đăng nhập lại một lần.
  return expected.length === stored.length && crypto.timingSafeEqual(expected, stored);
};

const generateResetToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      type: 'password_reset'
    },
    resetTokenSecret(user),
    { expiresIn: JWT_RESET_EXPIRES }
  );
};

// Đọc payload chưa xác thực để biết token thuộc user nào (cần user mới dựng được secret)
const decodeResetToken = (token) => {
  return jwt.decode(token);
};

const verifyResetToken = (token, user) => {
  return jwt.verify(token, resetTokenSecret(user));
};

module.exports = {
  findJwtSecretProblems,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashRefreshToken,
  refreshTokenMatches,
  generateResetToken,
  decodeResetToken,
  verifyResetToken
};
