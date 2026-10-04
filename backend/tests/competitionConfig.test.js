const crypto = require('crypto');
const { loadCompetitionConfig, ConfigError, getEventIdentity } = require('../src/integrations/competition/config');
const { baseEnv, PRIVATE_PEM, EVENT_SECRET } = require('./competitionTestKit');

describe('cấu hình competition-service', () => {
  test('không đặt biến nào → tắt', () => {
    expect(loadCompetitionConfig({})).toEqual({ enabled: false });
  });

  test('biến để trống (như .env.example) cũng là tắt', () => {
    expect(loadCompetitionConfig({ COMPETITION_SERVICE_URL: '', COMPETITION_SIGNING_KEY: '  ' })).toEqual({ enabled: false });
  });

  test('đủ và hợp lệ → bật, có mặc định cho issuer / tenant / audience', () => {
    const config = loadCompetitionConfig(baseEnv());
    expect(config).toMatchObject({
      enabled: true,
      serviceUrl: 'http://127.0.0.1:5100',
      keyId: 'core-test',
      issuer: 'badminton-digital-core',
      tenant: 'badminton-digital',
      audience: 'competition-service'
    });
  });

  test('bỏ dấu / cuối URL; cho phép ghi đè issuer, tenant, audience', () => {
    const config = loadCompetitionConfig(baseEnv({
      COMPETITION_SERVICE_URL: 'https://cs.example.com/',
      COMPETITION_ISSUER: 'core-x',
      COMPETITION_TENANT: 't1',
      COMPETITION_AUDIENCE: 'aud-x'
    }));
    expect(config).toMatchObject({ serviceUrl: 'https://cs.example.com', issuer: 'core-x', tenant: 't1', audience: 'aud-x' });
  });

  test('khoá PEM viết một dòng với \\n (dán vào .env / dashboard) vẫn dùng được', () => {
    const oneLine = PRIVATE_PEM.trim().replace(/\n/g, '\\n');
    expect(loadCompetitionConfig(baseEnv({ COMPETITION_SIGNING_KEY: oneLine })).enabled).toBe(true);
  });

  test('đặt dở dang → lỗi nêu đích danh biến thiếu', () => {
    const env = baseEnv();
    delete env.COMPETITION_SIGNING_KEY;
    delete env.COMPETITION_KEY_ID;
    expect(() => loadCompetitionConfig(env)).toThrow(ConfigError);
    expect(() => loadCompetitionConfig(env)).toThrow(/COMPETITION_SIGNING_KEY, COMPETITION_KEY_ID/);
  });

  test.each([
    ['URL không hợp lệ', { COMPETITION_SERVICE_URL: 'không phải url' }, /COMPETITION_SERVICE_URL/],
    ['URL sai giao thức', { COMPETITION_SERVICE_URL: 'ftp://x' }, /COMPETITION_SERVICE_URL/],
    ['khoá không phải PEM', { COMPETITION_SIGNING_KEY: 'abc' }, /COMPETITION_SIGNING_KEY/],
    ['secret chiều đi quá ngắn', { COMPETITION_EVENT_SECRET: 'ngan' }, /COMPETITION_EVENT_SECRET cần tối thiểu 32/],
    ['secret chiều về quá ngắn', { COMPETITION_WEBHOOK_SECRET: 'ngan' }, /COMPETITION_WEBHOOK_SECRET cần tối thiểu 32/],
    ['hai secret trùng nhau', { COMPETITION_WEBHOOK_SECRET: EVENT_SECRET }, /phải khác nhau/]
  ])('%s → lỗi', (_, overrides, pattern) => {
    expect(() => loadCompetitionConfig(baseEnv(overrides))).toThrow(pattern);
  });

  test('khoá không phải EC P-256 (RSA, secp256k1) bị từ chối — service chỉ nhận ES256', () => {
    const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
    const k1 = crypto.generateKeyPairSync('ec', { namedCurve: 'secp256k1' }).privateKey.export({ type: 'pkcs8', format: 'pem' });
    expect(() => loadCompetitionConfig(baseEnv({ COMPETITION_SIGNING_KEY: rsa }))).toThrow(/ES256/);
    expect(() => loadCompetitionConfig(baseEnv({ COMPETITION_SIGNING_KEY: k1 }))).toThrow(/ES256/);
  });

  test('danh tính sự kiện có sẵn ngay cả khi cổng tắt (outbox vẫn ghi)', () => {
    expect(getEventIdentity({})).toEqual({ source: 'badminton-digital-core', tenant: 'badminton-digital' });
    expect(getEventIdentity({ COMPETITION_ISSUER: 'x', COMPETITION_TENANT: 'y' })).toEqual({ source: 'x', tenant: 'y' });
  });
});
