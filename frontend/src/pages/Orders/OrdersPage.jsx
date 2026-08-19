import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import CustomerLayout from '../../layouts/CustomerLayout';
import { myOrderService } from '../../services/apiServices';
import { formatVnd, lookFor } from '../../utils/shop';
import { ORDER_TABS, orderQuantity, orderTotal, statusOf } from './orderStatus';

const formatDateTime = (value) =>
  value
    ? new Date(value).toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
    : '—';

/** "Đơn mua" — danh sách đơn khách đặt trên web, lọc theo trạng thái. */
export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('all');

  useEffect(() => {
    let cancelled = false;
    myOrderService
      .getAll({ limit: 100 })
      .then((res) => {
        if (cancelled) return;
        const data = res.data?.data;
        setOrders(Array.isArray(data) ? data : data?.rows || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.message || 'Không tải được danh sách đơn hàng.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => {
    const result = { all: orders.length };
    for (const order of orders) result[order.status] = (result[order.status] || 0) + 1;
    return result;
  }, [orders]);

  const visibleOrders = tab === 'all' ? orders : orders.filter((order) => order.status === tab);

  return (
    <CustomerLayout
      eyebrow="Đơn mua"
      title={
        <>
          ĐƠN <span className="text-gradient-nike">MUA HÀNG</span>
        </>
      }
      subtitle="Đơn phụ kiện bạn đặt trên web. Hàng được giữ tại quầy cho tới khi bạn tới lấy."
      action={
        <Link to="/shop" className="btn-nike-dark text-xs">
          Mua thêm 🛍️
        </Link>
      }
    >
      <div className="mb-6 flex flex-wrap gap-2">
        {ORDER_TABS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setTab(option.value)}
            className={`kinetic-chip ${tab === option.value ? 'active' : ''}`}
          >
            {option.label} ({counts[option.value] || 0})
          </button>
        ))}
      </div>

      {loading ? (
        <p className="py-16 text-center text-slate-400">⏳ Đang tải đơn hàng...</p>
      ) : error ? (
        <p className="py-16 text-center font-bold text-rose-400">{error}</p>
      ) : visibleOrders.length === 0 ? (
        <div className="nike-card-static p-12 text-center">
          <p className="text-6xl">📦</p>
          <p className="mt-4 font-kinetic text-xl font-black uppercase text-white">
            {tab === 'all' ? 'Bạn chưa đặt đơn nào' : 'Không có đơn nào ở mục này'}
          </p>
          <Link to="/shop" className="btn-nike-bolt mt-6 text-xs">
            Xem cửa hàng 🛍️
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {visibleOrders.map((order) => {
            const meta = statusOf(order.status);
            return (
              <Link
                key={order.id}
                to={`/orders/${order.id}`}
                className="nike-card block p-6 no-underline"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
                  <div>
                    <p className="font-kinetic text-base font-black uppercase tracking-tight text-white">
                      Đơn #{order.id}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDateTime(order.createdAt)} • 🏬 {order.branch?.name || 'Chi nhánh'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {order.qrCodeUrl && (
                      <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-3 py-1 font-kinetic text-[10px] font-black uppercase tracking-widest text-amber-300">
                        📲 Chờ chuyển khoản
                      </span>
                    )}
                    <span
                      className={`rounded-full border px-3 py-1 font-kinetic text-[10px] font-black uppercase tracking-widest ${meta.cls}`}
                    >
                      {meta.label}
                    </span>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {(order.lines || []).slice(0, 3).map((line) => {
                    const name = line.variant?.product?.name || `Sản phẩm #${line.variantId}`;
                    const look = lookFor(name);
                    return (
                      <div key={line.id} className="flex items-center gap-3">
                        <span
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br text-xl ${look.tint}`}
                        >
                          {look.icon}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-slate-300">{name}</span>
                        <span className="shrink-0 text-xs text-slate-500">× {line.quantity}</span>
                      </div>
                    );
                  })}
                  {(order.lines || []).length > 3 && (
                    <p className="text-xs text-slate-500">và {order.lines.length - 3} sản phẩm khác…</p>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
                  <span className="text-xs text-slate-500">{orderQuantity(order)} sản phẩm</span>
                  <span className="font-kinetic text-xl font-black text-emerald-400">
                    {formatVnd(orderTotal(order))}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </CustomerLayout>
  );
}
