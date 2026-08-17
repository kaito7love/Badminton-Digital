import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';

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
  const [cart, setCart] = useState(() => readCart(storageKey));

  // Đổi tài khoản trên cùng trình duyệt thì đổi luôn giỏ: giỏ của người này
  // không được hiện ra dưới tên người kia.
  useEffect(() => {
    setCart(readCart(storageKey));
  }, [storageKey]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(cart));
  }, [storageKey, cart]);

  const value = useMemo(() => {
    const items = cart.items;
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.price, 0);

    const addItem = (entry, quantity = 1) => {
      setCart((current) => {
        const existing = current.items.find((item) => item.variantId === entry.variantId);
        const items = existing
          ? current.items.map((item) =>
            item.variantId === entry.variantId
              // Trần 99 khớp với giới hạn phía API — chặn ngay ở đây để khách
              // không bấm mãi rồi mới ăn lỗi lúc đặt đơn.
              ? { ...item, quantity: Math.min(99, item.quantity + quantity) }
              : item)
          : [...current.items, { ...entry, quantity: Math.min(99, quantity) }];
        return { branchId: current.branchId ?? entry.branchId ?? null, items };
      });
    };

    const setQuantity = (variantId, quantity) => {
      const next = Math.max(1, Math.min(99, Number(quantity) || 1));
      setCart((current) => ({
        ...current,
        items: current.items.map((item) => (item.variantId === variantId ? { ...item, quantity: next } : item))
      }));
    };

    const removeItem = (variantId) => {
      setCart((current) => {
        const items = current.items.filter((item) => item.variantId !== variantId);
        return { branchId: items.length ? current.branchId : null, items };
      });
    };

    const removeItems = (variantIds) => {
      const drop = new Set(variantIds);
      setCart((current) => {
        const items = current.items.filter((item) => !drop.has(item.variantId));
        return { branchId: items.length ? current.branchId : null, items };
      });
    };

    const clear = () => setCart({ branchId: null, items: [] });

    /** Trả về false nếu giỏ đang có hàng của chi nhánh khác — trang gọi phải hỏi khách. */
    const switchBranch = (branchId, { force = false } = {}) => {
      if (cart.branchId === branchId) return true;
      if (items.length > 0 && !force) return false;
      setCart({ branchId, items: force ? [] : items });
      return true;
    };

    return {
      branchId: cart.branchId,
      items,
      totalQuantity,
      totalAmount,
      addItem,
      setQuantity,
      removeItem,
      removeItems,
      clear,
      switchBranch
    };
  }, [cart]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => useContext(CartContext);
