// Các phép biến đổi trạng thái giỏ hàng, tách khỏi CartContext.jsx để test được
// mà không cần dựng React — cùng dạng { branchId, items } vào/ra, không đụng
// localStorage hay context.

const MAX_QUANTITY = 99;
const MIN_QUANTITY = 1;

export const clampQuantity = (value) => Math.max(MIN_QUANTITY, Math.min(MAX_QUANTITY, Number(value) || MIN_QUANTITY));

/**
 * Thêm một mẫu vào giỏ. Đã có sẵn thì cộng dồn số lượng (trần ở MAX_QUANTITY
 * khớp giới hạn phía API — chặn ngay ở đây để khách không bấm mãi rồi mới ăn
 * lỗi lúc đặt đơn); chưa có thì thêm dòng mới.
 *
 * `branchId` của giỏ chốt theo món ĐẦU TIÊN — giỏ trống nhận branchId của entry,
 * giỏ đã có hàng thì giữ nguyên bất kể entry thuộc chi nhánh nào (trang gọi
 * phải tự đảm bảo không trộn hai chi nhánh trước khi gọi hàm này).
 */
export const addItem = (state, entry, quantity = 1) => {
  const existing = state.items.find((item) => item.variantId === entry.variantId);
  const items = existing
    ? state.items.map((item) =>
      item.variantId === entry.variantId
        ? { ...item, quantity: clampQuantity(item.quantity + quantity) }
        : item)
    : [...state.items, { ...entry, quantity: clampQuantity(quantity) }];
  return { branchId: state.branchId ?? entry.branchId ?? null, items };
};

export const setQuantity = (state, variantId, quantity) => ({
  ...state,
  items: state.items.map((item) =>
    item.variantId === variantId ? { ...item, quantity: clampQuantity(quantity) } : item)
});

// Giỏ về rỗng thì branchId cũng phải về null — nếu không, giỏ trống vẫn "khoá"
// vào một chi nhánh cũ và khách không đổi được nơi mua ở lần ghé kế tiếp.
export const removeItem = (state, variantId) => {
  const items = state.items.filter((item) => item.variantId !== variantId);
  return { branchId: items.length ? state.branchId : null, items };
};

export const removeItems = (state, variantIds) => {
  const drop = new Set(variantIds);
  const items = state.items.filter((item) => !drop.has(item.variantId));
  return { branchId: items.length ? state.branchId : null, items };
};

export const clearCart = () => ({ branchId: null, items: [] });

/**
 * Đổi chi nhánh có an toàn không, mà KHÔNG cần force?
 * true khi: chưa có hàng nào, hoặc đang đổi về đúng chi nhánh hiện tại.
 */
export const canSwitchBranch = (state, branchId) => state.branchId === branchId || state.items.length === 0;

/**
 * Đổi chi nhánh giỏ đang gắn. `force: true` xoá sạch giỏ cũ để nhận chi nhánh
 * mới — dùng khi khách đã được hỏi và đồng ý. Không force mà giỏ đang có hàng
 * của chi nhánh khác thì giữ nguyên trạng thái, trang gọi phải tự hỏi khách
 * trước dựa vào `canSwitchBranch`.
 */
export const switchBranch = (state, branchId, { force = false } = {}) => {
  if (state.branchId === branchId) return state;
  if (state.items.length > 0 && !force) return state;
  return { branchId, items: force ? [] : state.items };
};

/**
 * Gộp giỏ khách (chưa đăng nhập) vào giỏ của tài khoản vừa đăng nhập/đăng ký
 * (FE-03). Trước đây đăng nhập là nạp giỏ của tài khoản (thường rỗng) và bỏ
 * luôn những món khách vừa chọn — đúng lúc khách bấm "Đặt hàng".
 *
 * - Giỏ khách rỗng → giữ giỏ tài khoản.
 * - Giỏ tài khoản rỗng → lấy giỏ khách.
 * - Cùng chi nhánh → cộng dồn từng món (trần số lượng như addItem).
 * - Khác chi nhánh → giỏ khách thắng: đó là thứ khách đang mua ngay lúc này;
 *   một giỏ không được trộn hai chi nhánh (xem CartContext).
 */
export const mergeGuestCart = (userCart, guestCart) => {
  if (!guestCart?.items?.length) return userCart;
  if (!userCart?.items?.length) return guestCart;
  if (userCart.branchId && guestCart.branchId && userCart.branchId !== guestCart.branchId) return guestCart;
  return guestCart.items.reduce(
    (state, item) => addItem(state, item, item.quantity),
    { branchId: userCart.branchId ?? guestCart.branchId ?? null, items: userCart.items }
  );
};

/**
 * Giỏ phải dùng sau khi đổi key lưu trữ (đăng nhập, đăng xuất, đổi tài khoản).
 * Chỉ gộp khi đi từ khách sang tài khoản — đăng xuất hay đổi sang người khác
 * thì không mang giỏ của người này sang người kia. `removeGuestCart` báo
 * CartContext xoá giỏ khách đã gộp để lần sau không gộp lại lần nữa.
 */
export const resolveCartSwitch = ({ fromKey, fromCart, toKey, storedToCart, guestKey }) => {
  const fromGuestToAccount = fromKey === guestKey && toKey !== guestKey;
  return fromGuestToAccount
    ? { cart: mergeGuestCart(storedToCart, fromCart), removeGuestCart: true }
    : { cart: storedToCart, removeGuestCart: false };
};

export const totalQuantityOf = (items) => items.reduce((sum, item) => sum + item.quantity, 0);
export const totalAmountOf = (items) => items.reduce((sum, item) => sum + item.quantity * item.price, 0);
