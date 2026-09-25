const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const request = require('supertest');
const { createFrontendHandlers, isBackendPath } = require('../src/utils/frontendStatic');

describe('isBackendPath — không bao giờ trả index.html cho path của backend', () => {
  test.each([
    ['/api', true],
    ['/api/v1/khong-co', true],
    ['/static/layouts/branch-1.json', true],
    ['/api-docs', true],
    ['/health', true],
    ['/', false],
    ['/courts', false],
    ['/reset-password', false],
    ['/apis-la-route-react', false]
  ])('%s → %s', (urlPath, expected) => {
    expect(isBackendPath(urlPath)).toBe(expected);
  });
});

describe('createFrontendHandlers — backend phục vụ bản build frontend', () => {
  let distDir;
  let app;

  beforeAll(() => {
    distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bd-dist-'));
    fs.mkdirSync(path.join(distDir, 'assets'));
    fs.writeFileSync(path.join(distDir, 'index.html'), '<!doctype html><div id="root"></div>');
    fs.writeFileSync(path.join(distDir, 'assets', 'index-abc123.js'), 'console.log(1)');
    fs.writeFileSync(path.join(distDir, 'favicon.svg'), '<svg/>');

    // Cùng thứ tự mount như server.js: route API → frontend → 404 JSON.
    app = express();
    app.get('/api/v1/ping', (req, res) => res.json({ ok: true }));
    const frontend = createFrontendHandlers(distDir);
    app.use(frontend.staticFiles);
    app.use(frontend.spaFallback);
    app.use((req, res) => res.status(404).json({ success: false, message: 'Không tìm thấy endpoint.' }));
  });

  afterAll(() => fs.rmSync(distDir, { recursive: true, force: true }));

  test('không cấu hình → null (dev, cụm compose chạy như cũ)', () => {
    expect(createFrontendHandlers(undefined)).toBeNull();
    expect(createFrontendHandlers('')).toBeNull();
  });

  test('thư mục thiếu index.html → báo lỗi ngay lúc khởi động', () => {
    expect(() => createFrontendHandlers(os.tmpdir() + '/khong-co-thu-muc-nay')).toThrow(/index\.html/);
  });

  test('route API vẫn chạy', async () => {
    const res = await request(app).get('/api/v1/ping');
    expect(res.body).toEqual({ ok: true });
  });

  test('route của React (F5) → index.html, không cache', async () => {
    for (const url of ['/', '/courts', '/reset-password?token=abc']) {
      const res = await request(app).get(url);
      expect(res.status).toBe(200);
      expect(res.text).toContain('<div id="root">');
      expect(res.headers['cache-control']).toBe('no-cache');
    }
  });

  test('/assets/* cache 1 năm immutable; file khác no-cache', async () => {
    const asset = await request(app).get('/assets/index-abc123.js');
    expect(asset.status).toBe(200);
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    const icon = await request(app).get('/favicon.svg');
    expect(icon.headers['cache-control']).toBe('no-cache');
  });

  test('API sai đường vẫn nhận 404 JSON, không phải trang HTML', async () => {
    const res = await request(app).get('/api/v1/khong-co');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  test('POST tới route React không bị trả index.html', async () => {
    const res = await request(app).post('/courts');
    expect(res.status).toBe(404);
  });
});
