// Kế hoạch 32, nhóm A — phiên đăng nhập, trên DB thử. Những dòng `test.failing` là LỖI ĐÃ BIẾT (báo cáo 33):
// khi lỗi được sửa, test báo đỏ để bạn đổi `test.failing` thành `test`.
const { api, tokenFor, registerCustomer, unique, sequelize } = require('./helpers');

afterAll(async () => { await sequelize.close(); });

describe('Phiên đăng nhập (A5, A6)', () => {
  let me;

  beforeAll(async () => {
    me = await registerCustomer(unique());
  });

  const login = async () => (await api().post('/api/v1/auth/login').send({ identifier: me.phone, password: me.password })).body.data;

  test('A5c: sau logout, refresh token cũ bị từ chối', async () => {
    const { accessToken, refreshToken } = await login();
    await api().post('/api/v1/auth/logout').set('Authorization', `Bearer ${accessToken}`);
    const res = await api().post('/api/v1/auth/refresh-token').send({ refreshToken });
    expect(res.status).toBe(401);
  });

  test('A1: sai mật khẩu và sai tài khoản cho cùng mã + thông điệp', async () => {
    const wrongPw = await api().post('/api/v1/auth/login').send({ identifier: me.phone, password: 'Sai@12345' });
    const noUser = await api().post('/api/v1/auth/login').send({ identifier: '0900000000', password: 'Sai@12345' });
    expect(wrongPw.status).toBe(noUser.status);
    expect(wrongPw.body.message).toBe(noUser.body.message);
  });

  test('A9b: đăng ký kèm role/roleId vẫn là customer', async () => {
    const phone = unique();
    await api().post('/api/v1/auth/register').send({ phone, fullName: 'Nâng quyền', password: 'SecTest@2026', role: 'admin', roleId: 1 });
    const res = await api().post('/api/v1/auth/login').send({ identifier: phone, password: 'SecTest@2026' });
    expect(res.body.data.user.role).toBe('customer');
  });

  test('token tạo sẵn dùng được (đối chứng cho helpers)', async () => {
    const res = await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${tokenFor(me)}`);
    expect(res.status).toBe(200);
  });

  // --- lỗi đã biết (báo cáo 33) ---
  test.failing('R1/A6b: đổi mật khẩu thu hồi refresh token cũ', async () => {
    const { accessToken, refreshToken } = await login();
    await api().put('/api/v1/auth/change-password').set('Authorization', `Bearer ${accessToken}`)
      .send({ oldPassword: me.password, newPassword: `${me.password}x` });
    me.password = `${me.password}x`;
    const res = await api().post('/api/v1/auth/refresh-token').send({ refreshToken });
    expect(res.status).toBe(401);
  });

  test.failing('R3/A5a: refresh token xoay vòng (dùng lần hai bị từ chối)', async () => {
    const { refreshToken } = await login();
    await api().post('/api/v1/auth/refresh-token').send({ refreshToken });
    const second = await api().post('/api/v1/auth/refresh-token').send({ refreshToken });
    expect(second.status).toBe(401);
  });

  test.failing('R4/A6a: access token hết hiệu lực ngay sau logout', async () => {
    const { accessToken } = await login();
    await api().post('/api/v1/auth/logout').set('Authorization', `Bearer ${accessToken}`);
    const res = await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(401);
  });

  test.failing('R2/A3: mật khẩu "123456" bị từ chối khi đăng ký', async () => {
    const res = await api().post('/api/v1/auth/register').send({ phone: unique(), fullName: 'Yếu', password: '123456' });
    expect(res.status).toBe(400);
  });
});
