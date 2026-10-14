import { describe, expect, test, vi } from 'vitest';
import { confirmBooking, resumePending } from './bookingFlow';
import { PENDING_KEY, savePending } from './pendingBooking';

const memoryStorage = (initial = {}) => {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    has: (k) => map.has(k)
  };
};
const blockedStorage = {
  getItem: () => { throw new Error('blocked'); },
  setItem: () => { throw new Error('blocked'); },
  removeItem: () => { throw new Error('blocked'); }
};

const selection = { courtId: 3, startTime: '18:00', endTime: '20:00' };
const base = { date: '2026-10-15', branchId: 1, selection };
const http = (status, message) => ({ response: { status, data: { message } } });

describe('confirmBooking', () => {
  test('khách hàng: gửi đúng bốn trường và trả lịch vừa tạo', async () => {
    const createBooking = vi.fn().mockResolvedValue({ data: { data: { id: 99, status: 'pending' } } });
    const result = await confirmBooking({ ...base, mode: 'customer', createBooking, storage: memoryStorage() });
    expect(createBooking).toHaveBeenCalledTimes(1);
    expect(createBooking).toHaveBeenCalledWith({ courtId: 3, bookingDate: '2026-10-15', startTime: '18:00', endTime: '20:00' });
    expect(result).toEqual({ type: 'created', booking: { id: 99, status: 'pending' } });
  });

  test('khách chưa đăng nhập: cất lựa chọn, KHÔNG gọi API', async () => {
    const createBooking = vi.fn();
    const storage = memoryStorage();
    const result = await confirmBooking({ ...base, mode: 'guest', createBooking, storage });
    expect(createBooking).not.toHaveBeenCalled();
    expect(result).toEqual({ type: 'login', saved: true });
    expect(JSON.parse(storage.getItem(PENDING_KEY))).toEqual({
      branchId: 1, date: '2026-10-15', courtId: 3, startTime: '18:00', endTime: '20:00'
    });
  });

  test('khách chưa đăng nhập, kho bị chặn: vẫn đi tiếp sang đăng nhập, báo saved=false', async () => {
    const result = await confirmBooking({ ...base, mode: 'guest', createBooking: vi.fn(), storage: blockedStorage });
    expect(result).toEqual({ type: 'login', saved: false });
  });

  test('nhân viên: bị chặn, không gọi API', async () => {
    const createBooking = vi.fn();
    const result = await confirmBooking({ ...base, mode: 'staff', createBooking, storage: memoryStorage() });
    expect(result).toEqual({ type: 'blocked' });
    expect(createBooking).not.toHaveBeenCalled();
  });

  test('409 trùng lịch: failed, tải lại lưới, thông điệp nguyên văn của server', async () => {
    const createBooking = vi.fn().mockRejectedValue(http(409, 'Khung giờ này đã có người đặt, vui lòng chọn khung giờ khác'));
    const result = await confirmBooking({ ...base, mode: 'customer', createBooking, storage: memoryStorage() });
    expect(result).toMatchObject({
      type: 'failed', kind: 'conflict', refreshGrid: true,
      message: 'Khung giờ này đã có người đặt, vui lòng chọn khung giờ khác'
    });
  });

  test('400 luật giờ / quá 14 ngày: failed kind=rejected', async () => {
    const createBooking = vi.fn().mockRejectedValue(http(400, 'Chỉ nhận đặt trước tối đa 14 ngày (đến 27/10/2026), vui lòng chọn ngày sớm hơn'));
    const result = await confirmBooking({ ...base, mode: 'customer', createBooking, storage: memoryStorage() });
    expect(result).toMatchObject({ type: 'failed', kind: 'rejected', refreshGrid: true });
  });

  test('mất mạng: failed kind=network, không tải lại lưới (để khách thử lại)', async () => {
    const createBooking = vi.fn().mockRejectedValue(new Error('Network Error'));
    const result = await confirmBooking({ ...base, mode: 'customer', createBooking, storage: memoryStorage() });
    expect(result).toMatchObject({ type: 'failed', kind: 'network', refreshGrid: false });
  });
});

describe('resumePending', () => {
  const window = { today: '2026-10-14', lastDate: '2026-10-27' };
  const withPending = (overrides = {}) => {
    const storage = memoryStorage();
    savePending(storage, { branchId: 3, date: '2026-10-15', selection, ...overrides });
    return storage;
  };

  test('khách hàng: lấy lại đúng chi nhánh, ngày, sân và khung giờ; kho đã xoá', () => {
    const storage = withPending();
    expect(resumePending({ storage, mode: 'customer', window })).toEqual({
      type: 'resume', branchId: 3, date: '2026-10-15', selection
    });
    expect(storage.has(PENDING_KEY)).toBe(false);
  });

  test('chưa đăng nhập: để nguyên, chưa đọc (khách quay lại từ trang đăng nhập vẫn còn)', () => {
    const storage = withPending();
    expect(resumePending({ storage, mode: 'guest', window })).toEqual({ type: 'none' });
    expect(storage.has(PENDING_KEY)).toBe(true);
  });

  test('nhân viên đăng nhập: bỏ lựa chọn, không dựng lại', () => {
    const storage = withPending();
    expect(resumePending({ storage, mode: 'staff', window })).toEqual({ type: 'none' });
    expect(storage.has(PENDING_KEY)).toBe(false);
  });

  test('lựa chọn của hôm qua (đăng nhập xong sau nửa đêm): không dựng lại', () => {
    const storage = withPending({ date: '2026-10-13' });
    expect(resumePending({ storage, mode: 'customer', window })).toEqual({ type: 'none' });
    expect(storage.has(PENDING_KEY)).toBe(false);
  });

  test('không có gì cất, hoặc kho bị chặn: không ném lỗi', () => {
    expect(resumePending({ storage: memoryStorage(), mode: 'customer', window })).toEqual({ type: 'none' });
    expect(resumePending({ storage: blockedStorage, mode: 'customer', window })).toEqual({ type: 'none' });
    expect(resumePending({ storage: blockedStorage, mode: 'staff', window })).toEqual({ type: 'none' });
  });
});
