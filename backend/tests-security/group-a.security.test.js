// Kế hoạch 37, nhóm A — R6, R11, R12 trên app thật, DB thử đã migrate + seed.
const { api, bearer, sequelize, registerCustomer, unique } = require('./helpers');

afterAll(async () => { await sequelize.close(); });

describe('R6: không lộ trạng thái khoá khi chưa biết mật khẩu', () => {
  let me;
  beforeAll(async () => {
    me = await registerCustomer(unique());
    await sequelize.query('UPDATE users SET is_active = 0 WHERE phone = ?', { replacements: [me.phone] });
  });

  test('mật khẩu sai → 401 (giống tài khoản không tồn tại)', async () => {
    const locked = await api().post('/api/v1/auth/login').send({ identifier: me.phone, password: 'Sai@12345' });
    const missing = await api().post('/api/v1/auth/login').send({ identifier: '0900000001', password: 'Sai@12345' });
    expect(locked.status).toBe(401);
    expect(locked.body.message).toBe(missing.body.message);
  });

  test('mật khẩu đúng → 403 vô hiệu hóa', async () => {
    const res = await api().post('/api/v1/auth/login').send({ identifier: me.phone, password: me.password });
    expect(res.status).toBe(403);
  });
});

describe('R11: đầu vào sai trả 400, không 500', () => {
  test.each([
    ['from không có thật', '/api/v1/reports/revenue?period=daily&from=2026-13-45&to=2026-12-31'],
    ['from là chữ', '/api/v1/reports/revenue?from=abc'],
    ['năm 5 chữ số', '/api/v1/reports/export-excel?from=99999-01-01'],
    ['period lạ', "/api/v1/reports/revenue-breakdown?period=daily'--"]
  ])('báo cáo: %s → 400', async (_, url) => {
    const res = await api().get(url).set('Authorization', bearer('admin'));
    expect(res.status).toBe(400);
  });

  test('báo cáo hợp lệ vẫn 200', async () => {
    const res = await api().get('/api/v1/reports/revenue?period=daily&from=2026-01-01&to=2026-12-31').set('Authorization', bearer('admin'));
    expect(res.status).toBe(200);
  });

  test('tạo khách với họ tên 300 ký tự → 400', async () => {
    const res = await api().post('/api/v1/customers').set('Authorization', bearer('employeeCn2'))
      .send({ fullName: 'x'.repeat(300), phone: unique() });
    expect(res.status).toBe(400);
  });

  test('id ngoài miền INT → 400', async () => {
    const res = await api().post('/api/v1/sales-orders').set('Authorization', bearer('employeeCn2')).send({ customerId: 9999999999999 });
    expect(res.status).toBe(400);
    const res2 = await api().get('/api/v1/bookings/99999999999999999999').set('Authorization', bearer('admin'));
    expect([400, 404]).toContain(res2.status);
  });
});

describe('R12: cài đặt được kiểm kiểu', () => {
  test.each([
    ['PUT /settings/pricing giá là chữ', 'put', '/api/v1/settings/pricing', { peakPrice: 'abc' }],
    ['PUT /settings/operating-hours giờ sai', 'put', '/api/v1/settings/operating-hours', { open: '99:99' }],
    ['PUT /settings khoá lạ', 'put', '/api/v1/settings', { key: 'khong_co_khoa_nay', value: { a: 1 } }]
  ])('%s → 400', async (_, method, url, body) => {
    const res = await api()[method](url).set('Authorization', bearer('admin')).send(body);
    expect(res.status).toBe(400);
  });

  test('ghi lại đúng giờ mở cửa hiện có vẫn 200 (không làm hỏng nút Lưu)', async () => {
    const current = await api().get('/api/v1/settings').set('Authorization', bearer('admin'));
    const hours = current.body.data.operating_hours;
    expect(hours).toBeTruthy();
    const res = await api().put('/api/v1/settings/operating-hours').set('Authorization', bearer('admin')).send(hours);
    expect(res.status).toBe(200);
  });
});
