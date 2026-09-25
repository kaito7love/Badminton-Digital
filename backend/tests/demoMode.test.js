const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// AuthService → utils/jwt kiểm secret ngay lúc require.
process.env.JWT_ACCESS_SECRET = crypto.randomBytes(48).toString('hex');
process.env.JWT_REFRESH_SECRET = crypto.randomBytes(48).toString('hex');

const {
  LOCKED_DEMO_EMAILS,
  isLockedDemoAccount,
  assertNotLockedDemoAccount
} = require('../src/utils/demoMode');
const { sequelize, User, Employee, Customer } = require('../src/models');
const AuthService = require('../src/services/AuthService');
const EmployeeService = require('../src/services/EmployeeService');
const CustomerService = require('../src/services/CustomerService');

const ON = { DEMO_MODE: 'true' };
const readRepoFile = (...parts) => fs.readFileSync(path.join(__dirname, '..', ...parts), 'utf8');

describe('demoMode — khoá tài khoản demo dùng chung', () => {
  test('chỉ khoá khi DEMO_MODE=true', () => {
    const manager = { email: 'manager.q3@badminton.com' };
    expect(isLockedDemoAccount(manager, ON)).toBe(true);
    expect(isLockedDemoAccount(manager, {})).toBe(false);
    expect(isLockedDemoAccount(manager, { DEMO_MODE: 'false' })).toBe(false);
  });

  test('admin và tài khoản không phải demo không bị khoá', () => {
    expect(isLockedDemoAccount({ email: 'admin@badminton.com' }, ON)).toBe(false);
    expect(isLockedDemoAccount({ email: 'khach.moi@gmail.com' }, ON)).toBe(false);
    expect(isLockedDemoAccount(null, ON)).toBe(false);
    expect(isLockedDemoAccount({ email: null }, ON)).toBe(false);
  });

  test('so email không phân biệt hoa thường', () => {
    expect(isLockedDemoAccount({ email: 'Customer@Badminton.com' }, ON)).toBe(true);
  });

  test('assert ném 403', () => {
    expect(() => assertNotLockedDemoAccount({ email: 'employee@badminton.com' }, ON))
      .toThrow(expect.objectContaining({ statusCode: 403 }));
    expect(() => assertNotLockedDemoAccount({ email: 'employee@badminton.com' }, {})).not.toThrow();
  });

  test('danh sách khớp seeder: mọi tài khoản @badminton.com trừ admin đều bị khoá, không thừa email nào', () => {
    const seedersDir = path.join(__dirname, '../src/seeders');
    const seeded = new Set();
    for (const file of fs.readdirSync(seedersDir)) {
      const text = fs.readFileSync(path.join(seedersDir, file), 'utf8');
      for (const [email] of text.matchAll(/[\w.]+@badminton\.com/g)) seeded.add(email);
    }
    seeded.delete('admin@badminton.com');
    expect([...seeded].sort()).toEqual([...LOCKED_DEMO_EMAILS].sort());
  });

  test('mọi tài khoản in trên trang đăng nhập bản demo (không tính admin chỉ có ở dev) đều bị khoá', () => {
    const loginPage = readRepoFile('..', 'frontend', 'src', 'pages', 'Login', 'LoginPage.jsx');
    const identifiers = [...loginPage.matchAll(/identifier: '([^']+)'/g)].map((m) => m[1]);
    expect(identifiers.length).toBeGreaterThan(0);
    for (const identifier of identifiers) {
      if (identifier === 'admin@badminton.com') continue;
      // Khách đăng nhập bằng SĐT 0903333333 — tài khoản đó là customer@badminton.com trong seeder.
      const email = identifier === '0903333333' ? 'customer@badminton.com' : identifier;
      expect(LOCKED_DEMO_EMAILS).toContain(email);
    }
  });
});

describe('demoMode — các service gọi đúng chỗ', () => {
  const saved = process.env.DEMO_MODE;
  const fakeTransaction = () => ({ LOCK: { UPDATE: 'UPDATE' }, commit: jest.fn(), rollback: jest.fn() });

  afterEach(() => {
    jest.restoreAllMocks();
    if (saved === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = saved;
  });

  test('tài khoản demo tự đổi mật khẩu → 403, không lưu gì', async () => {
    process.env.DEMO_MODE = 'true';
    const user = { email: 'manager.q7@badminton.com', passwordHash: 'x', save: jest.fn() };
    jest.spyOn(User, 'scope').mockReturnValue({ findByPk: jest.fn().mockResolvedValue(user) });

    await expect(AuthService.changePassword(9, { oldPassword: 'Manager@123', newPassword: 'moi-12345678' }))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(user.save).not.toHaveBeenCalled();
  });

  test('DEMO_MODE tắt → không chặn (đi tiếp tới bước so mật khẩu cũ)', async () => {
    delete process.env.DEMO_MODE;
    const user = { email: 'manager.q7@badminton.com', passwordHash: '$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv', save: jest.fn() };
    jest.spyOn(User, 'scope').mockReturnValue({ findByPk: jest.fn().mockResolvedValue(user) });

    await expect(AuthService.changePassword(9, { oldPassword: 'sai', newPassword: 'moi-12345678' }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  test('quản lý demo xoá nhân viên demo → 403, không xoá, rollback', async () => {
    process.env.DEMO_MODE = 'true';
    const transaction = fakeTransaction();
    const employee = { id: 4, userId: 5, branchId: 2, destroy: jest.fn(), toJSON: () => ({}) };
    jest.spyOn(sequelize, 'transaction').mockResolvedValue(transaction);
    jest.spyOn(Employee, 'findOne').mockResolvedValue(employee);
    jest.spyOn(User, 'findByPk').mockResolvedValue({ id: 5, email: 'employee.q3@badminton.com', role: { name: 'employee' } });

    const actor = { id: 8, role: { name: 'branch_manager' } };
    await expect(EmployeeService.deleteEmployee(4, { actor, branchId: 2 })).rejects.toMatchObject({ statusCode: 403 });
    expect(employee.destroy).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalled();
  });

  test('sửa SĐT nhân viên demo → 403', async () => {
    process.env.DEMO_MODE = 'true';
    const transaction = fakeTransaction();
    const demoUser = { id: 5, email: 'employee.q3@badminton.com', update: jest.fn() };
    const employee = { id: 4, userId: 5, branchId: 2, user: demoUser, update: jest.fn(), toJSON: () => ({}) };
    jest.spyOn(sequelize, 'transaction').mockResolvedValue(transaction);
    jest.spyOn(Employee, 'findOne').mockResolvedValue(employee);
    jest.spyOn(User, 'findByPk').mockResolvedValue({ id: 5, email: demoUser.email, role: { name: 'employee' } });

    const actor = { id: 8, role: { name: 'branch_manager' } };
    await expect(EmployeeService.updateEmployee(4, { phone: '0911000111' }, { actor, branchId: 2 }))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(demoUser.update).not.toHaveBeenCalled();
  });

  test('nhân viên đổi SĐT hồ sơ khách demo → 403; đổi tên thì vẫn được', async () => {
    process.env.DEMO_MODE = 'true';
    jest.spyOn(sequelize, 'transaction').mockImplementation(async () => fakeTransaction());
    const customer = { id: 1, userId: 3, phone: '0903333333', email: 'customer@badminton.com', update: jest.fn(async () => customer) };
    jest.spyOn(Customer, 'findByPk').mockResolvedValue(customer);
    jest.spyOn(User, 'findByPk').mockResolvedValue({ id: 3, email: 'customer@badminton.com' });

    await expect(CustomerService.updateCustomer(1, { phone: '0911222333' }, {}))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(customer.update).not.toHaveBeenCalled();

    await CustomerService.updateCustomer(1, { fullName: 'Tên mới' }, {});
    expect(customer.update).toHaveBeenCalledWith({ fullName: 'Tên mới' }, expect.anything());
  });
});
