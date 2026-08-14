const { normalizePhone, isValidPhone, looksLikePhone } = require('../src/utils/phone');

describe('phone — số điện thoại làm danh tính đăng nhập', () => {
  test('mọi cách gõ của cùng một số đều quy về một dạng', () => {
    const expected = '0903333333';
    for (const input of [
      '0903333333',
      '0903 333 333',
      '0903-333-333',
      '0903.333.333',
      '(0903) 333 333',
      '+84903333333',
      '+84 903 333 333',
      '0084903333333',
      '84903333333'
    ]) {
      expect(normalizePhone(input)).toBe(expected);
    }
  });

  test('trống hoặc không có gì thì trả null, không phải chuỗi rỗng', () => {
    // Chuỗi rỗng lọt xuống DB sẽ đụng unique index với nhau, NULL thì không
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('   ')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });

  test('nhận diện số hợp lệ', () => {
    expect(isValidPhone('0903333333')).toBe(true);
    expect(isValidPhone('+84903333333')).toBe(true);
    expect(isValidPhone('0912345678')).toBe(true);
  });

  test('từ chối số rác', () => {
    expect(isValidPhone('123')).toBe(false);
    expect(isValidPhone('9903333333')).toBe(false); // không bắt đầu bằng 0
    expect(isValidPhone('abc')).toBe(false);
    expect(isValidPhone('')).toBe(false);
    expect(isValidPhone('090333333333333')).toBe(false); // quá dài
  });

  test('phân biệt được người dùng đang gõ SĐT hay email', () => {
    expect(looksLikePhone('0903333333')).toBe(true);
    expect(looksLikePhone('0903 333 333')).toBe(true);
    expect(looksLikePhone('+84903333333')).toBe(true);
    expect(looksLikePhone('admin@badminton.com')).toBe(false);
    expect(looksLikePhone('nguoidung')).toBe(false);
    expect(looksLikePhone('')).toBe(false);
  });

  test('email chứa số vẫn không bị nhầm thành SĐT', () => {
    expect(looksLikePhone('0903333333@gmail.com')).toBe(false);
  });
});
