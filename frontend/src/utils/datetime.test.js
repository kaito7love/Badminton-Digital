import { describe, test, expect, vi, afterEach } from 'vitest';
import { todayInZone } from './datetime';

/**
 * `todayInZone` trả "hôm nay" theo lịch của CHI NHÁNH — trang Đặt sân và các ô
 * ngày dùng nó làm mốc đầu của dải ngày.
 *
 * Mốc "hiện tại" luôn được ghim bằng `vi.setSystemTime` với một mốc UTC tường
 * minh, nên test không phụ thuộc múi giờ của máy chạy test.
 */
const ghimThoiGian = (isoUtc) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(isoUtc));
};

afterEach(() => {
  vi.useRealTimers();
});

describe('todayInZone — ngày hôm nay theo đồng hồ chi nhánh', () => {
  const VN = 'Asia/Ho_Chi_Minh';

  test('17:40 ngày 06/10 giờ Việt Nam', () => {
    ghimThoiGian('2026-10-06T10:40:00Z');
    expect(todayInZone(VN)).toBe('2026-10-06');
  });

  test('qua nửa đêm giờ Việt Nam là sang ngày mới, không cắt chuỗi ISO', () => {
    // 06/10 17:00 UTC = 07/10 00:00 giờ Việt Nam. Cắt chuỗi ISO sẽ vẫn thấy
    // ngày 06 trong suốt 00:00–07:00 sáng.
    ghimThoiGian('2026-10-06T17:00:00Z');
    expect(todayInZone(VN)).toBe('2026-10-07');
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-10-06');
  });

  test('theo giờ CHI NHÁNH, không theo giờ máy khách', () => {
    // Cùng một thời điểm: Việt Nam đã sang 07/10, New York vẫn là tối 06/10.
    ghimThoiGian('2026-10-06T17:00:00Z');
    expect(todayInZone('Asia/Ho_Chi_Minh')).toBe('2026-10-07');
    expect(todayInZone('America/New_York')).toBe('2026-10-06');
  });

  test('thiếu múi giờ thì rơi về giờ Việt Nam', () => {
    ghimThoiGian('2026-10-06T17:00:00Z');
    expect(todayInZone()).toBe('2026-10-07');
  });
});
