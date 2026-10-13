const { createStreamGuard } = require('../src/integrations/competition/streamGuard');

describe('giới hạn số luồng SSE công khai', () => {
  test('mỗi địa chỉ tối đa `perIp` luồng; địa chỉ khác không bị ảnh hưởng', () => {
    const guard = createStreamGuard({ perIp: 2, total: 100 });
    const a1 = guard.acquire('1.1.1.1');
    const a2 = guard.acquire('1.1.1.1');
    expect(a1 && a2).toBeTruthy();
    expect(guard.acquire('1.1.1.1')).toBeNull();
    expect(guard.acquire('2.2.2.2')).toBeTruthy();
    expect(guard.sizeFor('1.1.1.1')).toBe(2);
  });

  test('trả chỗ thì mở lại được; gọi release nhiều lần chỉ trả một chỗ', () => {
    const guard = createStreamGuard({ perIp: 1, total: 100 });
    const release = guard.acquire('1.1.1.1');
    expect(guard.acquire('1.1.1.1')).toBeNull();
    release();
    release();
    release();
    expect(guard.size()).toBe(0);
    const again = guard.acquire('1.1.1.1');
    expect(again).toBeTruthy();
    expect(guard.acquire('1.1.1.1')).toBeNull(); // không bị "trả thừa" thành 2 chỗ
  });

  test('tổng số luồng cả hệ thống cũng bị chặn', () => {
    const guard = createStreamGuard({ perIp: 100, total: 3 });
    expect(['a', 'b', 'c'].map((ip) => Boolean(guard.acquire(ip)))).toEqual([true, true, true]);
    expect(guard.acquire('d')).toBeNull();
    expect(guard.size()).toBe(3);
  });

  test('không biết địa chỉ (ip rỗng): chỉ tính vào tổng, không bị gộp thành một địa chỉ chung', () => {
    const guard = createStreamGuard({ perIp: 1, total: 10 });
    expect([guard.acquire(undefined), guard.acquire(''), guard.acquire(null)].every(Boolean)).toBe(true);
    expect(guard.size()).toBe(3);
  });

  test('dọn bộ nhớ: hết luồng của một địa chỉ thì bỏ khỏi bảng', () => {
    const guard = createStreamGuard();
    guard.acquire('1.1.1.1')();
    expect(guard.sizeFor('1.1.1.1')).toBe(0);
    expect(guard.size()).toBe(0);
  });
});
