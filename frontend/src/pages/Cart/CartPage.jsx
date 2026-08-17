import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import CustomerLayout from '../../layouts/CustomerLayout';
import QuantityStepper from '../../components/QuantityStepper';
import { useCart } from '../../contexts/CartContext';
import { useAuth } from '../../contexts/AuthContext';
import { publicService } from '../../services/apiServices';
import { formatVnd, lookFor, variantLabel } from '../../utils/shop';
import { roleOf } from '../../utils/roles';

/**
 * Giỏ hàng: chọn món nào mua chuyến này, sửa số lượng, rồi sang bước đặt đơn.
 *
 * Chỉ những dòng được tích mới đi tiếp — khách hay để dành vài món trong giỏ và
 * chỉ lấy một phần, ép mua cả giỏ là bắt họ xoá đi rồi thêm lại lần sau.
 */

const CART_SELECTION_KEY = 'cart_selection';

export default function CartPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { items, branchId, setQuantity, removeItem, removeItems } = useCart();

  const [selectedIds, setSelectedIds] = useState(() => {
    try {
      return new Set(JSON.parse(sessionStorage.getItem(CART_SELECTION_KEY) || '[]'));
    } catch {
      return new Set();
    }
  });
  const [branchName, setBranchName] = useState(null);

  // Món mới thêm vào giỏ mặc định được tích sẵn; món đã xoá thì bỏ khỏi lựa chọn.
  useEffect(() => {
    setSelectedIds((current) => {
      const known = new Set(items.map((item) => item.variantId));
      const next = new Set([...current].filter((id) => known.has(id)));
      const isFirstVisit = current.size === 0 && next.size === 0;
      if (isFirstVisit) items.forEach((item) => next.add(item.variantId));
      return next;
    });
  }, [items]);

  useEffect(() => {
    sessionStorage.setItem(CART_SELECTION_KEY, JSON.stringify([...selectedIds]));
  }, [selectedIds]);

  useEffect(() => {
    if (!branchId) {
      setBranchName(null);
      return;
    }
    publicService
      .getBranches()
      .then((res) => {
        const branch = (res.data?.data || []).find((item) => item.id === branchId);
        setBranchName(branch?.name || null);
      })
      .catch(() => setBranchName(null));
  }, [branchId]);

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.variantId)),
    [items, selectedIds]
  );
  const selectedTotal = selectedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const allSelected = items.length > 0 && selectedIds.size === items.length;

  const toggle = (variantId) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(variantId)) next.delete(variantId);
      else next.add(variantId);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(items.map((item) => item.variantId)));
  };

  const removeSelected = () => {
    if (selectedItems.length === 0) return;
    if (!window.confirm(`Xoá ${selectedItems.length} sản phẩm khỏi giỏ hàng?`)) return;
    removeItems(selectedItems.map((item) => item.variantId));
  };

  const goToCheckout = () => {
    if (selectedItems.length === 0) return;
    // Chưa đăng nhập thì mời đăng nhập rồi quay lại đúng đây — giỏ vẫn nằm
    // trong localStorage nên không mất gì.
    if (!user) {
      navigate('/login', { state: { from: { pathname: '/checkout' } } });
      return;
    }
    if (roleOf(user) !== 'customer') {
      window.alert('Tài khoản nhân viên vui lòng bán hàng trong màn Bán Lẻ.');
      return;
    }
    navigate('/checkout');
  };

  return (
    <CustomerLayout
      eyebrow="Giỏ hàng"
      title={
        <>
          GIỎ <span className="text-gradient-nike">HÀNG</span>
        </>
      }
      subtitle={
        branchName
          ? `Hàng sẽ được giữ và thanh toán tại ${branchName}.`
          : 'Chọn sản phẩm muốn mua chuyến này rồi tiến hành đặt đơn.'
      }
      action={
        <Link to="/shop" className="btn-nike-dark text-xs">
          Mua thêm
        </Link>
      }
    >
      {items.length === 0 ? (
        <div className="nike-card-static p-12 text-center">
          <p className="text-6xl">🛒</p>
          <p className="mt-4 font-kinetic text-xl font-black uppercase text-white">Giỏ hàng đang trống</p>
          <p className="mt-3 text-slate-400">Ghé cửa hàng chọn vài món trước khi ra sân.</p>
          <Link to="/shop" className="btn-nike-bolt mt-6 text-xs">
            Xem cửa hàng 🛍️
          </Link>
        </div>
      ) : (
        <>
          <div className="nike-card-static mb-4 flex flex-wrap items-center justify-between gap-4 px-6 py-4">
            <label className="flex cursor-pointer items-center gap-3 text-sm font-bold text-slate-300">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="h-5 w-5 accent-emerald-400"
              />
              Chọn tất cả ({items.length})
            </label>
            <button
              type="button"
              onClick={removeSelected}
              disabled={selectedItems.length === 0}
              className="text-xs font-bold text-rose-400 transition hover:underline disabled:opacity-40"
            >
              🗑 Xoá mục đã chọn
            </button>
          </div>

          <div className="space-y-4">
            {items.map((item) => {
              const look = lookFor(item.name, item.categoryName);
              const checked = selectedIds.has(item.variantId);

              return (
                <div
                  key={item.variantId}
                  className={`nike-card-static flex flex-wrap items-center gap-4 p-5 transition ${
                    checked ? 'border-emerald-500/30' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(item.variantId)}
                    aria-label={`Chọn ${item.name}`}
                    className="h-5 w-5 shrink-0 accent-emerald-400"
                  />

                  <Link
                    to={`/shop/${item.productId}`}
                    className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br ${look.tint}`}
                  >
                    <span className="text-4xl">{look.icon}</span>
                  </Link>

                  <div className="min-w-[10rem] flex-1">
                    <Link
                      to={`/shop/${item.productId}`}
                      className="font-kinetic text-base font-black uppercase leading-tight text-white hover:text-emerald-400"
                    >
                      {item.name}
                    </Link>
                    <p className="mt-1 text-xs text-slate-400">{variantLabel(item)}</p>
                    <p className="font-mono text-[11px] text-slate-600">{item.sku}</p>
                  </div>

                  <QuantityStepper
                    value={item.quantity}
                    onChange={(next) => setQuantity(item.variantId, next)}
                    size="sm"
                  />

                  <div className="ml-auto text-right">
                    <p className="font-kinetic text-lg font-black text-emerald-400">
                      {formatVnd(item.price * item.quantity)}
                    </p>
                    <p className="text-[11px] text-slate-500">{formatVnd(item.price)} / cái</p>
                    <button
                      type="button"
                      onClick={() => removeItem(item.variantId)}
                      className="mt-1 text-[11px] font-bold text-rose-400 hover:underline"
                    >
                      Xoá
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Thanh tổng dính đáy: số tiền phải nhìn thấy được mọi lúc, không
              phải cuộn xuống cuối mới biết mình đang mua bao nhiêu. */}
          <div className="sticky bottom-20 z-30 mt-6 lg:bottom-4">
            <div className="nike-card-static flex flex-wrap items-center justify-between gap-4 border-emerald-500/30 p-5">
              <div>
                <p className="font-kinetic text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Tổng tiền ({selectedItems.reduce((sum, item) => sum + item.quantity, 0)} sản phẩm)
                </p>
                <p className="font-kinetic text-3xl font-black text-emerald-400">{formatVnd(selectedTotal)}</p>
              </div>
              <button
                type="button"
                onClick={goToCheckout}
                disabled={selectedItems.length === 0}
                className="btn-nike-bolt text-xs disabled:cursor-not-allowed disabled:opacity-40"
              >
                Đặt hàng ⚡
              </button>
            </div>
          </div>
        </>
      )}
    </CustomerLayout>
  );
}

export { CART_SELECTION_KEY };
