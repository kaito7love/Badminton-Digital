'use strict';

/**
 * Sinh bộ khoá cho tích hợp competition-service (plan 23):
 *
 *   npm run competition:keys                       # ghi backend/.keys/competition.env
 *   npm run competition:keys -- --service-url http://127.0.0.1:5100 --backend-url http://127.0.0.1:5000
 *   npm run competition:keys -- --force            # ghi đè bộ khoá cũ (xoay khoá: đổi kid)
 *
 * - Khoá BÍ MẬT ES256 + hai secret HMAC (mỗi chiều một secret) chỉ được ghi vào file `.keys/competition.env`
 *   (đã nằm trong .gitignore) — KHÔNG in ra màn hình, không vào log.
 * - File đó có hai khối: biến cho backend (COMPETITION_*) và biến cho competition-service (TRUSTED_ISSUERS,
 *   INBOUND_SOURCES, WEBHOOK_TARGETS). Chép từng khối vào .env / dashboard tương ứng rồi xoá file.
 * - Màn hình chỉ in khoá CÔNG KHAI dạng JWKS (an toàn để dán vào TRUSTED_ISSUERS).
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const parseArgs = (argv) => {
  const args = { force: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--force') args.force = true;
    else if (argv[i] === '--service-url') args.serviceUrl = argv[++i];
    else if (argv[i] === '--backend-url') args.backendUrl = argv[++i];
    else if (argv[i] === '--kid') args.kid = argv[++i];
  }
  return args;
};

/** Hàm thuần (test được): trả về nội dung file env và khoá công khai. */
const generateKeyset = ({ now = new Date(), serviceUrl = 'http://127.0.0.1:5100', backendUrl = 'http://127.0.0.1:5000', kid, issuer = 'badminton-digital-core', tenant = 'badminton-digital' } = {}) => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const keyId = kid || `core-${now.toISOString().slice(0, 7)}`;
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).trim().replace(/\n/g, '\\n');
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: keyId, alg: 'ES256', use: 'sig' };
  const eventSecret = crypto.randomBytes(48).toString('hex');
  const webhookSecret = crypto.randomBytes(48).toString('hex');

  const trustedIssuers = JSON.stringify([{ issuer, jwks: { keys: [jwk] } }]);
  const inbound = JSON.stringify([{ source: issuer, secret: eventSecret, tenant }]);
  const targets = JSON.stringify([{
    name: 'core',
    url: `${backendUrl.replace(/\/+$/, '')}/api/v1/integrations/competition/events`,
    secret: webhookSecret,
    types: ['competition.*']
  }]);

  const env = [
    '# ===== Khối 1: backend/.env (app chính) =====',
    `COMPETITION_SERVICE_URL=${serviceUrl}`,
    `COMPETITION_KEY_ID=${keyId}`,
    `COMPETITION_SIGNING_KEY="${pem}"`,
    `COMPETITION_EVENT_SECRET=${eventSecret}`,
    `COMPETITION_WEBHOOK_SECRET=${webhookSecret}`,
    '',
    '# ===== Khối 2: services/competition-service/.env (hoặc biến môi trường của service) =====',
    `TRUSTED_ISSUERS=${trustedIssuers}`,
    `INBOUND_SOURCES=${inbound}`,
    `WEBHOOK_TARGETS=${targets}`,
    ''
  ].join('\n');

  return { env, keyId, publicJwks: { keys: [jwk] } };
};

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  const dir = path.join(__dirname, '..', '.keys');
  const file = path.join(dir, 'competition.env');
  if (fs.existsSync(file) && !args.force) {
    console.error(`Đã có ${file}. Dùng --force để ghi đè (xoay khoá: nhớ cập nhật cả hai phía).`);
    process.exit(1);
  }
  const { env, keyId, publicJwks } = generateKeyset({ serviceUrl: args.serviceUrl, backendUrl: args.backendUrl, kid: args.kid });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, env, { mode: 0o600 });
  console.log(`Đã ghi ${file} (khoá bí mật + secret nằm trong file này, không in ra đây).`);
  console.log(`kid: ${keyId}`);
  console.log('Khoá công khai (JWKS):');
  console.log(JSON.stringify(publicJwks));
  console.log('Chép từng khối trong file vào backend/.env và .env của service, rồi XOÁ file.');
};

if (require.main === module) main();

module.exports = { generateKeyset, parseArgs };
