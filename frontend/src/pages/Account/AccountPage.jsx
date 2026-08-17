import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import CustomerLayout from '../../layouts/CustomerLayout';
import { useAuth } from '../../contexts/AuthContext';
import { authService, customerService } from '../../services/apiServices';

/**
 * Hồ sơ khách hàng — nơi khách tự xem được những gì hệ thống đang lưu về mình:
 * thông tin liên hệ, hạng thành viên, tiền đã chi, các buổi đã chơi và hoá đơn
 * kèm theo.
 *
 * Chỉ đọc, cộng thêm đổi mật khẩu. Tên/SĐT/email là thứ nhân viên đối chiếu khi
 * khách tới quầy và là danh tính đăng nhập — sửa được ở đây thì lịch sử chi
 * tiêu gắn nhầm người là chuyện sớm muộn, nên việc đó vẫn đi qua quầy.
 */

const TIERS = [
  { key: 'normal', label: 'Thành viên', icon: '🏸', from: 0, cls: 'border-slate-600 bg-slate-800/60 text-slate-300' },
  { key: 'gold', label: 'Hạng Vàng', icon: '🥇', from: 5000000, cls: 'border-amber-400/40 bg-amber-400/15 text-amber-300' },
  { key: 'vip', label: 'Hạng VIP', icon: '💎', from: 15000000, cls: 'border-emerald-400/40 bg-emerald-400/15 text-emerald-300' }
];

const tierOf = (key) => TIERS.find((t) => t.key === key) || TIERS[0];

const formatVnd = (value) => `${Number(value || 0).toLocaleString('vi-VN')}đ`;

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  return date.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const formatDate = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const initialsOf = (name) =>
  (name || '?')
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/5 py-3 last:border-0">
      <span className="font-kinetic text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
      <span className="truncate text-sm font-bold text-white">{value || '—'}</span>
    </div>
  );
}

function StatTile({ label, value, hint }) {
  return (
    <div className="nike-card-static p-6">
      <p className="font-kinetic text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-2 font-kinetic text-3xl font-black text-emerald-400">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function ChangePasswordCard() {
  const [form, setForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
  const [status, setStatus] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (form.newPassword.length < 6) {
      setStatus({ type: 'error', message: 'Mật khẩu mới phải có tối thiểu 6 ký tự.' });
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setStatus({ type: 'error', message: 'Xác nhận mật khẩu chưa khớp.' });
      return;
    }

    setSubmitting(true);
    try {
      await authService.changePassword({ oldPassword: form.oldPassword, newPassword: form.newPassword });
      setForm({ oldPassword: '', newPassword: '', confirmPassword: '' });
      setStatus({ type: 'success', message: 'Đã đổi mật khẩu.' });
    } catch (err) {
      setStatus({ type: 'error', message: err.response?.data?.message || 'Đổi mật khẩu không thành công.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="nike-card-static p-7">
      <h2 className="font-kinetic text-xl font-black uppercase tracking-tight text-white">Đổi mật khẩu</h2>
      <p className="mt-2 text-sm text-slate-400">Tối thiểu 6 ký tự. Đổi xong bạn vẫn giữ nguyên phiên đăng nhập này.</p>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <div>
          <label htmlFor="old-password" className="mb-2 block font-kinetic text-[10px] font-black uppercase tracking-widest text-slate-400">
            Mật khẩu hiện tại
          </label>
          <input
            id="old-password"
            type="password"
            required
            autoComplete="current-password"
            value={form.oldPassword}
            onChange={(event) => setForm({ ...form, oldPassword: event.target.value })}
            className="booking-input"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="new-password" className="mb-2 block font-kinetic text-[10px] font-black uppercase tracking-widest text-slate-400">
              Mật khẩu mới
            </label>
            <input
              id="new-password"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={form.newPassword}
              onChange={(event) => setForm({ ...form, newPassword: event.target.value })}
              className="booking-input"
            />
          </div>
          <div>
            <label htmlFor="confirm-password" className="mb-2 block font-kinetic text-[10px] font-black uppercase tracking-widest text-slate-400">
              Nhập lại mật khẩu mới
            </label>
            <input
              id="confirm-password"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })}
              className="booking-input"
            />
          </div>
        </div>

        {status && (
          <p className={`text-sm font-bold ${status.type === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}>
            {status.message}
          </p>
        )}

        <button type="submit" disabled={submitting} className="btn-nike-bolt text-xs disabled:opacity-60">
          {submitting ? 'Đang lưu...' : 'Cập nhật mật khẩu'}
        </button>
      </form>
    </section>
  );
}

export default function AccountPage() {
  const { user } = useAuth();
  const customerId = user?.customer?.id;

  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(Boolean(customerId));
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!customerId) return undefined;
    let cancelled = false;
    customerService
      .getHistory(customerId)
      .then((res) => {
        if (!cancelled) setHistory(res.data?.data || null);
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.message || 'Không tải được lịch sử chơi.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  // Hồ sơ trả về từ lịch sử là bản mới nhất (tổng chi tiêu vừa cộng sau lần
  // thanh toán gần nhất); user.customer chỉ là ảnh chụp lúc đăng nhập.
  const customer = history?.customer || user?.customer || null;
  const sessions = history?.sessions || [];
  const bookings = history?.bookings || [];

  const totalSpent = Number(customer?.totalSpent || 0);
  const tier = tierOf(customer?.loyaltyTier);
  const nextTier = TIERS.find((t) => t.from > totalSpent);

  const upcomingCount = useMemo(
    () =>
      bookings.filter((booking) => {
        const status = String(booking.status || '').toUpperCase();
        if (!['PENDING', 'CONFIRMED'].includes(status)) return false;
        const end = new Date(`${String(booking.bookingDate).slice(0, 10)}T${booking.endTime || '23:59'}`);
        return end > new Date();
      }).length,
    [bookings]
  );

  const paidSessions = useMemo(() => sessions.filter((session) => session.invoice), [sessions]);

  // API trả lịch sử theo thứ tự mới nhất trước
  const latestSession = sessions[0] || null;

  return (
    <CustomerLayout
      eyebrow="Tài khoản của tôi"
      title={
        <>
          HỒ SƠ <span className="text-gradient-nike">THÀNH VIÊN</span>
        </>
      }
      subtitle="Thông tin liên hệ, hạng thành viên và toàn bộ buổi chơi đã ghi nhận dưới tên bạn."
      action={
        <Link to="/my-bookings" className="btn-nike-dark text-xs">
          Lịch đặt của tôi
        </Link>
      }
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="nike-card-static p-7 lg:col-span-1">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-500 to-lime-400 font-kinetic text-xl font-black text-slate-950">
              {initialsOf(customer?.fullName || user?.fullName)}
            </div>
            <div className="min-w-0">
              <h2 className="truncate font-kinetic text-2xl font-black uppercase tracking-tight text-white">
                {customer?.fullName || user?.fullName}
              </h2>
              <span
                className={`mt-2 inline-block rounded-full border px-3 py-1 font-kinetic text-[10px] font-black uppercase tracking-widest ${tier.cls}`}
              >
                {tier.icon} {tier.label}
              </span>
            </div>
          </div>

          <div className="mt-6">
            <InfoRow label="Số điện thoại" value={customer?.phone || user?.phone} />
            <InfoRow label="Email" value={customer?.email || user?.email} />
            <InfoRow label="Thành viên từ" value={formatDate(customer?.createdAt || user?.createdAt)} />
            <InfoRow label="Mã khách hàng" value={customerId ? `#${customerId}` : '—'} />
          </div>

          <p className="mt-5 rounded-xl border border-white/10 bg-slate-950/60 p-4 text-xs leading-relaxed text-slate-400">
            Cần sửa tên, số điện thoại hay email? Nhờ nhân viên tại quầy cập nhật — số điện thoại cũng là danh tính
            đăng nhập của bạn.
          </p>
        </section>

        <div className="grid gap-6 sm:grid-cols-2 lg:col-span-2 lg:content-start">
          <StatTile
            label="Tổng chi tiêu"
            value={formatVnd(totalSpent)}
            hint={
              nextTier
                ? `Còn ${formatVnd(nextTier.from - totalSpent)} nữa lên ${nextTier.label}`
                : 'Bạn đang ở hạng cao nhất'
            }
          />
          <StatTile label="Buổi đã chơi" value={sessions.length} hint={`${paidSessions.length} buổi đã có hoá đơn`} />
          <StatTile label="Lịch đã đặt" value={bookings.length} hint={`${upcomingCount} lịch sắp tới`} />
          <StatTile label="Lần chơi gần nhất" value={formatDate(latestSession?.startTime)} hint={latestSession?.court?.name || '—'} />
        </div>
      </div>

      <section className="mt-6">
        <h2 className="mb-5 font-kinetic text-2xl font-black uppercase tracking-tight text-white">
          Lịch sử chơi & hoá đơn
        </h2>

        {loading ? (
          <p className="nike-card-static p-10 text-center text-slate-400">⏳ Đang tải lịch sử...</p>
        ) : error ? (
          <p className="nike-card-static p-10 text-center font-bold text-rose-400">{error}</p>
        ) : sessions.length === 0 ? (
          <div className="nike-card-static p-10 text-center">
            <p className="font-kinetic text-lg font-black uppercase text-white">Chưa có buổi chơi nào</p>
            <p className="mt-3 text-slate-400">Đặt sân đầu tiên và buổi chơi sẽ được ghi lại ở đây.</p>
            <Link to="/#booking-widget" className="btn-nike-bolt mt-6 text-xs">
              Đặt sân ngay ⚡
            </Link>
          </div>
        ) : (
          <div className="nike-card-static overflow-x-auto p-2">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-white/10 font-kinetic text-[10px] font-black uppercase tracking-widest text-slate-400">
                  <th className="px-4 py-4 text-left">Bắt đầu</th>
                  <th className="px-4 py-4 text-left">Sân</th>
                  <th className="px-4 py-4 text-right">Tiền sân</th>
                  <th className="px-4 py-4 text-right">Dịch vụ</th>
                  <th className="px-4 py-4 text-right">Tổng hoá đơn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {sessions.map((session) => (
                  <tr key={session.id} className="text-sm">
                    <td className="px-4 py-4 font-mono text-xs text-slate-300">{formatDateTime(session.startTime)}</td>
                    <td className="px-4 py-4 font-bold text-white">🏸 {session.court?.name || `Sân #${session.courtId}`}</td>
                    <td className="px-4 py-4 text-right text-slate-300">{formatVnd(session.invoice?.courtFee ?? session.courtFee)}</td>
                    <td className="px-4 py-4 text-right text-slate-300">{formatVnd(session.invoice?.extrasFee)}</td>
                    <td className="px-4 py-4 text-right font-kinetic font-black text-emerald-400">
                      {session.invoice ? formatVnd(session.invoice.totalAmount) : 'Chưa chốt'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="mt-6">
        <ChangePasswordCard />
      </div>
    </CustomerLayout>
  );
}
