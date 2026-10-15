import { describe, expect, test } from 'vitest';
import { isValidPhone, normalizePhone, sameName } from './phone';

describe('normalizePhone (khớp backend/src/utils/phone.js)', () => {
  test.each([
    ['0903 333 333', '0903333333'],
    ['+84 903-333-333', '0903333333'],
    ['0084903333333', '0903333333'],
    ['84903333333', '0903333333'],
    ['(090) 333.3333', '0903333333']
  ])('%s → %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  test('không có chữ số → null', () => {
    expect(normalizePhone('abc')).toBeNull();
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
});

describe('isValidPhone', () => {
  test('số hợp lệ / rác', () => {
    expect(isValidPhone('+84 919 000 333')).toBe(true);
    expect(isValidPhone('0903333333')).toBe(true);
    expect(isValidPhone('123')).toBe(false);
    expect(isValidPhone('abc')).toBe(false);
    expect(isValidPhone('903333333')).toBe(false); // không bắt đầu bằng 0
  });
});

describe('sameName', () => {
  test('bỏ qua hoa thường và khoảng trắng thừa', () => {
    expect(sameName('Nguyễn  Văn Khách ', 'nguyễn văn khách')).toBe(true);
    expect(sameName('Nguyễn Văn A', 'Nguyễn Văn B')).toBe(false);
  });
});
