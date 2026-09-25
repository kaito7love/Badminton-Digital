import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import * as cartReducer from './cartReducer';

/**
 * Giỏ hàng nằm ở trình duyệt, không ở server.
 *
 * Hàng chỉ thật sự được giữ khi khách bấm đặt đơn (lúc đó backend mới trừ kho).
 * Trước bước đó, một cái giỏ trên server chỉ tạo thêm một bảng phải dọn rác mà
 * không giữ được gì cho khách — nên giỏ sống trong localStorage, và đơn hàng
 * mới là thứ có thật.
 *
 * Giỏ gắn với MỘT chi nhánh: giá và tồn kho tính theo chi nhánh, gộp hàng của
 * hai nơi vào một đơn thì tới quầy sẽ thiếu mất một nửa. Đổi chi nhánh khi giỏ
 * đang có hàng phải hỏi khách trước (`switchBranch` trả về false để trang gọi
 * tự xử lý).
 *
 * Các phép biến đổi trạng thái (thêm, sửa số lượng, đổi chi nhánh, gộp giỏ khi
 * đăng nhập...) nằm ở `cartReducer.js` dưới dạng hàm thuần — file này chỉ lo
 * phần có tác dụng phụ: đọc/ghi localStorage và expose qua React context.
 */

const CartContext = createContext(null);

const GUEST_KEY = 'cart_guest';
const keyFor = (user) => (user?.id ? `cart_user_${user.id}` : GUEST_KEY);

const readCart = (storageKey) => {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (!saved || !Array.isArray(saved.items)) return { branchId: null, items: [] };
    return { branchId: saved.branchId ?? null, items: saved.items };
  } catch {
    return { branchId: null, items: [] };
  }
};

export function CartProvider({ children }) {
  const { user } = useAuth();
  const storageKey = keyFor(user);
  // Giỏ luôn đi kèm key của nó. Trước đây giỏ và key là hai thứ riêng: đúng
  // lúc đăng nhập, effect ghi localStorage chạy với key MỚI nhưng giỏ CŨ, rồi
  // giỏ của tài khoản (rỗng) đè lên — món khách vừa chọn biến mất (FE-03).
  const [state, setState] = useState(() => ({ key: storageKey, cart: readCart(storageKey) }));

  // Đổi tài khoản trên cùng trình duyệt thì đổi giỏ; từ khách sang tài khoản
  // thì gộp giỏ khách vào (resolveCartSwitch).
  useEffect(() => {
    if (state.key === storageKey) return;
    const { cart, removeGuestCart } = cartReducer.resolveCartSwitch({
      fromKey: state.key,
      fromCart: state.cart,
      toKey: storageKey,
      storedToCart: readCart(storageKey),
      guestKey: GUEST_KEY
    });
    if (removeGuestCart) localStorage.removeItem(GUEST_KEY);
    setState({ key: storageKey, cart });
  }, [storageKey, state]);

  // Chỉ ghi khi giỏ đúng là của key hiện tại.
  useEffect(() => {
    if (state.key !== storageKey) return;
    localStorage.setItem(state.key, JSON.stringify(state.cart));
  }, [state, storageKey]);

  const { cart } = state;
  const setCart = (update) => setState((current) => ({
    ...current,
    cart: typeof update === 'function' ? update(current.cart) : update
  }));

  const value = useMemo(() => {
    const items = cart.items;

    /** Trả về false nếu giỏ đang có hàng của chi nhánh khác — trang gọi phải hỏi khách. */
    const switchBranchAction = (branchId, options) => {
      const canSwitch = cartReducer.canSwitchBranch(cart, branchId) || options?.force;
      if (!canSwitch) return false;
      setCart((current) => cartReducer.switchBranch(current, branchId, options));
      return true;
    };

    return {
      branchId: cart.branchId,
      items,
      totalQuantity: cartReducer.totalQuantityOf(items),
      totalAmount: cartReducer.totalAmountOf(items),
      addItem: (entry, quantity = 1) => setCart((current) => cartReducer.addItem(current, entry, quantity)),
      setQuantity: (variantId, quantity) => setCart((current) => cartReducer.setQuantity(current, variantId, quantity)),
      removeItem: (variantId) => setCart((current) => cartReducer.removeItem(current, variantId)),
      removeItems: (variantIds) => setCart((current) => cartReducer.removeItems(current, variantIds)),
      clear: () => setCart(cartReducer.clearCart()),
      switchBranch: switchBranchAction
    };
  }, [cart]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => useContext(CartContext);
