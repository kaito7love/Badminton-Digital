const crypto = require('crypto');
const { loadCompetitionConfig } = require('../src/integrations/competition/config');

// Bộ khoá + cấu hình dùng chung cho các test tích hợp competition-service (không phải file test).
const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' });
const PUBLIC_PEM = publicKey.export({ type: 'spki', format: 'pem' });

const EVENT_SECRET = 'event-secret-used-only-in-tests-0123456789abcdef';
const WEBHOOK_SECRET = 'webhook-secret-used-only-in-tests-0123456789ab';

const baseEnv = (overrides = {}) => ({
  COMPETITION_SERVICE_URL: 'http://127.0.0.1:5100',
  COMPETITION_KEY_ID: 'core-test',
  COMPETITION_SIGNING_KEY: PRIVATE_PEM,
  COMPETITION_EVENT_SECRET: EVENT_SECRET,
  COMPETITION_WEBHOOK_SECRET: WEBHOOK_SECRET,
  ...overrides
});

const enabledConfig = (overrides) => loadCompetitionConfig(baseEnv(overrides));

module.exports = { PRIVATE_PEM, PUBLIC_PEM, EVENT_SECRET, WEBHOOK_SECRET, baseEnv, enabledConfig };
