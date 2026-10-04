const crypto = require('crypto');

// Chữ ký webhook hai chiều (docs/01 mục 6): X-Signature = sha256=HMAC(secret, X-Timestamp + "." + body).
// Mỗi chiều một secret; lệch giờ quá 5 phút là từ chối; so sánh bằng timingSafeEqual.

const TOLERANCE_SECONDS = 300;

const sign = (secret, timestamp, body) =>
  `sha256=${crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;

const verify = ({ secret, signature, timestamp, body, toleranceSeconds = TOLERANCE_SECONDS, now = Date.now() }) => {
  if (!signature || !timestamp || !/^\d+$/.test(String(timestamp))) return false;
  if (Math.abs(Math.floor(now / 1000) - Number(timestamp)) > toleranceSeconds) return false;
  const expected = Buffer.from(sign(secret, timestamp, body));
  const actual = Buffer.from(String(signature));
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
};

module.exports = { sign, verify, TOLERANCE_SECONDS };
