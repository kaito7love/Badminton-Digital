const OnlineOrderService = require('../src/services/OnlineOrderService');

const variant = (id, listPrice) => ({ id, listPrice });

describe('OnlineOrderService.mergeItems', () => {
  test('cùng một SKU gửi thành nhiều dòng thì cộng dồn lại', () => {
    const merged = OnlineOrderService.mergeItems([
      { variantId: 3, quantity: 2 },
      { variantId: 5, quantity: 1 },
      { variantId: 3, quantity: 4 }
    ]);

    expect(merged).toEqual([
      { variantId: 3, quantity: 6 },
      { variantId: 5, quantity: 1 }
    ]);
  });

  test('variantId dạng chuỗi từ client vẫn gộp đúng vào một dòng', () => {
    const merged = OnlineOrderService.mergeItems([
      { variantId: '7', quantity: '2' },
      { variantId: 7, quantity: 3 }
    ]);

    expect(merged).toEqual([{ variantId: 7, quantity: 5 }]);
  });
});

describe('OnlineOrderService.computeLines', () => {
  test('lấy giá từ biến thể trong kho, không tin giá client gửi lên', () => {
    const lines = OnlineOrderService.computeLines(
      [variant(3, '250000.00')],
      [{ variantId: 3, quantity: 2, unitPrice: 1 }]
    );

    expect(lines).toEqual([{ variantId: 3, quantity: 2, unitPrice: 250000, lineTotal: 500000 }]);
  });

  test('biến thể không còn bán thì cả đơn bị từ chối', () => {
    expect(() => OnlineOrderService.computeLines([variant(3, '250000.00')], [{ variantId: 99, quantity: 1 }]))
      .toThrow(/không còn được bán/);
  });

  test('lỗi từ chối là lỗi dữ liệu người dùng (400), không phải lỗi hệ thống', () => {
    try {
      OnlineOrderService.computeLines([], [{ variantId: 1, quantity: 1 }]);
      throw new Error('lẽ ra phải ném lỗi');
    } catch (error) {
      expect(error.statusCode).toBe(400);
    }
  });
});

describe('OnlineOrderService.totalOf', () => {
  test('cộng tổng tiền hàng qua nhiều dòng', () => {
    const lines = OnlineOrderService.computeLines(
      [variant(1, '250000.00'), variant(2, '25000.00')],
      [{ variantId: 1, quantity: 2 }, { variantId: 2, quantity: 3 }]
    );

    expect(OnlineOrderService.totalOf(lines)).toBe(575000);
  });

  test('giỏ rỗng thì tổng bằng 0, không phải NaN', () => {
    expect(OnlineOrderService.totalOf([])).toBe(0);
  });
});
