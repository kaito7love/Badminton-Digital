const {
  UniqueConstraintError,
  ValidationError,
  ValidationErrorItem,
  ForeignKeyConstraintError
} = require('sequelize');
const errorHandler = require('../src/middleware/errorHandler');

// Bản ghi users giả mang đủ hai trường bí mật — đúng thứ ValidationErrorItem giữ
// trong `instance` khi Sequelize báo lỗi trên một bản ghi thật.
const PASSWORD_HASH = '$2b$10$fakehashfakehashfakehashfakehashfakehashfakehashfakeh';
const REFRESH_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MX0.fake-refresh-signature';
const userInstance = {
  id: 1,
  email: 'admin@badminton.com',
  passwordHash: PASSWORD_HASH,
  refreshToken: REFRESH_TOKEN,
  toJSON() {
    return { id: this.id, email: this.email, passwordHash: this.passwordHash, refreshToken: this.refreshToken };
  }
};

const emailItem = () =>
  new ValidationErrorItem('Validation isEmail on email failed', 'Validation error', 'email', 'x', userInstance, 'isEmail', 'isEmail', []);

const run = (err) => {
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  errorHandler(err, { method: 'PUT', originalUrl: '/api/v1/employees/1?token=abc' }, res, () => {});
  return res;
};

const leaksSecrets = (value) => {
  const text = JSON.stringify(value);
  return text.includes(PASSWORD_HASH) || text.includes(REFRESH_TOKEN) || text.includes('"instance"');
};

describe('errorHandler — không bao giờ trả dữ liệu thô của Sequelize', () => {
  let logSpy;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    process.env.NODE_ENV = originalNodeEnv;
  });

  test('lỗi validation trả 400 kèm field/message, không kèm bản ghi', () => {
    const res = run(new ValidationError('Validation error: Validation isEmail on email failed', [emailItem()]));

    expect(res.statusCode).toBe(400);
    expect(res.body.errors).toEqual([{ field: 'email', message: 'Validation isEmail on email failed' }]);
    expect(leaksSecrets(res.body)).toBe(false);
  });

  test('trùng unique trả 409, chỉ báo cột bị trùng', () => {
    const err = new UniqueConstraintError({
      message: 'Validation error',
      errors: [
        new ValidationErrorItem('Số điện thoại này đã có tài khoản khác.', 'unique violation', 'phone', '0902222222', userInstance, 'not_unique')
      ],
      fields: { phone: '0902222222' },
      parent: Object.assign(new Error("Duplicate entry '0902222222' for key 'users.uq_users_phone'"), {
        code: 'ER_DUP_ENTRY',
        sql: 'UPDATE `users` SET `phone`=? WHERE `id` = ?'
      })
    });
    const res = run(err);

    expect(res.statusCode).toBe(409);
    expect(res.body.errors).toEqual([{ field: 'phone', message: 'Số điện thoại này đã có tài khoản khác.' }]);
    expect(leaksSecrets(res.body)).toBe(false);
  });

  test('vi phạm khoá ngoại trả 409, không kèm chi tiết', () => {
    const parent = Object.assign(new Error('Cannot delete or update a parent row: a foreign key constraint fails'), {
      code: 'ER_ROW_IS_REFERENCED_2',
      sql: 'DELETE FROM `users` WHERE `id` = 1'
    });
    const res = run(new ForeignKeyConstraintError({ parent }));

    expect(res.statusCode).toBe(409);
    expect(res.body.errors).toBeNull();
    expect(JSON.stringify(res.body)).not.toContain('DELETE FROM');
  });

  test('lỗi service tự throw giữ nguyên status/message nhưng không trả errors thô', () => {
    const err = Object.assign(new Error('Bạn không có quyền sửa tài khoản này.'), {
      statusCode: 403,
      errors: [{ instance: userInstance }]
    });
    const res = run(err);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ success: false, data: null, message: 'Bạn không có quyền sửa tài khoản này.', errors: null });
  });

  test('lỗi không lường trước: production giấu message, dev hiện để debug', () => {
    process.env.NODE_ENV = 'production';
    const prod = run(new Error("Unknown column 'x' in 'field list'"));
    expect(prod.statusCode).toBe(500);
    expect(prod.body.message).toBe('Lỗi máy chủ nội bộ.');

    process.env.NODE_ENV = 'development';
    expect(run(new Error("Unknown column 'x' in 'field list'")).body.message).toBe("Unknown column 'x' in 'field list'");
  });

  test('log không chứa bí mật trong instance, cũng không chứa token trên query string', () => {
    run(new ValidationError('Validation error', [emailItem()]));
    run(new Error('boom'));

    const logged = JSON.stringify(logSpy.mock.calls);
    expect(logged).not.toContain(PASSWORD_HASH);
    expect(logged).not.toContain(REFRESH_TOKEN);
    expect(logged).not.toContain('token=abc');
  });
});
