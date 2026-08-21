import React, { useState, useEffect } from 'react';
import { productCategoryService, productService, salesOrderService } from '../../services/apiServices';

const formatMoney = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0)) + 'đ';

export default function PosTab() {
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [filterCategoryId, setFilterCategoryId] = useState('all');
  const [loading, setLoading] = useState(true);

  const [order, setOrder] = useState(null);
  const [busyVariantId, setBusyVariantId] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [discountAmount, setDiscountAmount] = useState(0);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutResult, setCheckoutResult] = useState(null);
  const [checkingStatus, setCheckingStatus] = useState(false);

  const [voucherInput, setVoucherInput] = useState('');
  const [voucherBusy, setVoucherBusy] = useState(false);
  const [voucherError, setVoucherError] = useState(null);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const [catRes, prodRes] = await Promise.all([
          productCategoryService.getAll(),
          productService.getAll({ isActive: true }),
        ]);
        setCategories(catRes.data?.data || []);
        setProducts(prodRes.data?.data || []);
      } catch (err) {
        // Danh mục có thể trống — không chặn trang.
      }
      setLoading(false);
    };
    init();
  }, []);

  const ensureOrder = async () => {
    if (order) return order;
    const res = await salesOrderService.create({});
    const created = res.data.data;
    setOrder(created);
    return created;
  };

  const addToCart = async (variantId) => {
    setBusyVariantId(variantId);
    try {
      const currentOrder = await ensureOrder();
      const res = await salesOrderService.addLine(currentOrder.id, { variantId, quantity: 1 });
      setOrder(res.data.data);
    } catch (err) {
      alert(err.response?.data?.message || 'Không thêm được sản phẩm vào giỏ');
    } finally {
      setBusyVariantId(null);
    }
  };

  const removeLine = async (lineId) => {
    try {
      const res = await salesOrderService.removeLine(order.id, lineId);
      setOrder(res.data.data);
    } catch (err) {
      alert(err.response?.data?.message || 'Lỗi xoá dòng sản phẩm');
    }
  };

  const clearCart = async () => {
    if (!order || !order.lines.length) { setOrder(null); return; }
    if (!window.confirm('Huỷ toàn bộ giỏ hàng hiện tại? Tồn kho sẽ được hoàn lại.')) return;
    try {
      let current = order;
      for (const line of [...current.lines]) {
        const res = await salesOrderService.removeLine(current.id, line.id);
        current = res.data.data;
      }
      setOrder(null);
    } catch (err) {
      alert(err.response?.data?.message || 'Lỗi huỷ giỏ hàng');
    }
  };

  const cartTotal = (order?.lines || []).reduce((sum, l) => sum + Number(l.lineTotal), 0);
  const voucherDiscount = Number(order?.voucherDiscountAmount) || 0;
  const grandTotal = Math.max(0, cartTotal - (Number(discountAmount) || 0) - voucherDiscount);

  const applyVoucher = async () => {
    const code = voucherInput.trim();
    if (!code) return;
    setVoucherBusy(true);
    setVoucherError(null);
    try {
      const currentOrder = await ensureOrder();
      const res = await salesOrderService.applyVoucher(currentOrder.id, code);
      setOrder(res.data.data);
    } catch (err) {
      setVoucherError(err.response?.data?.errors?.[0]?.message || err.response?.data?.message || 'Mã giảm giá không hợp lệ');
    } finally {
      setVoucherBusy(false);
    }
  };

  const removeVoucher = async () => {
    if (!order) return;
    setVoucherBusy(true);
    try {
      const res = await salesOrderService.applyVoucher(order.id, null);
      setOrder(res.data.data);
      setVoucherInput('');
      setVoucherError(null);
    } catch (err) {
      alert(err.response?.data?.message || 'Lỗi gỡ mã giảm giá');
    } finally {
      setVoucherBusy(false);
    }
  };

  const handleCheckout = async () => {
    if (!order || !order.lines.length) return;
    setCheckingOut(true);
    try {
      const res = await salesOrderService.checkout(order.id, {
        paymentMethod,
        discountAmount: Number(discountAmount) || 0,
      });
      setCheckoutResult(res.data.data);
      setOrder(null);
      setDiscountAmount(0);
      setPaymentMethod('cash');
      setVoucherInput('');
      setVoucherError(null);
    } catch (err) {
      alert(err.response?.data?.message || 'Lỗi thanh toán');
    } finally {
      setCheckingOut(false);
    }
  };

  // Đọc lại trạng thái thanh toán của đơn transfer đang chờ — webhook ngân
  // hàng (POST /payments/webhook) cập nhật payment.status ở phía server,
  // trang này chỉ chủ động hỏi lại khi thu ngân bấm "Kiểm tra", không tự
  // polling (đơn giản, đủ dùng khi nhân viên đứng quầy theo dõi trực tiếp).
  const handleCheckPaymentStatus = async () => {
    if (!checkoutResult?.salesOrderId) return;
    setCheckingStatus(true);
    try {
      const res = await salesOrderService.getById(checkoutResult.salesOrderId);
      const paymentStatus = res.data?.data?.invoice?.payment?.status;
      if (paymentStatus) {
        setCheckoutResult((prev) => (prev ? { ...prev, paymentStatus } : prev));
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Không kiểm tra được trạng thái thanh toán');
    } finally {
      setCheckingStatus(false);
    }
  };

  const visibleProducts = filterCategoryId === 'all'
    ? products
    : products.filter((p) => String(p.categoryId) === String(filterCategoryId));

  if (loading) return <div className="p-8 text-slate-600 dark:text-slate-300">⏳ Đang tải quầy bán hàng...</div>;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Product picker */}
      <div className="lg:col-span-2 space-y-4">
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button onClick={() => setFilterCategoryId('all')}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold transition ${filterCategoryId === 'all' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300'}`}>
            Tất cả
          </button>
          {categories.map((c) => (
            <button key={c.id} onClick={() => setFilterCategoryId(c.id)}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold transition ${String(filterCategoryId) === String(c.id) ? 'bg-emerald-500 text-slate-950' : 'bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300'}`}>
              {c.name}
            </button>
          ))}
        </div>

        {visibleProducts.length === 0 ? (
          <p className="text-center text-slate-500 dark:text-slate-400 py-8 rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/90">Chưa có sản phẩm nào — thêm ở tab "Danh mục".</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {visibleProducts.map((p) => (
              <div key={p.id} className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/90 p-4 space-y-2">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{p.name}</p>
                <div className="space-y-1.5">
                  {(p.variants || []).map((v) => (
                    <button
                      key={v.id}
                      onClick={() => addToCart(v.id)}
                      disabled={busyVariantId === v.id}
                      className="w-full flex items-center justify-between rounded-xl bg-slate-50 hover:bg-emerald-500/10 dark:bg-slate-950/60 dark:hover:bg-emerald-500/10 px-3 py-2 text-xs transition disabled:opacity-50"
                    >
                      <span className="text-left">
                        <span className="font-mono text-slate-600 dark:text-slate-300">{v.sku}</span>
                        {(v.size || v.color) && <span className="ml-2 text-slate-400 dark:text-slate-500">{[v.size, v.color].filter(Boolean).join(' / ')}</span>}
                      </span>
                      <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                        {busyVariantId === v.id ? '...' : `+ ${formatMoney(v.listPrice)}`}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cart */}
      <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/90 p-6 shadow-xl shadow-slate-200/40 dark:shadow-slate-950/20 space-y-4 h-fit sticky top-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">🛒 Giỏ hàng</h3>
          {order && order.lines.length > 0 && (
            <button onClick={clearCart} className="text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline">Huỷ giỏ</button>
          )}
        </div>

        {!order || order.lines.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">Chưa có sản phẩm nào. Bấm vào sản phẩm bên trái để thêm.</p>
        ) : (
          <div className="space-y-2">
            {order.lines.map((line) => (
              <div key={line.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 dark:bg-slate-950/60 px-3 py-2 text-xs">
                <div>
                  <p className="font-semibold text-slate-800 dark:text-slate-200">{line.variant?.product?.name || line.variant?.sku}</p>
                  <p className="text-slate-400 dark:text-slate-500">{line.quantity} × {formatMoney(line.unitPrice)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{formatMoney(line.lineTotal)}</span>
                  <button onClick={() => removeLine(line.id)} className="text-rose-600 dark:text-rose-400 hover:text-rose-800">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3 border-t border-slate-200 dark:border-slate-800 pt-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Mã giảm giá</label>
            {order?.voucherCode ? (
              <div className="flex items-center justify-between rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs">
                <span className="font-semibold text-emerald-700 dark:text-emerald-300">{order.voucherCode} (-{formatMoney(voucherDiscount)})</span>
                <button onClick={removeVoucher} disabled={voucherBusy} className="text-rose-600 dark:text-rose-400 hover:text-rose-800 disabled:opacity-50">Gỡ ✕</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input value={voucherInput} onChange={(e) => setVoucherInput(e.target.value)}
                  placeholder="Nhập mã"
                  className="flex-1 rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-3 py-2 text-sm uppercase focus:border-emerald-500 focus:outline-none" />
                <button onClick={applyVoucher} disabled={voucherBusy || !voucherInput.trim() || !order?.lines?.length}
                  className="shrink-0 rounded-xl bg-slate-900 dark:bg-slate-100 px-4 text-xs font-semibold text-white dark:text-slate-900 disabled:opacity-50">
                  {voucherBusy ? '...' : 'Áp dụng'}
                </button>
              </div>
            )}
            {voucherError && <p className="mt-1 text-xs font-semibold text-rose-600 dark:text-rose-400">{voucherError}</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Giảm giá thêm (đ)</label>
            <input type="number" min={0} value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Phương thức thanh toán</label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none">
              <option value="cash">Tiền mặt</option>
              <option value="transfer">Chuyển khoản</option>
            </select>
          </div>

          <div className="flex items-center justify-between text-sm pt-2">
            <span className="text-slate-500 dark:text-slate-400">Tổng cộng</span>
            <span className="text-xl font-bold text-slate-900 dark:text-slate-100">{formatMoney(grandTotal)}</span>
          </div>

          <button
            onClick={handleCheckout}
            disabled={!order || !order.lines.length || checkingOut}
            className="w-full rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50 transition"
          >
            {checkingOut ? 'Đang thanh toán...' : '💳 Thanh toán'}
          </button>
        </div>
      </div>

      {checkoutResult && checkoutResult.paymentMethod === 'transfer' && checkoutResult.paymentStatus !== 'paid' && (
        <div className="lg:col-span-3 rounded-3xl border border-amber-500/30 bg-amber-500/10 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">⏳ Chờ khách chuyển khoản — Hoá đơn {checkoutResult.invoiceNo}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Số tiền cần chuyển: {formatMoney(checkoutResult.totalAmount)}
                {checkoutResult.voucherCode && ` (đã áp mã ${checkoutResult.voucherCode} -${formatMoney(checkoutResult.voucherDiscountAmount)})`}
              </p>
            </div>
            <button onClick={() => setCheckoutResult(null)} className="text-xs font-semibold text-amber-700 dark:text-amber-300 hover:underline">Đóng</button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-5">
            {checkoutResult.qrCodeUrl && (
              <img src={checkoutResult.qrCodeUrl} alt="Mã QR chuyển khoản" className="h-40 w-40 shrink-0 rounded-xl border border-slate-200 bg-white p-2" />
            )}
            <div className="flex flex-col gap-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">Đưa mã cho khách quét bằng app ngân hàng. Hệ thống tự nhận tiền qua webhook ngân hàng.</p>
              <button
                onClick={handleCheckPaymentStatus}
                disabled={checkingStatus}
                className="self-start rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60"
              >
                {checkingStatus ? 'Đang kiểm tra...' : '🔄 Kiểm tra đã thanh toán chưa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {checkoutResult && (checkoutResult.paymentMethod !== 'transfer' || checkoutResult.paymentStatus === 'paid') && (
        <div className="lg:col-span-3 rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">✅ Thanh toán thành công — Hoá đơn {checkoutResult.invoiceNo}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Tổng tiền: {formatMoney(checkoutResult.totalAmount)}
              {checkoutResult.voucherCode && ` (đã áp mã ${checkoutResult.voucherCode} -${formatMoney(checkoutResult.voucherDiscountAmount)})`}
            </p>
          </div>
          <button onClick={() => setCheckoutResult(null)} className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 hover:underline">Đóng</button>
        </div>
      )}
    </div>
  );
}
