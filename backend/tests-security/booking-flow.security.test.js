// Kế hoạch 39 — flow "Đặt sân" từ website, bốn góc nhìn (khách, nhân viên, quản lý, admin), trên DB thử đã migrate + seed.
// Phần lớn là hồi quy cho hành vi ĐÚNG đã quan sát. Các lỗi mở (báo cáo 40, mục 🐞) dùng `test.failing`:
// test đang PASS vì lỗi còn đó — khi sửa xong, nó sẽ FAIL và nhắc đổi thành `test` thường.
const { api, tokenForCurrent, registerCustomer, unique, sequelize, DEMO } = require('./helpers');

const pad = (n) => String(n).padStart(2, '0');
const hhmm = (h) => `${pad(h)}:00`;
const dayFrom = (n) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(Date.now() + n * 86400000));
const auth = async (who) => `Bearer ${await tokenForCurrent(typeof who === 'string' ? DEMO[who] : who)}`;

const createdByTest = []; // { id, as } — dọn ở cuối để DB thử không đầy
const track = (res, as) => { if (res.status === 201) createdByTest.push({ id: res.body.data.id, as }); return res; };

afterAll(async () => {
  for (const { id, as } of createdByTest) {
    await api().delete(`/api/v1/bookings/${id}`).set('Authorization', await auth(as));
  }
  await sequelize.close();
});

const publicCourts = async (branchId = 1) => {
  const res = await api().get(`/api/v1/public/courts?branchId=${branchId}`);
  return res.body.data.courts || res.body.data;
};

// Dò một khung còn trống ở ngày +offset (DB thử dùng lại nhiều lần nên khung cố định sẽ bị chiếm).
const tryBook = async (as, { dayOffset, branchId = 1, hours = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15], length = 1, extra = {}, header = {} }) => {
  const courts = await publicCourts(branchId);
  const bookingDate = dayFrom(dayOffset);
  for (const court of courts) {
    for (const h of hours) {
      let req = api().post('/api/v1/bookings').set('Authorization', await auth(as));
      Object.entries(header).forEach(([k, v]) => { req = req.set(k, v); });
      const res = await req.send({ courtId: court.id, bookingDate, startTime: hhmm(h), endTime: hhmm(h + length), ...extra });
      if (res.status !== 409 && res.status !== 400) return { res, courtId: court.id, bookingDate, startHour: h };
      if (res.status === 400 && !/bảo trì|đã qua/.test(res.body.message || '')) return { res, courtId: court.id, bookingDate, startHour: h };
    }
  }
  throw new Error('không tìm được khung trống trong DB thử');
};

describe('Khách vãng lai: xem lưới ngày công khai', () => {
  test('không cần đăng nhập, không lộ thông tin khách, không cache', async () => {
    const res = await api().get(`/api/v1/public/availability/day?branchId=1&date=${dayFrom(2)}`);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toMatch(/no-store/);
    expect(JSON.stringify(res.body)).not.toMatch(/phone|fullName|email|customerId|createdBy|userId/i);
  });

  test.each([['date=abc'], ['date=2026-13-45'], ['date='], ['branchId=abc&date=2026-01-01'], ['branchId=99999&date=2026-01-01']])(
    'tham số sai (%s) → 4xx, không 5xx',
    async (qs) => {
      const res = await api().get(`/api/v1/public/availability/day?${qs.startsWith('branchId') ? qs : `branchId=1&${qs}`}`);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    }
  );

  test('không token thì đặt sân / xem availability nội bộ → 401', async () => {
    expect((await api().post('/api/v1/bookings').send({})).status).toBe(401);
    expect((await api().get('/api/v1/bookings/availability?courtId=1&bookingDate=2030-01-01&startTime=09:00&endTime=10:00')).status).toBe(401);
  });
});

describe('Khách: đặt sân', () => {
  let customer;
  let rival;
  beforeAll(async () => {
    customer = await registerCustomer(unique());
    rival = await registerCustomer(unique());
  });

  test('đặt hợp lệ → pending, gắn đúng khách + chi nhánh; trường nhạy cảm gửi kèm bị bỏ qua', async () => {
    const { res } = await tryBook(customer, { dayOffset: 5, extra: { status: 'confirmed', customerId: 9999, createdBy: 1, branchId: 3, totalAmount: 1 } });
    track(res, customer);
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.branchId).toBe(1);
    expect(res.body.data.customerId).not.toBe(9999);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|refreshToken/);
  });

  test('hai yêu cầu song song cùng khung: đúng một 201, một 409', async () => {
    const courts = await publicCourts();
    const bookingDate = dayFrom(6);
    // khung giờ cố định ở sân cuối; dò giờ chưa bị chiếm bằng GET availability của công khai
    const dayGrid = await api().get(`/api/v1/public/availability/day?branchId=1&date=${bookingDate}`);
    const grid = dayGrid.body.data;
    const court = (grid.courts || courts).find((c) => (c.slots || c.cells || []).length);
    const free = (court.slots || court.cells).find((s) => s.state === 'free');
    const start = free.start || free.startTime;
    const endH = `${pad(Number(start.slice(0, 2)) + 1)}:00`;
    const body = { courtId: court.courtId ?? court.id, bookingDate, startTime: start, endTime: endH };
    const [a, b] = await Promise.all([
      api().post('/api/v1/bookings').set('Authorization', await auth(customer)).send(body),
      api().post('/api/v1/bookings').set('Authorization', await auth(rival)).send(body)
    ]);
    track(a, customer); track(b, rival);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
  });

  test('đặt chồng một phần → 409; sát nhau → 201', async () => {
    const first = await tryBook(customer, { dayOffset: 7, hours: [8, 9, 10, 11] });
    track(first.res, customer);
    const overlap = await api().post('/api/v1/bookings').set('Authorization', await auth(rival))
      .send({ courtId: first.courtId, bookingDate: first.bookingDate, startTime: `${pad(first.startHour)}:30`, endTime: `${pad(first.startHour + 1)}:30` });
    expect(overlap.status).toBe(409);
    const adjacent = await api().post('/api/v1/bookings').set('Authorization', await auth(rival))
      .send({ courtId: first.courtId, bookingDate: first.bookingDate, startTime: hhmm(first.startHour + 1), endTime: hhmm(first.startHour + 2) });
    track(adjacent, rival);
    expect([201, 409]).toContain(adjacent.status); // 409 chỉ khi khung liền sau đã bị chiếm từ lần chạy trước
  });

  test('ranh giới 14 ngày và quá 3 giờ', async () => {
    const courts = await publicCourts();
    const body = (d, s, e) => ({ courtId: courts[0].id, bookingDate: dayFrom(d), startTime: s, endTime: e });
    const tooFar = await api().post('/api/v1/bookings').set('Authorization', await auth(customer)).send(body(14, '08:00', '09:00'));
    expect(tooFar.status).toBe(400);
    const tooLong = await api().post('/api/v1/bookings').set('Authorization', await auth(customer)).send(body(8, '06:00', '10:00'));
    expect(tooLong.status).toBe(400);
    const past = await api().post('/api/v1/bookings').set('Authorization', await auth(customer)).send(body(-1, '08:00', '09:00'));
    expect(past.status).toBe(400);
  });

  test.each([
    ['giờ kết thúc ≤ bắt đầu', { startTime: '11:00', endTime: '10:00' }],
    ['trước giờ mở cửa', { startTime: '04:00', endTime: '05:00' }],
    ['qua giờ đóng cửa', { startTime: '22:00', endTime: '23:30' }],
    ['giờ không hợp lệ', { startTime: '25:99', endTime: '26:00' }],
    ['ngày không tồn tại', { bookingDate: '2026-02-31' }],
    ['courtId chữ', { courtId: 'abc' }],
    ['courtId âm', { courtId: -4 }]
  ])('đầu vào sai (%s) → 4xx, không 5xx', async (_name, patch) => {
    const courts = await publicCourts();
    const res = await api().post('/api/v1/bookings').set('Authorization', await auth(customer))
      .send({ courtId: courts[0].id, bookingDate: dayFrom(3), startTime: '09:00', endTime: '10:00', ...patch });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  test('khách gửi X-Branch-Id → 403', async () => {
    const courts = await publicCourts();
    const res = await api().post('/api/v1/bookings').set('Authorization', await auth(customer)).set('X-Branch-Id', '2')
      .send({ courtId: courts[0].id, bookingDate: dayFrom(3), startTime: '09:00', endTime: '10:00' });
    expect(res.status).toBe(403);
  });

  test('khách không sửa giờ / không tự xác nhận / không huỷ của người khác; huỷ của mình → 200, huỷ lại → 400', async () => {
    const mine = await tryBook(customer, { dayOffset: 9 });
    track(mine.res, customer);
    const id = mine.res.body.data.id;
    expect((await api().put(`/api/v1/bookings/${id}`).set('Authorization', await auth(customer)).send({ startTime: '12:00', endTime: '13:00' })).status).toBe(403);
    expect((await api().put(`/api/v1/bookings/${id}/confirm`).set('Authorization', await auth(customer))).status).toBe(403);
    expect((await api().delete(`/api/v1/bookings/${id}`).set('Authorization', await auth(rival))).status).toBe(403);
    expect((await api().get(`/api/v1/bookings/${id}`).set('Authorization', await auth(rival))).status).toBe(403);
    const cancelled = await api().delete(`/api/v1/bookings/${id}`).set('Authorization', await auth(customer));
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe('cancelled');
    expect((await api().delete(`/api/v1/bookings/${id}`).set('Authorization', await auth(customer))).status).toBe(400);
  });

  test('"Lịch của tôi" chỉ có booking của chính khách', async () => {
    const res = await api().get('/api/v1/bookings?limit=100').set('Authorization', await auth(customer));
    expect(res.status).toBe(200);
    const rows = res.body.data.items || res.body.data.bookings || res.body.data;
    const me = (await api().get('/api/v1/auth/me').set('Authorization', await auth(customer))).body.data.customer.id;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((b) => b.customerId === me)).toBe(true);
  });
});

describe('Nhân viên / quản lý / admin: vận hành đặt sân', () => {
  let customer;
  beforeAll(async () => { customer = await registerCustomer(unique()); });

  test('xác nhận chỉ từ pending; xác nhận lại → 400; nhân viên chi nhánh khác không đụng được', async () => {
    const { res } = await tryBook(customer, { dayOffset: 10 });
    track(res, 'employeeCn1');
    const id = res.body.data.id;
    expect((await api().put(`/api/v1/bookings/${id}/confirm`).set('Authorization', await auth('employeeCn2'))).status).toBeGreaterThanOrEqual(403);
    expect((await api().put(`/api/v1/bookings/${id}/confirm`).set('Authorization', await auth('managerCn2'))).status).toBeGreaterThanOrEqual(403);
    const ok = await api().put(`/api/v1/bookings/${id}/confirm`).set('Authorization', await auth('employeeCn1'));
    expect(ok.status).toBe(200);
    expect(ok.body.data.status).toBe('confirmed');
    expect((await api().put(`/api/v1/bookings/${id}/confirm`).set('Authorization', await auth('employeeCn1'))).status).toBe(400);
  });

  test('sửa lịch: chỉ courtId/bookingDate/startTime/endTime; trường cấm → 400; ngày đã qua → 400', async () => {
    const { res } = await tryBook(customer, { dayOffset: 11 });
    track(res, 'employeeCn1');
    const id = res.body.data.id;
    const forbidden = await api().put(`/api/v1/bookings/${id}`).set('Authorization', await auth('employeeCn1')).send({ status: 'completed', customerId: 1, branchId: 3 });
    expect(forbidden.status).toBe(400);
    const past = await api().put(`/api/v1/bookings/${id}`).set('Authorization', await auth('employeeCn1')).send({ bookingDate: dayFrom(-2) });
    expect(past.status).toBe(400);
  });

  test('nhân viên đặt xa 30 ngày và 6 giờ liền được (khác khách)', async () => {
    const { res } = await tryBook('employeeCn1', {
      dayOffset: 30, hours: [6], length: 6, extra: { customerName: 'Khách Giải Đấu', customerPhone: `0918${String(Date.now()).slice(-7)}` }
    });
    track(res, 'employeeCn1');
    expect(res.status).toBe(201);
  });

  test('đặt hộ bằng SĐT của khách đã có tài khoản không đổi tên hồ sơ khách đó', async () => {
    const [[before]] = await sequelize.query('SELECT full_name FROM customers WHERE id = 1');
    const { res } = await tryBook('employeeCn1', { dayOffset: 12, extra: { customerName: 'Kẻ Mạo Danh', customerPhone: '0903333333' } });
    track(res, 'employeeCn1');
    expect(res.status).toBe(201);
    const [[after]] = await sequelize.query('SELECT full_name FROM customers WHERE id = 1');
    expect(after.full_name).toBe(before.full_name);
  });

  test('admin: sân chi nhánh khác khi chưa chọn chi nhánh → 404; chọn X-Branch-Id thì đặt/huỷ được', async () => {
    const courts3 = await publicCourts(3);
    const body = { courtId: courts3[0].id, bookingDate: dayFrom(13), startTime: '06:00', endTime: '07:00', customerName: 'Khách Admin', customerPhone: `0917${String(Date.now()).slice(-7)}` };
    const noBranch = await api().post('/api/v1/bookings').set('Authorization', await auth('admin')).send(body);
    expect(noBranch.status).toBe(404);
    const withBranch = await api().post('/api/v1/bookings').set('Authorization', await auth('admin')).set('X-Branch-Id', '3').send(body);
    expect([201, 409]).toContain(withBranch.status);
    if (withBranch.status === 201) {
      expect(withBranch.body.data.branchId).toBe(3);
      const del = await api().delete(`/api/v1/bookings/${withBranch.body.data.id}`).set('Authorization', await auth('admin')).set('X-Branch-Id', '3');
      expect(del.status).toBe(200);
    }
  });

  test('X-Branch-Id không tồn tại hoặc của người khác → 403', async () => {
    expect((await api().get('/api/v1/bookings').set('Authorization', await auth('admin')).set('X-Branch-Id', '999')).status).toBe(403);
    expect((await api().get('/api/v1/bookings').set('Authorization', await auth('managerCn2')).set('X-Branch-Id', '3')).status).toBe(403);
  });

  test('nhân viên chỉ thấy booking chi nhánh mình', async () => {
    const res = await api().get('/api/v1/bookings?limit=100').set('Authorization', await auth('employeeCn1'));
    const rows = res.body.data.items || res.body.data.bookings || res.body.data;
    expect(res.status).toBe(200);
    expect(rows.every((b) => b.branchId === 1)).toBe(true);
  });
});

describe('Vòng đời: đặt → xác nhận → mở sân → checkout', () => {
  test('booking thành completed; checkout lại cùng phiên idempotent; completed không huỷ/sửa được; chi nhánh khác không mở được', async () => {
    const customer = await registerCustomer(unique());
    // sân cuối của CN1, hôm nay (nhân viên đặt không bị chặn giờ đã qua với khung đang diễn ra? dùng khung cuối ngày)
    const courts = await publicCourts();
    const courtId = courts[courts.length - 1].id;
    let booking = null;
    for (let h = 22; h >= 5 && !booking; h -= 1) {
      const res = await api().post('/api/v1/bookings').set('Authorization', await auth('employeeCn1'))
        .send({ courtId, bookingDate: dayFrom(0), startTime: hhmm(h), endTime: hhmm(h + 1), customerName: 'Khách Vòng Đời', customerPhone: `0915${String(Date.now()).slice(-7)}` });
      if (res.status === 201) booking = res.body.data;
    }
    expect(booking).toBeTruthy();
    const empAuth = await auth('employeeCn1');
    expect((await api().put(`/api/v1/bookings/${booking.id}/confirm`).set('Authorization', empAuth)).status).toBe(200);

    // chi nhánh khác không mở được sân bằng booking của CN1
    const courts2 = await publicCourts(2);
    const crossOpen = await api().post(`/api/v1/courts/${courts2[0].id}/open`).set('Authorization', await auth('employeeCn2')).send({ bookingId: booking.id });
    expect([400, 404]).toContain(crossOpen.status);

    const open = await api().post(`/api/v1/courts/${courtId}/open`).set('Authorization', empAuth).send({ bookingId: booking.id });
    expect(open.status).toBe(201);
    const sessionId = open.body.data.session ? open.body.data.session.id : open.body.data.id;
    const co1 = await api().post('/api/v1/payments/checkout').set('Authorization', empAuth).send({ sessionId, paymentMethod: 'cash' });
    expect(co1.status).toBe(201);
    const co2 = await api().post('/api/v1/payments/checkout').set('Authorization', empAuth).send({ sessionId, paymentMethod: 'cash' });
    expect(co2.body.data.invoiceId).toBe(co1.body.data.invoiceId);
    const [[inv]] = await sequelize.query('SELECT COUNT(*) AS n FROM invoices WHERE session_id = ?', { replacements: [sessionId] });
    expect(Number(inv.n)).toBe(1);

    const after = await api().get(`/api/v1/bookings/${booking.id}`).set('Authorization', empAuth);
    expect(after.body.data.status).toBe('completed');
    expect((await api().delete(`/api/v1/bookings/${booking.id}`).set('Authorization', empAuth)).status).toBe(400);
    expect((await api().put(`/api/v1/bookings/${booking.id}`).set('Authorization', empAuth).send({ startTime: '21:00', endTime: '22:00' })).status).toBe(400);

    // khách không đọc được hoá đơn của người khác; nhân viên chi nhánh khác không đọc được
    const invoiceId = co1.body.data.invoiceId;
    expect((await api().get(`/api/v1/invoices/${invoiceId}`).set('Authorization', await auth('employeeCn2'))).status).toBeGreaterThanOrEqual(403);
    expect((await api().get(`/api/v1/invoices/${invoiceId}`).set('Authorization', await auth(customer))).status).toBeGreaterThanOrEqual(403);
  });
});

describe('Lỗi đang mở (xem báo cáo 40) — test.failing: PASS khi lỗi còn, FAIL khi đã sửa', () => {
  // 🐞 F1: GET /bookings?date=abc → SQL "Incorrect DATE value" → 500. Mong muốn: 400.
  test.failing('danh sách đặt sân với date không hợp lệ phải trả 400 (hiện 500)', async () => {
    const res = await api().get('/api/v1/bookings?date=abc').set('Authorization', await auth('employeeCn1'));
    expect(res.status).toBe(400);
  });

  // 🐞 F2: đặt hộ nhận SĐT "123" và lưu thành hồ sơ khách (đăng ký tự phục vụ thì kiểm). Mong muốn: 400.
  test.failing('đặt hộ với SĐT không hợp lệ phải bị từ chối (hiện 201, lưu "123")', async () => {
    const courts = await publicCourts();
    const res = await api().post('/api/v1/bookings').set('Authorization', await auth('employeeCn1'))
      .send({ courtId: courts[0].id, bookingDate: dayFrom(14), startTime: '05:00', endTime: '06:00', customerName: 'Thử SĐT', customerPhone: '123' });
    track(res, 'employeeCn1');
    expect(res.status).toBe(400);
  });
});
