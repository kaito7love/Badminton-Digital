const path = require('path');
const crypto = require('crypto');
const request = require('supertest');
const { generateKeyPair, exportJWK, SignJWT } = require('jose');
const { loadConfig } = require('../../src/platform/config');
const { createLogger } = require('../../src/platform/logging/logger');
const { createSequelize } = require('../../src/platform/db/sequelize');
const { defineModels } = require('../../src/db');
const { createApp } = require('../../src/app');
const { createEventValidator } = require('../../src/platform/events/schemas');
const { sign } = require('../../src/platform/events/signature');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const ISSUER = 'test-core';
const INBOUND_SECRET = 'inbound-secret-for-tests-0123456789abcdef';

// Dựng service thật (Express + MySQL thật) với cấu hình test: bật kiểm response
// theo OpenAPI và kiểm payload sự kiện theo JSON Schema → mọi lệch hợp đồng làm
// test đỏ. Mỗi file test dùng tenant riêng để không giẫm dữ liệu của nhau.
const createTestContext = async ({ webhookTargets = [], tenant, env = {} } = {}) => {
  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
  const kid = 'test-key';
  const jwk = { ...(await exportJWK(publicKey)), kid, alg: 'ES256' };
  const theTenant = tenant || `t-${crypto.randomBytes(4).toString('hex')}`;
  const config = loadConfig({
    ...process.env,
    NODE_ENV: 'test',
    DB_NAME: process.env.TEST_DB_NAME || 'competition_service_test',
    OPENAPI_VALIDATE_RESPONSES: 'true',
    EVENTS_VALIDATE: 'true',
    LOG_LEVEL: process.env.TEST_LOG_LEVEL || 'silent',
    TRUSTED_ISSUERS: JSON.stringify([{ issuer: ISSUER, jwks: { keys: [jwk] } }]),
    TRUSTED_ISSUERS_FILE: '',
    INBOUND_SOURCES: JSON.stringify([{ source: 'bd-core', secret: INBOUND_SECRET, tenant: theTenant }]),
    WEBHOOK_TARGETS: JSON.stringify(webhookTargets),
    ...env
  });
  const logger = createLogger(config);
  const sequelize = createSequelize(config.db, logger);
  const models = defineModels(sequelize);
  const built = createApp({ config, sequelize, models, logger });

  const token = async ({ scope = '', sub = 'test:user', org = [], player, name, ttl = 60, iat, aud = 'competition-service', issuer = ISSUER, key = privateKey, tenantOverride } = {}) => {
    const now = iat || Math.floor(Date.now() / 1000);
    const claims = { tenant: tenantOverride || theTenant, scope, org };
    if (player) claims.player = player;
    if (name) claims.player_name = name;
    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'ES256', kid })
      .setIssuer(issuer)
      .setAudience(aud)
      .setSubject(sub)
      .setIssuedAt(now)
      .setExpirationTime(now + ttl)
      .sign(key);
  };

  const api = request(built.app);
  // Gọi API với một bộ scope; tự thêm Idempotency-Key cho POST nếu không đưa.
  // Token của `as` sống 300 giây (mức tối đa service chấp nhận): một file test chạy quá
  // 60 giây + 30 giây dung sai thì token 60 giây hết hạn giữa chừng → 401 (gặp ở plan 18 mục 9).
  const as = async (claims) => {
    const bearer = `Bearer ${await token({ ttl: 300, ...claims })}`;
    const wrap = (method) => (url, { key } = {}) => {
      const req = api[method](url).set('Authorization', bearer);
      if ((method === 'post' || method === 'put') && key !== false) req.set('Idempotency-Key', key || crypto.randomUUID());
      return req;
    };
    return { get: wrap('get'), post: wrap('post'), put: wrap('put'), patch: wrap('patch'), delete: wrap('delete') };
  };

  const sendEvent = (event, { secret = INBOUND_SECRET, timestamp = Math.floor(Date.now() / 1000), source = 'bd-core' } = {}) => {
    const body = JSON.stringify(event);
    return api
      .post('/v1/events')
      .set('Content-Type', 'application/json')
      .set('X-Event-Source', source)
      .set('X-Timestamp', String(timestamp))
      .set('X-Signature', sign(secret, timestamp, body))
      .send(body);
  };

  return {
    tenant: theTenant,
    app: built.app,
    api,
    as,
    token,
    sendEvent,
    models,
    sequelize,
    built,
    eventValidator: createEventValidator(),
    close: () => sequelize.close()
  };
};

const ANSWERS_EX42 = { serve: 3, clear: 3, backhand: 2, smash: 3, drop: 3, net: 4, defense: 3, footwork: 3, stamina: 3, tactics: 3, rotation: 4, experience: 3 };
const allAnswers = (level) => Object.fromEntries(Object.keys(ANSWERS_EX42).map((k) => [k, level]));

const STAFF = 'rating:read rating:assess player:write ranking:read matchmaking:compute';
const MANAGER = `${STAFF} rating:assess:any rating:adjust`;

module.exports = { createTestContext, ANSWERS_EX42, allAnswers, STAFF, MANAGER, INBOUND_SECRET };
