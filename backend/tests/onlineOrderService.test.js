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

describe('OnlineOrderService.paymentDeadlineFrom', () => {
  test('mốc hạn là đúng 30 phút sau thời điểm truyền vào', () => {
    const now = new Date('2026-08-18T10:00:00.000Z');
    const deadline = OnlineOrderService.paymentDeadlineFrom(now);

    expect(deadline.toISOString()).toBe('2026-08-18T10:30:00.000Z');
  });
});

describe('OnlineOrderService.isPaymentExpired', () => {
  test('chưa tới hạn thì chưa hết hạn', () => {
    const order = { paymentDeadlineAt: '2026-08-18T10:30:00.000Z' };
    expect(OnlineOrderService.isPaymentExpired(order, new Date('2026-08-18T10:29:59.000Z'))).toBe(false);
  });

  test('qua đúng mốc hạn thì coi là hết hạn', () => {
    const order = { paymentDeadlineAt: '2026-08-18T10:30:00.000Z' };
    expect(OnlineOrderService.isPaymentExpired(order, new Date('2026-08-18T10:30:01.000Z'))).toBe(true);
  });

  test('đơn tiền mặt không có paymentDeadlineAt thì không bao giờ hết hạn', () => {
    expect(OnlineOrderService.isPaymentExpired({ paymentDeadlineAt: null })).toBe(false);
  });
});

describe('OnlineOrderService.buildQrCodeUrl', () => {
  test('addInfo gắn mã đơn để quầy dò tay khi đối chiếu sao kê', () => {
    const url = OnlineOrderService.buildQrCodeUrl(1042, 585000);

    expect(url).toContain('amount=585000');
    expect(url).toContain(encodeURIComponent('DH1042'));
  });
});

describe('OnlineOrderService.qrCodeFor', () => {
  test('không có QR khi thanh toán bằng tiền mặt', () => {
    expect(OnlineOrderService.qrCodeFor({ id: 1, paymentMethod: 'cash', status: 'open' })).toBeNull();
  });

  test('không có QR khi đơn đã thanh toán xong', () => {
    const order = { id: 1, paymentMethod: 'transfer', status: 'paid', invoice: { totalAmount: 100000 } };
    expect(OnlineOrderService.qrCodeFor(order)).toBeNull();
  });

  test('không có QR khi đơn đã huỷ — hàng đã trả về kệ, không còn gì để trả', () => {
    const order = { id: 1, paymentMethod: 'transfer', status: 'cancelled', invoice: { totalAmount: 100000 } };
    expect(OnlineOrderService.qrCodeFor(order)).toBeNull();
  });

  test('đơn đang chờ chuyển khoản thì có QR đúng số tiền hoá đơn', () => {
    const order = { id: 7, paymentMethod: 'transfer', status: 'open', invoice: { totalAmount: 650000 } };
    const url = OnlineOrderService.qrCodeFor(order);

    expect(url).toContain('amount=650000');
    expect(url).toContain(encodeURIComponent('DH7'));
  });

  test('chưa kịp có invoice thì tính tạm theo tổng các dòng hàng', () => {
    const order = {
      id: 9,
      paymentMethod: 'transfer',
      status: 'open',
      invoice: null,
      lines: [{ lineTotal: '250000.00' }, { lineTotal: '25000.00' }]
    };

    expect(OnlineOrderService.qrCodeFor(order)).toContain('amount=275000');
  });
});
