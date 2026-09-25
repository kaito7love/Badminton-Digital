import { describe, test, expect } from 'vitest';
import {
  addItem,
  setQuantity,
  removeItem,
  removeItems,
  clearCart,
  canSwitchBranch,
  switchBranch,
  totalQuantityOf,
  totalAmountOf,
  mergeGuestCart,
  resolveCartSwitch
} from './cartReducer';

const empty = () => ({ branchId: null, items: [] });

const productA = { variantId: 3, name: 'Áo Yonex Thi Đấu Nam', price: 250000, branchId: 1 };
const productB = { variantId: 9, name: 'Quấn Cán Vợt Yonex', price: 25000, branchId: 1 };

describe('cartReducer.addItem', () => {
  test('giỏ trống nhận branchId của món đầu tiên', () => {
    const state = addItem(empty(), productA, 2);
    expect(state).toEqual({ branchId: 1, items: [{ ...productA, quantity: 2 }] });
  });

  test('thêm lại đúng biến thể thì cộng dồn số lượng, không tạo dòng mới', () => {
    let state = addItem(empty(), productA, 2);
    state = addItem(state, productA, 3);
    expect(state.items).toHaveLength(1);
    expect(state.items[0].quantity).toBe(5);
  });

  test('số lượng chặn ở 99 dù cộng dồn vượt quá', () => {
    let state = addItem(empty(), productA, 90);
    state = addItem(state, productA, 20);
    expect(state.items[0].quantity).toBe(99);
  });

  test('số lượng tối thiểu là 1, không cho 0 hay âm', () => {
    expect(addItem(empty(), productA, 0).items[0].quantity).toBe(1);
    expect(addItem(empty(), productA, -5).items[0].quantity).toBe(1);
  });

  test('branchId của giỏ giữ nguyên khi thêm món thứ hai, dù entry mang branchId khác', () => {
    const state = addItem(addItem(empty(), productA, 1), { ...productB, branchId: 2 }, 1);
    expect(state.branchId).toBe(1);
    expect(state.items).toHaveLength(2);
  });
});

describe('cartReducer.setQuantity', () => {
  test('sửa đúng dòng theo variantId, không đụng dòng khác', () => {
    const state = addItem(addItem(empty(), productA, 1), productB, 1);
    const next = setQuantity(state, productB.variantId, 5);
    expect(next.items.find((i) => i.variantId === productA.variantId).quantity).toBe(1);
    expect(next.items.find((i) => i.variantId === productB.variantId).quantity).toBe(5);
  });

  test('chặn trong khoảng 1–99', () => {
    const state = addItem(empty(), productA, 1);
    expect(setQuantity(state, productA.variantId, 150).items[0].quantity).toBe(99);
    expect(setQuantity(state, productA.variantId, 0).items[0].quantity).toBe(1);
  });

  test('giá trị không phải số thì rơi về 1 thay vì NaN', () => {
    const state = addItem(empty(), productA, 1);
    expect(setQuantity(state, productA.variantId, 'abc').items[0].quantity).toBe(1);
  });
});

describe('cartReducer.removeItem / removeItems', () => {
  test('xoá dòng cuối cùng thì branchId cũng về null', () => {
    const state = addItem(empty(), productA, 1);
    expect(removeItem(state, productA.variantId)).toEqual(empty());
  });

  test('còn dòng khác thì giữ nguyên branchId', () => {
    const state = addItem(addItem(empty(), productA, 1), productB, 1);
    const next = removeItem(state, productA.variantId);
    expect(next.branchId).toBe(1);
    expect(next.items).toEqual([{ ...productB, quantity: 1 }]);
  });

  test('removeItems xoá nhiều dòng cùng lúc', () => {
    const state = addItem(addItem(empty(), productA, 1), productB, 1);
    expect(removeItems(state, [productA.variantId, productB.variantId])).toEqual(empty());
  });

  test('xoá một variantId không tồn tại thì không đổi gì', () => {
    const state = addItem(empty(), productA, 1);
    expect(removeItem(state, 999)).toEqual(state);
  });
});

describe('cartReducer.clearCart', () => {
  test('luôn trả về giỏ trống', () => {
    expect(clearCart()).toEqual(empty());
  });
});

describe('cartReducer.canSwitchBranch / switchBranch', () => {
  test('giỏ trống thì đổi chi nhánh nào cũng được', () => {
    expect(canSwitchBranch(empty(), 2)).toBe(true);
  });

  test('đổi về đúng chi nhánh hiện tại luôn được, kể cả khi giỏ có hàng', () => {
    const state = addItem(empty(), productA, 1);
    expect(canSwitchBranch(state, 1)).toBe(true);
  });

  test('giỏ có hàng của chi nhánh khác thì không đổi được nếu không force', () => {
    const state = addItem(empty(), productA, 1);
    expect(canSwitchBranch(state, 2)).toBe(false);
    expect(switchBranch(state, 2)).toBe(state);
  });

  test('force=true thì đổi chi nhánh và xoá sạch giỏ cũ', () => {
    const state = addItem(empty(), productA, 1);
    expect(switchBranch(state, 2, { force: true })).toEqual({ branchId: 2, items: [] });
  });

  test('đổi về đúng chi nhánh hiện tại là no-op, trả về cùng object', () => {
    const state = addItem(empty(), productA, 1);
    expect(switchBranch(state, 1)).toBe(state);
  });
});

describe('cartReducer.totalQuantityOf / totalAmountOf', () => {
  test('cộng đúng số lượng và thành tiền qua nhiều dòng', () => {
    const state = addItem(addItem(empty(), productA, 2), productB, 3);
    expect(totalQuantityOf(state.items)).toBe(5);
    expect(totalAmountOf(state.items)).toBe(2 * 250000 + 3 * 25000);
  });

  test('giỏ rỗng thì tổng bằng 0', () => {
    expect(totalQuantityOf([])).toBe(0);
    expect(totalAmountOf([])).toBe(0);
  });
});

describe('mergeGuestCart — giỏ chọn lúc chưa đăng nhập không được mất (FE-03)', () => {
  const productC = { variantId: 20, name: 'Vợt Q7', price: 3800000, branchId: 3 };

  test('giỏ tài khoản rỗng → lấy nguyên giỏ khách', () => {
    const guest = addItem(empty(), productA, 2);
    expect(mergeGuestCart(empty(), guest)).toEqual(guest);
  });

  test('giỏ khách rỗng → giữ giỏ tài khoản', () => {
    const saved = addItem(empty(), productB, 1);
    expect(mergeGuestCart(saved, empty())).toEqual(saved);
  });

  test('cùng chi nhánh → cộng dồn, món trùng thì cộng số lượng (trần 99)', () => {
    const saved = addItem(addItem(empty(), productA, 98), productB, 1);
    const guest = addItem(empty(), productA, 5);
    const merged = mergeGuestCart(saved, guest);
    expect(merged.branchId).toBe(1);
    expect(merged.items.find((i) => i.variantId === productA.variantId).quantity).toBe(99);
    expect(merged.items.find((i) => i.variantId === productB.variantId).quantity).toBe(1);
  });

  test('khác chi nhánh → giỏ khách thắng (thứ khách đang mua), không trộn hai chi nhánh', () => {
    const saved = addItem(empty(), productA, 1);
    const guest = addItem(empty(), productC, 1);
    expect(mergeGuestCart(saved, guest)).toEqual(guest);
  });
});

describe('resolveCartSwitch — đổi key lưu giỏ khi đăng nhập/đăng xuất', () => {
  const GUEST = 'cart_guest';
  const guestCart = addItem(empty(), productA, 2);

  test('khách → tài khoản: gộp và xoá giỏ khách', () => {
    const result = resolveCartSwitch({ fromKey: GUEST, fromCart: guestCart, toKey: 'cart_user_7', storedToCart: empty(), guestKey: GUEST });
    expect(result).toEqual({ cart: guestCart, removeGuestCart: true });
  });

  test('tài khoản → khách (đăng xuất): không mang giỏ của tài khoản ra ngoài', () => {
    const result = resolveCartSwitch({ fromKey: 'cart_user_7', fromCart: guestCart, toKey: GUEST, storedToCart: empty(), guestKey: GUEST });
    expect(result).toEqual({ cart: empty(), removeGuestCart: false });
  });

  test('tài khoản A → tài khoản B: giỏ của B, không gộp giỏ của A', () => {
    const bCart = addItem(empty(), productB, 1);
    const result = resolveCartSwitch({ fromKey: 'cart_user_7', fromCart: guestCart, toKey: 'cart_user_8', storedToCart: bCart, guestKey: GUEST });
    expect(result).toEqual({ cart: bCart, removeGuestCart: false });
  });
});
