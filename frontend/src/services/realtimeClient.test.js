import { describe, test, expect, vi } from 'vitest';

// realtimeClient import apiClient (axios) — chỉ test hai hàm thuần, không cần mạng.
vi.mock('./apiClient', () => ({ refreshAccessToken: vi.fn() }));
const { nextBackoffMs, tokenExpiresWithin, isConnectionSilent } = await import('./realtimeClient');

const base64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwtWithExp = (expSeconds) => `${base64url({ alg: 'HS256' })}.${base64url({ id: 1, exp: expSeconds })}.sig`;

describe('nextBackoffMs — lùi dần khi mở lại SSE', () => {
  test('2s, 4s, 8s, 16s rồi dừng ở 30s', () => {
    expect([0, 1, 2, 3, 4, 10].map(nextBackoffMs)).toEqual([2000, 4000, 8000, 16000, 30000, 30000]);
  });
});

describe('tokenExpiresWithin — có cần refresh trước khi mở lại SSE', () => {
  const now = Date.UTC(2026, 8, 25, 12, 0, 0);

  test('còn hạn lâu → không cần', () => {
    expect(tokenExpiresWithin(jwtWithExp(now / 1000 + 600), 60, now)).toBe(false);
  });

  test('còn dưới 60 giây hoặc đã hết → cần', () => {
    expect(tokenExpiresWithin(jwtWithExp(now / 1000 + 30), 60, now)).toBe(true);
    expect(tokenExpiresWithin(jwtWithExp(now / 1000 - 5), 60, now)).toBe(true);
  });

  test('token hỏng hoặc thiếu exp → coi như hết hạn', () => {
    expect(tokenExpiresWithin('khong-phai-jwt', 60, now)).toBe(true);
    expect(tokenExpiresWithin(`${base64url({})}.${base64url({ id: 1 })}.x`, 60, now)).toBe(true);
  });
});

describe('isConnectionSilent — watchdog phát hiện kết nối chết mà không báo lỗi', () => {
  test('server ping mỗi 25 giây: im lặng tới 60 giây vẫn coi là sống, quá 60 giây là chết', () => {
    const now = 1_000_000;
    expect(isConnectionSilent(now - 25000, now)).toBe(false);
    expect(isConnectionSilent(now - 60000, now)).toBe(false);
    expect(isConnectionSilent(now - 60001, now)).toBe(true);
  });
});
