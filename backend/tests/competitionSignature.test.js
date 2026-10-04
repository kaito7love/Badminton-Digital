const { sign, verify } = require('../src/integrations/competition/signature');

const SECRET = 'signature-secret-used-only-in-tests-0123456789';
const BODY = JSON.stringify({ id: 'e1', type: 'bd.customer.merged', data: { sourceRef: 'bd:customer:1', targetRef: 'bd:customer:2' } });
const NOW = 1_790_000_000_000;
const ts = Math.floor(NOW / 1000);

describe('chữ ký webhook HMAC hai chiều', () => {
  test('đúng dạng sha256=<hex> và đúng khi kiểm lại', () => {
    const signature = sign(SECRET, ts, BODY);
    expect(signature).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(verify({ secret: SECRET, signature, timestamp: String(ts), body: BODY, now: NOW })).toBe(true);
  });

  test.each([
    ['sai secret', (s) => ({ ...s, secret: 'khac-secret-khac-secret-khac-secret-0123' })],
    ['sửa thân', (s) => ({ ...s, body: `${BODY} ` })],
    ['sửa timestamp', (s) => ({ ...s, timestamp: String(ts + 1) })],
    ['thiếu chữ ký', (s) => ({ ...s, signature: undefined })],
    ['thiếu timestamp', (s) => ({ ...s, timestamp: undefined })],
    ['timestamp không phải số', (s) => ({ ...s, timestamp: 'abc' })],
    ['chữ ký ngắn hơn', (s) => ({ ...s, signature: 'sha256=abc' })],
    ['lệch giờ quá 5 phút (cũ)', (s) => ({ ...s, now: NOW + 301_000 })],
    ['lệch giờ quá 5 phút (tương lai)', (s) => ({ ...s, now: NOW - 301_000 })]
  ])('%s → từ chối', (_, mutate) => {
    const base = { secret: SECRET, signature: sign(SECRET, ts, BODY), timestamp: String(ts), body: BODY, now: NOW };
    expect(verify(mutate(base))).toBe(false);
  });

  test('lệch 4 phút vẫn nhận', () => {
    expect(verify({ secret: SECRET, signature: sign(SECRET, ts, BODY), timestamp: String(ts), body: BODY, now: NOW + 240_000 })).toBe(true);
  });

  test('khớp với cách ký của service (cùng công thức HMAC(secret, timestamp + "." + body))', () => {
    // Giá trị tham chiếu tính độc lập bằng crypto thuần.
    const expected = `sha256=${require('crypto').createHmac('sha256', SECRET).update(`${ts}.${BODY}`).digest('hex')}`;
    expect(sign(SECRET, ts, BODY)).toBe(expected);
  });
});
