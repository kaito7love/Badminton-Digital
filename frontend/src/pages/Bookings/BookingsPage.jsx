import React, { useState, useEffect, useRef } from 'react';
import { Modal, Badge, Pagination } from '../../components/UIComponents';
import { bookingService, courtService, customerService } from '../../services/apiServices';
import { connectRealtimeStream } from '../../services/realtimeClient';
import { useBranch } from '../../contexts/BranchContext';
import { todayInZone } from '../../utils/datetime';
import { isValidPhone, normalizePhone, sameName } from '../../utils/phone';
import InlineNotice from '../../components/InlineNotice';
import { serverMessage } from '../../utils/serverMessage';

const formatMoney = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(n)) + 'đ';

export default function BookingsPage() {
  const [bookings, setBookings] = useState([]);
  const [meta, setMeta] = useState(null);
  const [page, setPage] = useState(1);
  const [courts, setCourts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('list');
  // Lỗi thao tác hiện thành banner trong trang (không dùng alert); lỗi lưu lịch hiện trong modal để không mất dữ liệu đang gõ.
  const [notice, setNotice] = useState(null);
  const [noticeTone, setNoticeTone] = useState('error');
  const [modalError, setModalError] = useState(null);
  // Khách có sẵn khớp SĐT đang gõ trong form tạo lịch (kế hoạch 42, F5): { id, fullName, phone } | null.
  const [phoneMatch, setPhoneMatch] = useState(null);
  const [realtimeStatus, setRealtimeStatus] = useState('live');
  const { selectedBranchId, activeTimezone } = useBranch() || {};
  const showNotice = (message, tone = 'error') => {
    setNoticeTone(tone);
    setNotice(message);
  };

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

  // Đồng bộ realtime (F6): khách đặt/huỷ ở nơi khác thì danh sách tự tải lại, không cần F5. Nhận sự kiện = tải lại
  // TRANG HIỆN TẠI (không ráp state từ payload). Đang mở form thì hoãn tới khi đóng, để không làm mất dữ liệu đang gõ.
  const pageRef = useRef(page);
  const modalOpenRef = useRef(false);
  const refreshPendingRef = useRef(false);
  pageRef.current = page;
  modalOpenRef.current = isModalOpen;

  useEffect(() => {
    const refresh = () => {
      if (modalOpenRef.current) {
        refreshPendingRef.current = true;
        return;
      }
      fetchBookings(pageRef.current);
    };
    const close = connectRealtimeStream({
      branchId: selectedBranchId,
      onEvent: (eventName) => {
        if (eventName === 'booking:changed') refresh();
      },
      onReconnect: refresh,
      onStatusChange: setRealtimeStatus
    });
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      close();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [selectedBranchId]);

  useEffect(() => {
    if (!isModalOpen && refreshPendingRef.current) {
      refreshPendingRef.current = false;
      fetchBookings(pageRef.current);
    }
  }, [isModalOpen]);

  const handleOpenAddModal = () => {
    setEditingBooking(null);
    setModalError(null);
    setPhoneMatch(null);
    setFormData({
      customerName: '',
      customerPhone: '',
      courtId: courts[0]?.id ? String(courts[0].id) : '',
      // Theo múi giờ chi nhánh — cắt toISOString() ra ngày hôm trước trong khoảng 00:00–07:00 giờ Việt Nam.
      bookingDate: todayInZone(activeTimezone),
      startTime: '08:00',
      endTime: '09:00',
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (b) => {
    setEditingBooking(b);
    setModalError(null);
    setPhoneMatch(null);
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
      const schedule = {
        courtId: parseInt(formData.courtId),
        bookingDate: formData.bookingDate,
        startTime: formData.startTime,
        endTime: formData.endTime,
      };

      if (editingBooking) {
        // Đổi lịch chỉ đổi sân/ngày/giờ — backend trả 400 nếu gửi thêm trường khác.
        await bookingService.updateBooking(editingBooking.id, schedule);
      } else {
        const res = await bookingService.createBooking({
          ...schedule,
          customerName: formData.customerName,
          customerPhone: formData.customerPhone,
        });
        // Lịch vừa gắn vào hồ sơ có sẵn theo SĐT: nói rõ cho nhân viên, nhất là khi tên gõ khác tên đã lưu (F5).
        const match = res?.data?.data?.customerMatch;
        if (match?.nameDiffers) {
          showNotice(`Đã tạo lịch và gắn vào khách "${match.fullName}" (khớp SĐT). Tên bạn gõ khác tên đã lưu — nếu nhập nhầm SĐT hãy huỷ lịch rồi tạo lại.`, 'warning');
        } else if (match) {
          showNotice(`Đã tạo lịch và gắn vào khách "${match.fullName}" (khớp SĐT).`, 'success');
        }
      }

      await fetchBookings();
      setIsModalOpen(false);
    } catch (err) {
      setModalError(serverMessage(err, 'Lỗi lưu lịch đặt sân'));
    }
  };

  // Rời ô SĐT: tra khách có sẵn khớp đúng số này để nhân viên thấy lịch sẽ gắn vào hồ sơ nào TRƯỚC khi lưu (F5).
  const lookupPhone = async () => {
    const phone = normalizePhone(formData.customerPhone);
    if (editingBooking || !phone || !isValidPhone(phone)) {
      setPhoneMatch(null);
      return;
    }
    try {
      const res = await customerService.getAllCustomers({ search: phone, limit: 10 });
      const list = res.data?.data;
      const rows = Array.isArray(list) ? list : list?.items || list?.customers || list?.rows || [];
      const hit = rows.find((c) => normalizePhone(c.phone) === phone);
      setPhoneMatch(hit ? { id: hit.id, fullName: hit.fullName, phone: hit.phone } : null);
    } catch {
      setPhoneMatch(null); // tra cứu chỉ là gợi ý — lỗi thì thôi, việc lưu vẫn có chốt chặn ở server
    }
  };

  const handleCancelBooking = async (id) => {
    if (!window.confirm('Bạn có chắc muốn hủy đặt sân này?')) return;
    try {
      await bookingService.cancelBooking(id);
      await fetchBookings();
    } catch (err) {
      showNotice(serverMessage(err, 'Lỗi hủy đặt sân'));
    }
  };

  const handleConfirmBooking = async (id) => {
    try {
      await bookingService.confirmBooking(id);
      await fetchBookings();
    } catch (err) {
      showNotice(serverMessage(err, 'Lỗi xác nhận đặt sân'));
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

      {realtimeStatus === 'reconnecting' && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs font-semibold text-amber-800 dark:text-amber-200">
          Đang kết nối lại để cập nhật tự động… danh sách có thể chưa mới nhất.
        </p>
      )}
      <InlineNotice message={notice} tone={noticeTone} onClose={() => setNotice(null)} />

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
              required={!editingBooking}
              disabled={Boolean(editingBooking)}
              value={formData.customerName}
              onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-white px-4 py-3 text-sm focus:border-emerald-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              placeholder="Nguyễn Văn A"
            />
            {editingBooking && (
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                Đổi lịch chỉ đổi được sân, ngày và giờ. Muốn đổi khách, hãy huỷ lịch này rồi tạo lịch mới.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">Số điện thoại *</label>
              <input
                type="text"
                required={!editingBooking}
                disabled={Boolean(editingBooking)}
                value={formData.customerPhone}
                onChange={(e) => {
                  setPhoneMatch(null);
                  setFormData({ ...formData, customerPhone: e.target.value });
                }}
                onBlur={lookupPhone}
                className="w-full rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-white px-4 py-3 text-sm focus:border-emerald-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
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

          {phoneMatch && !editingBooking && (
            <p
              data-testid="phone-match"
              className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
                formData.customerName.trim() && !sameName(formData.customerName, phoneMatch.fullName)
                  ? 'border-amber-600/40 bg-amber-500/10 text-amber-900 dark:border-amber-400/40 dark:text-amber-200'
                  : 'border-emerald-600/40 bg-emerald-500/10 text-emerald-800 dark:border-emerald-400/40 dark:text-emerald-300'
              }`}
            >
              Khớp khách <strong>{phoneMatch.fullName}</strong> ({phoneMatch.phone}).
              {formData.customerName.trim() && !sameName(formData.customerName, phoneMatch.fullName)
                ? ' Tên bạn gõ khác tên đã lưu — lịch sẽ gắn vào hồ sơ này. Kiểm lại SĐT?'
                : ' Lịch sẽ gắn vào hồ sơ này.'}
            </p>
          )}

          <InlineNotice message={modalError} onClose={() => setModalError(null)} />

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
