// Báo cáo 40, F1/F2/F8 — validator danh sách đặt sân và SĐT của khách vãng lai. Không cần DB.
const express = require('express');
const request = require('supertest');
const { listBookingsRules, createBookingRules } = require('../src/validations/bookingValidation');
const { openCourtRules } = require('../src/validations/courtValidation');
const CustomerService = require('../src/services/CustomerService');

const app = express();
app.use(express.json());
app.get('/bookings', listBookingsRules, (req, res) => res.json({ ok: true, query: req.query }));
app.post('/bookings', createBookingRules, (req, res) => res.json({ ok: true }));
app.post('/courts/:id/open', openCourtRules, (req, res) => res.json({ ok: true }));

describe('GET /bookings — query hợp lệ (F1)', () => {
  test.each([
    [''], ['?date=2026-10-20'], ['?status=pending&courtId=3'], ['?sort=desc&page=2&limit=50'], ['?page=abc&limit=xyz']
  ])('%s → đi tiếp', async (qs) => {
    const res = await request(app).get(`/bookings${qs}`);
    expect(res.status).toBe(200);
  });

  test.each([
    ['?date=abc'], ['?date=2026-13-45'], ['?date=2026-02-31'], ['?date=20/10/2026'], ['?date=2026-10-20T00:00:00Z'],
    ['?courtId=abc'], ['?courtId=0'], ['?courtId=99999999999'],
    ['?status=hack'], ['?status=PENDING%27%20OR%201%3D1'], ['?sort=sideways']
  ])('%s → 400 (trước đây date sai là 500)', async (qs) => {
    const res = await request(app).get(`/bookings${qs}`);
    expect(res.status).toBe(400);
    expect(res.body.errors.length).toBeGreaterThan(0);
  });
});

describe('SĐT khách vãng lai (F2)', () => {
  const body = (customerPhone) => ({ courtId: 1, bookingDate: '2026-10-20', startTime: '09:00', endTime: '10:00', customerName: 'A', customerPhone });

  test.each([['abc'], ['123'], ['0'], ['12345678901234'], ['09abc0001']])('đặt hộ với "%s" → 400', async (phone) => {
    const res = await request(app).post('/bookings').send(body(phone));
    expect(res.status).toBe(400);
    expect(res.body.errors.some((e) => e.field === 'customerPhone')).toBe(true);
  });

  test.each([['0919000333'], ['+84 919 000 333'], ['0919-000-333'], [''], [null]])('đặt hộ với %j → đi tiếp', async (phone) => {
    const res = await request(app).post('/bookings').send(body(phone));
    expect(res.status).toBe(200);
  });

  test('mở sân với guestPhone sai → 400, đúng → đi tiếp', async () => {
    expect((await request(app).post('/courts/1/open').send({ guestName: 'A', guestPhone: '123' })).status).toBe(400);
    expect((await request(app).post('/courts/1/open').send({ guestName: 'A', guestPhone: '0919000333' })).status).toBe(200);
    expect((await request(app).post('/courts/1/open').send({ guestName: 'A' })).status).toBe(200);
  });

  test('resolveWalkIn từ chối số rác trước khi chạm DB, kể cả khi bị gọi thẳng', async () => {
    await expect(CustomerService.resolveWalkIn({ fullName: 'A', phone: '123' })).rejects.toMatchObject({ statusCode: 400 });
    await expect(CustomerService.resolveWalkIn({ fullName: 'A', phone: 'abc' })).rejects.toMatchObject({ statusCode: 400 });
  });

  test('resolveWalkIn không có tên lẫn SĐT → null (khách ẩn danh vẫn được)', async () => {
    await expect(CustomerService.resolveWalkIn({ fullName: '  ', phone: '' })).resolves.toBeNull();
  });
});
