const crypto = require('crypto');

// Cấu hình cổng nối competition-service. Hàm thuần (nhận `env`) để test được mà
// không phải nạp lại module — cùng khuôn `utils/paymentConfig.js`.
//
// Ba trạng thái:
//  - không đặt biến nào  → TẮT: cổng trả 503 COMPETITION_DISABLED, outbox vẫn ghi
//    sự kiện khách (bật service sau vẫn đồng bộ được), phần còn lại của app chạy như cũ;
//  - đặt đủ và hợp lệ    → BẬT;
//  - đặt dở dang / sai   → ConfigError ngay lúc khởi động. Không chạy nửa vời: có URL
//    mà thiếu khoá ký thì mọi request tới service đều 401 mà không ai biết vì sao.

const MIN_SECRET_LENGTH = 32;
const DEFAULTS = { issuer: 'badminton-digital-core', tenant: 'badminton-digital', audience: 'competition-service' };
const REQUIRED = [
  'COMPETITION_SERVICE_URL',
  'COMPETITION_SIGNING_KEY',
  'COMPETITION_KEY_ID',
  'COMPETITION_EVENT_SECRET',
  'COMPETITION_WEBHOOK_SECRET'
];

class ConfigError extends Error {}

const clean = (value) => String(value ?? '').trim();

/** Danh tính ghi vào sự kiện outbox — có cả khi cổng tắt, nên không bắt buộc cấu hình. */
const getEventIdentity = (env = process.env) => ({
  source: clean(env.COMPETITION_ISSUER) || DEFAULTS.issuer,
  tenant: clean(env.COMPETITION_TENANT) || DEFAULTS.tenant
});

const normalizePem = (value) => clean(value).replace(/\\n/g, '\n');

const loadCompetitionConfig = (env = process.env) => {
  const present = REQUIRED.filter((name) => clean(env[name]));
  if (present.length === 0) return { enabled: false };

  const missing = REQUIRED.filter((name) => !clean(env[name]));
  if (missing.length) {
    throw new ConfigError(`Cấu hình competition-service dở dang — thiếu: ${missing.join(', ')} (hoặc xoá hết để tắt tính năng).`);
  }

  let serviceUrl;
  try {
    const url = new URL(clean(env.COMPETITION_SERVICE_URL));
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('giao thức');
    serviceUrl = url.toString().replace(/\/+$/, '');
  } catch {
    throw new ConfigError('COMPETITION_SERVICE_URL phải là địa chỉ http(s) hợp lệ.');
  }

  const signingKey = normalizePem(env.COMPETITION_SIGNING_KEY);
  try {
    const key = crypto.createPrivateKey(signingKey);
    if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
      throw new Error('không phải khoá EC P-256');
    }
  } catch (err) {
    throw new ConfigError(`COMPETITION_SIGNING_KEY phải là khoá bí mật ES256 (EC P-256, PEM): ${err.message}`);
  }

  const eventSecret = clean(env.COMPETITION_EVENT_SECRET);
  const webhookSecret = clean(env.COMPETITION_WEBHOOK_SECRET);
  for (const [name, value] of [['COMPETITION_EVENT_SECRET', eventSecret], ['COMPETITION_WEBHOOK_SECRET', webhookSecret]]) {
    if (value.length < MIN_SECRET_LENGTH) throw new ConfigError(`${name} cần tối thiểu ${MIN_SECRET_LENGTH} ký tự.`);
  }
  if (eventSecret === webhookSecret) {
    throw new ConfigError('COMPETITION_EVENT_SECRET và COMPETITION_WEBHOOK_SECRET phải khác nhau (mỗi chiều một secret).');
  }

  const identity = getEventIdentity(env);
  return {
    enabled: true,
    serviceUrl,
    signingKey,
    keyId: clean(env.COMPETITION_KEY_ID),
    issuer: identity.source,
    tenant: identity.tenant,
    audience: clean(env.COMPETITION_AUDIENCE) || DEFAULTS.audience,
    eventSecret,
    webhookSecret
  };
};

let cached = null;
/** Cấu hình của tiến trình — nạp một lần. Sai cấu hình thì ném lỗi ở lần gọi đầu (server.js gọi lúc khởi động). */
const getCompetitionConfig = () => {
  if (!cached) cached = loadCompetitionConfig(process.env);
  return cached;
};
const resetCompetitionConfig = () => { cached = null; };

module.exports = {
  ConfigError,
  MIN_SECRET_LENGTH,
  REQUIRED,
  loadCompetitionConfig,
  getCompetitionConfig,
  resetCompetitionConfig,
  getEventIdentity
};
