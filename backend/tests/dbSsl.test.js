const { buildSslOptions } = require('../src/config/dbSsl');

const PEM = '-----BEGIN CERTIFICATE-----\nMIIBfake\n-----END CERTIFICATE-----';

describe('buildSslOptions — TLS tới MySQL (Aiven bắt buộc)', () => {
  test('không đặt DB_SSL → null, kết nối thường như máy dev', () => {
    expect(buildSslOptions({})).toBeNull();
    expect(buildSslOptions({ DB_SSL: 'false', DB_SSL_CA: PEM })).toBeNull();
  });

  test('bật TLS thì mặc định kiểm chứng chứng chỉ', () => {
    expect(buildSslOptions({ DB_SSL: 'true' })).toEqual({ rejectUnauthorized: true });
    expect(buildSslOptions({ DB_SSL: 'TRUE ' })).toEqual({ rejectUnauthorized: true });
  });

  test('CA dạng PEM, kể cả khi ô env lưu xuống dòng thành "\\n"', () => {
    expect(buildSslOptions({ DB_SSL: 'true', DB_SSL_CA: PEM }).ca).toBe(PEM);
    const escaped = PEM.replace(/\n/g, '\\n');
    expect(buildSslOptions({ DB_SSL: 'true', DB_SSL_CA: escaped }).ca).toBe(PEM);
  });

  test('CA dạng base64 của PEM', () => {
    const b64 = Buffer.from(PEM).toString('base64');
    expect(buildSslOptions({ DB_SSL: 'true', DB_SSL_CA: b64 }).ca).toBe(PEM);
  });

  test('CA không phải chứng chỉ → báo lỗi, không âm thầm bỏ qua', () => {
    expect(() => buildSslOptions({ DB_SSL: 'true', DB_SSL_CA: 'khong-phai-chung-chi' })).toThrow(/DB_SSL_CA/);
  });

  test('chỉ tắt kiểm chứng khi đặt rõ DB_SSL_REJECT_UNAUTHORIZED=false', () => {
    expect(buildSslOptions({ DB_SSL: 'true', DB_SSL_REJECT_UNAUTHORIZED: 'false' }))
      .toEqual({ rejectUnauthorized: false });
    expect(buildSslOptions({ DB_SSL: 'true', DB_SSL_REJECT_UNAUTHORIZED: 'no' }))
      .toEqual({ rejectUnauthorized: true });
  });
});
