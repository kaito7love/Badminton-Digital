import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import CustomerLayout from '../../layouts/CustomerLayout';
import { bookingService } from '../../services/apiServices';

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
    <CustomerLayout
      eyebrow="Lịch đặt của tôi"
      title={
        <>
          LỊCH ĐẶT <span className="text-gradient-nike">SÂN</span>
        </>
      }
      subtitle={
        <>
          Lịch mới đặt ở trạng thái <span className="font-semibold text-amber-300">chờ xác nhận</span> — nhân viên sẽ
          duyệt trước giờ chơi.
        </>
      }
      action={
        <Link to="/#booking-widget" className="btn-nike-bolt text-xs">
          + Đặt sân mới
        </Link>
      }
    >
      {loading ? (
        <p className="py-16 text-center text-slate-400">⏳ Đang tải lịch đặt...</p>
      ) : error ? (
        <p className="py-16 text-center font-bold text-rose-400">{error}</p>
      ) : bookings.length === 0 ? (
        <div className="nike-card-static p-12 text-center">
          <p className="font-kinetic text-xl font-black uppercase text-white">Bạn chưa đặt sân lần nào</p>
          <p className="mt-3 text-slate-400">Chọn khung giờ ở trang chủ, hệ thống sẽ giữ chỗ ngay khi còn trống.</p>
          <Link to="/#booking-widget" className="btn-nike-bolt mt-6 text-xs">
            Đặt sân đầu tiên ⚡
          </Link>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {bookings.map((b) => {
            const status = String(b.status || '').toUpperCase();
            const meta = STATUS_META[status] || { label: status, cls: 'bg-slate-700/30 text-slate-300 border-slate-600' };
            const canCancel = ['PENDING', 'CONFIRMED'].includes(status) && isUpcoming(b);

            return (
              <div key={b.id} className="nike-card flex flex-col justify-between gap-4 p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs font-bold text-slate-400">
                      📅 {formatDate(b.bookingDate)} • ⏱ {trimSeconds(b.startTime)}–{trimSeconds(b.endTime)}
                    </p>
                    <h3 className="mt-2 font-kinetic text-lg font-black uppercase tracking-tight text-emerald-400">
                      🏸 {b.court?.name || `Sân #${b.courtId}`}
                    </h3>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-3 py-1 font-kinetic text-[10px] font-black uppercase tracking-widest ${meta.cls}`}
                  >
                    {meta.label}
                  </span>
                </div>

                {canCancel && (
                  <div className="border-t border-white/10 pt-3 text-right">
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
    </CustomerLayout>
  );
}
