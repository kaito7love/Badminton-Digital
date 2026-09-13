const {
  normalizeDiscountPolicy,
  resolveManualDiscount,
  assertManualDiscountAllowed
} = require('../src/utils/discountPolicy');

const employee = { role: { name: 'employee' } };
const manager = { role: { name: 'branch_manager' } };
const admin = { role: 'admin' };
const policy = { employeeMaxPercent: 10 };

const statusOf = (fn) => {
  try {
    fn();
    return null;
  } catch (error) {
    return error.statusCode;
  }
};

describe('resolveManualDiscount — quy số giảm ra đồng nguyên', () => {
  test('giảm theo số tiền không vượt tổng tiền', () => {
    expect(resolveManualDiscount({ baseAmount: 60000, discountAmount: 5000 })).toBe(5000);
    expect(resolveManualDiscount({ baseAmount: 60000, discountAmount: 999999 })).toBe(60000);
  });

  test('giảm theo % tính trên tổng tiền, tối đa 100%', () => {
    expect(resolveManualDiscount({ baseAmount: 151000, discountAmount: 10, isDiscountPercent: true })).toBe(15100);
    expect(resolveManualDiscount({ baseAmount: 151000, discountAmount: 150, isDiscountPercent: true })).toBe(151000);
  });

  test('làm tròn về đồng và không nhận số âm', () => {
    expect(resolveManualDiscount({ baseAmount: 151500, discountAmount: 7, isDiscountPercent: true })).toBe(10605);
    expect(resolveManualDiscount({ baseAmount: 60000, discountAmount: -5000 })).toBe(0);
  });
});

describe('assertManualDiscountAllowed — lý do và trần theo vai trò', () => {
  test('không giảm thì không cần lý do', () => {
    expect(assertManualDiscountAllowed({ actor: employee, baseAmount: 60000, discountAmount: 0, policy })).toEqual({ reason: null, percent: 0 });
  });

  test('có giảm mà thiếu lý do (hoặc chỉ toàn khoảng trắng) thì 400', () => {
    expect(statusOf(() => assertManualDiscountAllowed({ actor: admin, baseAmount: 60000, discountAmount: 1000, policy }))).toBe(400);
    expect(statusOf(() => assertManualDiscountAllowed({ actor: admin, baseAmount: 60000, discountAmount: 1000, reason: '   ', policy }))).toBe(400);
  });

  test('lý do dài quá 200 ký tự thì 400', () => {
    expect(statusOf(() => assertManualDiscountAllowed({ actor: admin, baseAmount: 60000, discountAmount: 1000, reason: 'x'.repeat(201), policy }))).toBe(400);
  });

  test('nhân viên giảm đúng bằng trần thì được, kèm lý do đã gọt khoảng trắng', () => {
    expect(assertManualDiscountAllowed({ actor: employee, baseAmount: 151000, discountAmount: 15100, reason: '  Khách quen  ', policy }))
      .toEqual({ reason: 'Khách quen', percent: 10 });
  });

  test('nhân viên giảm vượt trần một đồng thì 403, thông báo nói rõ mức trần', () => {
    expect(() => assertManualDiscountAllowed({ actor: employee, baseAmount: 151000, discountAmount: 15101, reason: 'Khách quen', policy }))
      .toThrow(/tối đa 10%/);
    expect(statusOf(() => assertManualDiscountAllowed({ actor: employee, baseAmount: 151000, discountAmount: 15101, reason: 'Khách quen', policy }))).toBe(403);
  });

  test('nhân viên giảm 100% (hoá đơn 0đ) bị chặn', () => {
    expect(statusOf(() => assertManualDiscountAllowed({ actor: employee, baseAmount: 60000, discountAmount: 60000, reason: 'Miễn phí', policy }))).toBe(403);
  });

  test('quản lý chi nhánh và admin không bị trần', () => {
    expect(assertManualDiscountAllowed({ actor: manager, baseAmount: 60000, discountAmount: 30000, reason: 'Sự cố sân', policy }).percent).toBe(50);
    expect(assertManualDiscountAllowed({ actor: admin, baseAmount: 60000, discountAmount: 60000, reason: 'Khách mời', policy }).percent).toBe(100);
  });

  test('giảm đúng X% của một số lẻ không bị chặn vì chênh 1 đồng do làm tròn', () => {
    const discountAmount = resolveManualDiscount({ baseAmount: 60005, discountAmount: 10, isDiscountPercent: true });
    expect(() => assertManualDiscountAllowed({ actor: employee, baseAmount: 60005, discountAmount, reason: 'Khách quen', policy })).not.toThrow();
  });

  test('trần 0% thì nhân viên không được giảm tay đồng nào', () => {
    expect(statusOf(() => assertManualDiscountAllowed({ actor: employee, baseAmount: 60000, discountAmount: 1, reason: 'Thử', policy: { employeeMaxPercent: 0 } }))).toBe(403);
  });

  test('vai trò lạ bị áp trần như nhân viên', () => {
    expect(statusOf(() => assertManualDiscountAllowed({ actor: { role: 'cashier' }, baseAmount: 60000, discountAmount: 30000, reason: 'Thử', policy }))).toBe(403);
  });
});

describe('normalizeDiscountPolicy — setting lưu sai không làm mất trần', () => {
  test.each([
    [undefined, 10],
    [null, 10],
    [{}, 10],
    [{ employeeMaxPercent: '' }, 10],
    [{ employeeMaxPercent: null }, 10],
    [{ employeeMaxPercent: 'abc' }, 10],
    [{ employeeMaxPercent: 150 }, 10],
    [{ employeeMaxPercent: -1 }, 10],
    [{ employeeMaxPercent: 0 }, 0],
    [{ employeeMaxPercent: '15' }, 15],
    [{ employeeMaxPercent: 12.5 }, 12.5]
  ])('%j -> %d%%', (value, expected) => {
    expect(normalizeDiscountPolicy(value)).toEqual({ employeeMaxPercent: expected });
  });
});
