// R1 (báo cáo 33): đổi mật khẩu phải thu hồi refresh token cũ và cấp cặp token mới cho thiết bị đang đổi.
// Không cần DB: User.scope(...).findByPk và User.update được thay bằng bản giả.
const crypto = require('crypto');
const bcrypt = require('bcrypt');

process.env.JWT_ACCESS_SECRET = crypto.randomBytes(48).toString('hex');
process.env.JWT_REFRESH_SECRET = crypto.randomBytes(48).toString('hex');

const { User } = require('../src/models');
const AuthService = require('../src/services/AuthService');
const { verifyAccessToken, verifyRefreshToken, hashRefreshToken } = require('../src/utils/jwt');

const OLD = 'Cu@123456';
const NEW = 'Moi@7654321';

const mockUser = async (overrides = {}) => ({
  id: 42,
  email: 'khach@example.test',
  isActive: true,
  passwordHash: await bcrypt.hash(OLD, 4),
  refreshToken: 'hash-cua-refresh-token-cu',
  role: { name: 'customer' },
  ...overrides
});

describe('AuthService.changePassword — thu hồi phiên cũ (R1)', () => {
  let updateSpy;
  let savedDemo;

  const stubFind = (user) => jest.spyOn(User, 'scope').mockReturnValue({ findByPk: jest.fn().mockResolvedValue(user) });

  beforeEach(() => {
    savedDemo = process.env.DEMO_MODE;
    delete process.env.DEMO_MODE;
    updateSpy = jest.spyOn(User, 'update').mockResolvedValue([1]);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (savedDemo === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = savedDemo;
  });

  test('ghi mật khẩu mới và refresh token mới (dạng sha256) trong MỘT lệnh update', async () => {
    stubFind(await mockUser());

    const result = await AuthService.changePassword(42, { oldPassword: OLD, newPassword: NEW });

    expect(updateSpy).toHaveBeenCalledTimes(1);
    const [values, options] = updateSpy.mock.calls[0];
    expect(options).toEqual({ where: { id: 42 } });
    expect(await bcrypt.compare(NEW, values.passwordHash)).toBe(true);
    expect(values.refreshToken).toBe(hashRefreshToken(result.refreshToken));
    expect(values.refreshToken).not.toBe('hash-cua-refresh-token-cu');
    expect(values.refreshToken).toMatch(/^[a-f0-9]{64}$/);
  });

  test('trả cặp token mới hợp lệ, mang đúng id và vai trò', async () => {
    stubFind(await mockUser());

    const { accessToken, refreshToken, message } = await AuthService.changePassword(42, { oldPassword: OLD, newPassword: NEW });

    expect(message).toMatch(/thành công/i);
    expect(verifyAccessToken(accessToken)).toMatchObject({ id: 42, role: 'customer' });
    expect(verifyRefreshToken(refreshToken).id).toBe(42);
  });

  test('mật khẩu cũ sai → 400 và KHÔNG đụng tới refresh token hay mật khẩu', async () => {
    stubFind(await mockUser());

    await expect(AuthService.changePassword(42, { oldPassword: 'sai-mat-khau', newPassword: NEW }))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(updateSpy).not.toHaveBeenCalled();
  });

  test('tài khoản demo dùng chung → 403 và không update', async () => {
    process.env.DEMO_MODE = 'true';
    stubFind(await mockUser({ email: 'customer@badminton.com' }));

    await expect(AuthService.changePassword(42, { oldPassword: OLD, newPassword: NEW }))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(updateSpy).not.toHaveBeenCalled();
  });

  test('người dùng không tồn tại → 404', async () => {
    stubFind(null);
    await expect(AuthService.changePassword(999, { oldPassword: OLD, newPassword: NEW }))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(updateSpy).not.toHaveBeenCalled();
  });
});
