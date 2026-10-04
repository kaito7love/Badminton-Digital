const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { generateKeyset, parseArgs } = require('../scripts/competition-keys');
const { loadCompetitionConfig } = require('../src/integrations/competition/config');
const { signServiceToken } = require('../src/integrations/competition/serviceToken');

const parseEnv = (text) => Object.fromEntries(
  text.split('\n').filter((l) => l && !l.startsWith('#')).map((l) => {
    const i = l.indexOf('=');
    let value = l.slice(i + 1);
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    return [l.slice(0, i), value];
  })
);

describe('npm run competition:keys', () => {
  const now = new Date('2026-10-05T00:00:00Z');
  const { env, keyId, publicJwks } = generateKeyset({ now, serviceUrl: 'http://127.0.0.1:5100', backendUrl: 'http://127.0.0.1:5000' });
  const vars = parseEnv(env);

  test('khối backend nạp được thẳng vào cấu hình cổng (dán vào .env là chạy)', () => {
    const config = loadCompetitionConfig(vars);
    expect(config.enabled).toBe(true);
    expect(config.keyId).toBe('core-2026-10');
    expect(keyId).toBe('core-2026-10');
  });

  test('token ký bằng khoá bí mật kiểm được bằng khoá công khai trong TRUSTED_ISSUERS (đúng dạng service đọc)', () => {
    const config = loadCompetitionConfig(vars);
    const token = signServiceToken(config, { sub: 'anonymous', scope: ['ranking:read'], org: [] });
    const issuers = JSON.parse(vars.TRUSTED_ISSUERS);
    expect(issuers).toHaveLength(1);
    expect(issuers[0].issuer).toBe('badminton-digital-core');
    const jwk = issuers[0].jwks.keys[0];
    expect(jwk).toMatchObject({ kty: 'EC', crv: 'P-256', kid: 'core-2026-10', alg: 'ES256' });
    expect(jwk.d).toBeUndefined(); // khoá công khai tuyệt đối không có thành phần bí mật
    const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    expect(() => jwt.verify(token, publicKey, { algorithms: ['ES256'], audience: 'competition-service' })).not.toThrow();
    expect(publicJwks.keys[0]).toEqual(jwk);
  });

  test('khối service: INBOUND_SOURCES / WEBHOOK_TARGETS dùng đúng hai secret của backend, hai chiều khác nhau', () => {
    const inbound = JSON.parse(vars.INBOUND_SOURCES)[0];
    const target = JSON.parse(vars.WEBHOOK_TARGETS)[0];
    expect(inbound).toMatchObject({ source: 'badminton-digital-core', tenant: 'badminton-digital', secret: vars.COMPETITION_EVENT_SECRET });
    expect(target).toMatchObject({ url: 'http://127.0.0.1:5000/api/v1/integrations/competition/events', secret: vars.COMPETITION_WEBHOOK_SECRET, types: ['competition.*'] });
    expect(inbound.secret).not.toBe(target.secret);
    expect(inbound.secret.length).toBeGreaterThanOrEqual(32);
  });

  test('mỗi lần chạy ra bộ khoá mới', () => {
    const other = parseEnv(generateKeyset({ now }).env);
    expect(other.COMPETITION_EVENT_SECRET).not.toBe(vars.COMPETITION_EVENT_SECRET);
    expect(other.COMPETITION_SIGNING_KEY).not.toBe(vars.COMPETITION_SIGNING_KEY);
  });

  test('đọc tham số dòng lệnh', () => {
    expect(parseArgs(['--force', '--service-url', 'http://s', '--backend-url', 'http://b', '--kid', 'k1']))
      .toEqual({ force: true, serviceUrl: 'http://s', backendUrl: 'http://b', kid: 'k1' });
  });
});
