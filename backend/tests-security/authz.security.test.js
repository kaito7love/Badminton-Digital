// Kế hoạch 32, nhóm B + E — IDOR, chéo chi nhánh, rò dữ liệu, trên DB thử đã migrate + seed.
const { api, bearer, tokenFor, registerCustomer, unique, sequelize } = require('./helpers');

afterAll(async () => { await sequelize.close(); });

const tomorrow = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(Date.now() + 86400000));

describe('B1: khách không vào được khu nhân viên', () => {
  test.each([
    ['get', '/api/v1/employees'], ['get', '/api/v1/customers'], ['get', '/api/v1/reports/dashboard'],
    ['get', '/api/v1/activity-logs'], ['put', '/api/v1/settings'], ['get', '/api/v1/branches'], ['get', '/api/v1/courts']
  ])('%s %s → 403', async (method, url) => {
    const res = await api()[method](url).set('Authorization', bearer('customer')).send({});
    expect(res.status).toBe(403);
  });

  test('không token → 401 ở route cần đăng nhập', async () => {
    expect((await api().get('/api/v1/bookings')).status).toBe(401);
  });
});

describe('B2: khách không đụng được dữ liệu của khách khác', () => {
  let owner;
  let intruder;
  let bookingId;
  let ownerCustomerId;

  beforeAll(async () => {
    owner = await registerCustomer(unique());
    intruder = await registerCustomer(unique());
    const courts = await api().get('/api/v1/public/courts?branchId=1');
    const list = courts.body.data.courts || courts.body.data;
    // Chạy lại nhiều lần trên cùng DB thử thì slot cũ đã bị chiếm (409): dò tới khi có slot trống.
    let res;
    for (const court of list) {
      for (let hour = 7; hour <= 21 && !(res && res.status === 201); hour += 1) {
        const pad = (n) => String(n).padStart(2, '0');
        res = await api().post('/api/v1/bookings').set('Authorization', `Bearer ${tokenFor(owner)}`)
          .send({ courtId: court.id, bookingDate: tomorrow(), startTime: `${pad(hour)}:00`, endTime: `${pad(hour + 1)}:00` });
      }
      if (res && res.status === 201) break;
    }
    expect([200, 201]).toContain(res.status);
    bookingId = res.body.data.id;
    const own = await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${tokenFor(owner)}`);
    ownerCustomerId = own.body.data.customer.id;
  });

  test('xem booking của người khác → bị chặn', async () => {
    const res = await api().get(`/api/v1/bookings/${bookingId}`).set('Authorization', `Bearer ${tokenFor(intruder)}`);
    expect([403, 404]).toContain(res.status);
  });

  test('huỷ booking của người khác → bị chặn và booking còn nguyên', async () => {
    const res = await api().delete(`/api/v1/bookings/${bookingId}`).set('Authorization', `Bearer ${tokenFor(intruder)}`);
    expect([403, 404]).toContain(res.status);
    const still = await api().get(`/api/v1/bookings/${bookingId}`).set('Authorization', `Bearer ${tokenFor(owner)}`);
    expect(still.body.data.status).not.toBe('cancelled');
  });

  test('danh sách booking của người lạ không chứa booking này', async () => {
    const res = await api().get('/api/v1/bookings').set('Authorization', `Bearer ${tokenFor(intruder)}`);
    const rows = res.body.data.items || res.body.data.bookings || res.body.data;
    expect(rows.map((b) => b.id)).not.toContain(bookingId);
  });

  test('xem hồ sơ và lịch sử của khách khác → bị chặn', async () => {
    for (const url of [`/api/v1/customers/${ownerCustomerId}`, `/api/v1/customers/${ownerCustomerId}/history`]) {
      const res = await api().get(url).set('Authorization', `Bearer ${tokenFor(intruder)}`);
      expect([403, 404]).toContain(res.status);
    }
  });
});

describe('B3: nhân viên chi nhánh này không đụng được chi nhánh khác', () => {
  // id theo seeder: sân 8 / hoá đơn 12 / đơn 12 / phiếu nhập 6 thuộc chi nhánh 3.
  test.each([
    ['/api/v1/courts/8'], ['/api/v1/invoices/12'], ['/api/v1/sales-orders/12'], ['/api/v1/goods-receipts/6']
  ])('nhân viên CN2 GET %s (dữ liệu CN3) → bị chặn', async (url) => {
    const res = await api().get(url).set('Authorization', bearer('employeeCn2'));
    expect([403, 404]).toContain(res.status);
  });

  test('X-Branch-Id khác chi nhánh của mình → 403', async () => {
    const res = await api().get('/api/v1/bookings').set('Authorization', bearer('employeeCn2')).set('X-Branch-Id', '3');
    expect(res.status).toBe(403);
  });

  test('khách gửi X-Branch-Id → 403', async () => {
    const res = await api().get('/api/v1/bookings').set('Authorization', bearer('customer')).set('X-Branch-Id', '2');
    expect(res.status).toBe(403);
  });

  // --- lỗi đã biết (báo cáo 33, R8) ---
  test.failing('R8: GET /sessions/:id/extras của phiên chi nhánh khác bị chặn', async () => {
    await api().post('/api/v1/courts/9/open').set('Authorization', bearer('employeeCn3')).send({});
    const [row] = await sequelize.query('SELECT id FROM court_sessions WHERE branch_id = 3 ORDER BY id DESC LIMIT 1', { type: 'SELECT' });
    const res = await api().get(`/api/v1/sessions/${row.id}/extras`).set('Authorization', bearer('employeeCn2'));
    expect([403, 404]).toContain(res.status);
  });
});

describe('E1: không rò trường bí mật', () => {
  test.each([
    ['admin', '/api/v1/auth/me'], ['admin', '/api/v1/employees'], ['admin', '/api/v1/customers'],
    ['managerCn2', '/api/v1/employees'], ['customer', '/api/v1/auth/me'], ['employeeCn2', '/api/v1/customers']
  ])('%s GET %s', async (who, url) => {
    const res = await api().get(url).set('Authorization', bearer(who));
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|password_hash|refreshToken|refresh_token|\$2[aby]\$\d{2}\$/);
  });
});
