const { generateKeyPair } = require('jose');
const { createTestContext } = require('./helpers');

// Xác thực service token + scope + cô lập tenant (docs/01 mục 6).
let ctx;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(() => ctx.close());

const get = async (tokenPromise, url = '/v1/players') => ctx.api.get(url).set('Authorization', `Bearer ${await tokenPromise}`);

describe('service token', () => {
  test('không có token → 401 UNAUTHENTICATED (trước cả kiểm hợp đồng)', async () => {
    const res = await ctx.api.post('/v1/me/assessments').send({ nonsense: true });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ success: false, code: 'UNAUTHENTICATED', data: null });
  });

  test('token hợp lệ + đúng scope → 200', async () => {
    const res = await get(ctx.token({ scope: 'rating:read' }));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ items: [], total: 0, page: 1 });
  });

  test('ký bằng khoá khác → 401', async () => {
    const { privateKey } = await generateKeyPair('ES256');
    expect((await get(ctx.token({ scope: 'rating:read', key: privateKey }))).status).toBe(401);
  });

  test('bên ký lạ / sai audience / hết hạn / sống quá lâu → 401', async () => {
    expect((await get(ctx.token({ scope: 'rating:read', issuer: 'someone-else' }))).status).toBe(401);
    expect((await get(ctx.token({ scope: 'rating:read', aud: 'other-service' }))).status).toBe(401);
    const old = Math.floor(Date.now() / 1000) - 600;
    const expired = await get(ctx.token({ scope: 'rating:read', iat: old, ttl: 60 }));
    expect(expired.status).toBe(401);
    expect(expired.body.message).toMatch(/hết hạn/);
    const longLived = await get(ctx.token({ scope: 'rating:read', ttl: 3600 }));
    expect(longLived.status).toBe(401);
    expect(longLived.body.message).toMatch(/quá dài/);
  });

  test('thiếu scope → 403 FORBIDDEN_SCOPE', async () => {
    const res = await get(ctx.token({ scope: 'rating:self' }));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_SCOPE');
  });

  test('tenant khác không thấy hồ sơ (404, không lộ tồn tại)', async () => {
    const staff = await ctx.as({ scope: 'player:write rating:read' });
    const created = await staff.put('/v1/players/by-ref/bd:customer:iso1').send({ displayName: 'Cô Lập' });
    expect(created.status).toBe(201);
    const other = await ctx.api
      .get(`/v1/players/${created.body.data.id}`)
      .set('Authorization', `Bearer ${await ctx.token({ scope: 'rating:read', tenantOverride: 'another-tenant' })}`);
    expect(other.status).toBe(404);
    expect(other.body.code).toBe('NOT_FOUND');
  });

  test('endpoint không có trong hợp đồng → 404; body sai hợp đồng → 400 VALIDATION_FAILED', async () => {
    const staff = await ctx.as({ scope: 'player:write rating:read' });
    expect((await staff.get('/v1/khong-co')).status).toBe(404);
    const bad = await staff.put('/v1/players/by-ref/bd:customer:x').send({ displayName: '', extra: 1 });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('VALIDATION_FAILED');
    expect(bad.body.errors.length).toBeGreaterThan(0);
  });

  test('health không cần token; X-Request-Id được giữ nguyên', async () => {
    const res = await ctx.api.get('/health/ready').set('X-Request-Id', 'req-abc-123');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
    expect(res.headers['x-request-id']).toBe('req-abc-123');
  });
});
