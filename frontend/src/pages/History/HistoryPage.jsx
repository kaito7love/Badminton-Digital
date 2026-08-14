import React, { useState, useEffect, useCallback } from 'react';
import { historyService } from '../../services/apiServices';

// ─── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    closed:    { label: 'Đã đóng',    cls: 'bg-slate-700/60 text-slate-300 border-slate-600/50' },
    playing:   { label: 'Đang chơi', cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
    completed: { label: 'Hoàn thành', cls: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
    confirmed: { label: 'Đã xác nhận', cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
    pending:   { label: 'Chờ xác nhận', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
    cancelled: { label: 'Đã huỷ',     cls: 'bg-rose-500/20 text-rose-300 border-rose-500/30' },
    paid:      { label: 'Đã thanh toán', cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
    pending_payment: { label: 'Chờ thanh toán', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  };
  const s = map[status] || { label: status, cls: 'bg-slate-700/60 text-slate-400 border-slate-600/50' };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${s.cls}`}>
      {s.label}
    </span>
  );
}

// ─── Format helpers ────────────────────────────────────────────────────────────
const fmtDateTime = (dt) => {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const fmtDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
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
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-slate-500">
      <div className="text-6xl opacity-30">🕐</div>
      <p className="text-sm font-semibold">{message}</p>
    </div>
  );
}

// ─── Loading Skeleton ──────────────────────────────────────────────────────────
function SkeletonRow({ cols }) {
  return (
    <tr className="border-t border-slate-800/60">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3.5">
          <div className="h-4 rounded-lg bg-slate-800 animate-pulse" style={{ width: `${60 + (i * 17) % 40}%` }} />
        </td>
      ))}
    </tr>
  );
}

// ─── Sessions Tab ──────────────────────────────────────────────────────────────
function SessionsTab() {
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
        <div className="flex items-center gap-2 rounded-2xl border border-slate-800/80 bg-slate-900/60 px-4 py-2.5">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ngày</span>
          <input
            type="date"
            name="date"
            value={filters.date}
            onChange={handleFilter}
            className="bg-transparent text-sm text-slate-200 outline-none [color-scheme:dark]"
          />
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-slate-800/80 bg-slate-900/60 px-4 py-2.5">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Sân</span>
          <input
            type="text"
            name="courtName"
            value={filters.courtName}
            onChange={handleFilter}
            placeholder="Tất cả"
            className="bg-transparent text-sm text-slate-200 outline-none placeholder:text-slate-600 w-28"
          />
        </div>
        {(filters.date || filters.courtName) && (
          <button
            onClick={() => setFilters({ date: '', courtName: '', page: 1 })}
            className="rounded-2xl border border-slate-700/60 bg-slate-800/60 px-4 py-2.5 text-xs font-bold text-slate-400 hover:text-white transition"
          >
            ✕ Xoá lọc
          </button>
        )}
        <div className="ml-auto text-xs text-slate-500 font-semibold">
          {meta ? `${meta.total || 0} phiên chơi` : ''}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-900/50 backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="border-b border-slate-800/80 bg-slate-950/60">
                {['Thời gian bắt đầu', 'Thời gian đóng', 'Sân', 'Khách hàng', 'Thời lượng', 'Tiền sân', 'Phụ kiện', 'Tổng cộng', 'Trạng thái'].map(h => (
                  <th key={h} className="px-4 py-3.5 text-left text-[11px] font-black uppercase tracking-wider text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={9} />)
                : error
                  ? (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-rose-400 font-semibold">{error}</td></tr>
                  )
                  : sessions.length === 0
                    ? <tr><td colSpan={9}><EmptyState message="Chưa có phiên chơi nào được ghi nhận" /></td></tr>
                    : sessions.map(s => {
                      const invoice = s.invoice;
                      const payment = invoice?.payment;
                      const payStatus = payment?.status === 'paid' ? 'paid' : invoice ? 'pending_payment' : null;
                      return (
                        <tr key={s.id} className="border-t border-slate-800/40 hover:bg-slate-800/30 transition-colors group">
                          <td className="px-4 py-3.5 text-slate-300 font-mono text-xs">{fmtDateTime(s.startTime)}</td>
                          <td className="px-4 py-3.5 text-slate-300 font-mono text-xs">{fmtDateTime(s.endTime)}</td>
                          <td className="px-4 py-3.5 font-bold text-emerald-400">{s.court?.name || '—'}</td>
                          <td className="px-4 py-3.5">
                            {s.customer
                              ? <div><p className="font-semibold text-white">{s.customer.fullName}</p>{s.customer.phone && <p className="text-xs text-slate-500">{s.customer.phone}</p>}</div>
                              : <span className="text-slate-600 italic text-xs">Khách vãng lai</span>}
                          </td>
                          <td className="px-4 py-3.5 text-slate-300 font-semibold">{fmtDuration(s.durationSeconds)}</td>
                          <td className="px-4 py-3.5 text-slate-200 font-semibold">{fmtMoney(s.courtFee)}</td>
                          <td className="px-4 py-3.5 text-slate-200">{fmtMoney(invoice?.extrasFee)}</td>
                          <td className="px-4 py-3.5 font-black text-white">{fmtMoney(invoice?.totalAmount)}</td>
                          <td className="px-4 py-3.5">{payStatus ? <StatusBadge status={payStatus} /> : <span className="text-slate-600 text-xs">—</span>}</td>
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
            className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-30 transition"
          >← Trước</button>
          <span className="text-xs font-semibold text-slate-400">Trang {filters.page} / {meta.totalPages}</span>
          <button
            disabled={filters.page >= meta.totalPages}
            onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}
            className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-30 transition"
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
        <div className="flex items-center gap-2 rounded-2xl border border-slate-800/80 bg-slate-900/60 px-4 py-2.5">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ngày</span>
          <input
            type="date"
            name="date"
            value={filters.date}
            onChange={handleFilter}
            className="bg-transparent text-sm text-slate-200 outline-none [color-scheme:dark]"
          />
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-slate-800/80 bg-slate-900/60 px-4 py-2.5">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Trạng thái</span>
          <select
            name="status"
            value={filters.status}
            onChange={handleFilter}
            className="bg-transparent text-sm text-slate-200 outline-none cursor-pointer"
          >
            {statusOptions.map(o => <option key={o.value} value={o.value} className="bg-slate-900">{o.label}</option>)}
          </select>
        </div>
        {(filters.date || filters.status) && (
          <button
            onClick={() => setFilters({ date: '', status: '', page: 1 })}
            className="rounded-2xl border border-slate-700/60 bg-slate-800/60 px-4 py-2.5 text-xs font-bold text-slate-400 hover:text-white transition"
          >
            ✕ Xoá lọc
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-900/50 backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-slate-800/80 bg-slate-950/60">
                {['Ngày đặt', 'Sân', 'Khách hàng', 'Giờ bắt đầu', 'Giờ kết thúc', 'Trạng thái', 'Người tạo'].map(h => (
                  <th key={h} className="px-4 py-3.5 text-left text-[11px] font-black uppercase tracking-wider text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={7} />)
                : error
                  ? <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-rose-400 font-semibold">{error}</td></tr>
                  : bookings.length === 0
                    ? <tr><td colSpan={7}><EmptyState message="Chưa có lịch sử đặt sân" /></td></tr>
                    : bookings.map(b => (
                      <tr key={b.id} className="border-t border-slate-800/40 hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3.5 font-mono text-xs text-slate-300">{fmtDate(b.bookingDate)}</td>
                        <td className="px-4 py-3.5 font-bold text-emerald-400">{b.court?.name || '—'}</td>
                        <td className="px-4 py-3.5">
                          {b.customer
                            ? <div><p className="font-semibold text-white">{b.customer.fullName}</p><p className="text-xs text-slate-500">{b.customer.phone}</p></div>
                            : <span className="text-slate-600 italic text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-xs text-slate-300">{b.startTime || '—'}</td>
                        <td className="px-4 py-3.5 font-mono text-xs text-slate-300">{b.endTime || '—'}</td>
                        <td className="px-4 py-3.5"><StatusBadge status={b.status} /></td>
                        <td className="px-4 py-3.5 text-slate-400 text-xs">{b.creator?.fullName || '—'}</td>
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

// ─── Main HistoryPage ──────────────────────────────────────────────────────────
const TABS = [
  { key: 'sessions', label: '🏸 Phiên Chơi', desc: 'Các phiên sân đã kết thúc' },
  { key: 'bookings', label: '📅 Đặt Sân',    desc: 'Lịch sử đặt lịch' },
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
            <h1 className="text-2xl font-black text-white tracking-tight">Lịch Sử Hoạt Động</h1>
            <p className="text-sm text-slate-500 font-medium">Tra cứu phiên chơi và đặt sân trong quá khứ</p>
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex items-center gap-1 rounded-2xl border border-slate-800/70 bg-slate-900/50 p-1 w-fit">
        {TABS.map(tab => (
          <button
            key={tab.key}
            id={`history-tab-${tab.key}`}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-all ${
              activeTab === tab.key
                ? 'bg-gradient-to-r from-violet-500/20 to-purple-500/10 text-violet-300 border border-violet-500/30 shadow-lg shadow-violet-900/20'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <span>{tab.label}</span>
            {activeTab === tab.key && (
              <span className="text-[10px] font-normal text-violet-400/80 hidden sm:inline">{tab.desc}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="animate-fade-in">
        {activeTab === 'sessions' ? <SessionsTab /> : <BookingsTab />}
      </div>
    </div>
  );
}
