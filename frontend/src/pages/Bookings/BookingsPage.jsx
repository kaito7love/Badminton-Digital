import React, { useState, useEffect } from 'react';
import { Modal, Badge, Pagination } from '../../components/UIComponents';
import { bookingService, courtService } from '../../services/apiServices';

const formatMoney = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(n)) + 'đ';

export default function BookingsPage() {
  const [bookings, setBookings] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [courts, setCourts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('list');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState(null);
  const [formData, setFormData] = useState({
    customerName: '',
    customerPhone: '',
    courtId: '',
    bookingDate: '',
    startTime: '08:00',
    endTime: '09:00',
  });

  const fetchBookings = async (targetPage = page) => {
    try {
      const res = await bookingService.getAllBookings({ page: targetPage });
      const data = res.data?.data || res.data || [];
      setBookings(Array.isArray(data) ? data : []);
      setMeta(res.data?.meta || null);
    } catch (err) {
      setError(err.message || 'Không tải được danh sách đặt sân');
    }
  };

  const fetchCourts = async () => {
    try {
      const res = await courtService.getAllCourts();
      const data = res.data?.data || res.data || [];
      setCourts(Array.isArray(data) ? data : []);
    } catch { /* non-critical */ }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchBookings(1), fetchCourts()]);
      setLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    if (page === 1) return; // trang 1 đã được init() tải ở trên
    fetchBookings(page);
  }, [page]);

  const handleOpenAddModal = () => {
    setEditingBooking(null);
    setFormData({
      customerName: '',
      customerPhone: '',
      courtId: courts[0]?.id ? String(courts[0].id) : '',
      bookingDate: new Date().toISOString().split('T')[0],
      startTime: '08:00',
      endTime: '09:00',
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (b) => {
    setEditingBooking(b);
    setFormData({
      customerName: b.customer?.fullName || '',
      customerPhone: b.customer?.phone || '',
      courtId: String(b.courtId || b.court?.id || ''),
      bookingDate: b.bookingDate || b.date || '',
      startTime: b.startTime || '08:00',
      endTime: b.endTime || '09:00',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        courtId: parseInt(formData.courtId),
        customerName: formData.customerName,
        customerPhone: formData.customerPhone,
        bookingDate: formData.bookingDate,
        startTime: formData.startTime,
        endTime: formData.endTime,
      };

      if (editingBooking) {
        await bookingService.updateBooking(editingBooking.id, payload);
      } else {
        await bookingService.createBooking(payload);
      }

      await fetchBookings();
      setIsModalOpen(false);
    } catch (err) {
      alert(err.response?.data?.message || 'Lỗi lưu lịch đặt sân');
    }
  };

  const handleCancelBooking = async (id) => {
    if (!window.confirm('Bạn có chắc muốn hủy đặt sân này?')) return;
    try {
      await bookingService.cancelBooking(id);
      await fetchBookings();
    } catch (err) {
      alert(err.response?.data?.message || 'Lỗi hủy đặt sân');
    }
  };

  const handleConfirmBooking = async (id) => {
    try {
      await bookingService.confirmBooking(id);
      await fetchBookings();
    } catch (err) {
      alert(err.response?.data?.message || 'Lỗi xác nhận đặt sân');
    }
  };

  if (loading) return <div className="p-8 text-slate-500 dark:text-slate-400 font-semibold animate-pulse">⚡ Đang tải lịch đặt sân...</div>;
  if (error) return <div className="p-8 text-rose-600 dark:text-rose-400 font-semibold">❌ Lỗi: {error}</div>;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-emerald-600 dark:text-emerald-400 font-medium">Booking Management</p>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mt-1">Quản Lý Đặt Sân</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-2xl">Theo dõi danh sách khách đặt online & tại quầy, duyệt hoặc đổi lịch đặt sân.</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="flex shrink-0 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/80 p-1">
            <button
              onClick={() => setViewMode('list')}
              className={`whitespace-nowrap rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider transition ${viewMode === 'list' ? 'bg-emerald-500 text-slate-950 shadow-md' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}
            >
              Danh sách
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`whitespace-nowrap rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider transition ${viewMode === 'calendar' ? 'bg-emerald-500 text-slate-950 shadow-md' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`}
            >
              Lịch Tuần
            </button>
          </div>
          <button
            onClick={handleOpenAddModal}
            className="shrink-0 whitespace-nowrap rounded-2xl bg-gradient-to-r from-emerald-500 to-lime-400 px-5 py-3 text-xs font-black uppercase tracking-wider text-slate-950 shadow-lg shadow-emerald-500/20 hover:brightness-110 transition"
          >
            + Tạo Lịch Đặt Mới
          </button>
        </div>
      </div>

      {viewMode === 'list' ? (
        <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800/80 dark:bg-slate-900/80 p-6 md:p-8 shadow-2xl backdrop-blur-xl">
          {bookings.length === 0 ? (
            <p className="text-center text-slate-500 dark:text-slate-400 py-12 font-medium">Chưa có lịch đặt sân nào trong hệ thống.</p>
          ) : (
            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
              {bookings.map((b) => {
                const status = (b.status || '').toUpperCase();
                const courtName = b.court?.name || b.courtName || `Sân #${b.courtId}`;
                const customerName = b.customer?.fullName || 'Khách vãng lai';
                const phone = b.customer?.phone || '';
                const date = b.bookingDate || b.date || '';
                const time = b.startTime && b.endTime ? `${b.startTime} - ${b.endTime}` : '';

                return (
                  <div key={b.id} className="rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800/80 dark:bg-slate-950/80 p-6 flex flex-col justify-between space-y-4 hover:border-emerald-500/40 transition">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 font-mono">📅 {date} • ⏱ {time}</span>
                        <h3 className="mt-2 text-lg font-bold text-slate-900 dark:text-white">{customerName}</h3>
                        {phone && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">📞 {phone}</p>}
                      </div>
                      <Badge variant={status === 'CONFIRMED' || status === 'COMPLETED' ? 'emerald' : status === 'PENDING' ? 'amber' : 'rose'}>
                        {status}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 pt-4 border-t border-slate-200 dark:border-slate-800/80">
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">🏸 {courtName}</span>
                      <div className="flex gap-3 font-bold">
                        {status !== 'CANCELLED' && status !== 'COMPLETED' && (
                          <button onClick={() => handleOpenEditModal(b)} className="text-sky-600 dark:text-sky-400 hover:underline">✏️ Đổi lịch</button>
                        )}
                        {status === 'PENDING' && (
                          <button onClick={() => handleConfirmBooking(b.id)} className="text-emerald-600 dark:text-emerald-400 hover:underline">✅ Duyệt</button>
                        )}
                        {status !== 'CANCELLED' && status !== 'COMPLETED' && (
                          <button onClick={() => handleCancelBooking(b.id)} className="text-rose-600 dark:text-rose-400 hover:underline">❌ Hủy</button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <Pagination meta={meta} onPageChange={setPage} itemLabel="lượt đặt sân" />
        </div>
      ) : (
        <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800/80 dark:bg-slate-900/80 p-12 shadow-2xl backdrop-blur-xl text-center space-y-4">
          <div className="text-5xl">📅</div>
          <h3 className="text-2xl font-extrabold text-slate-900 dark:text-white">Giao Diện Lịch Đặt Sân Tương Tác</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto font-medium">Lịch hiển thị khung giờ 06:00 - 23:00 trực quan, giúp nhân viên check lịch trống nhanh chóng.</p>
        </div>
      )}

      {/* Modal Thêm / Sửa Đặt Sân */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingBooking ? `Cập Nhật Lịch #${editingBooking.id}` : 'Tạo Lịch Đặt Sân Mới'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Tên khách hàng *</label>
            <input
              type="text"
              required
              value={formData.customerName}
              onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-white px-4 py-3 text-sm focus:border-emerald-400 focus:outline-none"
              placeholder="Nguyễn Văn A"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Số điện thoại *</label>
              <input
                type="text"
                required
                value={formData.customerPhone}
                onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-white px-4 py-3 text-sm focus:border-emerald-400 focus:outline-none"
                placeholder="090XXXXXXX"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Chọn Sân *</label>
              <select
                value={formData.courtId}
                onChange={(e) => setFormData({ ...formData, courtId: e.target.value })}
                required
                className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-white px-4 py-3 text-sm focus:border-emerald-400 focus:outline-none"
              >
                <option value="">-- Chọn sân --</option>
                {courts.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Ngày chơi *</label>
              <input
                type="date"
                required
                value={formData.bookingDate}
                onChange={(e) => setFormData({ ...formData, bookingDate: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-white px-3 py-2.5 text-xs focus:border-emerald-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Bắt đầu *</label>
              <input
                type="time"
                required
                value={formData.startTime}
                onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-white px-3 py-2.5 text-xs focus:border-emerald-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Kết thúc *</label>
              <input
                type="time"
                required
                value={formData.endTime}
                onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-white px-3 py-2.5 text-xs focus:border-emerald-400 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="rounded-xl bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 px-4 py-2.5 text-xs font-bold uppercase tracking-wider"
            >
              Hủy
            </button>
            <button
              type="submit"
              className="rounded-xl bg-emerald-500 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-slate-950 hover:bg-emerald-400"
            >
              {editingBooking ? 'Cập Nhật Lịch' : 'Lưu Đặt Sân'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
