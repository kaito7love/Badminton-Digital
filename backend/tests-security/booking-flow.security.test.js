// Kế hoạch 39 — flow "Đặt sân" từ website, bốn góc nhìn (khách, nhân viên, quản lý, admin), trên DB thử đã migrate + seed.
// Phần lớn là hồi quy cho hành vi ĐÚNG đã quan sát. Các lỗi mở (báo cáo 40, mục 🐞) dùng `test.failing`:
// test đang PASS vì lỗi còn đó — khi sửa xong, nó sẽ FAIL và nhắc đổi thành `test` thường.
const { api, tokenForCurrent, unique, sequelize, DEMO } = require('./helpers');
const AuthService = require('../src/services/AuthService');
const { User } = require('../src/models');
const BookingService = require('../src/services/BookingService');
const realtimeBus = require('../src/utils/realtimeBus');
const { openWindowViolation } = require('../src/utils/bookingOpenWindow');

// Khách mới cho mỗi nhóm test. Đi thẳng AuthService vì route /auth/register có limiter 5 lần/giờ/IP.
const newCustomer = async (phone) => {
  await AuthService.register({ fullName: `SecTest ${phone}`, phone, password: 'Cam-Bien-Gio-2026' });
  const user = await User.findOne({ where: { phone } });
  return { id: user.id, email: user.email, role: 'customer', phone };
};

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
const freeHours = async (branchId, bookingDate) => {
  const grid = await api().get(`/api/v1/public/availability/day?branchId=${branchId}&date=${bookingDate}`);
  if (grid.status !== 200) return null;
  const out = new Map();
  for (const court of grid.body.data.courts || []) {
    const free = new Set((court.slots || []).filter((c) => c.state === 'free').map((c) => Number(String(c.start || c.startTime).slice(0, 2))));
    out.set(court.courtId ?? court.id, free);
  }
  return out;
};

const tryBook = async (as, { dayOffset, branchId = 1, hours = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15], length = 1, extra = {}, header = {} }) => {
  const courts = await publicCourts(branchId);
  const bookingDate = dayFrom(dayOffset);
  const grid = await freeHours(branchId, bookingDate); // null khi ngày nằm ngoài dải của lưới công khai
  const post = async (court, h) => {
    let req = api().post('/api/v1/bookings').set('Authorization', await auth(as));
    Object.entries(header).forEach(([k, v]) => { req = req.set(k, v); });
    return req.send({ courtId: court.id, bookingDate, startTime: hhmm(h), endTime: hhmm(h + length), ...extra });
  };
  for (const court of courts) {
    for (const h of hours) {
      if (grid) {
        const free = grid.get(court.id);
        if (!free) continue;
        let ok = true;
        for (let k = 0; k < length; k += 1) if (!free.has(h + k)) ok = false;
        if (!ok) continue;
      }
      const res = await post(court, h);
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
    customer = await newCustomer(unique());
    rival = await newCustomer(unique());
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
  beforeAll(async () => { customer = await newCustomer(unique()); });

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
    const customer = await newCustomer(unique());
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

    // Khung được chọn từ cuối ngày nên thường lệch giờ so với lúc chạy test: xác nhận lệch giờ (kế hoạch 42, F4).
    const open = await api().post(`/api/v1/courts/${courtId}/open`).set('Authorization', empAuth).send({ bookingId: booking.id, acknowledgeTimeMismatch: true });
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

describe('Đã sửa theo báo cáo 40 (F1, F2, F8, F10)', () => {
  // F1: GET /bookings?date=abc từng trả 500 (SQL "Incorrect DATE value").
  test.each([['date=abc'], ['date=2026-13-45'], ['date=2026-02-31'], ['courtId=abc'], ['status=hack'], ['sort=sideways']])(
    'danh sách đặt sân với %s → 400, không 500',
    async (qs) => {
      const res = await api().get(`/api/v1/bookings?${qs}`).set('Authorization', await auth('employeeCn1'));
      expect(res.status).toBe(400);
    }
  );

  test('danh sách hợp lệ vẫn chạy, kể cả khách; sort=desc cho lịch mới nhất trước', async () => {
    const ok = await api().get(`/api/v1/bookings?date=${dayFrom(5)}&status=pending&limit=5`).set('Authorization', await auth('employeeCn1'));
    expect(ok.status).toBe(200);
    const customer = await newCustomer(unique());
    const own = await tryBook(customer, { dayOffset: 4, hours: [6, 7, 8] });
    track(own.res, customer);
    const later = await tryBook(customer, { dayOffset: 8, hours: [6, 7, 8] });
    track(later.res, customer);
    const asc = await api().get('/api/v1/bookings?sort=asc').set('Authorization', await auth(customer));
    const desc = await api().get('/api/v1/bookings?sort=desc').set('Authorization', await auth(customer));
    const rows = (r) => r.body.data.items || r.body.data.bookings || r.body.data;
    expect(rows(asc).map((b) => b.id)).toEqual([own.res.body.data.id, later.res.body.data.id]);
    expect(rows(desc).map((b) => b.id)).toEqual([later.res.body.data.id, own.res.body.data.id]);
  });

  // F2: đặt hộ nhận SĐT "123" và lưu thành hồ sơ khách; "abc" lặng lẽ thành NULL.
  test.each([['123'], ['abc'], ['09abc0001'], ['12345678901234']])('đặt hộ với SĐT "%s" → 400, không tạo khách', async (phone) => {
    const courts = await publicCourts();
    const [[before]] = await sequelize.query('SELECT COUNT(*) AS n FROM customers');
    const res = await api().post('/api/v1/bookings').set('Authorization', await auth('employeeCn1'))
      .send({ courtId: courts[0].id, bookingDate: dayFrom(14), startTime: '05:00', endTime: '06:00', customerName: 'Thử SĐT', customerPhone: phone });
    track(res, 'employeeCn1');
    expect(res.status).toBe(400);
    const [[after]] = await sequelize.query('SELECT COUNT(*) AS n FROM customers');
    expect(Number(after.n)).toBe(Number(before.n));
  });

  test('đặt hộ: SĐT dạng +84 vẫn được và chuẩn hoá; bỏ trống SĐT vẫn được', async () => {
    const suffix = String(Date.now()).slice(-7);
    const plus = await tryBook('employeeCn1', { dayOffset: 15, hours: [6, 7, 8], extra: { customerName: 'Khách +84', customerPhone: `+84 91${suffix.slice(0, 1)} ${suffix.slice(1, 4)} ${suffix.slice(4)}` } });
    track(plus.res, 'employeeCn1');
    expect(plus.res.status).toBe(201);
    const blank = await tryBook('employeeCn1', { dayOffset: 15, hours: [9, 10, 11], extra: { customerName: 'Khách Không SĐT' } });
    track(blank.res, 'employeeCn1');
    expect(blank.res.status).toBe(201);
  });

  test('mở sân với guestPhone sai → 400', async () => {
    const courts = await publicCourts();
    const res = await api().post(`/api/v1/courts/${courts[0].id}/open`).set('Authorization', await auth('employeeCn1')).send({ guestName: 'Thử', guestPhone: '123' });
    expect(res.status).toBe(400);
  });

  // F8: thông báo chọn sai chi nhánh phải nói rõ cách xử lý (mã trạng thái giữ nguyên).
  test('admin chưa chọn chi nhánh đặt sân CN3 → 404 kèm gợi ý đổi chi nhánh', async () => {
    const courts3 = await publicCourts(3);
    const res = await api().post('/api/v1/bookings').set('Authorization', await auth('admin'))
      .send({ courtId: courts3[0].id, bookingDate: dayFrom(13), startTime: '06:00', endTime: '07:00', customerName: 'Khách Admin', customerPhone: `0917${String(Date.now()).slice(-7)}` });
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/đổi chi nhánh/);
  });
});

describe('Kế hoạch 42 — F3 giữ chỗ hàng loạt', () => {
  test('khách đã giữ đủ 5 lịch → lần thứ 6 bị 400 BOOKING_LIMIT; huỷ một lịch thì đặt lại được; nhân viên không bị trần', async () => {
    const customer = await newCustomer(unique());
    const made = [];
    for (let i = 0; i < 5; i += 1) {
      const { res } = await tryBook(customer, { dayOffset: 3 + i, hours: [6, 7, 8, 9, 10, 11, 12, 13] });
      track(res, customer);
      expect(res.status).toBe(201);
      made.push(res.body.data.id);
    }
    const courts = await publicCourts();
    const sixth = await api().post('/api/v1/bookings').set('Authorization', await auth(customer))
      .send({ courtId: courts[0].id, bookingDate: dayFrom(9), startTime: '14:00', endTime: '15:00' });
    expect(sixth.status).toBe(400);
    expect(sixth.body.code).toBe('BOOKING_LIMIT');
    expect(sixth.body.message).toMatch(/tối đa 5/);

    expect((await api().delete(`/api/v1/bookings/${made[0]}`).set('Authorization', await auth(customer))).status).toBe(200);
    const again = await tryBook(customer, { dayOffset: 9, hours: [14, 15, 16] });
    track(again.res, customer);
    expect(again.res.status).toBe(201);

    // nhân viên đặt hộ nhiều lịch cho cùng một khách: không bị trần
    const staff = [];
    for (let i = 0; i < 6; i += 1) {
      const r = await tryBook('employeeCn1', { dayOffset: 10 + i, hours: [17, 18, 19, 20], extra: { customerId: undefined, customerName: 'Khách Nhiều Lịch', customerPhone: '0919555111' } });
      track(r.res, 'employeeCn1');
      staff.push(r.res.status);
    }
    expect(staff.every((x) => x === 201)).toBe(true);
  });

  test('POST /bookings của khách: lượt thứ 21 trong 10 phút → 429; nhân viên không bị giới hạn', async () => {
    const customer = await newCustomer(unique());
    const header = await auth(customer);
    let last;
    for (let i = 0; i < 21; i += 1) {
      last = await api().post('/api/v1/bookings').set('Authorization', header).send({});
    }
    expect(last.status).toBe(429);
    expect(last.body.message).toMatch(/quá nhanh/);

    const staffHeader = await auth('employeeCn1');
    let staffLast;
    for (let i = 0; i < 22; i += 1) staffLast = await api().post('/api/v1/bookings').set('Authorization', staffHeader).send({});
    expect(staffLast.status).toBe(400); // validator, không phải 429
  });

  test('sweeper: huỷ lịch pending quá hạn do KHÁCH đặt; không đụng lịch do nhân viên tạo hay lịch còn hạn', async () => {
    const customer = await newCustomer(unique());
    const old = await tryBook(customer, { dayOffset: 11, hours: [6, 7, 8, 9] });
    const fresh = await tryBook(customer, { dayOffset: 12, hours: [6, 7, 8, 9] });
    const byStaff = await tryBook('employeeCn1', { dayOffset: 13, hours: [6, 7, 8, 9], extra: { customerName: 'Khách Quầy', customerPhone: `0918${String(Date.now()).slice(-7)}` } });
    [old, fresh].forEach((x) => track(x.res, customer));
    track(byStaff.res, 'employeeCn1');
    const idOf = (x) => x.res.body.data.id;
    await sequelize.query('UPDATE bookings SET created_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 DAY) WHERE id IN (?, ?)', { replacements: [idOf(old), idOf(byStaff)] });

    const expired = await BookingService.expireStalePendingBookings();
    expect(expired).toBeGreaterThanOrEqual(1);
    const [rows] = await sequelize.query('SELECT id, status FROM bookings WHERE id IN (?, ?, ?)', { replacements: [idOf(old), idOf(fresh), idOf(byStaff)] });
    const status = Object.fromEntries(rows.map((r) => [r.id, r.status]));
    expect(status[idOf(old)]).toBe('cancelled');
    expect(status[idOf(fresh)]).toBe('pending');
    expect(status[idOf(byStaff)]).toBe('pending');
    const [[log]] = await sequelize.query("SELECT user_id, employee_id, action FROM activity_logs WHERE action = 'booking.expired' AND target_id = ?", { replacements: [idOf(old)] });
    expect(log.action).toBe('booking.expired');
    expect(log.user_id).toBeNull();
    // chạy lại không huỷ thêm lịch nào của ba lịch trên
    await BookingService.expireStalePendingBookings();
    const [after] = await sequelize.query('SELECT status FROM bookings WHERE id = ?', { replacements: [idOf(fresh)] });
    expect(after[0].status).toBe('pending');
  });
});

describe('Kế hoạch 42 — F4 mở sân từ booking', () => {
  const closeSession = async (courtId, header) => {
    const [[session]] = await sequelize.query("SELECT id FROM court_sessions WHERE court_id = ? AND status = 'playing'", { replacements: [courtId] });
    if (session) await api().post('/api/v1/payments/checkout').set('Authorization', header).send({ sessionId: session.id, paymentMethod: 'cash' });
  };

  test('lịch của ngày khác → 400 BOOKING_WRONG_DAY và không tạo phiên; lịch hôm nay lệch giờ → 409 rồi 201 khi có cờ', async () => {
    const header = await auth('employeeCn1');
    const courts = await publicCourts();
    const court = courts[courts.length - 2];
    await closeSession(court.id, header);

    const future = await api().post('/api/v1/bookings').set('Authorization', header)
      .send({ courtId: court.id, bookingDate: dayFrom(20), startTime: '09:00', endTime: '10:00', customerName: 'Khách Xa', customerPhone: `0916${String(Date.now()).slice(-7)}` });
    track(future, 'employeeCn1');
    expect(future.status).toBe(201);
    const [[before]] = await sequelize.query('SELECT COUNT(*) AS n FROM court_sessions WHERE booking_id = ?', { replacements: [future.body.data.id] });
    const wrongDay = await api().post(`/api/v1/courts/${court.id}/open`).set('Authorization', header).send({ bookingId: future.body.data.id });
    expect(wrongDay.status).toBe(400);
    expect(wrongDay.body.code).toBe('BOOKING_WRONG_DAY');
    const [[afterWrong]] = await sequelize.query('SELECT COUNT(*) AS n FROM court_sessions WHERE booking_id = ?', { replacements: [future.body.data.id] });
    expect(Number(afterWrong.n)).toBe(Number(before.n));
    const [[bk]] = await sequelize.query('SELECT status FROM bookings WHERE id = ?', { replacements: [future.body.data.id] });
    expect(bk.status).toBe('pending');

    // hôm nay: chọn một khung chưa qua mà đang LỆCH giờ so với bây giờ; không có (cuối ngày) thì bỏ qua phần này
    const now = new Date();
    let hour = null;
    for (let h = 5; h <= 22 && hour === null; h += 1) {
      const v = openWindowViolation({ bookingDate: dayFrom(0), startTime: hhmm(h), endTime: hhmm(h + 1), now, timezone: 'Asia/Ho_Chi_Minh' });
      const endsAt = new Date(`${dayFrom(0)}T${hhmm(h + 1)}:00+07:00`).getTime();
      if (v && v.code === 'TIME_MISMATCH' && endsAt > now.getTime()) hour = h;
    }
    if (hour === null) return;
    const today = await api().post('/api/v1/bookings').set('Authorization', header)
      .send({ courtId: court.id, bookingDate: dayFrom(0), startTime: hhmm(hour), endTime: hhmm(hour + 1), customerName: 'Khách Hôm Nay', customerPhone: `0915${String(Date.now()).slice(-7)}` });
    if (today.status !== 201) return; // khung đã bị chiếm từ lần chạy trước
    track(today, 'employeeCn1');
    const mismatch = await api().post(`/api/v1/courts/${court.id}/open`).set('Authorization', header).send({ bookingId: today.body.data.id });
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.code).toBe('BOOKING_TIME_MISMATCH');
    const ok = await api().post(`/api/v1/courts/${court.id}/open`).set('Authorization', header).send({ bookingId: today.body.data.id, acknowledgeTimeMismatch: true });
    expect(ok.status).toBe(201);
    await closeSession(court.id, header);
  });
});

describe('Kế hoạch 42 — F5 khớp SĐT khi đặt hộ và F6 sự kiện realtime', () => {
  test('nhân viên đặt bằng SĐT khách có sẵn: phản hồi nêu hồ sơ khớp và tên có khác không; SĐT mới thì không', async () => {
    const [[demo]] = await sequelize.query('SELECT id, full_name FROM customers WHERE id = 1');
    const header = await auth('employeeCn1');

    const differ = await tryBook('employeeCn1', { dayOffset: 16, hours: [6, 7, 8, 9], extra: { customerName: 'Tên Gõ Khác', customerPhone: '0903333333' } });
    track(differ.res, 'employeeCn1');
    expect(differ.res.status).toBe(201);
    expect(differ.res.body.data.customerMatch).toEqual({ id: demo.id, fullName: demo.full_name, nameDiffers: true });

    const same = await tryBook('employeeCn1', { dayOffset: 17, hours: [6, 7, 8, 9], extra: { customerName: demo.full_name, customerPhone: '0903 333 333' } });
    track(same.res, 'employeeCn1');
    expect(same.res.body.data.customerMatch.nameDiffers).toBe(false);

    const fresh = await tryBook('employeeCn1', { dayOffset: 18, hours: [6, 7, 8, 9], extra: { customerName: 'Khách Mới Hoàn Toàn', customerPhone: `0914${String(Date.now()).slice(-7)}` } });
    track(fresh.res, 'employeeCn1');
    expect(fresh.res.status).toBe(201);
    expect(fresh.res.body.data.customerMatch).toBeUndefined();

    // khách tự đặt: không bao giờ có trường này
    const customer = await newCustomer(unique());
    const own = await tryBook(customer, { dayOffset: 7, hours: [6, 7, 8, 9] });
    track(own.res, customer);
    expect(own.res.body.data.customerMatch).toBeUndefined();
    expect(header).toBeTruthy();
  });

  test('đặt / xác nhận / huỷ phát booking:changed chỉ với branchId, bookingId, status (không PII)', async () => {
    const events = [];
    const off = realtimeBus.subscribe('booking:changed', (p) => events.push(p));
    try {
      const customer = await newCustomer(unique());
      const { res } = await tryBook(customer, { dayOffset: 8, hours: [10, 11, 12, 13] });
      track(res, customer);
      const id = res.body.data.id;
      await api().put(`/api/v1/bookings/${id}/confirm`).set('Authorization', await auth('employeeCn1'));
      await api().delete(`/api/v1/bookings/${id}`).set('Authorization', await auth(customer));
      const mine = events.filter((e) => e.bookingId === id);
      expect(mine.map((e) => e.status)).toEqual(['pending', 'confirmed', 'cancelled']);
      mine.forEach((e) => expect(Object.keys(e).sort()).toEqual(['bookingId', 'branchId', 'status']));
    } finally {
      off();
    }
  });
});

describe('Kế hoạch 43 — thông báo cho khách', () => {
  const inbox = async (customer, qs = '') => {
    const res = await api().get(`/api/v1/notifications${qs}`).set('Authorization', await auth(customer));
    expect(res.status).toBe(200);
    return res.body.data;
  };

  test('nhân viên duyệt → khách có 1 thông báo booking.confirmed (chưa đọc), đánh dấu đã đọc → unreadCount 0', async () => {
    const customer = await newCustomer(unique());
    const { res } = await tryBook(customer, { dayOffset: 4, hours: [6, 7, 8, 9] });
    track(res, customer);
    expect((await inbox(customer)).items).toHaveLength(0);

    await api().put(`/api/v1/bookings/${res.body.data.id}/confirm`).set('Authorization', await auth('employeeCn1'));
    const data = await inbox(customer);
    expect(data.unreadCount).toBe(1);
    expect(data.items[0]).toMatchObject({ type: 'booking.confirmed', bookingId: res.body.data.id, readAt: null });
    expect(data.items[0].body).toMatch(/\d{2}\/\d{2}\/\d{4} · \d{2}:\d{2}–\d{2}:\d{2}/);

    const read = await api().put(`/api/v1/notifications/${data.items[0].id}/read`).set('Authorization', await auth(customer));
    expect(read.status).toBe(200);
    expect((await inbox(customer)).unreadCount).toBe(0);
    expect((await inbox(customer, '?unread=true')).items).toHaveLength(0);
  });

  test('nhân viên huỷ → cancelled_by_staff; khách tự huỷ → KHÔNG có thông báo', async () => {
    const customer = await newCustomer(unique());
    const a = await tryBook(customer, { dayOffset: 5, hours: [6, 7, 8, 9] });
    const b = await tryBook(customer, { dayOffset: 6, hours: [6, 7, 8, 9] });
    track(a.res, customer); track(b.res, customer);

    expect((await api().delete(`/api/v1/bookings/${b.res.body.data.id}`).set('Authorization', await auth(customer))).status).toBe(200);
    expect((await inbox(customer)).items).toHaveLength(0);

    expect((await api().delete(`/api/v1/bookings/${a.res.body.data.id}`).set('Authorization', await auth('employeeCn1'))).status).toBe(200);
    const data = await inbox(customer);
    expect(data.items.map((n) => n.type)).toEqual(['booking.cancelled_by_staff']);
  });

  test('nhân viên đổi giờ → rescheduled nêu cả khung cũ và mới; sửa mà không đổi gì → không thêm', async () => {
    const customer = await newCustomer(unique());
    const made = await tryBook(customer, { dayOffset: 7, hours: [6, 7, 8, 9] });
    track(made.res, customer);
    const id = made.res.body.data.id;
    const startNow = made.startHour;

    const same = await api().put(`/api/v1/bookings/${id}`).set('Authorization', await auth('employeeCn1'))
      .send({ startTime: hhmm(startNow), endTime: hhmm(startNow + 1) });
    expect(same.status).toBe(200);
    expect((await inbox(customer)).items).toHaveLength(0);

    // dời sang một giờ trống thật (lấy từ lưới công khai) của cùng sân/ngày
    const grid = await freeHours(1, made.bookingDate);
    const free = [...(grid.get(made.courtId) || [])].filter((h) => h !== startNow && h >= 5 && h <= 21).sort((x, y) => x - y);
    expect(free.length).toBeGreaterThan(0);
    const moved = free[free.length - 1];
    const r = await api().put(`/api/v1/bookings/${id}`).set('Authorization', await auth('employeeCn1'))
      .send({ startTime: hhmm(moved), endTime: hhmm(moved + 1) });
    expect(r.status).toBe(200);
    const data = await inbox(customer);
    expect(data.items).toHaveLength(1);
    expect(data.items[0].type).toBe('booking.rescheduled');
    expect(data.items[0].body).toContain(`${hhmm(startNow)}–${hhmm(startNow + 1)}`);
    expect(data.items[0].body).toContain(`${hhmm(moved)}–${hhmm(moved + 1)}`);
  });

  test('lịch pending quá hạn bị tự huỷ → khách có booking.expired', async () => {
    const customer = await newCustomer(unique());
    const made = await tryBook(customer, { dayOffset: 8, hours: [6, 7, 8, 9] });
    track(made.res, customer);
    await sequelize.query('UPDATE bookings SET created_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 DAY) WHERE id = ?', { replacements: [made.res.body.data.id] });
    await BookingService.expireStalePendingBookings();
    const data = await inbox(customer);
    expect(data.items.map((n) => n.type)).toEqual(['booking.expired']);
    expect(data.items[0].body).toMatch(/chưa được xác nhận kịp thời/);
  });

  test('khách vãng lai không tài khoản: không có thông báo nào; thông báo không chứa tên nhân viên/SĐT', async () => {
    const phone = `0913${String(Date.now()).slice(-7)}`;
    const walkIn = await tryBook('employeeCn1', { dayOffset: 9, hours: [6, 7, 8, 9], extra: { customerName: 'Khách Vãng Lai TB', customerPhone: phone } });
    track(walkIn.res, 'employeeCn1');
    await api().put(`/api/v1/bookings/${walkIn.res.body.data.id}/confirm`).set('Authorization', await auth('employeeCn1'));
    const [[n]] = await sequelize.query('SELECT COUNT(*) AS n FROM customer_notifications WHERE customer_id = ?', { replacements: [walkIn.res.body.data.customerId] });
    expect(Number(n.n)).toBe(0);

    const [rows] = await sequelize.query('SELECT title, body FROM customer_notifications ORDER BY id DESC LIMIT 30');
    const blob = JSON.stringify(rows);
    expect(blob).not.toMatch(/employee@badminton|manager\.q3|admin@badminton|\b09\d{8}\b/);
  });

  test('IDOR: khách B không đọc/đánh dấu thông báo của khách A; vai khác 403; không token 401; read-all chỉ của mình', async () => {
    const a = await newCustomer(unique());
    const b = await newCustomer(unique());
    const made = await tryBook(a, { dayOffset: 10, hours: [6, 7, 8, 9] });
    track(made.res, a);
    await api().put(`/api/v1/bookings/${made.res.body.data.id}/confirm`).set('Authorization', await auth('employeeCn1'));
    const aInbox = await inbox(a);
    const id = aInbox.items[0].id;

    expect((await api().put(`/api/v1/notifications/${id}/read`).set('Authorization', await auth(b))).status).toBe(404);
    expect((await inbox(b)).items).toHaveLength(0);
    expect((await inbox(a)).unreadCount).toBe(1);

    for (const who of ['employeeCn1', 'managerCn2', 'admin']) {
      expect((await api().get('/api/v1/notifications').set('Authorization', await auth(who))).status).toBe(403);
    }
    expect((await api().get('/api/v1/notifications')).status).toBe(401);
    expect((await api().get('/api/v1/notifications?limit=500').set('Authorization', await auth(a))).status).toBe(400);
    expect((await api().put('/api/v1/notifications/abc/read').set('Authorization', await auth(a))).status).toBe(400);

    expect((await api().put('/api/v1/notifications/read-all').set('Authorization', await auth(b))).status).toBe(200);
    expect((await inbox(a)).unreadCount).toBe(1); // read-all của B không đụng của A
    expect((await api().put('/api/v1/notifications/read-all').set('Authorization', await auth(a))).status).toBe(200);
    expect((await inbox(a)).unreadCount).toBe(0);
  });

  test('ghi thông báo lỗi → trạng thái lịch KHÔNG đổi (cùng transaction)', async () => {
    const { CustomerNotification } = require('../src/models');
    const customer = await newCustomer(unique());
    const made = await tryBook(customer, { dayOffset: 11, hours: [6, 7, 8, 9] });
    track(made.res, customer);
    const spy = jest.spyOn(CustomerNotification, 'create').mockRejectedValueOnce(new Error('boom'));
    try {
      const res = await api().put(`/api/v1/bookings/${made.res.body.data.id}/confirm`).set('Authorization', await auth('employeeCn1'));
      expect(res.status).toBeGreaterThanOrEqual(500);
    } finally {
      spy.mockRestore();
    }
    const [[row]] = await sequelize.query('SELECT status FROM bookings WHERE id = ?', { replacements: [made.res.body.data.id] });
    expect(row.status).toBe('pending');
  });

  test('khoá cài đặt notification_policy: email phải là true/false', async () => {
    const bad = await api().put('/api/v1/settings').set('Authorization', await auth('admin')).send({ key: 'notification_policy', value: { email: 'yes' } });
    expect(bad.status).toBe(400);
    const ok = await api().put('/api/v1/settings').set('Authorization', await auth('admin')).send({ key: 'notification_policy', value: { email: true } });
    expect(ok.status).toBe(200);
  });
});
