import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import CustomerLayout from '../../layouts/CustomerLayout';
import { useCart } from '../../contexts/CartContext';
import { useAuth } from '../../contexts/AuthContext';
import { myOrderService, publicService } from '../../services/apiServices';
import { formatVnd, lookFor, variantLabel } from '../../utils/shop';
import { CART_SELECTION_KEY } from './CartPage';

/**
 * Bước xác nhận đơn: ai nhận, nhận ở đâu, trả bao nhiêu.
 *
 * Hai lựa chọn thanh toán, hai số phận khác nhau sau khi bấm "Đặt hàng":
 * - Tiền mặt: hàng được giữ, khách trả tiền khi tới quầy, nhân viên chốt đơn.
 * - Chuyển khoản: backend tạo hoá đơn ngay, trang chi tiết đơn hiện mã QR để
 *   khách trả trước — không cần nhân viên đứng đó xác nhận, webhook tự lo.
 *   Không chuyển khoản trong 30 phút thì đơn tự huỷ, hàng trả về kệ.
 */

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { items, branchId, removeItems } = useCart();

  const [branch, setBranch] = useState(null);
  const [form, setForm] = useState({
    contactName: user?.fullName || '',
    contactPhone: user?.phone || '',
    customerNote: '',
    paymentMethod: 'cash'
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const orderedItems = useMemo(() => {
    let selectedIds;
    try {
      selectedIds = new Set(JSON.parse(sessionStorage.getItem(CART_SELECTION_KEY) || '[]'));
    } catch {
      selectedIds = new Set();
    }
    // Không có lựa chọn nào được lưu (mở thẳng /checkout) thì lấy cả giỏ.
    if (selectedIds.size === 0) return items;
    return items.filter((item) => selectedIds.has(item.variantId));
  }, [items]);

  const total = orderedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalQuantity = orderedItems.reduce((sum, item) => sum + item.quantity, 0);

  useEffect(() => {
    publicService
      .getBranches()
      .then((res) => {
        const list = res.data?.data || [];
        setBranch(list.find((item) => item.id === branchId) || list[0] || null);
      })
      .catch(() => setBranch(null));
  }, [branchId]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (orderedItems.length === 0) return;

    const targetBranchId = branchId || branch?.id;
    if (!targetBranchId) {
      setError('Chưa xác định được chi nhánh nhận hàng. Vui lòng quay lại cửa hàng và chọn chi nhánh.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await myOrderService.place({
        branchId: targetBranchId,
        items: orderedItems.map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
        contactName: form.contactName.trim(),
        contactPhone: form.contactPhone.trim(),
        customerNote: form.customerNote.trim() || undefined,
        paymentMethod: form.paymentMethod
      });

      // Chỉ bỏ khỏi giỏ những món đã đặt thành công — món chưa chọn vẫn nằm lại.
      removeItems(orderedItems.map((item) => item.variantId));
      sessionStorage.removeItem(CART_SELECTION_KEY);
      navigate(`/orders/${res.data?.data?.id}`, { state: { justPlaced: true }, replace: true });
    } catch (err) {
      setError(
        err.response?.data?.errors?.[0]?.message ||
        err.response?.data?.message ||
        'Đặt hàng không thành công. Vui lòng thử lại.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (orderedItems.length === 0) {
    return (
      <CustomerLayout eyebrow="Đặt hàng" title="XÁC NHẬN ĐƠN">
        <div className="nike-card-static p-12 text-center">
          <p className="font-kinetic text-xl font-black uppercase text-white">Không có sản phẩm nào để đặt</p>
          <Link to="/shop" className="btn-nike-bolt mt-6 text-xs">
            Về cửa hàng 🛍️
          </Link>
        </div>
      </CustomerLayout>
    );
  }

  return (
    <CustomerLayout
      eyebrow="Đặt hàng"
      title={
        <>
          XÁC NHẬN <span className="text-gradient-nike">ĐƠN HÀNG</span>
        </>
      }
      subtitle="Kiểm tra lại thông tin người nhận và danh sách hàng trước khi đặt."
    >
      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <div className="space-y-6">
          <section className="nike-card-static p-7">
            <h2 className="font-kinetic text-xl font-black uppercase tracking-tight text-white">
              📍 Nhận hàng tại quầy
            </h2>
            {branch ? (
              <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                <p className="font-kinetic text-base font-black uppercase text-emerald-300">{branch.name}</p>
                {branch.address && <p className="mt-1 text-sm text-slate-400">{branch.address}</p>}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-400">Đang tải thông tin chi nhánh...</p>
            )}
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              Hàng được giữ ngay khi bạn đặt. Vui lòng tới lấy trong giờ mở cửa — nếu đổi ý, huỷ đơn trong mục
              “Đơn mua” để hàng quay lại kệ cho người khác.
            </p>
          </section>

          <section className="nike-card-static p-7">
            <h2 className="font-kinetic text-xl font-black uppercase tracking-tight text-white">👤 Người nhận</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="contact-name"
                  className="mb-2 block font-kinetic text-[10px] font-black uppercase tracking-widest text-slate-400"
                >
                  Họ tên *
                </label>
                <input
                  id="contact-name"
                  required
                  maxLength={100}
                  value={form.contactName}
                  onChange={(event) => setForm({ ...form, contactName: event.target.value })}
                  className="booking-input"
                />
              </div>
              <div>
                <label
                  htmlFor="contact-phone"
                  className="mb-2 block font-kinetic text-[10px] font-black uppercase tracking-widest text-slate-400"
                >
                  Số điện thoại *
                </label>
                <input
                  id="contact-phone"
                  required
                  inputMode="tel"
                  value={form.contactPhone}
                  onChange={(event) => setForm({ ...form, contactPhone: event.target.value })}
                  className="booking-input"
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Nhân viên đối chiếu tên và số điện thoại này khi giao hàng — nhờ người khác lấy hộ thì điền thông tin
              của họ.
            </p>

            <div className="mt-4">
              <label
                htmlFor="customer-note"
                className="mb-2 block font-kinetic text-[10px] font-black uppercase tracking-widest text-slate-400"
              >
                Ghi chú cho quầy
              </label>
              <textarea
                id="customer-note"
                rows={3}
                maxLength={500}
                value={form.customerNote}
                onChange={(event) => setForm({ ...form, customerNote: event.target.value })}
                placeholder="VD: chiều nay 18h mình qua lấy, nhờ quầy giữ giúp."
                className="booking-input resize-none"
              />
            </div>
          </section>

          <section className="nike-card-static p-7">
            <h2 className="font-kinetic text-xl font-black uppercase tracking-tight text-white">
              💳 Phương thức thanh toán
            </h2>
            <div className="mt-4 space-y-3">
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
                  form.paymentMethod === 'cash'
                    ? 'border-emerald-500/40 bg-emerald-500/5'
                    : 'border-white/10 bg-slate-950/40 hover:border-white/20'
                }`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value="cash"
                  checked={form.paymentMethod === 'cash'}
                  onChange={() => setForm({ ...form, paymentMethod: 'cash' })}
                  className="mt-1 h-4 w-4 accent-emerald-400"
                />
                <div>
                  <p className="text-sm font-bold text-white">💵 Tiền mặt tại quầy</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Hàng được giữ, bạn trả tiền khi tới lấy — nhân viên xuất hoá đơn ngay lúc đó.
                  </p>
                </div>
              </label>

              <label
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
                  form.paymentMethod === 'transfer'
                    ? 'border-emerald-500/40 bg-emerald-500/5'
                    : 'border-white/10 bg-slate-950/40 hover:border-white/20'
                }`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value="transfer"
                  checked={form.paymentMethod === 'transfer'}
                  onChange={() => setForm({ ...form, paymentMethod: 'transfer' })}
                  className="mt-1 h-4 w-4 accent-emerald-400"
                />
                <div>
                  <p className="text-sm font-bold text-white">🏦 Chuyển khoản trước</p>
                  <p className="mt-1 text-xs text-slate-400">
                    Đặt xong hiện mã QR để quét trả ngay — không cần chờ nhân viên. Quét trong{' '}
                    <span className="font-bold text-amber-300">30 phút</span>, quá giờ đơn tự huỷ và hàng trả
                    về kệ.
                  </p>
                </div>
              </label>
            </div>
          </section>
        </div>

        <aside className="nike-card-static p-7 lg:sticky lg:top-24">
          <h2 className="font-kinetic text-xl font-black uppercase tracking-tight text-white">🧾 Đơn của bạn</h2>

          <div className="mt-4 space-y-3">
            {orderedItems.map((item) => {
              const look = lookFor(item.name, item.categoryName);
              return (
                <div key={item.variantId} className="flex items-center gap-3">
                  <span
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br text-2xl ${look.tint}`}
                  >
                    {look.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white">{item.name}</p>
                    <p className="text-xs text-slate-500">
                      {variantLabel(item)} × {item.quantity}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-slate-200">
                    {formatVnd(item.price * item.quantity)}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-5 space-y-2 border-t border-white/10 pt-4 text-sm">
            <div className="flex justify-between text-slate-400">
              <span>Tạm tính ({totalQuantity} sản phẩm)</span>
              <span>{formatVnd(total)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-white/10 pt-3">
              <span className="font-kinetic text-sm font-black uppercase text-white">Tổng cộng</span>
              <span className="font-kinetic text-2xl font-black text-emerald-400">{formatVnd(total)}</span>
            </div>
          </div>

          {error && <p className="mt-4 text-sm font-bold text-rose-400">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="btn-nike-bolt mt-5 w-full justify-center text-xs disabled:opacity-60"
          >
            {submitting ? 'Đang đặt hàng...' : 'Đặt hàng ⚡'}
          </button>
          <Link
            to="/cart"
            className="mt-3 block text-center text-xs font-bold text-slate-400 transition hover:text-emerald-400"
          >
            ← Quay lại giỏ hàng
          </Link>
        </aside>
      </form>
    </CustomerLayout>
  );
}
