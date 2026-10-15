import { describe, test, expect } from 'vitest';
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_BYTES, PASSWORD_HINT, passwordLengthError } from './passwordRules';
import { serverMessage } from './serverMessage';

describe('passwordRules — khớp chính sách backend', () => {
  test('hằng số đúng như đã duyệt', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(PASSWORD_MAX_BYTES).toBe(72);
    expect(PASSWORD_HINT).toBe('Tối thiểu 8 ký tự');
  });

  test.each([['', true], ['1234567', true], ['12345678', false], ['a'.repeat(72), false], ['a'.repeat(73), true]])(
    '%j → lỗi=%s', (value, hasError) => expect(Boolean(passwordLengthError(value))).toBe(hasError)
  );

  test('tính theo byte UTF-8: 25 chữ "ệ" (75 byte) quá dài', () => {
    expect(passwordLengthError('ệ'.repeat(25))).toBeTruthy();
    expect(passwordLengthError('ệ'.repeat(24))).toBeNull(); // 72 byte
  });

  test('không phải chuỗi → lỗi', () => {
    expect(passwordLengthError(undefined)).toBeTruthy();
    expect(passwordLengthError(12345678)).toBeTruthy();
  });
});

describe('serverMessage', () => {
  const err = (data) => ({ response: { data } });
  test('ưu tiên lỗi từng trường (msg của express-validator)', () => {
    expect(serverMessage(err({ message: 'Dữ liệu đầu vào không hợp lệ.', errors: [{ msg: 'Mật khẩu này quá phổ biến.' }] }), 'x')).toBe('Mật khẩu này quá phổ biến.');
  });
  test('dùng errors[0].message nếu không có msg', () => {
    expect(serverMessage(err({ message: 'Validation failed', errors: [{ field: 'p', message: 'Quá ngắn' }] }), 'x')).toBe('Quá ngắn');
  });
  test('rơi về message chung rồi fallback', () => {
    expect(serverMessage(err({ message: 'Lỗi chung', errors: null }), 'x')).toBe('Lỗi chung');
    expect(serverMessage(err({}), 'mặc định')).toBe('mặc định');
    expect(serverMessage(new Error('mạng'), 'mặc định')).toBe('mặc định');
  });
});
