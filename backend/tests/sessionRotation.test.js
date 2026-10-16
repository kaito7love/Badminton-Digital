// R3 + R4 (báo cáo 33; kế hoạch 37 nhóm C): xoay vòng refresh token có ân hạn và thu hồi access token.
// Không cần DB: User.scope(...).findByPk / User.update được thay bằng bản giả.
const crypto = require('crypto');
const express = require('express');
const request = require('supertest');

process.env.JWT_ACCESS_SECRET = crypto.randomBytes(48).toString('hex');
process.env.JWT_REFRESH_SECRET = crypto.randomBytes(48).toString('hex');

const jwt = require('jsonwebtoken');
const { User, sequelize } = require('../src/models');
const AuthService = require('../src/services/AuthService');
const authMiddleware = require('../src/middleware/authMiddleware');
const {
  generateAccessToken, generateRefreshToken, verifyAccessToken, hashRefreshToken
} = require('../src/utils/jwt');

const base = (overrides = {}) => ({
  id: 7, email: 'a@example.test', isActive: true, tokenVersion: 0,
  role: { name: 'customer' }, refreshToken: null, previousRefreshToken: null, previousRefreshExpiresAt: null,
  ...overrides
});

describe('jwt — claim mới', () => {
  test('refresh token có jti: hai token ký trong CÙNG giây khác nhau', () => {
    const a = generateRefreshToken({ id: 1 });
    const b = generateRefreshToken({ id: 1 });
    expect(a).not.toBe(b);
    expect(jwt.decode(a).jti).toBeTruthy();
    expect(jwt.decode(a).jti).not.toBe(jwt.decode(b).jti);
  });

  test('access token mang tv = tokenVersion của user (mặc định 0)', () => {
    expect(verifyAccessToken(generateAccessToken(base({ tokenVersion: 3 }))).tv).toBe(3);
    expect(verifyAccessToken(generateAccessToken({ id: 1, email: 'x' })).tv).toBe(0);
  });
});

describe('AuthService.refreshAccessToken — xoay vòng và ân hạn', () => {
  let updateSpy;
  let findSpy;

  // `users` là chuỗi trả lần lượt cho các lần findByPk
  const stubUsers = (...users) => {
    findSpy = jest.fn();
    users.forEach((u) => findSpy.mockResolvedValueOnce(u));
    jest.spyOn(User, 'scope').mockReturnValue({ findByPk: findSpy });
  };

  beforeEach(() => { updateSpy = jest.spyOn(User, 'update').mockResolvedValue([1]); });
  afterEach(() => jest.restoreAllMocks());

  test('token hiện tại → cấp cặp MỚI, ghi hash mới + chuyển hash cũ sang previous với hạn ~30 giây (so-và-đổi)', async () => {
    const t0 = generateRefreshToken({ id: 7 });
    const user = base({ refreshToken: hashRefreshToken(t0) });
    stubUsers(user);

    const before = Date.now();
    const result = await AuthService.refreshAccessToken(t0);

    expect(typeof result.accessToken).toBe('string');
    expect(typeof result.refreshToken).toBe('string');
    expect(result.refreshToken).not.toBe(t0);

    const [values, options] = updateSpy.mock.calls[0];
    expect(values.refreshToken).toBe(hashRefreshToken(result.refreshToken));
    expect(values.previousRefreshToken).toBe(hashRefreshToken(t0));
    const graceMs = new Date(values.previousRefreshExpiresAt).getTime() - before;
    expect(graceMs).toBeGreaterThan(25 * 1000);
    expect(graceMs).toBeLessThanOrEqual(31 * 1000);
    // compare-and-swap: chỉ ghi khi hash trong DB vẫn là hash vừa đọc
    expect(options.where).toEqual({ id: 7, refreshToken: hashRefreshToken(t0) });
  });

  test('token cũ trong ân hạn → CHỈ access token, không xoay, không trả refresh token', async () => {
    const tOld = generateRefreshToken({ id: 7 });
    const tNow = generateRefreshToken({ id: 7 });
    stubUsers(base({
      refreshToken: hashRefreshToken(tNow),
      previousRefreshToken: hashRefreshToken(tOld),
      previousRefreshExpiresAt: new Date(Date.now() + 10 * 1000)
    }));

    const result = await AuthService.refreshAccessToken(tOld);

    expect(typeof result.accessToken).toBe('string');
    expect(result.refreshToken).toBeUndefined();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  test('token cũ QUÁ ân hạn → 401', async () => {
    const tOld = generateRefreshToken({ id: 7 });
    stubUsers(base({
      refreshToken: hashRefreshToken(generateRefreshToken({ id: 7 })),
      previousRefreshToken: hashRefreshToken(tOld),
      previousRefreshExpiresAt: new Date(Date.now() - 1000)
    }));
    await expect(AuthService.refreshAccessToken(tOld)).rejects.toMatchObject({ statusCode: 401 });
    expect(updateSpy).not.toHaveBeenCalled();
  });

  test('token lạ (không phải hiện tại cũng không phải previous) → 401', async () => {
    const stranger = generateRefreshToken({ id: 7 });
    stubUsers(base({
      refreshToken: hashRefreshToken(generateRefreshToken({ id: 7 })),
      previousRefreshToken: hashRefreshToken(generateRefreshToken({ id: 7 })),
      previousRefreshExpiresAt: new Date(Date.now() + 10 * 1000)
    }));
    await expect(AuthService.refreshAccessToken(stranger)).rejects.toMatchObject({ statusCode: 401 });
  });

  test('thua cuộc đua so-và-đổi (update ảnh hưởng 0 dòng) → rơi về ân hạn thay vì 500/401', async () => {
    const t0 = generateRefreshToken({ id: 7 });
    const winnerToken = generateRefreshToken({ id: 7 });
    // lần đọc 1: token ta đưa còn là hiện tại; lần đọc 2 (sau khi thua): đã bị đối thủ xoay → t0 thành previous
    stubUsers(
      base({ refreshToken: hashRefreshToken(t0) }),
      base({ refreshToken: hashRefreshToken(winnerToken), previousRefreshToken: hashRefreshToken(t0), previousRefreshExpiresAt: new Date(Date.now() + 20 * 1000) })
    );
    updateSpy.mockResolvedValueOnce([0]);

    const result = await AuthService.refreshAccessToken(t0);

    expect(typeof result.accessToken).toBe('string');
    expect(result.refreshToken).toBeUndefined();
  });

  test('tài khoản bị khoá → 401 ngay cả khi token đúng', async () => {
    const t0 = generateRefreshToken({ id: 7 });
    stubUsers(base({ isActive: false, refreshToken: hashRefreshToken(t0) }));
    await expect(AuthService.refreshAccessToken(t0)).rejects.toMatchObject({ statusCode: 401 });
  });

  test('access token cấp ra mang tokenVersion hiện tại của user', async () => {
    const t0 = generateRefreshToken({ id: 7 });
    stubUsers(base({ tokenVersion: 4, refreshToken: hashRefreshToken(t0) }));
    const { accessToken } = await AuthService.refreshAccessToken(t0);
    expect(verifyAccessToken(accessToken).tv).toBe(4);
  });
});

describe('logout / đổi mật khẩu tăng token_version và xoá ân hạn', () => {
  afterEach(() => jest.restoreAllMocks());

  test('logout: refreshToken, previous_* về null và token_version tăng 1', async () => {
    const updateSpy = jest.spyOn(User, 'update').mockResolvedValue([1]);
    await AuthService.logout(7);
    const [values, options] = updateSpy.mock.calls[0];
    expect(values.refreshToken).toBeNull();
    expect(values.previousRefreshToken).toBeNull();
    expect(values.previousRefreshExpiresAt).toBeNull();
    expect(values.tokenVersion).toBeDefined();
    expect(options).toEqual({ where: { id: 7 } });
    expect(String(values.tokenVersion.val || values.tokenVersion)).toMatch(/token_version\s*\+\s*1/);
  });

  test('đổi mật khẩu: token_version + 1, previous_* xoá, access token trả về mang version MỚI', async () => {
    const bcrypt = require('bcrypt');
    const hash = await bcrypt.hash('Cu@123456xyz', 4);
    jest.spyOn(User, 'scope').mockReturnValue({
      findByPk: jest.fn().mockResolvedValue(base({ tokenVersion: 2, passwordHash: hash, phone: '0911111111' }))
    });
    const updateSpy = jest.spyOn(User, 'update').mockResolvedValue([1]);

    const result = await AuthService.changePassword(7, { oldPassword: 'Cu@123456xyz', newPassword: 'Tr0ng-Ngay-M@i-9' });

    const [values] = updateSpy.mock.calls[0];
    expect(values.tokenVersion).toBe(3);
    expect(values.previousRefreshToken).toBeNull();
    expect(values.refreshToken).toBe(hashRefreshToken(result.refreshToken));
    expect(verifyAccessToken(result.accessToken).tv).toBe(3);
  });
});

describe('authMiddleware — so tv với token_version', () => {
  afterEach(() => jest.restoreAllMocks());

  const appWith = (user) => {
    jest.spyOn(User, 'findByPk').mockResolvedValue(user);
    const app = express();
    app.get('/me', authMiddleware, (req, res) => res.json({ ok: true }));
    return app;
  };
  const tokenWith = (claims) => jwt.sign({ id: 7, email: 'a@example.test', role: 'customer', ...claims }, process.env.JWT_ACCESS_SECRET, { expiresIn: '5m' });

  test('tv khớp → qua', async () => {
    const res = await request(appWith(base({ tokenVersion: 2 }))).get('/me').set('Authorization', `Bearer ${tokenWith({ tv: 2 })}`);
    expect(res.status).toBe(200);
  });

  test('tv lệch (đã logout/đổi mật khẩu) → 401', async () => {
    const res = await request(appWith(base({ tokenVersion: 3 }))).get('/me').set('Authorization', `Bearer ${tokenWith({ tv: 2 })}`);
    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/thu hồi/);
  });

  test('token phát TRƯỚC khi có cột (không có tv) vẫn dùng được khi version = 0', async () => {
    const res = await request(appWith(base({ tokenVersion: 0 }))).get('/me').set('Authorization', `Bearer ${tokenWith({})}`);
    expect(res.status).toBe(200);
  });

  test('token cũ không có tv bị thu hồi sau lần tăng version đầu tiên', async () => {
    const res = await request(appWith(base({ tokenVersion: 1 }))).get('/me').set('Authorization', `Bearer ${tokenWith({})}`);
    expect(res.status).toBe(401);
  });

  afterAll(async () => { await sequelize.close(); });
});
