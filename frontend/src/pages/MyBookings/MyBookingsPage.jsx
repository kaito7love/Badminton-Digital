import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { bookingService } from '../../services/apiServices';
import { useAuth } from '../../contexts/AuthContext';

// Trang của khách hàng, cố tình KHÔNG dùng SidebarLayout: khách không có việc gì
// với thanh điều hướng quản trị, và nhìn thấy "Quản Lý Sân", "Nhân Viên" chỉ tổ
// dẫn họ bấm vào rồi lãnh 403.

const STATUS_META = {
  PENDING: { label: 'Chờ xác nhận', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  CONFIRMED: { label: 'Đã xác nhận', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  COMPLETED: { label: 'Đã chơi xong', cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  CANCELLED: { label: 'Đã huỷ', cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30' }
};

const formatDate = (value) => {
  if (!value) return '';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

const trimSeconds = (t) => (t ? String(t).slice(0, 5) : '');

export default function MyBookingsPage() {
  const { user, logout } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const fetchBookings = async () => {
    try {
      setError(null);
      const res = await bookingService.getAllBookings({ limit: 100 });
      const data = res.data?.data;
      setBookings(Array.isArray(data) ? data : data?.bookings || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Không tải được danh sách lịch đặt');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  const handleCancel = async (id) => {
    if (!window.confirm('Huỷ lịch đặt này?')) return;
    setBusyId(id);
    try {
      await bookingService.cancelBooking(id);
      await fetchBookings();
    } catch (err) {
      alert(err.response?.data?.message || 'Huỷ lịch thất bại');
    } finally {
      setBusyId(null);
    }
  };

  // Lịch đã qua giờ kết thúc thì không còn gì để huỷ nữa
  const isUpcoming = (b) => {
    const end = new Date(`${String(b.bookingDate).slice(0, 10)}T${b.endTime || '23:59'}`);
    return end > new Date();
  };

  return (
    <div className="min-h-screen bg-[#070A11] text-slate-100 font-sans">
      <div className="fixed top-0 left-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-0 right-0 w-96 h-96 bg-lime-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10 mx-auto max-w-4xl px-5 py-8 md:py-12">
        <header className="flex flex-wrap items-center justify-between gap-4 pb-8">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-lime-400 p-0.5 group-hover:scale-105 transition-transform">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center text-emerald-400 font-black">
                🏸
              </div>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Badminton Digital</p>
              <p className="text-sm font-bold text-white">Lịch đặt của tôi</p>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-sm text-slate-400">
              Xin chào, <span className="font-bold text-slate-200">{user?.fullName}</span>
            </span>
            <button
              onClick={logout}
              className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-bold text-slate-300 hover:bg-slate-700 transition"
            >
              Đăng xuất
            </button>
          </div>
        </header>

        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-black text-white">Lịch đặt sân</h1>
            <p className="mt-1 text-sm text-slate-400">
              Lịch mới đặt ở trạng thái <span className="text-amber-300 font-semibold">chờ xác nhận</span> — nhân viên sẽ duyệt trước giờ chơi.
            </p>
          </div>
          <Link
            to="/#booking-widget"
            className="rounded-2xl bg-gradient-to-r from-emerald-500 to-lime-400 px-5 py-3 text-xs font-black uppercase tracking-wider text-slate-950 shadow-lg shadow-emerald-500/20 hover:brightness-110 transition"
          >
            + Đặt sân mới
          </Link>
        </div>

        {loading ? (
          <p className="py-16 text-center text-slate-400">Đang tải lịch đặt...</p>
        ) : error ? (
          <p className="py-16 text-center text-rose-400">{error}</p>
        ) : bookings.length === 0 ? (
          <div className="rounded-3xl border border-slate-800/80 bg-slate-900/60 p-12 text-center">
            <p className="text-slate-300 font-semibold">Bạn chưa đặt sân lần nào.</p>
            <Link to="/#booking-widget" className="mt-3 inline-block text-emerald-400 font-bold hover:underline">
              Đặt sân đầu tiên →
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {bookings.map((b) => {
              const status = String(b.status || '').toUpperCase();
              const meta = STATUS_META[status] || { label: status, cls: 'bg-slate-700/30 text-slate-300 border-slate-600' };
              const canCancel = ['PENDING', 'CONFIRMED'].includes(status) && isUpcoming(b);

              return (
                <div
                  key={b.id}
                  className="rounded-2xl border border-slate-800/80 bg-slate-950/80 p-6 flex flex-col justify-between gap-4 hover:border-emerald-500/40 transition"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-xs font-bold text-slate-400">
                        📅 {formatDate(b.bookingDate)} • ⏱ {trimSeconds(b.startTime)}–{trimSeconds(b.endTime)}
                      </p>
                      <h3 className="mt-2 text-lg font-bold text-emerald-400">
                        🏸 {b.court?.name || `Sân #${b.courtId}`}
                      </h3>
                    </div>
                    <span className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider ${meta.cls}`}>
                      {meta.label}
                    </span>
                  </div>

                  {canCancel && (
                    <div className="border-t border-slate-800/80 pt-3 text-right">
                      <button
                        onClick={() => handleCancel(b.id)}
                        disabled={busyId === b.id}
                        className="text-xs font-bold text-rose-400 hover:underline disabled:opacity-50"
                      >
                        {busyId === b.id ? 'Đang huỷ...' : '❌ Huỷ lịch này'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
