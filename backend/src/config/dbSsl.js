'use strict';

// Không require gì từ models/ ở đây: config.js nạp file này, và sequelize-cli
// nạp config.js trước mọi thứ khác.

const PEM_HEADER = '-----BEGIN CERTIFICATE-----';

/** DB_SSL_CA nhận PEM (kể cả khi ô env lưu xuống dòng thành "\n") hoặc base64 của PEM. */
const decodeCa = (raw) => {
  const value = String(raw).trim();
  if (value.includes(PEM_HEADER)) return value.replace(/\\n/g, '\n');
  const decoded = Buffer.from(value, 'base64').toString('utf8');
  if (!decoded.includes(PEM_HEADER)) {
    throw new Error('DB_SSL_CA không phải chứng chỉ PEM (hoặc base64 của PEM) hợp lệ.');
  }
  return decoded;
};

/**
 * Tuỳ chọn TLS cho mysql2 (`dialectOptions.ssl`). Aiven và phần lớn MySQL
 * managed bắt buộc TLS.
 *
 * - `DB_SSL=true` bật TLS; không đặt thì trả null — kết nối thường như máy dev.
 * - `DB_SSL_CA`: CA của nhà cung cấp (Aiven: nút "CA certificate" trên trang service).
 * - Luôn kiểm chứng chứng chỉ server. Thiếu CA thì Node chỉ tin CA công cộng,
 *   nên CA riêng của nhà cung cấp sẽ bị từ chối — lỗi rõ ràng lúc kết nối,
 *   không âm thầm chấp nhận mọi chứng chỉ. Chỉ tắt kiểm chứng khi đặt rõ
 *   `DB_SSL_REJECT_UNAUTHORIZED=false` (không khuyến nghị: mất tác dụng chống
 *   nghe lén giữa đường).
 */
const buildSslOptions = (env = process.env) => {
  if (String(env.DB_SSL || '').trim().toLowerCase() !== 'true') return null;
  const ssl = {
    rejectUnauthorized: String(env.DB_SSL_REJECT_UNAUTHORIZED || '').trim().toLowerCase() !== 'false'
  };
  if (env.DB_SSL_CA && String(env.DB_SSL_CA).trim()) ssl.ca = decodeCa(env.DB_SSL_CA);
  return ssl;
};

module.exports = { buildSslOptions };
