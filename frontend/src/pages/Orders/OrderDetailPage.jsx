import React, { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import CustomerLayout from '../../layouts/CustomerLayout';
import { myOrderService } from '../../services/apiServices';
import { formatVnd, lookFor, variantLabel } from '../../utils/shop';
import { orderQuantity, orderTotal, statusOf } from './orderStatus';

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

const formatCountdown = (ms) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

/** Đếm ngược tới một mốc thời gian ISO — tự cập nhật mỗi giây, dừng khi không còn mốc. */
function useCountdown(deadlineIso) {
  const [remainingMs, setRemainingMs] = useState(() => (deadlineIso ? new Date(deadlineIso) - new Date() : 0));

  useEffect(() => {
    if (!deadlineIso) return undefined;
    const tick = () => setRemainingMs(new Date(deadlineIso) - new Date());
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [deadlineIso]);

  return Math.max(0, remainingMs);
}

/**
 * Mã QR chuyển khoản + đồng hồ đếm ngược 30 phút. Chỉ hiện khi backend còn trả
 * `qrCodeUrl` — tự null khi đã thanh toán, đã huỷ, hoặc chọn tiền mặt, nên
 * component này không cần tự đoán điều kiện, chỉ cần tin field đó.
 */
function PaymentQrCard({ order }) {
  const remainingMs = useCountdown(order.paymentDeadlineAt);
  if (!order.qrCodeUrl) return null;

  const runningOut = remainingMs > 0 && remainingMs < 5 * 60 * 1000;

  return (
    <section className="nike-card-static border-amber-500/30 p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-kinetic text-xl font-black uppercase tracking-tight text-white">
          📲 Quét mã để thanh toán
        </h2>
        {order.paymentDeadlineAt && (
          <span className={`font-mono text-sm font-black ${runningOut ? 'text-rose-400' : 'text-amber-300'}`}>
            Còn {formatCountdown(remainingMs)}
          </span>
        )}
      </div>

      <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row sm:items-start">
        <img
          src={order.qrCodeUrl}
          alt="Mã QR chuyển khoản"
          className="h-44 w-44 shrink-0 rounded-xl border border-white/10 bg-white p-2"
        />
        <div className="text-sm text-slate-300">
          <p>
            Mở app ngân hàng, quét mã và xác nhận đúng số tiền{' '}
            <span className="font-bold text-white">{formatVnd(order.invoice?.totalAmount)}</span>.
          </p>
          <p className="mt-3 rounded-xl border border-white/10 bg-slate-950/60 p-3 text-xs leading-relaxed text-slate-400">
            Trang này tự làm mới khi tiền về, không cần bấm gì thêm. Quá {' '}
            <span className="font-bold text-amber-300">30 phút</span> chưa chuyển khoản, đơn tự huỷ và hàng trả
            về kệ — bạn đặt lại là được.
          </p>
        </div>
      </div>
    </section>
  );
}

/**
 * Chi tiết một đơn: mốc trạng thái, nơi nhận, người nhận, danh sách hàng và
 * nút huỷ khi đơn còn đang chờ.
 */
export default function OrderDetailPage() {
  const { id } = useParams();
  const location = useLocation();
  const justPlaced = location.state?.justPlaced;

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    let cancelled = false;
    myOrderService
      .getById(id)
      .then((res) => {
        if (!cancelled) setOrder(res.data?.data || null);
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.message || 'Không tìm thấy đơn hàng.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Đơn đang chờ chuyển khoản thì tự làm mới — khách không phải bấm F5 để
  // biết webhook đã nhận tiền hay chưa. Dừng ngay khi đơn rời khỏi trạng thái
  // chờ (đã trả, đã huỷ) hoặc không còn là đơn chuyển khoản.
  useEffect(() => {
    if (!order || order.status !== 'open' || order.paymentMethod !== 'transfer') return undefined;
    const interval = setInterval(() => {
      myOrderService
        .getById(id)
        .then((res) => {
          if (res.data?.data) setOrder(res.data.data);
        })
        .catch(() => {
          // Bỏ qua lỗi mạng thoáng qua — lần quét kế tiếp thử lại, không phá
          // trải nghiệm khách đang chờ bằng một thông báo lỗi giữa chừng.
        });
    }, 10000);
    return () => clearInterval(interval);
  }, [id, order?.status, order?.paymentMethod]);

  const handleCancel = async () => {
    if (!window.confirm('Huỷ đơn hàng này? Hàng sẽ được trả lại kệ.')) return;
    setCancelling(true);
    try {
      const res = await myOrderService.cancel(id);
      setOrder(res.data?.data || order);
    } catch (err) {
      window.alert(err.response?.data?.message || 'Huỷ đơn không thành công.');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <CustomerLayout>
        <p className="py-24 text-center text-slate-400">⏳ Đang tải đơn hàng...</p>
      </CustomerLayout>
    );
  }

  if (error || !order) {
    return (
      <CustomerLayout>
        <div className="nike-card-static p-12 text-center">
          <p className="font-kinetic text-xl font-black uppercase text-white">{error || 'Không tìm thấy đơn hàng'}</p>
          <Link to="/orders" className="btn-nike-bolt mt-6 text-xs">
            Về đơn mua
          </Link>
        </div>
      </CustomerLayout>
    );
  }

  const meta = statusOf(order.status);
  const total = orderTotal(order);
  const canCancel = order.status === 'open';
  const statusHint =
    order.status === 'open' && order.paymentMethod === 'transfer'
      ? 'Quét mã QR bên dưới để chuyển khoản trước, hoặc trả tiền mặt khi bạn tới lấy hàng.'
      : meta.hint;

  return (
    <CustomerLayout
      eyebrow={`Đơn #${order.id}`}
      title={
        <>
          CHI TIẾT <span className="text-gradient-nike">ĐƠN HÀNG</span>
        </>
      }
      action={
        <Link to="/orders" className="btn-nike-dark text-xs">
          ← Đơn mua
        </Link>
      }
    >
      {justPlaced && (
        <div className="nike-card-static mb-6 border-emerald-500/40 p-6 text-center">
          <p className="text-5xl">🎉</p>
          <p className="mt-3 font-kinetic text-xl font-black uppercase text-white">Đặt hàng thành công</p>
          <p className="mt-2 text-sm text-slate-400">
            Hàng đã được giữ tại quầy {order.branch?.name}. Mời bạn tới lấy trong giờ mở cửa.
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <div className="space-y-6">
          <section className="nike-card-static p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-kinetic text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Trạng thái
                </p>
                <span
                  className={`mt-2 inline-block rounded-full border px-3 py-1 font-kinetic text-[10px] font-black uppercase tracking-widest ${meta.cls}`}
                >
                  {meta.label}
                </span>
              </div>
              <p className="text-xs text-slate-500">Đặt lúc {formatDateTime(order.createdAt)}</p>
            </div>
            <p className="mt-3 text-sm text-slate-400">{statusHint}</p>

            {order.invoice && (
              <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/60 p-4 text-sm">
                <div className="flex justify-between text-slate-400">
                  <span>Số hoá đơn</span>
                  <span className="font-mono font-bold text-white">{order.invoice.invoiceNo}</span>
                </div>
                {order.invoice.payment && (
                  <div className="mt-2 flex justify-between text-slate-400">
                    <span>Giao dịch</span>
                    <span className="font-bold text-white">
                      {order.invoice.payment.method === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'} •{' '}
                      {order.invoice.payment.status === 'paid'
                        ? `đã nhận lúc ${formatDateTime(order.invoice.payment.paidAt)}`
                        : 'đang chờ thanh toán'}
                    </span>
                  </div>
                )}
              </div>
            )}

            {canCancel && (
              <button
                type="button"
                onClick={handleCancel}
                disabled={cancelling}
                className="mt-5 text-xs font-bold text-rose-400 transition hover:underline disabled:opacity-50"
              >
                {cancelling ? 'Đang huỷ...' : '❌ Huỷ đơn hàng này'}
              </button>
            )}
          </section>

          <PaymentQrCard order={order} />

          <section className="nike-card-static p-7">
            <h2 className="font-kinetic text-xl font-black uppercase tracking-tight text-white">📦 Sản phẩm</h2>
            <div className="mt-4 space-y-3">
              {(order.lines || []).map((line) => {
                const name = line.variant?.product?.name || `Sản phẩm #${line.variantId}`;
                const look = lookFor(name);
                return (
                  <div key={line.id} className="flex items-center gap-4">
                    <span
                      className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br text-3xl ${look.tint}`}
                    >
                      {look.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-white">{name}</p>
                      <p className="text-xs text-slate-500">
                        {variantLabel(line.variant)} • {formatVnd(line.unitPrice)} × {line.quantity}
                      </p>
                    </div>
                    <span className="shrink-0 font-kinetic text-base font-black text-emerald-400">
                      {formatVnd(line.lineTotal)}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24">
          <section className="nike-card-static p-7">
            <h2 className="font-kinetic text-xl font-black uppercase tracking-tight text-white">📍 Nhận hàng</h2>
            <p className="mt-3 font-kinetic text-base font-black uppercase text-emerald-300">
              {order.branch?.name || 'Chi nhánh'}
            </p>
            {order.branch?.address && <p className="mt-1 text-sm text-slate-400">{order.branch.address}</p>}

            <div className="mt-4 space-y-2 border-t border-white/10 pt-4 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-slate-400">Người nhận</span>
                <span className="font-bold text-white">{order.contactName || '—'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-400">Điện thoại</span>
                <span className="font-bold text-white">{order.contactPhone || '—'}</span>
              </div>
            </div>

            {order.customerNote && (
              <p className="mt-4 rounded-xl border border-white/10 bg-slate-950/60 p-4 text-xs leading-relaxed text-slate-400">
                <span className="font-bold text-slate-300">Ghi chú: </span>
                {order.customerNote}
              </p>
            )}
          </section>

          <section className="nike-card-static p-7">
            <h2 className="font-kinetic text-xl font-black uppercase tracking-tight text-white">🧾 Thanh toán</h2>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between text-slate-400">
                <span>Phương thức</span>
                <span className="font-bold text-white">
                  {order.paymentMethod === 'transfer' ? '🏦 Chuyển khoản' : '💵 Tiền mặt tại quầy'}
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Tiền hàng ({orderQuantity(order)} sản phẩm)</span>
                <span>{formatVnd(total)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-white/10 pt-3">
                <span className="font-kinetic text-sm font-black uppercase text-white">Tổng cộng</span>
                <span className="font-kinetic text-2xl font-black text-emerald-400">
                  {formatVnd(order.invoice?.totalAmount ?? total)}
                </span>
              </div>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-slate-500">
              {order.status === 'paid'
                ? 'Đơn đã thanh toán.'
                : order.paymentMethod === 'transfer'
                  ? 'Quét mã QR ở trên để chuyển khoản trước, hoặc trả tiền mặt khi tới quầy.'
                  : 'Thanh toán tiền mặt hoặc chuyển khoản khi bạn tới lấy hàng.'}
            </p>
          </section>
        </aside>
      </div>
    </CustomerLayout>
  );
}
