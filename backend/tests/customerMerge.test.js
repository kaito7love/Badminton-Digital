const CustomerService = require('../src/services/CustomerService');
const { Customer } = require('../src/models');

const PHONE = '0909000111';
const walkIn = (overrides = {}) => ({ id: 10, userId: null, phone: PHONE, deletedAt: null, ...overrides });
const account = (overrides = {}) => ({ id: 20, userId: 7, phone: null, deletedAt: null, ...overrides });
const owner = (overrides = {}) => ({ id: 7, phone: PHONE, role: { name: 'customer' }, ...overrides });

const outcome = (args) => {
  try {
    CustomerService.assertMergeable(args);
    return 'allow';
  } catch (err) {
    return err.statusCode;
  }
};

describe('CustomerService.assertMergeable — khi nào nhân viên gộp được hồ sơ', () => {
  test.each([
    ['hồ sơ tại quầy + tài khoản cùng số, hồ sơ tài khoản chưa mang số', walkIn(), account(), owner(), 'allow'],
    ['số tài khoản lưu dạng +84 vẫn khớp', walkIn(), account(), owner({ phone: '+84909000111' }), 'allow'],
    ['không thấy hồ sơ tại quầy', null, account(), owner(), 404],
    ['không thấy hồ sơ tài khoản', walkIn(), null, null, 404],
    ['gộp vào chính nó', account(), account(), owner(), 400],
    ['hồ sơ tại quầy đã gộp (xoá mềm)', walkIn({ deletedAt: new Date() }), account(), owner(), 409],
    ['hồ sơ tại quầy đã gắn tài khoản khác', walkIn({ userId: 3 }), account(), owner(), 409],
    ['hồ sơ tại quầy không có số', walkIn({ phone: null }), account(), owner(), 400],
    ['hồ sơ đích không gắn tài khoản', walkIn(), account({ userId: null }), null, 400],
    ['hồ sơ đích đã bị xoá', walkIn(), account({ deletedAt: new Date() }), owner(), 400],
    ['tài khoản đã bị xoá (không nạp được user)', walkIn(), account(), null, 400],
    ['tài khoản không phải khách hàng', walkIn(), account(), owner({ role: { name: 'employee' } }), 400],
    ['hồ sơ tài khoản đã mang số', walkIn(), account({ phone: '0911222333' }), owner(), 400],
    ['số của tài khoản khác số hồ sơ tại quầy', walkIn(), account(), owner({ phone: '0909000222' }), 400]
  ])('%s → %s', (_, w, a, u, expected) => {
    expect(outcome({ walkIn: w, account: a, accountUser: u })).toBe(expected);
  });
});

describe('CustomerService.withAccountContact — chủ tài khoản xem hồ sơ của mình', () => {
  test('hồ sơ chưa mang số/email → trả số/email của tài khoản', () => {
    const profile = Customer.build({ id: 20, userId: 7, fullName: 'Khách A', phone: null, email: null });
    CustomerService.withAccountContact(profile, { phone: PHONE, email: 'a@example.com' });
    expect(profile.toJSON()).toMatchObject({ phone: PHONE, email: 'a@example.com' });
  });

  test('hồ sơ đã có số/email → giữ nguyên', () => {
    const profile = Customer.build({ id: 20, userId: 7, fullName: 'Khách A', phone: PHONE, email: 'old@example.com' });
    CustomerService.withAccountContact(profile, { phone: '0911222333', email: 'new@example.com' });
    expect(profile.toJSON()).toMatchObject({ phone: PHONE, email: 'old@example.com' });
  });

  test('không có hồ sơ → không lỗi', () => {
    expect(CustomerService.withAccountContact(null, { phone: PHONE })).toBeNull();
  });
});
