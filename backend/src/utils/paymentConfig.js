const crypto = require('crypto');

// Chuyển khoản chỉ bật khi có ĐỦ hai thứ: tài khoản nhận tiền thật và webhook
// xác nhận tiền về có secret.
// - Thiếu tài khoản thì QR trỏ vào đâu cũng sai — trước đây mọi QR trỏ vào tài
//   khoản demo MB-0987654321 viết cứng trong code.
// - Thiếu webhook thì không ai xác nhận được tiền đã về: đơn online tự huỷ sau
//   30 phút dù khách đã chuyển. Còn webhook không secret thì ai cũng gửi được
//   "đã trả".
//
// Tài khoản nằm ở biến môi trường, không ở DB hay màn hình Cài đặt: đổi số tài
// khoản nhận tiền phải cần quyền vào server, một tài khoản admin bị lộ không đủ.
// Đọc process.env mỗi lần gọi (không chốt lúc require) để test đặt được env riêng.

const MIN_WEBHOOK_SECRET_LENGTH = 32;

const clean = (value) => String(value ?? '').trim();

/** `{ bankId, accountNo, accountName }` hoặc null nếu thiếu biến nào. */
const getTransferAccount = (env = process.env) => {
  const account = {
    bankId: clean(env.PAYMENT_BANK_ID),
    accountNo: clean(env.PAYMENT_BANK_ACCOUNT_NO),
    accountName: clean(env.PAYMENT_BANK_ACCOUNT_NAME)
  };
  return account.bankId && account.accountNo && account.accountName ? account : null;
};

const getWebhookSecret = (env = process.env) => {
  const secret = clean(env.PAYMENT_WEBHOOK_SECRET);
  return secret.length >= MIN_WEBHOOK_SECRET_LENGTH ? secret : null;
};

const isWebhookConfigured = (env = process.env) => getWebhookSecret(env) !== null;

const isTransferEnabled = (env = process.env) => getTransferAccount(env) !== null && isWebhookConfigured(env);

/**
 * So header gửi lên với secret đã cấu hình. Băm sha256 cả hai rồi mới
 * `timingSafeEqual`: hai digest luôn dài bằng nhau, nên thời gian phản hồi không
 * lộ độ dài hay phần đúng của chuỗi gửi lên.
 */
const webhookSecretMatches = (provided, env = process.env) => {
  const expected = getWebhookSecret(env);
  if (!expected || typeof provided !== 'string' || !provided) return false;
  const digest = (value) => crypto.createHash('sha256').update(value, 'utf8').digest();
  return crypto.timingSafeEqual(digest(provided), digest(expected));
};

const assertTransferEnabled = (env = process.env) => {
  if (isTransferEnabled(env)) return;
  const error = new Error('Chuyển khoản chưa được bật (thiếu tài khoản nhận tiền hoặc webhook xác nhận tiền về). Vui lòng thanh toán tiền mặt.');
  error.statusCode = 400;
  throw error;
};

module.exports = {
  MIN_WEBHOOK_SECRET_LENGTH,
  getTransferAccount,
  isWebhookConfigured,
  isTransferEnabled,
  webhookSecretMatches,
  assertTransferEnabled
};
