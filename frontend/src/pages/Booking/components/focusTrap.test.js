import { describe, expect, test } from 'vitest';
import { FOCUSABLE, trapTarget } from './focusTrap';

describe('trapTarget — khoá Tab trong hộp thoại', () => {
  const [a, b, c] = [{ id: 'quay-lại' }, { id: 'giữa' }, { id: 'xác-nhận' }];
  const items = [a, b, c];

  test('Tab ở phần tử cuối quay về phần tử đầu', () => {
    expect(trapTarget(items, c, false)).toBe(a);
  });

  test('Shift+Tab ở phần tử đầu nhảy tới phần tử cuối', () => {
    expect(trapTarget(items, a, true)).toBe(c);
  });

  test('đang ở giữa hộp: để trình duyệt tự đi tiếp', () => {
    expect(trapTarget(items, b, false)).toBeNull();
    expect(trapTarget(items, b, true)).toBeNull();
    expect(trapTarget(items, a, false)).toBeNull();
    expect(trapTarget(items, c, true)).toBeNull();
  });

  test('tiêu điểm đang ở ngoài hộp: kéo vào đầu (Tab) hoặc cuối (Shift+Tab)', () => {
    const outside = { id: 'nút-ở-nền-trang' };
    expect(trapTarget(items, outside, false)).toBe(a);
    expect(trapTarget(items, outside, true)).toBe(c);
    expect(trapTarget(items, null, false)).toBe(a);
  });

  test('hộp chỉ có một phần tử: Tab và Shift+Tab đều giữ nguyên tại đó', () => {
    expect(trapTarget([a], a, false)).toBe(a);
    expect(trapTarget([a], a, true)).toBe(a);
  });

  test('hộp không có phần tử nào nhận tiêu điểm: không ép gì', () => {
    expect(trapTarget([], a, false)).toBeNull();
    expect(trapTarget(undefined, a, false)).toBeNull();
  });

  test('bộ chọn phần tử nhận tiêu điểm bỏ qua nút đã khoá', () => {
    expect(FOCUSABLE).toContain('button:not([disabled])');
    expect(FOCUSABLE).toContain('[tabindex]:not([tabindex="-1"])');
  });
});
