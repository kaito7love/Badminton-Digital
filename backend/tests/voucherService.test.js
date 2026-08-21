const VoucherService = require('../src/services/VoucherService');

describe('VoucherService.normalizeCode', () => {
  test('bỏ khoảng trắng thừa và viết hoa toàn bộ', () => {
    expect(VoucherService.normalizeCode('  sale10  ')).toBe('SALE10');
  });

  test('rỗng hoặc undefined thì trả về chuỗi rỗng, không ném lỗi', () => {
    expect(VoucherService.normalizeCode(undefined)).toBe('');
    expect(VoucherService.normalizeCode('')).toBe('');
  });
});

describe('VoucherService.computeDiscount', () => {
  test('giảm cứng (flat) thấp hơn tổng đơn thì giảm đúng số tiền đó', () => {
    const voucher = { discountType: 'flat', discountValue: 20000 };
    expect(VoucherService.computeDiscount(voucher, 200000)).toBe(20000);
  });

  test('giảm cứng cao hơn tổng đơn thì chỉ giảm tối đa bằng tổng đơn', () => {
    const voucher = { discountType: 'flat', discountValue: 100000 };
    expect(VoucherService.computeDiscount(voucher, 50000)).toBe(50000);
  });

  test('giảm theo % tính đúng trên tổng đơn khi không có mức trần', () => {
    const voucher = { discountType: 'percent', discountValue: 10, maxDiscountAmount: null };
    expect(VoucherService.computeDiscount(voucher, 500000)).toBe(50000);
  });

  test('giảm theo % bị chặn bởi mức trần maxDiscountAmount', () => {
    const voucher = { discountType: 'percent', discountValue: 50, maxDiscountAmount: 30000 };
    expect(VoucherService.computeDiscount(voucher, 500000)).toBe(30000);
  });

  test('giảm theo % vẫn không bao giờ vượt quá tổng đơn dù mức trần cao hơn', () => {
    const voucher = { discountType: 'percent', discountValue: 90, maxDiscountAmount: 1000000 };
    expect(VoucherService.computeDiscount(voucher, 50000)).toBe(45000);
  });

  test('làm tròn về đồng nguyên — VND không có đơn vị lẻ dưới 1đ', () => {
    const voucher = { discountType: 'percent', discountValue: 10, maxDiscountAmount: null };
    expect(VoucherService.computeDiscount(voucher, 333333)).toBe(33333);
  });
});

describe('VoucherService.assertConsistent', () => {
  test('percent > 100 bị chặn (áp dụng cho cả tạo mới lẫn sửa)', () => {
    expect(() => VoucherService.assertConsistent({ discountType: 'percent', discountValue: 150 }))
      .toThrow(/không thể vượt quá 100/);
  });

  test('flat thì giá trị lớn hơn 100 vẫn hợp lệ — đó là số tiền, không phải %', () => {
    expect(() => VoucherService.assertConsistent({ discountType: 'flat', discountValue: 50000 })).not.toThrow();
  });

  test('ngày kết thúc trước ngày bắt đầu bị chặn', () => {
    expect(() => VoucherService.assertConsistent({
      discountType: 'flat',
      discountValue: 1000,
      startsAt: '2026-12-01T00:00:00.000Z',
      endsAt: '2026-01-01T00:00:00.000Z'
    })).toThrow(/phải sau ngày bắt đầu/);
  });

  test('chỉ có một trong hai mốc thời gian thì không kiểm khoảng', () => {
    expect(() => VoucherService.assertConsistent({
      discountType: 'flat',
      discountValue: 1000,
      startsAt: '2026-12-01T00:00:00.000Z',
      endsAt: null
    })).not.toThrow();
  });
});

describe('VoucherService.assertWithinWindow', () => {
  const now = new Date('2026-08-20T10:00:00.000Z');

  test('voucher đã ngừng áp dụng (isActive=false) thì ném lỗi 400', () => {
    const voucher = { isActive: false, startsAt: null, endsAt: null };
    expect(() => VoucherService.assertWithinWindow(voucher, now)).toThrow(/ngừng áp dụng/);
  });

  test('chưa tới ngày bắt đầu thì ném lỗi', () => {
    const voucher = { isActive: true, startsAt: '2026-09-01T00:00:00.000Z', endsAt: null };
    expect(() => VoucherService.assertWithinWindow(voucher, now)).toThrow(/chưa tới ngày/);
  });

  test('đã qua ngày hết hạn thì ném lỗi', () => {
    const voucher = { isActive: true, startsAt: null, endsAt: '2026-08-01T00:00:00.000Z' };
    expect(() => VoucherService.assertWithinWindow(voucher, now)).toThrow(/đã hết hạn/);
  });

  test('đang trong khoảng hiệu lực thì không ném lỗi', () => {
    const voucher = { isActive: true, startsAt: '2026-08-01T00:00:00.000Z', endsAt: '2026-09-01T00:00:00.000Z' };
    expect(() => VoucherService.assertWithinWindow(voucher, now)).not.toThrow();
  });

  test('không có startsAt/endsAt (mã dùng vô thời hạn) thì luôn hợp lệ', () => {
    const voucher = { isActive: true, startsAt: null, endsAt: null };
    expect(() => VoucherService.assertWithinWindow(voucher, now)).not.toThrow();
  });

  test('lỗi ném ra là lỗi dữ liệu người dùng (400), không phải lỗi hệ thống', () => {
    try {
      VoucherService.assertWithinWindow({ isActive: false, startsAt: null, endsAt: null }, now);
      throw new Error('lẽ ra phải ném lỗi');
    } catch (error) {
      expect(error.statusCode).toBe(400);
    }
  });
});

describe('VoucherService.validateAndCompute', () => {
  test('gọi mà không truyền transaction thì ném lỗi lập trình ngay lập tức', async () => {
    await expect(
      VoucherService.validateAndCompute({ code: 'SALE10', orderAmount: 100000 })
    ).rejects.toThrow(/requires an active transaction/);
  });
});
