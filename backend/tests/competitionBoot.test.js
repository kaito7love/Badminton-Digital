const { execFileSync } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const jwt = require('jsonwebtoken');
const { buildBootEnv, shellQuote } = require('../scripts/competition-boot');
const { loadCompetitionConfig } = require('../src/integrations/competition/config');
const { signServiceToken } = require('../src/integrations/competition/serviceToken');

const EVENT = crypto.randomBytes(32).toString('base64');
const WEBHOOK = crypto.randomBytes(32).toString('base64');
const SCRIPT = path.join(__dirname, '..', 'scripts', 'competition-boot.js');

describe('competition-boot (bản demo một container)', () => {
  test('thiếu / ngắn / trùng secret → lỗi nêu đích danh', () => {
    expect(() => buildBootEnv({})).toThrow(/COMPETITION_EVENT_SECRET/);
    expect(() => buildBootEnv({ COMPETITION_EVENT_SECRET: EVENT })).toThrow(/COMPETITION_WEBHOOK_SECRET/);
    expect(() => buildBootEnv({ COMPETITION_EVENT_SECRET: 'ngan', COMPETITION_WEBHOOK_SECRET: WEBHOOK })).toThrow(/32/);
    expect(() => buildBootEnv({ COMPETITION_EVENT_SECRET: EVENT, COMPETITION_WEBHOOK_SECRET: EVENT })).toThrow(/khác nhau/);
  });

  test('suy ra biến cho cả hai process: service nghe 127.0.0.1, webhook về đúng cổng backend, dùng đúng hai secret Render đưa vào', () => {
    const { exports } = buildBootEnv({ COMPETITION_EVENT_SECRET: EVENT, COMPETITION_WEBHOOK_SECRET: WEBHOOK, PORT: '10000' });
    const vars = Object.fromEntries(exports);
    expect(Object.keys(vars)).toEqual(['COMPETITION_SERVICE_URL', 'COMPETITION_KEY_ID', 'COMPETITION_SIGNING_KEY', 'COMPETITION_EVENT_SECRET', 'COMPETITION_WEBHOOK_SECRET', 'TRUSTED_ISSUERS', 'INBOUND_SOURCES', 'WEBHOOK_TARGETS']);
    expect(vars.COMPETITION_SERVICE_URL).toBe('http://127.0.0.1:5100');
    expect(JSON.parse(vars.INBOUND_SOURCES)[0].secret).toBe(EVENT);
    const target = JSON.parse(vars.WEBHOOK_TARGETS)[0];
    expect(target).toMatchObject({ url: 'http://127.0.0.1:10000/api/v1/integrations/competition/events', secret: WEBHOOK });
    expect(JSON.stringify(JSON.parse(vars.TRUSTED_ISSUERS))).not.toMatch(/"d":/); // chỉ khoá công khai
  });

  test('mỗi lần khởi động ra một khoá khác nhau', () => {
    const env = { COMPETITION_EVENT_SECRET: EVENT, COMPETITION_WEBHOOK_SECRET: WEBHOOK };
    const a = Object.fromEntries(buildBootEnv(env).exports);
    const b = Object.fromEntries(buildBootEnv(env).exports);
    expect(a.COMPETITION_SIGNING_KEY).not.toBe(b.COMPETITION_SIGNING_KEY);
  });

  test('shellQuote giữ nguyên mọi ký tự, kể cả nháy đơn, $, xuống dòng', () => {
    const nasty = "a'b\"c $HOME `x` \\n\nsau";
    const out = execFileSync('sh', ['-c', `X=${shellQuote(nasty)}; printf %s "$X"`]).toString();
    expect(out).toBe(nasty);
  });

  test('chạy thật qua sh như entrypoint: eval → backend nạp được cấu hình, token ký ra kiểm được bằng khoá công khai trong TRUSTED_ISSUERS', () => {
    const script = `out=$(node ${JSON.stringify(SCRIPT)}); eval "$out"; node -e "process.stdout.write(JSON.stringify(process.env))"`;
    const env = execFileSync('sh', ['-c', script], {
      env: { ...process.env, COMPETITION_EVENT_SECRET: EVENT, COMPETITION_WEBHOOK_SECRET: WEBHOOK, PORT: '5000' }
    }).toString();
    const parsed = JSON.parse(env);

    const config = loadCompetitionConfig(parsed);
    expect(config.enabled).toBe(true);
    const token = signServiceToken(config, { sub: 'bd:user:1', scope: ['ranking:read'], org: [] });
    const jwk = JSON.parse(parsed.TRUSTED_ISSUERS)[0].jwks.keys[0];
    expect(jwk.kid).toBe(config.keyId);
    const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
    expect(() => jwt.verify(token, publicKey, { algorithms: ['ES256'], audience: 'competition-service' })).not.toThrow();
  });

  test('entrypoint dừng khi cấu hình sai: tách bước gán khỏi eval để `set -e` bắt được mã thoát khác 0', () => {
    const script = `set -e; out=$(node ${JSON.stringify(SCRIPT)}); eval "$out"; echo KHONG_DUOC_TOI_DAY`;
    let error;
    try {
      execFileSync('sh', ['-c', script], { env: { ...process.env, COMPETITION_EVENT_SECRET: '', COMPETITION_WEBHOOK_SECRET: '' }, stdio: 'pipe' });
    } catch (err) {
      error = err;
    }
    expect(error).toBeDefined();
    expect(String(error.stdout)).not.toContain('KHONG_DUOC_TOI_DAY');
    expect(String(error.stderr)).toMatch(/competition-boot/);
  });
});
