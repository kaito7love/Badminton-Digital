// Nhóm A (kế hoạch 37): R5, R6, R11, R12 — phần không cần DB.
const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const bcrypt = require('bcrypt');

process.env.JWT_ACCESS_SECRET = crypto.randomBytes(48).toString('hex');
process.env.JWT_REFRESH_SECRET = crypto.randomBytes(48).toString('hex');

const { User } = require('../src/models');
const AuthService = require('../src/services/AuthService');
const { reportRangeRules, isRealDate } = require('../src/validations/reportValidation');
const { updateSettingRules, settingBodyRules, validateSettingObject } = require('../src/validations/settingValidation');
const errorHandler = require('../src/middleware/errorHandler');

describe('R5 + R6 — AuthService.login', () => {
  let compareSpy;
  const stubUser = (user) => jest.spyOn(User, 'scope').mockReturnValue({ findOne: jest.fn().mockResolvedValue(user) });
  const account = async (overrides = {}) => ({
    id: 5, email: 'a@example.test', phone: '0912345678', isActive: true, fullName: 'A',
    passwordHash: await bcrypt.hash('Dung@123456', 4), role: { name: 'customer' }, ...overrides
  });

  beforeEach(() => { compareSpy = jest.spyOn(bcrypt, 'compare'); });
  afterEach(() => jest.restoreAllMocks());

  test('R5: không có tài khoản vẫn tốn đúng một lần bcrypt.compare (cùng chi phí với sai mật khẩu)', async () => {
    stubUser(null);
    await expect(AuthService.login({ identifier: '0900000000', password: 'bat-ky' })).rejects.toMatchObject({ statusCode: 401 });
    expect(compareSpy).toHaveBeenCalledTimes(1);
  });

  test('sai mật khẩu cũng đúng một lần compare và cùng thông điệp với "không có tài khoản"', async () => {
    stubUser(await account());
    const wrong = await AuthService.login({ identifier: 'a@example.test', password: 'sai' }).catch((e) => e);
    stubUser(null);
    const missing = await AuthService.login({ identifier: '0900000000', password: 'sai' }).catch((e) => e);
    expect(wrong.statusCode).toBe(401);
    expect(missing.statusCode).toBe(401);
    expect(wrong.message).toBe(missing.message);
  });

  test('R6: tài khoản bị khoá + mật khẩu SAI → 401, không lộ trạng thái khoá', async () => {
    stubUser(await account({ isActive: false }));
    await expect(AuthService.login({ identifier: 'a@example.test', password: 'sai' })).rejects.toMatchObject({ statusCode: 401 });
  });

  test('R6: tài khoản bị khoá + mật khẩu ĐÚNG → 403 "vô hiệu hóa" và không cấp token', async () => {
    stubUser(await account({ isActive: false }));
    const updateSpy = jest.spyOn(User, 'update').mockResolvedValue([1]);
    await expect(AuthService.login({ identifier: 'a@example.test', password: 'Dung@123456' })).rejects.toMatchObject({ statusCode: 403 });
    expect(updateSpy).not.toHaveBeenCalled();
  });

  test.each([[{ x: 1 }], [['a']], [123], [null]])('mật khẩu không phải chuỗi (%j) → 401, không 500', async (pw) => {
    stubUser(await account());
    await expect(AuthService.login({ identifier: 'a@example.test', password: pw })).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe('R11 — validator báo cáo', () => {
  const app = express();
  app.get('/r', reportRangeRules, (req, res) => res.json({ ok: true }));

  test.each([
    ['không tham số', ''],
    ['khoảng hợp lệ', '?period=monthly&from=2026-01-01&to=2026-12-31'],
    ['chỉ from', '?from=2026-05-01'],
    ['from = to', '?from=2026-05-01&to=2026-05-01']
  ])('hợp lệ: %s', async (_, qs) => {
    expect((await request(app).get('/r' + qs)).status).toBe(200);
  });

  test.each([
    ['ngày không có thật', '?from=2026-13-45'],
    ['chữ', '?from=abc'],
    ['năm 5 chữ số', '?from=99999-01-01'],
    ['30/2', '?to=2026-02-30'],
    ['from sau to', '?from=2026-06-02&to=2026-06-01'],
    ['period lạ', "?period=daily'--"],
    ['mảng', '?from=2026-01-01&from=2026-01-02']
  ])('400: %s', async (_, qs) => {
    expect((await request(app).get('/r' + qs)).status).toBe(400);
  });

  test('isRealDate bắt ngày không tồn tại', () => {
    expect(isRealDate('2028-02-29')).toBe(true);
    expect(isRealDate('2027-02-29')).toBe(false);
    expect(isRealDate('2026-04-31')).toBe(false);
  });
});

describe('R11 — errorHandler với mã lỗi MySQL', () => {
  const appThrowing = (err) => { const a = express(); a.get('/x', (q, s, n) => n(err)); a.use(errorHandler); return a; };
  const dbError = (code) => Object.assign(new Error(code), { name: 'SequelizeDatabaseError', parent: { code } });

  beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  test.each(['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'])('%s → 409 thử lại', async (code) => {
    const res = await request(appThrowing(dbError(code))).get('/x');
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).not.toMatch(/ER_LOCK|Deadlock/i);
  });

  test.each(['ER_DATA_TOO_LONG', 'ER_WARN_DATA_OUT_OF_RANGE', 'ER_DATA_OUT_OF_RANGE'])('%s → 400', async (code) => {
    const res = await request(appThrowing(dbError(code))).get('/x');
    expect(res.status).toBe(400);
  });

  test('lỗi DB khác vẫn là 500 và không lộ chi tiết ở production', async () => {
    const saved = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const res = await request(appThrowing(dbError('ER_BAD_FIELD_ERROR'))).get('/x');
      expect(res.status).toBe(500);
      expect(res.body.message).toBe('Lỗi máy chủ nội bộ.');
    } finally { process.env.NODE_ENV = saved; }
  });
});

describe('R11 — id số nguyên nằm trong miền INT ở mọi validator', () => {
  const fs = require('fs');
  const path = require('path');
  const dir = path.join(__dirname, '..', 'src', 'validations');
  const offenders = [];
  fs.readdirSync(dir).filter((f) => f.endsWith('.js')).forEach((f) => {
    fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/).forEach((line, i) => {
      if (/(param|body|query)\('[\w.*]*[iI]d'\)/.test(line) && line.includes('.isInt()')) offenders.push(`${f}:${i + 1}`);
    });
  });
  test('không còn `.isInt()` trần trên trường id', () => {
    expect(offenders).toEqual([]);
  });
});

describe('R12 — validator cài đặt', () => {
  const app = express();
  app.use(express.json());
  app.put('/pricing', settingBodyRules, (req, res) => res.json({ ok: true }));
  app.put('/', updateSettingRules, (req, res) => res.json({ ok: true }));

  test.each([
    ['giá hợp lệ', { peakPricePerHour: 180000, offpeakPricePerHour: 120000 }],
    ['chuỗi số từ ô nhập', { peakPrice: '180000' }],
    ['giờ cao điểm dạng số', { peakStartHour: 17, peakEndHour: 22 }],
    ['giờ dạng HH:mm', { open: '05:00', close: '23:00', peak_start: '17:00', peak_end: '21:00' }],
    ['dạng mảng cũ', [{ day: 'Monday - Friday', open: '06:00', close: '22:00' }]],
    ['object rỗng', {}]
  ])('chấp nhận: %s', async (_, body) => {
    expect((await request(app).put('/pricing').send(body)).status).toBe(200);
  });

  test.each([
    ['giá là chữ', { peakPrice: 'abc' }],
    ['giá âm', { peakPricePerHour: -1 }],
    ['giá quá lớn', { peakPricePerHour: 1e12 }],
    ['giờ sai định dạng', { open: '25:99' }],
    ['giờ cao điểm ngoài 0–24', { peakStartHour: 30 }],
    ['chuỗi quá dài', { name: 'x'.repeat(201) }],
    ['quá nhiều khoá', Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, 1]))],
    ['lồng quá sâu', { a: { b: { c: { d: 1 } } } }],
    ['quá 4 KB', Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`k${i}`, 'y'.repeat(200)]))]
  ])('400: %s', async (_, body) => {
    expect((await request(app).put('/pricing').send(body)).status).toBe(400);
  });

  // Gửi JSON thô (supertest .send(object) có thể bỏ khoá __proto__ hoặc đổi content-type của chuỗi).
  test.each([
    ['khoá __proto__', '{"__proto__":{"x":1}}'],
    ['khoá constructor lồng', '{"a":{"constructor":{"prototype":{"x":1}}}}'],
    ['chuỗi thay vì object', '"abc"'],
    ['null', 'null'],
    ['số', '5']
  ])('400 (JSON thô): %s', async (_, raw) => {
    const res = await request(app).put('/pricing').set('Content-Type', 'application/json').send(raw);
    expect(res.status).toBe(400);
  });

  test('PUT /settings: khoá lạ bị từ chối, khoá đã biết nhận', async () => {
    expect((await request(app).put('/').send({ key: 'khoa_la', value: { a: 1 } })).status).toBe(400);
    expect((await request(app).put('/').send({ key: 'pricing', value: { peakPrice: 1 } })).status).toBe(200);
    expect((await request(app).put('/').send({ key: 'discount_policy', value: { employeeMaxPercent: 10 } })).status).toBe(200);
    expect((await request(app).put('/').send({ key: 'discount_policy', value: { employeeMaxPercent: 500 } })).status).toBe(400);
  });

  test('validateSettingObject dùng được độc lập', () => {
    expect(validateSettingObject({ a: 1 })).toBe(true);
    expect(() => validateSettingObject('x')).toThrow();
  });
});
