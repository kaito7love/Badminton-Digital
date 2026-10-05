const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { decodeCa, sslOptions } = require('../../src/platform/db/sequelize');
const { findResetProblems } = require('../../scripts/demo-reset');

// Chứng chỉ giả đủ dài: chỉ kiểm cách giải mã, không dùng để kết nối.
const PEM = `-----BEGIN CERTIFICATE-----\n${crypto.randomBytes(300).toString('base64').replace(/(.{64})/g, '$1\n')}\n-----END CERTIFICATE-----\n`;

describe('DB_SSL_CA của service (cùng các cách dán như app chính)', () => {
  test('PEM nguyên văn', () => {
    expect(decodeCa(PEM)).toBe(PEM.trim());
  });

  test('PEM bị ô env đổi xuống dòng thành \\n', () => {
    expect(decodeCa(PEM.trim().replace(/\n/g, '\\n'))).toBe(PEM.trim());
  });

  test('base64 của PEM — cách dán lên Render / GitHub Secrets', () => {
    expect(decodeCa(Buffer.from(PEM).toString('base64'))).toBe(PEM);
  });

  test('đường dẫn tới file PEM', () => {
    const file = path.join(os.tmpdir(), `cs-ca-${process.pid}.pem`);
    fs.writeFileSync(file, PEM);
    try {
      expect(decodeCa(file)).toBe(PEM);
    } finally {
      fs.unlinkSync(file);
    }
  });

  test('không đặt DB_SSL → không TLS; có → luôn kiểm chứng chứng chỉ', () => {
    expect(sslOptions({ ssl: false })).toBeUndefined();
    expect(sslOptions({ ssl: true, sslCa: Buffer.from(PEM).toString('base64') })).toEqual({ ca: PEM, rejectUnauthorized: true });
    expect(sslOptions({ ssl: true })).toEqual({ ca: undefined, rejectUnauthorized: true });
  });
});

describe('demo-reset của service — rào chắn chạy nhầm', () => {
  const ok = { ALLOW_DEMO_SEED: 'true', DEMO_RESET_CONFIRM: 'competition_demo', NODE_ENV: 'development' };

  test('đủ điều kiện → không có lỗi', () => {
    expect(findResetProblems(ok, 'competition_demo')).toEqual([]);
  });

  test.each([
    ['thiếu ALLOW_DEMO_SEED', { ...ok, ALLOW_DEMO_SEED: undefined }, /ALLOW_DEMO_SEED/],
    ['DEMO_RESET_CONFIRM khác tên DB', { ...ok, DEMO_RESET_CONFIRM: 'competition_prod' }, /DEMO_RESET_CONFIRM/],
    ['thiếu DEMO_RESET_CONFIRM', { ...ok, DEMO_RESET_CONFIRM: undefined }, /DEMO_RESET_CONFIRM/],
    ['NODE_ENV=production', { ...ok, NODE_ENV: 'production' }, /NODE_ENV/]
  ])('%s → từ chối', (_, env, pattern) => {
    expect(findResetProblems(env, 'competition_demo').join('\n')).toMatch(pattern);
  });

  test('chưa có tên DB → từ chối', () => {
    expect(findResetProblems(ok, '').join('\n')).toMatch(/DB_NAME/);
  });
});
