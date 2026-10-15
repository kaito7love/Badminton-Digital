// Kế hoạch 37, nhóm C — R3 + R4 trên app thật, DB thử đã chạy migration 20261015100001.
const jwt = require('jsonwebtoken');
const { api, sequelize, registerCustomer, unique, tokenFor } = require('./helpers');

afterAll(async () => { await sequelize.close(); });

const bearer = (t) => `Bearer ${t}`;

describe('R3: xoay vòng refresh token và ân hạn', () => {
  let me;
  let tokens;

  beforeAll(async () => {
    me = await registerCustomer(unique());
    const res = await api().post('/api/v1/auth/login').send({ identifier: me.phone, password: me.password });
    tokens = res.body.data;
  });

  test('hai request refresh CÙNG token đồng thời: cả hai 200, đúng một bên được refresh token mới', async () => {
    const [a, b] = await Promise.all([
      api().post('/api/v1/auth/refresh-token').send({ refreshToken: tokens.refreshToken }),
      api().post('/api/v1/auth/refresh-token').send({ refreshToken: tokens.refreshToken })
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const rotated = [a, b].filter((r) => typeof r.body.data.refreshToken === 'string');
    expect(rotated).toHaveLength(1);
    expect(typeof a.body.data.accessToken).toBe('string');
    expect(typeof b.body.data.accessToken).toBe('string');
    tokens = { ...tokens, refreshToken: rotated[0].body.data.refreshToken };
  });

  test('token mới (bên thắng cuộc) dùng được và xoay tiếp', async () => {
    const res = await api().post('/api/v1/auth/refresh-token').send({ refreshToken: tokens.refreshToken });
    expect(res.status).toBe(200);
    expect(typeof res.body.data.refreshToken).toBe('string');
    tokens = { ...tokens, refreshToken: res.body.data.refreshToken, stale: tokens.refreshToken };
  });

  test('token cũ vẫn trong ân hạn → access token (không có refresh token mới)', async () => {
    const res = await api().post('/api/v1/auth/refresh-token').send({ refreshToken: tokens.stale });
    expect(res.status).toBe(200);
    expect(res.body.data.refreshToken).toBeUndefined();
  });

  test('token cũ QUÁ ân hạn → 401', async () => {
    await sequelize.query('UPDATE users SET previous_refresh_expires_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE) WHERE phone = ?', { replacements: [me.phone] });
    const res = await api().post('/api/v1/auth/refresh-token').send({ refreshToken: tokens.stale });
    expect(res.status).toBe(401);
  });

  test('token hiện tại vẫn còn hiệu lực sau khi ân hạn của token cũ đã hết', async () => {
    const res = await api().post('/api/v1/auth/refresh-token').send({ refreshToken: tokens.refreshToken });
    expect(res.status).toBe(200);
  });

  test('/auth/me không lộ trường mới (token_version, previous_*)', async () => {
    const res = await api().get('/api/v1/auth/me').set('Authorization', bearer(tokenFor(me)));
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/tokenVersion|token_version|previousRefresh|previous_refresh/);
  });
});

describe('R4: access token bị thu hồi ngay', () => {
  let me;
  let deviceA;
  let deviceB;

  beforeAll(async () => {
    me = await registerCustomer(unique());
    deviceA = (await api().post('/api/v1/auth/login').send({ identifier: me.phone, password: me.password })).body.data;
    deviceB = (await api().post('/api/v1/auth/login').send({ identifier: me.phone, password: me.password })).body.data;
  });

  test('token phát trước khi có cột (không có tv) vẫn dùng được ở version 0', async () => {
    const legacy = jwt.sign({ id: me.id, email: me.email, role: 'customer' }, process.env.JWT_ACCESS_SECRET, { expiresIn: '5m' });
    const res = await api().get('/api/v1/auth/me').set('Authorization', bearer(legacy));
    expect(res.status).toBe(200);
  });

  test('cả hai thiết bị đang dùng được trước khi đổi mật khẩu', async () => {
    expect((await api().get('/api/v1/auth/me').set('Authorization', bearer(deviceA.accessToken))).status).toBe(200);
    expect((await api().get('/api/v1/auth/me').set('Authorization', bearer(deviceB.accessToken))).status).toBe(200);
  });

  test('B đổi mật khẩu: access token của A bị 401 NGAY, access token mới của B dùng được', async () => {
    const newPassword = 'Doi-Mat-Khau-Moi-77!';
    const change = await api().put('/api/v1/auth/change-password').set('Authorization', bearer(deviceB.accessToken))
      .send({ oldPassword: me.password, newPassword });
    expect(change.status).toBe(200);

    const a = await api().get('/api/v1/auth/me').set('Authorization', bearer(deviceA.accessToken));
    expect(a.status).toBe(401);
    const bOld = await api().get('/api/v1/auth/me').set('Authorization', bearer(deviceB.accessToken));
    expect(bOld.status).toBe(401); // chính token cũ của B cũng bị thu hồi — B phải dùng token mới
    const bNew = await api().get('/api/v1/auth/me').set('Authorization', bearer(change.body.data.accessToken));
    expect(bNew.status).toBe(200);
    me.password = newPassword;
    deviceB = { ...deviceB, ...change.body.data };
  });

  test('luồng SSE (?token=) cũng từ chối access token đã bị thu hồi', async () => {
    const res = await api().get(`/api/v1/realtime/stream?token=${encodeURIComponent(deviceA.accessToken)}`);
    expect(res.status).toBe(401);
    const gateway = await api().get('/api/v1/competition/me').set('Authorization', bearer(deviceA.accessToken));
    expect([401, 503]).toContain(gateway.status); // 503 khi tích hợp thi đấu tắt; quan trọng là KHÔNG 200
  });

  test('refresh token mới của B cấp được access token hợp lệ (mang version mới)', async () => {
    const res = await api().post('/api/v1/auth/refresh-token').send({ refreshToken: deviceB.refreshToken });
    expect(res.status).toBe(200);
    const check = await api().get('/api/v1/auth/me').set('Authorization', bearer(res.body.data.accessToken));
    expect(check.status).toBe(200);
  });

  test('logout: access token và refresh token đều hết hiệu lực ngay', async () => {
    const login = await api().post('/api/v1/auth/login').send({ identifier: me.phone, password: me.password });
    const { accessToken, refreshToken } = login.body.data;
    expect((await api().post('/api/v1/auth/logout').set('Authorization', bearer(accessToken))).status).toBe(200);
    expect((await api().get('/api/v1/auth/me').set('Authorization', bearer(accessToken))).status).toBe(401);
    expect((await api().post('/api/v1/auth/refresh-token').send({ refreshToken })).status).toBe(401);
  });
});
