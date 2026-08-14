const jwt = require('jsonwebtoken');

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'badminton_jwt_access_secret_key_2026_super_secure';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'badminton_jwt_refresh_secret_key_2026_super_secure';
const JWT_ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES || '15m';
const JWT_REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES || '7d';
const JWT_RESET_EXPIRES = process.env.JWT_RESET_EXPIRES || '15m';

// Secret của reset token gắn với passwordHash hiện tại: đổi mật khẩu xong là
// mọi token cũ tự hết hiệu lực, nên link reset chỉ dùng được đúng một lần.
const resetTokenSecret = (user) => `${JWT_ACCESS_SECRET}.${user.passwordHash}`;

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
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  generateResetToken,
  decodeResetToken,
  verifyResetToken
};
