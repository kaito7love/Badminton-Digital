const crypto = require('crypto');

// Chữ ký webhook hai chiều: X-Signature: sha256=HMAC(secret, X-Timestamp + "." + body).
// Lệch thời gian quá tolerance thì từ chối (chống gửi lại gói cũ).

const sign = (secret, timestamp, body) =>
  `sha256=${crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;

const verify = ({ secret, signature, timestamp, body, toleranceSeconds, now = Date.now() }) => {
  if (!signature || !timestamp || !/^\d+$/.test(String(timestamp))) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > toleranceSeconds) return false;
  const expected = Buffer.from(sign(secret, timestamp, body));
  const actual = Buffer.from(String(signature));
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
};

module.exports = { sign, verify };
