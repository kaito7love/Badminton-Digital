// R9 + R10 (báo cáo 33, kế hoạch 35): header bảo mật trên mọi response và no-store cho API. Không cần DB.
const express = require('express');
const request = require('supertest');
const { securityHeaders, apiNoStore, buildCsp, CSP, CSP_DIRECTIVES, HSTS_VALUE } = require('../src/utils/securityHeaders');

const createApp = ({ trustProxy = false } = {}) => {
  const app = express();
  if (trustProxy) app.set('trust proxy', 1);
  app.use(securityHeaders);
  app.use('/api/v1', apiNoStore);
  app.get('/api/v1/auth/me', (req, res) => res.json({ me: true }));
  app.get('/api/v1/public/branches', (req, res) => res.json({ branches: [] }));
  app.get('/api/v1/realtime/stream', (req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.json({ sse: true }); });
  app.get('/api/v1/boom', (req, res, next) => next(new Error('boom')));
  app.get('/api-docs', (req, res) => res.send('swagger'));
  app.get('/index.html', (req, res) => res.type('html').send('<html></html>'));
  // Giống server.js: route không khớp trả JSON 404 chứ không dùng trang lỗi mặc định của Express (tự đặt CSP riêng).
  app.use((req, res) => res.status(404).json({ success: false }));
  app.use((err, req, res, next) => res.status(500).json({ success: false })); // eslint-disable-line no-unused-vars
  return app;
};

const REQUIRED = ['content-security-policy', 'x-frame-options', 'x-content-type-options', 'referrer-policy', 'permissions-policy'];

describe('CSP (R9)', () => {
  const directive = (name) => CSP_DIRECTIVES[name];

  test('chuỗi CSP dựng đúng từ khai báo', () => {
    expect(buildCsp({ 'default-src': ["'self'"], 'img-src': ["'self'", 'data:'] })).toBe("default-src 'self'; img-src 'self' data:");
    expect(CSP).toContain("default-src 'self'");
  });

  test('script-src chỉ cho cùng origin: không unsafe-inline, không unsafe-eval, không domain ngoài', () => {
    expect(directive('script-src')).toEqual(["'self'"]);
    expect(CSP).not.toMatch(/unsafe-eval/);
  });

  test('chống clickjacking, plugin và đổi base/form', () => {
    expect(directive('frame-ancestors')).toEqual(["'none'"]);
    expect(directive('object-src')).toEqual(["'none'"]);
    expect(directive('base-uri')).toEqual(["'self'"]);
    expect(directive('form-action')).toEqual(["'self'"]);
  });

  test('chỉ mở đúng các nguồn ngoài mà frontend dùng: Google Fonts và mã QR VietQR', () => {
    const external = Object.values(CSP_DIRECTIVES).flat().filter((s) => s.startsWith('http')).sort();
    expect(external).toEqual(['https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'https://img.vietqr.io']);
    expect(directive('connect-src')).toEqual(["'self'"]); // API + SSE cùng origin, không gọi ra ngoài
  });
});

describe('Header bảo mật trên mọi loại response', () => {
  test.each([
    ['JSON API', '/api/v1/auth/me', 200],
    ['danh mục công khai', '/api/v1/public/branches', 200],
    ['trang tĩnh', '/index.html', 200],
    ['404', '/khong-co-gi', 404],
    ['lỗi 500', '/api/v1/boom', 500]
  ])('%s', async (_, url, status) => {
    const res = await request(createApp()).get(url);
    expect(res.status).toBe(status);
    REQUIRED.forEach((h) => expect(res.headers[h]).toBeTruthy());
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBe(CSP);
  });

  test('Swagger UI (/api-docs) không bị CSP của ứng dụng chặn nhưng vẫn có các header còn lại', async () => {
    const res = await request(createApp()).get('/api-docs');
    expect(res.headers['content-security-policy']).toBeUndefined();
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('HSTS chỉ khi thật sự là HTTPS', () => {
  test('HTTP thường: không có HSTS', async () => {
    const res = await request(createApp({ trustProxy: true })).get('/api/v1/auth/me');
    expect(res.headers['strict-transport-security']).toBeUndefined();
  });

  test('qua proxy tin cậy báo https: có HSTS 180 ngày, không includeSubDomains/preload', async () => {
    const res = await request(createApp({ trustProxy: true })).get('/api/v1/auth/me').set('X-Forwarded-Proto', 'https');
    expect(res.headers['strict-transport-security']).toBe(HSTS_VALUE);
    expect(HSTS_VALUE).toBe('max-age=15552000');
    expect(HSTS_VALUE).not.toMatch(/includeSubDomains|preload/i);
  });

  test('chưa bật trust proxy: client tự gửi X-Forwarded-Proto: https KHÔNG kích hoạt HSTS', async () => {
    const res = await request(createApp({ trustProxy: false })).get('/api/v1/auth/me').set('X-Forwarded-Proto', 'https');
    expect(res.headers['strict-transport-security']).toBeUndefined();
  });
});

describe('Cache-Control cho API (R10)', () => {
  test('response API cá nhân là no-store', async () => {
    const res = await request(createApp()).get('/api/v1/auth/me');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  test('lỗi 401/500 của API cũng no-store', async () => {
    const res = await request(createApp()).get('/api/v1/boom');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  test('/api/v1/public/* không bị ép no-store', async () => {
    const res = await request(createApp()).get('/api/v1/public/branches');
    expect(res.headers['cache-control']).toBeUndefined();
  });

  test('handler tự đặt Cache-Control (SSE) ghi đè được', async () => {
    const res = await request(createApp()).get('/api/v1/realtime/stream');
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  test('ngoài /api/v1 (trang tĩnh) không bị đụng', async () => {
    const res = await request(createApp()).get('/index.html');
    expect(res.headers['cache-control']).toBeUndefined();
  });
});
