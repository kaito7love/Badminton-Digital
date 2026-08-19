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

export const totalQuantityOf = (items) => items.reduce((sum, item) => sum + item.quantity, 0);
export const totalAmountOf = (items) => items.reduce((sum, item) => sum + item.quantity * item.price, 0);
