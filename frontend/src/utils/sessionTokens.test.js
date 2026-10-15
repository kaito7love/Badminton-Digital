import { describe, test, expect } from 'vitest';
import { storeSessionTokens } from './sessionTokens';

const fakeStorage = (initial = {}) => {
  const data = { ...initial };
  return {
    data,
    setItem: (k, v) => { data[k] = String(v); },
    getItem: (k) => (k in data ? data[k] : null),
    removeItem: (k) => { delete data[k]; }
  };
};

describe('storeSessionTokens — lưu cặp token mới sau khi đổi mật khẩu', () => {
  test('ghi cả hai khi server trả đủ', () => {
    const storage = fakeStorage({ access_token: 'cu-a', refresh_token: 'cu-r' });
    expect(storeSessionTokens({ accessToken: 'moi-a', refreshToken: 'moi-r' }, storage)).toBe(true);
    expect(storage.data).toEqual({ access_token: 'moi-a', refresh_token: 'moi-r' });
  });

  test.each([
    ['null', null],
    ['undefined', undefined],
    ['object rỗng', {}],
    ['thiếu refresh', { accessToken: 'a' }],
    ['thiếu access', { refreshToken: 'r' }],
    ['chuỗi rỗng', { accessToken: '', refreshToken: 'r' }],
    ['không phải chuỗi', { accessToken: 123, refreshToken: ['r'] }]
  ])('bỏ qua và KHÔNG xoá token đang có khi dữ liệu là %s', (_, data) => {
    const storage = fakeStorage({ access_token: 'cu-a', refresh_token: 'cu-r' });
    expect(storeSessionTokens(data, storage)).toBe(false);
    expect(storage.data).toEqual({ access_token: 'cu-a', refresh_token: 'cu-r' });
  });

  test('không có storage thì không ném lỗi', () => {
    expect(storeSessionTokens({ accessToken: 'a', refreshToken: 'r' }, null)).toBe(false);
  });
});
