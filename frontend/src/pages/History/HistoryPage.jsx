import React, { useState, useEffect, useCallback } from 'react';
import { historyService, salesOrderService, invoiceService } from '../../services/apiServices';
import { formatDateTime, formatPlainDate } from '../../utils/datetime';
import { useBranch } from '../../contexts/BranchContext';
import { useAuth } from '../../contexts/AuthContext';
import { roleOf } from '../../utils/roles';

// ─── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    closed:    { label: 'Đã đóng',    cls: 'bg-slate-200 text-slate-700 border-slate-300 dark:bg-slate-700/60 dark:text-slate-300 dark:border-slate-600/50' },
    playing:   { label: 'Đang chơi', cls: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' },
    completed: { label: 'Hoàn thành', cls: 'bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30' },
    confirmed: { label: 'Đã xác nhận', cls: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' },
    pending:   { label: 'Chờ xác nhận', cls: 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30' },
    cancelled: { label: 'Đã huỷ',     cls: 'bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/30' },
    paid:      { label: 'Đã thanh toán', cls: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30' },
    pending_payment: { label: 'Chờ thanh toán', cls: 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30' },
    refunded:  { label: 'Đã huỷ', cls: 'bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/30' },
  };
  const s = map[status] || { label: status, cls: 'bg-slate-200 text-slate-500 border-slate-300 dark:bg-slate-700/60 dark:text-slate-400 dark:border-slate-600/50' };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${s.cls}`}>
      {s.label}
    </span>
  );
}

// ─── Format helpers ────────────────────────────────────────────────────────────
// Mốc tuyệt đối (startTime/endTime/createdAt) hiển thị theo giờ chi nhánh;
// còn bookingDate là cột DATE — giờ treo tường, dùng formatPlainDate để không
// bị đổi múi giờ làm nhảy ngày.
const fmtMoney = (n) => {
  if (n == null) return '—';
  return Number(n).toLocaleString('vi-VN') + '₫';
};
const fmtDuration = (secs) => {
  if (!secs) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}g ${m}p` : `${m} phút`;
};

// ─── Empty State ───────────────────────────────────────────────────────────────
function EmptyState({ message }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-slate-400 dark:text-slate-500">
      <div className="text-6xl opacity-30">🕐</div>
      <p className="text-sm font-semibold">{message}</p>
    </div>
  );
}

// ─── Loading Skeleton ──────────────────────────────────────────────────────────
function SkeletonRow({ cols }) {
  return (
    <tr className="border-t border-slate-200 dark:border-slate-800/60">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3.5">
          <div className="h-4 rounded-lg bg-slate-200 dark:bg-slate-800 animate-pulse" style={{ width: `${60 + (i * 17) % 40}%` }} />
        </td>
      ))}
    </tr>
  );
}

// ─── Void Invoice (chỉ admin/branch_manager, chỉ hoá đơn đã thanh toán) ────────
function VoidInvoiceButton({ invoiceId, invoiceNo, onVoided }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleConfirm = async () => {
    if (!reason.trim()) {
      setError('Vui lòng nhập lý do huỷ hoá đơn');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await invoiceService.voidInvoice(invoiceId, { reason: reason.trim() });
      setOpen(false);
      setReason('');
      onVoided?.();
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể huỷ hoá đơn. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="whitespace-nowrap rounded-lg border border-rose-300 bg-rose-50 text-rose-600 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20 px-2.5 py-1 text-[11px] font-bold transition"
      >
        Huỷ hoá đơn
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-6 space-y-4">
            <div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white">Huỷ hoá đơn {invoiceNo}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Hành động này sẽ chuyển hoá đơn sang trạng thái huỷ, hoàn tồn kho (nếu là đơn bán lẻ)
                và trừ lại điểm chi tiêu/hạng hội viên của khách (nếu có). Không thể hoàn tác.
              </p>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Lý do huỷ *</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="mt-1.5 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-violet-400"
                placeholder="VD: Nhân viên checkout nhầm, khách yêu cầu huỷ..."
              />
            </div>
            {error && <p className="text-sm text-rose-600 dark:text-rose-400 font-semibold">{error}</p>}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setOpen(false); setReason(''); setError(null); }}
                disabled={submitting}
                className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition disabled:opacity-50"
              >
                Đóng
              </button>
              <button
                onClick={handleConfirm}
                disabled={submitting}
                className="rounded-xl bg-rose-600 hover:bg-rose-700 px-4 py-2 text-sm font-bold text-white transition disabled:opacity-50"
              >
                {submitting ? 'Đang huỷ...' : 'Xác nhận huỷ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Sessions Tab ──────────────────────────────────────────────────────────────
function SessionsTab() {
  // Hiển thị theo giờ chi nhánh đang xem, không theo giờ máy người xem.
  const { activeTimezone } = useBranch();
  const { user } = useAuth();
  const canVoid = ['admin', 'branch_manager'].includes(roleOf(user));
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ date: '', courtName: '', page: 1 });
  const [meta, setMeta] = useState(null);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { page: filters.page, limit: 20 };
      if (filters.date)      params.date      = filters.date;
      if (filters.courtName) params.courtName = filters.courtName;
      const res = await historyService.getSessions(params);
      setSessions(res.data?.data ?? []);
      setMeta(res.data?.meta ?? null);
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải dữ liệu phiên chơi. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, [filters.date, filters.courtName, filters.page]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const handleFilter = (e) => {
    const { name, value } = e.target;
    setFilters(f => ({ ...f, [name]: value, page: 1 }));
  };

  return (
    <div className="space-y-5">
      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white dark:border-slate-800/80 dark:bg-slate-900/60 px-4 py-2.5">
          <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Ngày</span>
          <input
            type="date"
            name="date"
            value={filters.date}
            onChange={handleFilter}
            className="bg-transparent text-sm text-slate-900 dark:text-slate-200 outline-none [color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white dark:border-slate-800/80 dark:bg-slate-900/60 px-4 py-2.5">
          <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Sân</span>
          <input
            type="text"
            name="courtName"
            value={filters.courtName}
            onChange={handleFilter}
            placeholder="Tất cả"
            className="bg-transparent text-sm text-slate-900 dark:text-slate-200 outline-none placeholder:text-slate-400 dark:placeholder:text-slate-600 w-28"
          />
        </div>
        {(filters.date || filters.courtName) && (
          <button
            onClick={() => setFilters({ date: '', courtName: '', page: 1 })}
            className="rounded-2xl border border-slate-300 bg-slate-100 text-slate-600 hover:text-slate-900 dark:border-slate-700/60 dark:bg-slate-800/60 dark:text-slate-400 dark:hover:text-white px-4 py-2.5 text-xs font-bold transition"
          >
            ✕ Xoá lọc
          </button>
        )}
        <div className="ml-auto text-xs text-slate-500 font-semibold">
          {meta ? `${meta.total || 0} phiên chơi` : ''}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800/70 dark:bg-slate-900/50 backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800/80 dark:bg-slate-950/60">
                {['Thời gian bắt đầu', 'Thời gian đóng', 'Sân', 'Khách hàng', 'Thời lượng', 'Tiền sân', 'Phụ kiện', 'Tổng cộng', 'Trạng thái', ...(canVoid ? ['Thao tác'] : [])].map(h => (
                  <th key={h} className="px-4 py-3.5 text-left text-[11px] font-black uppercase tracking-wider text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={canVoid ? 10 : 9} />)
                : error
                  ? (
                    <tr><td colSpan={canVoid ? 10 : 9} className="px-4 py-8 text-center text-sm text-rose-600 dark:text-rose-400 font-semibold">{error}</td></tr>
                  )
                  : sessions.length === 0
                    ? <tr><td colSpan={canVoid ? 10 : 9}><EmptyState message="Chưa có phiên chơi nào được ghi nhận" /></td></tr>
                    : sessions.map(s => {
                      const invoice = s.invoice;
                      const payment = invoice?.payment;
                      const payStatus = payment?.status === 'paid' ? 'paid' : payment?.status === 'refunded' ? 'refunded' : invoice ? 'pending_payment' : null;
                      return (
                        <tr key={s.id} className="border-t border-slate-100 dark:border-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                          <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300 font-mono text-xs">{formatDateTime(s.startTime, activeTimezone)}</td>
                          <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300 font-mono text-xs">{formatDateTime(s.endTime, activeTimezone)}</td>
                          <td className="px-4 py-3.5 font-bold text-emerald-600 dark:text-emerald-400">{s.court?.name || '—'}</td>
                          <td className="px-4 py-3.5">
                            {s.customer
                              ? <div><p className="font-semibold text-slate-900 dark:text-white">{s.customer.fullName}</p>{s.customer.phone && <p className="text-xs text-slate-400 dark:text-slate-500">{s.customer.phone}</p>}</div>
                              : <span className="text-slate-400 dark:text-slate-600 italic text-xs">Khách vãng lai</span>}
                          </td>
                          <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300 font-semibold">{fmtDuration(s.durationSeconds)}</td>
                          <td className="px-4 py-3.5 text-slate-700 dark:text-slate-200 font-semibold">{fmtMoney(s.courtFee)}</td>
                          <td className="px-4 py-3.5 text-slate-700 dark:text-slate-200">{fmtMoney(invoice?.extrasFee)}</td>
                          <td className="px-4 py-3.5 font-black text-slate-900 dark:text-white">{fmtMoney(invoice?.totalAmount)}</td>
                          <td className="px-4 py-3.5">{payStatus ? <StatusBadge status={payStatus} /> : <span className="text-slate-400 dark:text-slate-600 text-xs">—</span>}</td>
                          {canVoid && (
                            <td className="px-4 py-3.5">
                              {payment?.status === 'paid' && (
                                <VoidInvoiceButton invoiceId={invoice.id} invoiceNo={invoice.invoiceNo} onVoided={fetchSessions} />
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            disabled={filters.page <= 1}
            onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}
            className="rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 px-4 py-2 text-xs font-bold disabled:opacity-30 transition"
          >← Trước</button>
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Trang {filters.page} / {meta.totalPages}</span>
          <button
            disabled={filters.page >= meta.totalPages}
            onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}
            className="rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 px-4 py-2 text-xs font-bold disabled:opacity-30 transition"
          >Sau →</button>
        </div>
      )}
    </div>
  );
}

// ─── Bookings Tab ──────────────────────────────────────────────────────────────
function BookingsTab() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ date: '', status: '', page: 1 });
  const [meta, setMeta] = useState(null);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { page: filters.page, limit: 20 };
      // Chỉ lấy completed + cancelled
      if (filters.status) {
        params.status = filters.status;
      } else {
        // Gọi 2 lần và gộp (hoặc backend hỗ trợ status=completed,cancelled)
        params.status = filters.status || 'completed';
      }
      if (filters.date) params.date = filters.date;
      const [resCompleted, resCancelled] = await Promise.all([
        historyService.getBookings({ ...params, status: 'completed' }),
        filters.status && filters.status !== 'cancelled'
          ? Promise.resolve(null)
          : historyService.getBookings({ ...params, status: 'cancelled' }),
      ]);
      const completed = resCompleted.data?.data?.rows || resCompleted.data?.data || [];
      const cancelled = resCancelled?.data?.data?.rows || resCancelled?.data?.data || [];
      const all = filters.status === 'completed'
        ? completed
        : filters.status === 'cancelled'
          ? cancelled
          : [...completed, ...cancelled].sort((a, b) => new Date(b.bookingDate) - new Date(a.bookingDate));
      setBookings(Array.isArray(all) ? all : []);
      setMeta(null);
    } catch (err) {
      setError('Không thể tải dữ liệu đặt sân. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, [filters.date, filters.status, filters.page]);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  const handleFilter = (e) => {
    const { name, value } = e.target;
    setFilters(f => ({ ...f, [name]: value, page: 1 }));
  };

  const statusOptions = [
    { value: '', label: 'Tất cả' },
    { value: 'completed', label: 'Hoàn thành' },
    { value: 'cancelled', label: 'Đã huỷ' },
  ];

  return (
    <div className="space-y-5">
      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white dark:border-slate-800/80 dark:bg-slate-900/60 px-4 py-2.5">
          <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Ngày</span>
          <input
            type="date"
            name="date"
            value={filters.date}
            onChange={handleFilter}
            className="bg-transparent text-sm text-slate-900 dark:text-slate-200 outline-none [color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white dark:border-slate-800/80 dark:bg-slate-900/60 px-4 py-2.5">
          <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Trạng thái</span>
          <select
            name="status"
            value={filters.status}
            onChange={handleFilter}
            className="bg-transparent text-sm text-slate-900 dark:text-slate-200 outline-none cursor-pointer"
          >
            {statusOptions.map(o => <option key={o.value} value={o.value} className="bg-white dark:bg-slate-900">{o.label}</option>)}
          </select>
        </div>
        {(filters.date || filters.status) && (
          <button
            onClick={() => setFilters({ date: '', status: '', page: 1 })}
            className="rounded-2xl border border-slate-300 bg-slate-100 text-slate-600 hover:text-slate-900 dark:border-slate-700/60 dark:bg-slate-800/60 dark:text-slate-400 dark:hover:text-white px-4 py-2.5 text-xs font-bold transition"
          >
            ✕ Xoá lọc
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800/70 dark:bg-slate-900/50 backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800/80 dark:bg-slate-950/60">
                {['Ngày đặt', 'Sân', 'Khách hàng', 'Giờ bắt đầu', 'Giờ kết thúc', 'Trạng thái', 'Người tạo'].map(h => (
                  <th key={h} className="px-4 py-3.5 text-left text-[11px] font-black uppercase tracking-wider text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={7} />)
                : error
                  ? <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-rose-600 dark:text-rose-400 font-semibold">{error}</td></tr>
                  : bookings.length === 0
                    ? <tr><td colSpan={7}><EmptyState message="Chưa có lịch sử đặt sân" /></td></tr>
                    : bookings.map(b => (
                      <tr key={b.id} className="border-t border-slate-100 dark:border-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3.5 font-mono text-xs text-slate-600 dark:text-slate-300">{formatPlainDate(b.bookingDate)}</td>
                        <td className="px-4 py-3.5 font-bold text-emerald-600 dark:text-emerald-400">{b.court?.name || '—'}</td>
                        <td className="px-4 py-3.5">
                          {b.customer
                            ? <div><p className="font-semibold text-slate-900 dark:text-white">{b.customer.fullName}</p><p className="text-xs text-slate-400 dark:text-slate-500">{b.customer.phone}</p></div>
                            : <span className="text-slate-400 dark:text-slate-600 italic text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-xs text-slate-600 dark:text-slate-300">{b.startTime || '—'}</td>
                        <td className="px-4 py-3.5 font-mono text-xs text-slate-600 dark:text-slate-300">{b.endTime || '—'}</td>
                        <td className="px-4 py-3.5"><StatusBadge status={b.status} /></td>
                        <td className="px-4 py-3.5 text-slate-500 dark:text-slate-400 text-xs">{b.creator?.fullName || '—'}</td>
                      </tr>
                    ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Sales Orders Tab (Bán lẻ) ────────────────────────────────────────────────
function SalesOrdersTab() {
  // Hiển thị theo giờ chi nhánh đang xem, không theo giờ máy người xem.
  const { activeTimezone } = useBranch();
  const { user } = useAuth();
  const canVoid = ['admin', 'branch_manager'].includes(roleOf(user));
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ date: '', status: '', page: 1 });
  const [meta, setMeta] = useState(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { page: filters.page, limit: 20 };
      if (filters.date) { params.from = filters.date; params.to = filters.date; }
      if (filters.status) params.status = filters.status;
      const res = await salesOrderService.getAll(params);
      setOrders(res.data?.data ?? []);
      setMeta(res.data?.meta ?? null);
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải dữ liệu đơn bán lẻ. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, [filters.date, filters.status, filters.page]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const handleFilter = (e) => {
    const { name, value } = e.target;
    setFilters(f => ({ ...f, [name]: value, page: 1 }));
  };

  const statusOptions = [
    { value: '', label: 'Tất cả' },
    { value: 'open', label: 'Đang mở' },
    { value: 'paid', label: 'Đã thanh toán' },
    { value: 'cancelled', label: 'Đã huỷ' },
  ];

  return (
    <div className="space-y-5">
      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white dark:border-slate-800/80 dark:bg-slate-900/60 px-4 py-2.5">
          <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Ngày</span>
          <input
            type="date"
            name="date"
            value={filters.date}
            onChange={handleFilter}
            className="bg-transparent text-sm text-slate-900 dark:text-slate-200 outline-none [color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white dark:border-slate-800/80 dark:bg-slate-900/60 px-4 py-2.5">
          <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Trạng thái</span>
          <select
            name="status"
            value={filters.status}
            onChange={handleFilter}
            className="bg-transparent text-sm text-slate-900 dark:text-slate-200 outline-none cursor-pointer"
          >
            {statusOptions.map(o => <option key={o.value} value={o.value} className="bg-white dark:bg-slate-900">{o.label}</option>)}
          </select>
        </div>
        {(filters.date || filters.status) && (
          <button
            onClick={() => setFilters({ date: '', status: '', page: 1 })}
            className="rounded-2xl border border-slate-300 bg-slate-100 text-slate-600 hover:text-slate-900 dark:border-slate-700/60 dark:bg-slate-800/60 dark:text-slate-400 dark:hover:text-white px-4 py-2.5 text-xs font-bold transition"
          >
            ✕ Xoá lọc
          </button>
        )}
        <div className="ml-auto text-xs text-slate-500 font-semibold">
          {meta ? `${meta.total || 0} đơn hàng` : ''}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800/70 dark:bg-slate-900/50 backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800/80 dark:bg-slate-950/60">
                {['Hoá đơn', 'Thời gian', 'Khách hàng', 'Nhân viên bán', 'Sản phẩm', 'Tổng tiền', 'Trạng thái', ...(canVoid ? ['Thao tác'] : [])].map(h => (
                  <th key={h} className="px-4 py-3.5 text-left text-[11px] font-black uppercase tracking-wider text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={canVoid ? 8 : 7} />)
                : error
                  ? <tr><td colSpan={canVoid ? 8 : 7} className="px-4 py-8 text-center text-sm text-rose-600 dark:text-rose-400 font-semibold">{error}</td></tr>
                  : orders.length === 0
                    ? <tr><td colSpan={canVoid ? 8 : 7}><EmptyState message="Chưa có đơn bán lẻ nào được ghi nhận" /></td></tr>
                    : orders.map(o => {
                      const payment = o.invoice?.payment;
                      const payStatus = payment?.status === 'paid' ? 'paid' : payment?.status === 'refunded' ? 'refunded' : o.invoice ? 'pending_payment' : o.status === 'cancelled' ? 'cancelled' : null;
                      const productSummary = (o.lines || []).map(l => `${l.variant?.product?.name || l.variant?.sku} ×${l.quantity}`).join(', ');
                      return (
                        <tr key={o.id} className="border-t border-slate-100 dark:border-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                          <td className="px-4 py-3.5 font-bold text-emerald-600 dark:text-emerald-400">{o.invoice?.invoiceNo || `#${o.id}`}</td>
                          <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300 font-mono text-xs">{formatDateTime(o.createdAt, activeTimezone)}</td>
                          <td className="px-4 py-3.5">
                            {o.customer
                              ? <div><p className="font-semibold text-slate-900 dark:text-white">{o.customer.fullName}</p>{o.customer.phone && <p className="text-xs text-slate-400 dark:text-slate-500">{o.customer.phone}</p>}</div>
                              : <span className="text-slate-400 dark:text-slate-600 italic text-xs">Khách lẻ</span>}
                          </td>
                          <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">{o.cashier?.user?.fullName || '—'}</td>
                          <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300 text-xs max-w-[220px] truncate" title={productSummary}>{productSummary || '—'}</td>
                          <td className="px-4 py-3.5 font-black text-slate-900 dark:text-white">{fmtMoney(o.invoice?.totalAmount)}</td>
                          <td className="px-4 py-3.5">{payStatus ? <StatusBadge status={payStatus} /> : <span className="text-slate-400 dark:text-slate-600 text-xs">Đang mở</span>}</td>
                          {canVoid && (
                            <td className="px-4 py-3.5">
                              {payment?.status === 'paid' && (
                                <VoidInvoiceButton invoiceId={o.invoice.id} invoiceNo={o.invoice.invoiceNo} onVoided={fetchOrders} />
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            disabled={filters.page <= 1}
            onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}
            className="rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 px-4 py-2 text-xs font-bold disabled:opacity-30 transition"
          >← Trước</button>
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Trang {filters.page} / {meta.totalPages}</span>
          <button
            disabled={filters.page >= meta.totalPages}
            onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}
            className="rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 px-4 py-2 text-xs font-bold disabled:opacity-30 transition"
          >Sau →</button>
        </div>
      )}
    </div>
  );
}

// ─── Main HistoryPage ──────────────────────────────────────────────────────────
const TABS = [
  { key: 'sessions', label: '🏸 Phiên Chơi', desc: 'Các phiên sân đã kết thúc' },
  { key: 'bookings', label: '📅 Đặt Sân',    desc: 'Lịch sử đặt lịch' },
  { key: 'salesOrders', label: '🛍️ Bán Lẻ', desc: 'Đơn bán lẻ dụng cụ tại quầy' },
];

export default function HistoryPage() {
  const [activeTab, setActiveTab] = useState('sessions');

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/30 to-purple-500/20 border border-violet-500/30 text-xl">
            🕐
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Lịch Sử Hoạt Động</h1>
            <p className="text-sm text-slate-500 dark:text-slate-500 font-medium">Tra cứu phiên chơi và đặt sân trong quá khứ</p>
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex items-center gap-1 rounded-2xl border border-slate-200 bg-white dark:border-slate-800/70 dark:bg-slate-900/50 p-1 w-fit">
        {TABS.map(tab => (
          <button
            key={tab.key}
            id={`history-tab-${tab.key}`}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-all ${
              activeTab === tab.key
                ? 'bg-gradient-to-r from-violet-500/20 to-purple-500/10 text-violet-700 dark:text-violet-300 border border-violet-500/30 shadow-lg shadow-violet-900/20'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800/60'
            }`}
          >
            <span>{tab.label}</span>
            {activeTab === tab.key && (
              <span className="text-[10px] font-normal text-violet-600/80 dark:text-violet-400/80 hidden sm:inline">{tab.desc}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="animate-fade-in">
        {activeTab === 'sessions' && <SessionsTab />}
        {activeTab === 'bookings' && <BookingsTab />}
        {activeTab === 'salesOrders' && <SalesOrdersTab />}
      </div>
    </div>
  );
}
