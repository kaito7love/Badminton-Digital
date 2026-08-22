import React, { useState, useEffect, useCallback } from 'react';
import { activityLogService } from '../../services/apiServices';
import { formatDateTime } from '../../utils/datetime';
import { useBranch } from '../../contexts/BranchContext';

// ─── Empty State ───────────────────────────────────────────────────────────────
function EmptyState({ message }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-slate-400 dark:text-slate-500">
      <div className="text-6xl opacity-30">📋</div>
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

// ─── Detail Modal (oldValues/newValues) ────────────────────────────────────────
function LogDetailModal({ log, onClose }) {
  if (!log) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white">{log.action}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {log.targetType ? `${log.targetType}${log.targetId ? ` #${log.targetId}` : ''}` : '—'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            Đóng
          </button>
        </div>
        {log.oldValues && (
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Giá trị cũ</p>
            <pre className="rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 p-3 text-xs text-slate-700 dark:text-slate-300 overflow-x-auto whitespace-pre-wrap break-all">
              {JSON.stringify(log.oldValues, null, 2)}
            </pre>
          </div>
        )}
        {log.newValues && (
          <div>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Giá trị mới</p>
            <pre className="rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 p-3 text-xs text-slate-700 dark:text-slate-300 overflow-x-auto whitespace-pre-wrap break-all">
              {JSON.stringify(log.newValues, null, 2)}
            </pre>
          </div>
        )}
        {!log.oldValues && !log.newValues && (
          <p className="text-sm text-slate-400 dark:text-slate-600 italic">Không có dữ liệu chi tiết cho hành động này.</p>
        )}
      </div>
    </div>
  );
}

export default function ActivityLogPage() {
  const { activeTimezone } = useBranch();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({ from: '', to: '', action: '', targetType: '', page: 1 });
  const [meta, setMeta] = useState(null);
  const [detailLog, setDetailLog] = useState(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = { page: filters.page, limit: 20 };
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;
      if (filters.action) params.action = filters.action;
      if (filters.targetType) params.targetType = filters.targetType;
      const res = await activityLogService.list(params);
      setLogs(res.data?.data ?? []);
      setMeta(res.data?.meta ?? null);
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể tải nhật ký hoạt động. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, [filters.from, filters.to, filters.action, filters.targetType, filters.page]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const handleFilter = (e) => {
    const { name, value } = e.target;
    setFilters((f) => ({ ...f, [name]: value, page: 1 }));
  };

  const hasActiveFilters = filters.from || filters.to || filters.action || filters.targetType;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/30 to-purple-500/20 border border-violet-500/30 text-xl">
          📋
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Nhật Ký Hoạt Động</h1>
          <p className="text-sm text-slate-500 dark:text-slate-500 font-medium">Ai đã làm gì, lúc nào, trong chi nhánh đang xem</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white dark:border-slate-800/80 dark:bg-slate-900/60 px-4 py-2.5">
          <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Từ ngày</span>
          <input
            type="date"
            name="from"
            value={filters.from}
            onChange={handleFilter}
            className="bg-transparent text-sm text-slate-900 dark:text-slate-200 outline-none [color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white dark:border-slate-800/80 dark:bg-slate-900/60 px-4 py-2.5">
          <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Đến ngày</span>
          <input
            type="date"
            name="to"
            value={filters.to}
            onChange={handleFilter}
            className="bg-transparent text-sm text-slate-900 dark:text-slate-200 outline-none [color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white dark:border-slate-800/80 dark:bg-slate-900/60 px-4 py-2.5">
          <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Hành động</span>
          <input
            type="text"
            name="action"
            value={filters.action}
            onChange={handleFilter}
            placeholder="VD: invoice.voided"
            className="bg-transparent text-sm text-slate-900 dark:text-slate-200 outline-none placeholder:text-slate-400 dark:placeholder:text-slate-600 w-36"
          />
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white dark:border-slate-800/80 dark:bg-slate-900/60 px-4 py-2.5">
          <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Đối tượng</span>
          <input
            type="text"
            name="targetType"
            value={filters.targetType}
            onChange={handleFilter}
            placeholder="VD: invoice"
            className="bg-transparent text-sm text-slate-900 dark:text-slate-200 outline-none placeholder:text-slate-400 dark:placeholder:text-slate-600 w-28"
          />
        </div>
        {hasActiveFilters && (
          <button
            onClick={() => setFilters({ from: '', to: '', action: '', targetType: '', page: 1 })}
            className="rounded-2xl border border-slate-300 bg-slate-100 text-slate-600 hover:text-slate-900 dark:border-slate-700/60 dark:bg-slate-800/60 dark:text-slate-400 dark:hover:text-white px-4 py-2.5 text-xs font-bold transition"
          >
            ✕ Xoá lọc
          </button>
        )}
        <div className="ml-auto text-xs text-slate-500 font-semibold">
          {meta ? `${meta.total || 0} hoạt động` : ''}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800/70 dark:bg-slate-900/50 backdrop-blur-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-800/80 dark:bg-slate-950/60">
                {['Thời gian', 'Người thao tác', 'Hành động', 'Đối tượng', ''].map((h) => (
                  <th key={h} className="px-4 py-3.5 text-left text-[11px] font-black uppercase tracking-wider text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} cols={5} />)
                : error
                  ? <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-rose-600 dark:text-rose-400 font-semibold">{error}</td></tr>
                  : logs.length === 0
                    ? <tr><td colSpan={5}><EmptyState message="Chưa có hoạt động nào được ghi nhận" /></td></tr>
                    : logs.map((log) => (
                      <tr key={log.id} className="border-t border-slate-100 dark:border-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300 font-mono text-xs">{formatDateTime(log.createdAt, activeTimezone)}</td>
                        <td className="px-4 py-3.5">
                          <p className="font-semibold text-slate-900 dark:text-white">{log.user?.fullName || 'Hệ thống'}</p>
                          {log.employee?.position && <p className="text-xs text-slate-400 dark:text-slate-500">{log.employee.position}</p>}
                        </td>
                        <td className="px-4 py-3.5 font-mono text-xs text-violet-700 dark:text-violet-300">{log.action}</td>
                        <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300 text-xs">
                          {log.targetType ? `${log.targetType}${log.targetId ? ` #${log.targetId}` : ''}` : '—'}
                        </td>
                        <td className="px-4 py-3.5">
                          <button
                            onClick={() => setDetailLog(log)}
                            className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                          >
                            Xem chi tiết
                          </button>
                        </td>
                      </tr>
                    ))
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
            onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
            className="rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 px-4 py-2 text-xs font-bold disabled:opacity-30 transition"
          >← Trước</button>
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Trang {filters.page} / {meta.totalPages}</span>
          <button
            disabled={filters.page >= meta.totalPages}
            onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
            className="rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 px-4 py-2 text-xs font-bold disabled:opacity-30 transition"
          >Sau →</button>
        </div>
      )}

      <LogDetailModal log={detailLog} onClose={() => setDetailLog(null)} />
    </div>
  );
}
