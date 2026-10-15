// Kế hoạch 35 — R9 (F1) và R10 (F5) trên app thật (server.js), cần DB thử đã migrate + seed.
const { api, bearer, sequelize } = require('./helpers');

afterAll(async () => { await sequelize.close(); });

const REQUIRED = ['content-security-policy', 'x-frame-options', 'x-content-type-options', 'referrer-policy', 'permissions-policy'];

describe('F1: header bảo mật trên app thật', () => {
  test.each([
    ['danh mục công khai', '/api/v1/public/branches'],
    ['lỗi 401', '/api/v1/auth/me'],
    ['route không tồn tại', '/api/v1/khong-co']
  ])('%s có đủ header', async (_, url) => {
    const res = await api().get(url);
    REQUIRED.forEach((h) => expect(res.headers[h]).toBeTruthy());
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['content-security-policy']).toMatch(/frame-ancestors 'none'/);
  });

  test('HTTP thường không nhận HSTS; qua proxy báo https thì app (chưa bật trust proxy) cũng không tin client', async () => {
    const res = await api().get('/api/v1/public/branches').set('X-Forwarded-Proto', 'https');
    expect(res.headers['strict-transport-security']).toBeUndefined();
  });
});

describe('F5: response cá nhân là no-store', () => {
  test.each([
    ['khách', 'customer', '/api/v1/auth/me'],
    ['khách', 'customer', '/api/v1/bookings'],
    ['nhân viên', 'employeeCn2', '/api/v1/customers'],
    ['admin', 'admin', '/api/v1/employees']
  ])('%s GET %s', async (_, who, url) => {
    const res = await api().get(url).set('Authorization', bearer(who));
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  test('lỗi 401 của API cũng no-store', async () => {
    const res = await api().get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.headers['cache-control']).toBe('no-store');
  });
});
