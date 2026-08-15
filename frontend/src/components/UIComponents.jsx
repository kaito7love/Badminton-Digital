import React from 'react';

export function Modal({ isOpen, onClose, title, children }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-200/60 dark:bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-6 shadow-2xl animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4 mb-4">
          <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition"
          >
            ✕
          </button>
        </div>
        <div className="space-y-4">{children}</div>
      </div>
    </div>
  );
}

export function Badge({ children, variant = 'slate' }) {
  const styles = {
    emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20',
    amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20',
    rose: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20',
    sky: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20',
    violet: 'bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20',
    slate: 'bg-slate-200 text-slate-700 border-slate-300 dark:bg-slate-700/50 dark:text-slate-300 dark:border-slate-600/30',
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${styles[variant] || styles.slate}`}>
      {children}
    </span>
  );
}

export function StatBox({ label, value, subtext, highlight }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/90 p-6 shadow-xl shadow-slate-200/40 dark:shadow-slate-950/20">
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-900 dark:text-slate-100">{value}</p>
      {subtext && <p className={`mt-2 text-xs ${highlight ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>{subtext}</p>}
    </div>
  );
}

/**
 * Thanh phân trang dùng chung — chỉ hiện khi thật sự có nhiều hơn 1 trang.
 * `meta` là shape trả về từ `getPagingData` ở backend: { page, limit, total, totalPages }.
 */
export function Pagination({ meta, onPageChange, itemLabel = 'mục' }) {
  if (!meta || meta.totalPages <= 1) return null;
  const { page, totalPages, total } = meta;

  return (
    <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-xs text-slate-500">{total != null ? `${total} ${itemLabel}` : ''}</span>
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 px-4 py-2 text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          ← Trước
        </button>
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 whitespace-nowrap">Trang {page} / {totalPages}</span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 px-4 py-2 text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          Sau →
        </button>
      </div>
    </div>
  );
}

export function Table({ headers, children }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/90">
      <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
        <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/50 uppercase tracking-wider text-xs text-slate-500 dark:text-slate-400">
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="px-6 py-4 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">{children}</tbody>
      </table>
    </div>
  );
}
