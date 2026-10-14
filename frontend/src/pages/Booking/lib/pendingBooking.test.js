import { describe, expect, test } from 'vitest';
import { PENDING_KEY, clearPending, savePending, takePending } from './pendingBooking';

/** Kho giả có cùng giao diện với sessionStorage. */
const memoryStorage = (initial = {}) => {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    has: (k) => map.has(k)
  };
};
const brokenStorage = () => ({
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
  removeItem: () => {
    throw new Error('blocked');
  }
});

const WINDOW = { today: '2026-10-14', lastDate: '2026-10-27' };
const saved = { branchId: 1, date: '2026-10-15', selection: { courtId: 3, startTime: '18:00', endTime: '20:00' } };

describe('pendingBooking', () => {
  test('khoá riêng, không trùng khoá của ô đặt nhanh ở Trang chủ', () => {
    expect(PENDING_KEY).toBe('pending_booking_datsan');
    expect(PENDING_KEY).not.toBe('pending_booking');
  });

  test('cất rồi lấy lại đúng nguyên lựa chọn, và lấy là xoá', () => {
    const storage = memoryStorage();
    expect(savePending(storage, saved)).toBe(true);
    expect(takePending(storage, WINDOW)).toEqual(saved);
    expect(storage.has(PENDING_KEY)).toBe(false);
    expect(takePending(storage, WINDOW)).toBeNull();
  });

  test('ngày đã qua (đăng nhập xong sau nửa đêm) hoặc quá dải thì bỏ', () => {
    const past = memoryStorage();
    savePending(past, { ...saved, date: '2026-10-13' });
    expect(takePending(past, WINDOW)).toBeNull();

    const far = memoryStorage();
    savePending(far, { ...saved, date: '2026-10-28' });
    expect(takePending(far, WINDOW)).toBeNull();
  });

  test('ngày đầu và ngày cuối của dải còn hợp lệ', () => {
    for (const date of [WINDOW.today, WINDOW.lastDate]) {
      const storage = memoryStorage();
      savePending(storage, { ...saved, date });
      expect(takePending(storage, WINDOW)?.date).toBe(date);
    }
  });

  test('dữ liệu hỏng hoặc sai dạng thì bỏ, không ném lỗi', () => {
    const bad = [
      'không phải json',
      '[]',
      'null',
      JSON.stringify({ date: '15/10/2026', courtId: 1, startTime: '18:00', endTime: '19:00' }),
      JSON.stringify({ date: '2026-10-15', courtId: 'x', startTime: '18:00', endTime: '19:00' }),
      JSON.stringify({ date: '2026-10-15', courtId: 1, startTime: '18:00', endTime: '17:00' }),
      JSON.stringify({ date: '2026-10-15', courtId: 1, startTime: '25:00', endTime: '26:00' })
    ];
    for (const raw of bad) {
      const storage = memoryStorage({ [PENDING_KEY]: raw });
      expect(takePending(storage, WINDOW)).toBeNull();
    }
  });

  test('thiếu mã chi nhánh vẫn dựng lại được (chi nhánh = null)', () => {
    const storage = memoryStorage();
    savePending(storage, { ...saved, branchId: null });
    expect(takePending(storage, WINDOW)?.branchId).toBeNull();
  });

  test('kho bị chặn (chế độ riêng tư): không vỡ, chỉ là không cất được', () => {
    expect(savePending(brokenStorage(), saved)).toBe(false);
    expect(takePending(brokenStorage(), WINDOW)).toBeNull();
    expect(() => clearPending(brokenStorage())).not.toThrow();
  });

  test('clearPending xoá lựa chọn đã cất', () => {
    const storage = memoryStorage();
    savePending(storage, saved);
    clearPending(storage);
    expect(storage.has(PENDING_KEY)).toBe(false);
  });
});
