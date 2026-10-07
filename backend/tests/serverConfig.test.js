const { resolveCorsOrigin, resolveTrustProxy, resolveBuildVersion, DEV_DEFAULT_ORIGIN } = require('../src/utils/serverConfig');

describe('resolveCorsOrigin — DEP-09', () => {
  test('dev/test không đặt CORS_ORIGIN → Vite dev server như cũ', () => {
    expect(resolveCorsOrigin({ NODE_ENV: 'development' })).toBe(DEV_DEFAULT_ORIGIN);
    expect(resolveCorsOrigin({})).toBe(DEV_DEFAULT_ORIGIN);
  });

  test('production không đặt → đóng (false), không rơi về localhost', () => {
    expect(resolveCorsOrigin({ NODE_ENV: 'production' })).toBe(false);
    expect(resolveCorsOrigin({ NODE_ENV: 'production', CORS_ORIGIN: '  ' })).toBe(false);
  });

  test('một origin → chuỗi, bỏ dấu / thừa ở cuối', () => {
    expect(resolveCorsOrigin({ NODE_ENV: 'production', CORS_ORIGIN: 'https://demo.example.com/' }))
      .toBe('https://demo.example.com');
  });

  test('nhiều origin phân tách dấu phẩy → mảng', () => {
    expect(resolveCorsOrigin({ NODE_ENV: 'production', CORS_ORIGIN: 'https://a.vn, https://b.vn,' }))
      .toEqual(['https://a.vn', 'https://b.vn']);
  });
});

describe('resolveTrustProxy — AUTH-02', () => {
  test('không khai → 0 ở mọi môi trường: chạy không có proxy thì client không tự giả được IP', () => {
    expect(resolveTrustProxy({ NODE_ENV: 'production' })).toBe(0);
    expect(resolveTrustProxy({ NODE_ENV: 'development' })).toBe(0);
    expect(resolveTrustProxy({})).toBe(0);
  });

  test('compose khai 1 hop (nginx), render.yaml khai 3 hop (Cloudflare → Render → LB nội bộ)', () => {
    const fs = require('fs');
    const path = require('path');
    const root = path.join(__dirname, '..', '..');
    expect(fs.readFileSync(path.join(root, 'docker', 'docker-compose.yml'), 'utf8')).toMatch(/TRUST_PROXY_HOPS: "1"/);
    expect(fs.readFileSync(path.join(root, 'render.yaml'), 'utf8')).toMatch(/key: TRUST_PROXY_HOPS\s+value: "3"/);
  });

  test('đặt số hop rõ ràng', () => {
    expect(resolveTrustProxy({ NODE_ENV: 'production', TRUST_PROXY_HOPS: '2' })).toBe(2);
    expect(resolveTrustProxy({ NODE_ENV: 'production', TRUST_PROXY_HOPS: '0' })).toBe(0);
  });

  test('không nhận "true" hay số lạ — tin mọi hop là để client tự giả IP', () => {
    for (const value of ['true', '-1', '1.5', 'abc', '11']) {
      expect(() => resolveTrustProxy({ NODE_ENV: 'production', TRUST_PROXY_HOPS: value })).toThrow(/TRUST_PROXY_HOPS/);
    }
  });
});

describe('resolveBuildVersion — mã commit cho /health', () => {
  test('Render đặt sẵn RENDER_GIT_COMMIT → cắt còn 7 ký tự', () => {
    expect(resolveBuildVersion({ RENDER_GIT_COMMIT: '0f732dbca11e4f0b9a7c3d5e6f70812934abcdef' })).toBe('0f732db');
  });

  test('GIT_COMMIT dùng khi không chạy trên Render (compose, CI)', () => {
    expect(resolveBuildVersion({ GIT_COMMIT: '2FBFFAF' })).toBe('2fbffaf');
    expect(resolveBuildVersion({ RENDER_GIT_COMMIT: '', GIT_COMMIT: '2fbffaf0' })).toBe('2fbffaf');
  });

  test('không có biến nào → dev, không phải chuỗi rỗng', () => {
    expect(resolveBuildVersion({})).toBe('dev');
    expect(resolveBuildVersion({ RENDER_GIT_COMMIT: '   ' })).toBe('dev');
  });

  // /health là endpoint công khai, không đăng nhập: chỉ nhận thứ trông đúng như
  // SHA, để một biến đặt nhầm không bị dội nguyên văn ra ngoài.
  test('giá trị không phải SHA → dev, không dội env ra endpoint công khai', () => {
    for (const bad of ['main', 'v1.2.3', 'xyzxyzx', '123456', 'secret-token-value', '0f732db; rm -rf /']) {
      expect(resolveBuildVersion({ RENDER_GIT_COMMIT: bad })).toBe('dev');
    }
  });
});
