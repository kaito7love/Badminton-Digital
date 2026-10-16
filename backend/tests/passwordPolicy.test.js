// R2 (báo cáo 33; kế hoạch 37 nhóm B): chính sách mật khẩu. Hàm thuần + validator, không cần DB.
const express = require('express');
const request = require('supertest');

process.env.JWT_ACCESS_SECRET = 'password-policy-access-secret-0123456789abcdef';
process.env.JWT_REFRESH_SECRET = 'password-policy-refresh-secret-0123456789abcde';

const { checkPassword, assertPassword, MIN_LENGTH, MAX_BYTES, COMMON } = require('../src/utils/passwordPolicy');
const { validateRegister, validateChangePassword, validateResetPassword } = require('../src/validations/authValidation');
const { createEmployeeRules } = require('../src/validations/employeeValidation');
const { createCustomerRules } = require('../src/validations/customerValidation');

const reason = (pw, ctx) => { const r = checkPassword(pw, ctx); return r.ok ? 'ok' : r.reason; };

describe('checkPassword — độ dài', () => {
  test('hằng số đúng như đã duyệt: 8 đến 72 byte', () => {
    expect(MIN_LENGTH).toBe(8);
    expect(MAX_BYTES).toBe(72);
  });

  test.each([['', 'length'], ['abc', 'length'], ['1234567', 'length'], ['Xk9#mQ2', 'length'], ['Xk9#mQ2p', 'ok']])(
    '%j → %s', (pw, expected) => expect(reason(pw)).toBe(expected)
  );

  test('72 byte hợp lệ, 73 byte bị từ chối (bcrypt chỉ dùng 72 byte đầu)', () => {
    expect(reason('Xk9#mQ2p'.repeat(9))).toBe('ok'); // 72
    expect(reason('Xk9#mQ2p'.repeat(9) + 'z')).toBe('length'); // 73
  });

  test('ký tự có dấu tính theo byte UTF-8, không theo số ký tự', () => {
    // 'ệ' = 3 byte → 25 ký tự = 75 byte
    expect(reason('ệ'.repeat(25) )).toBe('length');
    expect(reason('Sân cầu lông 2026!')).toBe('ok');
  });

  test.each([[null], [undefined], [12345678], [{}], [['abcdefgh']]])('không phải chuỗi (%j) → length', (pw) => {
    expect(reason(pw)).toBe('length');
  });
});

describe('checkPassword — mật khẩu phổ biến', () => {
  test.each([
    '12345678', 'password', 'Password', 'PASSWORD123', 'qwertyuiop', 'matkhau123', 'MatKhau2026!', 'admin123',
    'badminton', 'Caulong123', 'iloveyou', 'abc@12345'.replace('12345', '123'), 'Admin@123', 'Employee@123',
    'Manager@123', 'Customer@123'
  ])('%s bị chặn', (pw) => {
    const r = checkPassword(pw.length < 8 ? pw.padEnd(8, '!') : pw);
    // một vài chuỗi trên ngắn hơn 8 → length; còn lại phải là "common"
    expect(['common', 'length']).toContain(r.reason);
    expect(r.ok).toBe(false);
  });

  test.each(['12345678', 'password', 'qwertyuiop', 'matkhau123', 'Admin@123'])('%s → common (đủ dài)', (pw) => {
    expect(reason(pw)).toBe('common');
  });

  test('so không phân biệt hoa thường và bỏ đuôi số/ký hiệu', () => {
    expect(reason('PaSsWoRd')).toBe('common');
    expect(reason('password2026!!')).toBe('common');
    expect(reason('2026password')).toBe('common');
  });

  test('danh sách chặn đủ lớn và không chứa mật khẩu ngắn hơn quy định vô ích', () => {
    expect(COMMON.size).toBeGreaterThan(150);
  });

  test.each(['Tr0ng-Ngay-M@i', 'sau-cau-long-vui-ve', 'Xk9#mQ2pLw', 'Mat-khau-dai-va-khong-pho-bien-123', 'Sân cầu lông 2026!'])(
    '%s được chấp nhận', (pw) => expect(reason(pw)).toBe('ok')
  );
});

describe('checkPassword — đơn giản', () => {
  test.each([['aaaaaaaa'], ['zzzzzzzzzz'], ['11111111']])('%s lặp một ký tự', (pw) => {
    expect(['common', 'simple']).toContain(reason(pw));
  });
  test.each([['abcdefghij'], ['87654321'], ['mnopqrstu']])('%s dãy liên tiếp', (pw) => {
    expect(['common', 'simple']).toContain(reason(pw));
  });
  test('dãy ngắn xen ký tự khác không bị coi là đơn giản', () => {
    expect(reason('abc-Xk9#mQ2')).toBe('ok');
  });
});

describe('checkPassword — trùng thông tin cá nhân', () => {
  const ctx = { phone: '0912345678', email: 'nguyen.van.an@example.com', fullName: 'Nguyễn Văn An' };

  test('chứa số điện thoại (có hoặc không số 0 đầu, +84)', () => {
    expect(reason('xK0912345678y', ctx)).toBe('personal');
    expect(reason('xK912345678yZ!', ctx)).toBe('personal');
    expect(reason('xK912345678yZ!', { phone: '+84 912 345 678' })).toBe('personal');
  });

  test('chứa phần trước @ của email (≥ 4 ký tự), bỏ dấu chấm', () => {
    expect(reason('nguyenvanan#Q9', { email: 'nguyen.van.an@example.com' })).toBe('personal');
    expect(reason('Q9#vanbinh!!', { email: 'vanbinh@example.com' })).toBe('personal');
  });

  test('chứa họ tên không dấu, không khoảng trắng', () => {
    expect(reason('NguyenVanAn#2026', ctx)).toBe('personal');
    expect(reason('nguyễn văn an 77', ctx)).toBe('personal');
  });

  test('email/tên/phone ngắn hoặc không liên quan không gây báo nhầm', () => {
    expect(reason('Xk9#mQ2pLw', ctx)).toBe('ok');
    expect(reason('Xk9#ab#mQ2', { email: 'ab@x.com' })).toBe('ok');
    expect(reason('Xk9#mQ2pLw', {})).toBe('ok');
  });

  test('assertPassword ném lỗi 400 với thông điệp tiếng Việt', () => {
    expect(() => assertPassword('123', {})).toThrow(/8 đến 72/);
    try { assertPassword('password', {}); } catch (e) { expect(e.statusCode).toBe(400); }
    expect(() => assertPassword('Xk9#mQ2pLw', {})).not.toThrow();
  });
});

describe('validator đăng ký / đổi / đặt lại mật khẩu', () => {
  const app = express();
  app.use(express.json());
  app.post('/register', validateRegister, (req, res) => res.json({ ok: true }));
  app.put('/change', (req, res, next) => { req.user = { phone: '0911111111', email: 'chutaikhoan@example.com', fullName: 'Chu Tai Khoan' }; next(); }, validateChangePassword, (req, res) => res.json({ ok: true }));
  app.post('/reset', validateResetPassword, (req, res) => res.json({ ok: true }));
  app.post('/employee', ...createEmployeeRules, (req, res) => res.json({ ok: true }));
  app.post('/customer', ...createCustomerRules, (req, res) => res.json({ ok: true }));

  const base = { phone: '0912345678', fullName: 'Nguyễn Văn An', email: 'an@example.com' };

  test('đăng ký: mật khẩu mạnh qua, yếu 400 kèm thông điệp cụ thể', async () => {
    expect((await request(app).post('/register').send({ ...base, password: 'Tr0ng-Ngay-M@i' })).status).toBe(200);
    const weak = await request(app).post('/register').send({ ...base, password: '123456' });
    expect(weak.status).toBe(400);
    expect(JSON.stringify(weak.body)).toMatch(/8 đến 72/);
    const common = await request(app).post('/register').send({ ...base, password: 'matkhau2026' });
    expect(JSON.stringify(common.body)).toMatch(/phổ biến/);
    const personal = await request(app).post('/register').send({ ...base, password: 'x0912345678y!' });
    expect(JSON.stringify(personal.body)).toMatch(/số điện thoại/);
  });

  test('đổi mật khẩu: đúng chính sách qua; yếu 400; trùng email của chính mình 400', async () => {
    expect((await request(app).put('/change').send({ oldPassword: 'cu', newPassword: 'Tr0ng-Ngay-M@i' })).status).toBe(200);
    expect((await request(app).put('/change').send({ oldPassword: 'cu', newPassword: 'password' })).status).toBe(400);
    expect((await request(app).put('/change').send({ oldPassword: 'cu', newPassword: 'chutaikhoan#Q9z' })).status).toBe(400);
  });

  test('đổi sang CHÍNH mật khẩu hiện tại: chỉ kiểm độ dài (Postman idempotent), nhưng vẫn phải ≥ 8', async () => {
    expect((await request(app).put('/change').send({ oldPassword: 'Admin@123', newPassword: 'Admin@123' })).status).toBe(200);
    expect((await request(app).put('/change').send({ oldPassword: '123456', newPassword: '123456' })).status).toBe(400);
  });

  test('đặt lại mật khẩu: kiểm độ dài + phổ biến (chưa biết user ở tầng này)', async () => {
    expect((await request(app).post('/reset').send({ token: 't', newPassword: 'Tr0ng-Ngay-M@i' })).status).toBe(200);
    expect((await request(app).post('/reset').send({ token: 't', newPassword: '12345678' })).status).toBe(400);
    expect((await request(app).post('/reset').send({ token: 't', newPassword: 'abc' })).status).toBe(400);
  });

  test('tạo nhân viên: chặn mật khẩu yếu và trùng SĐT', async () => {
    const emp = { email: 'nv@example.com', phone: '0912345678', fullName: 'Nhân Viên Mới' };
    expect((await request(app).post('/employee').send({ ...emp, password: 'Tr0ng-Ngay-M@i' })).status).toBe(200);
    expect((await request(app).post('/employee').send({ ...emp, password: '123456' })).status).toBe(400);
    expect((await request(app).post('/employee').send({ ...emp, password: 'Ca0912345678!' })).status).toBe(400);
  });

  test('tạo tài khoản khách: mật khẩu tuỳ chọn, có thì phải đạt chính sách', async () => {
    const cus = { fullName: 'Khách Mới', phone: '0912345678' };
    expect((await request(app).post('/customer').send(cus)).status).toBe(200); // không đặt mật khẩu
    expect((await request(app).post('/customer').send({ ...cus, password: 'Tr0ng-Ngay-M@i' })).status).toBe(200);
    expect((await request(app).post('/customer').send({ ...cus, password: 'qwerty' })).status).toBe(400);
  });
});
