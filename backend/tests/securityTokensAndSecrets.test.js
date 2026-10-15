// Kế hoạch 32 (A4, A5b, A7, E1, E2): token sai loại / sai chữ ký bị từ chối, và các trường bí mật
// không bao giờ rời khỏi model hay errorHandler. Chạy không cần DB.
process.env.JWT_ACCESS_SECRET = 'security-tokens-access-secret-0123456789abcdef';
process.env.JWT_REFRESH_SECRET = 'security-tokens-refresh-secret-0123456789abcde';

const jwt = require('jsonwebtoken');
const request = require('supertest');
const express = require('express');
const { ValidationError, ValidationErrorItem } = require('sequelize');
const {
  generateAccessToken, generateRefreshToken, verifyAccessToken, verifyRefreshToken,
  generateResetToken, hashRefreshToken, refreshTokenMatches
} = require('../src/utils/jwt');
const errorHandler = require('../src/middleware/errorHandler');

const user = { id: 7, email: 'a@example.test', role: { name: 'customer' }, passwordHash: '$2b$10$abcdefghijklmnopqrstuv' };

describe('Token (A4)', () => {
  test('access token hợp lệ được nhận', () => {
    expect(verifyAccessToken(generateAccessToken(user)).id).toBe(7);
  });

  test('refresh token không dùng làm access token được, và ngược lại', () => {
    expect(() => verifyAccessToken(generateRefreshToken(user))).toThrow();
    expect(() => verifyRefreshToken(generateAccessToken(user))).toThrow();
  });

  test('token đặt lại mật khẩu không dùng làm access token được', () => {
    expect(() => verifyAccessToken(generateResetToken(user))).toThrow();
  });

  test('alg "none" bị từ chối', () => {
    const payload = Buffer.from(JSON.stringify({ id: 1, role: 'admin' })).toString('base64url');
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    expect(() => verifyAccessToken(`${header}.${payload}.`)).toThrow();
  });

  test('đổi chữ ký hoặc ký bằng secret khác bị từ chối', () => {
    const good = generateAccessToken(user);
    expect(() => verifyAccessToken(good.slice(0, -3) + (good.endsWith('AAA') ? 'BBB' : 'AAA'))).toThrow();
    expect(() => verifyAccessToken(jwt.sign({ id: 1, role: 'admin' }, 'secret-khac-0123456789abcdef0123456789'))).toThrow();
  });

  test('token hết hạn bị từ chối', () => {
    const expired = jwt.sign({ id: 7 }, process.env.JWT_ACCESS_SECRET, { expiresIn: -10 });
    expect(() => verifyAccessToken(expired)).toThrow(/expired/i);
  });

  test('access token do server phát có hạn dùng (không vô thời hạn)', () => {
    const decoded = jwt.decode(generateAccessToken(user));
    expect(decoded.exp).toBeDefined();
    expect(decoded.exp - decoded.iat).toBeLessThanOrEqual(60 * 60);
  });
});

describe('Refresh token lưu dạng hash (A5b)', () => {
  test('hash sha256 hex 64 ký tự, khác token gốc, so khớp đúng', () => {
    const token = generateRefreshToken(user);
    const stored = hashRefreshToken(token);
    expect(stored).toMatch(/^[a-f0-9]{64}$/);
    expect(stored).not.toBe(token);
    expect(refreshTokenMatches(token, stored)).toBe(true);
    expect(refreshTokenMatches(token + 'x', stored)).toBe(false);
    expect(refreshTokenMatches(token, token)).toBe(false); // bản thô cũ không còn được chấp nhận
  });
});

describe('Bí mật không rời khỏi hệ thống (E1, E2)', () => {
  test('model User mặc định không nạp passwordHash / refreshToken', () => {
    const { User } = require('../src/models');
    const excluded = User.options.defaultScope.attributes.exclude;
    expect(excluded).toEqual(expect.arrayContaining(['passwordHash', 'refreshToken', 'previousRefreshToken', 'previousRefreshExpiresAt']));
  });

  const appWithError = (err) => {
    const app = express();
    app.get('/boom', (req, res, next) => next(err));
    app.use(errorHandler);
    return app;
  };

  test('lỗi validation của Sequelize chỉ trả [{ field, message }], không có instance', async () => {
    const item = new ValidationErrorItem('Email sai', 'Validation error', 'email', 'x', { passwordHash: '$2b$secret', refreshToken: 'tok' });
    const res = await request(appWithError(new ValidationError('x', [item]))).get('/boom');
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|refreshToken|\$2b\$|instance/);
    expect(res.body.errors).toEqual([{ field: 'email', message: 'Email sai' }]);
  });

  test('lỗi không rõ ở production chỉ trả thông điệp chung, không stack hay SQL', async () => {
    const saved = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const err = new Error("Table 'x.users' doesn't exist: SELECT * FROM users WHERE password_hash = '$2b$..'");
      const res = await request(appWithError(err)).get('/boom');
      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Lỗi máy chủ nội bộ.');
      expect(JSON.stringify(res.body)).not.toMatch(/SELECT|password_hash|\sat\s/);
    } finally {
      process.env.NODE_ENV = saved;
    }
  });
});
