import React from 'react';

export function Modal({ isOpen, onClose, title, children }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
          <h3 className="text-xl font-semibold text-slate-100">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition"
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
    emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    amber: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    rose: 'bg-rose-500/10 text-rose-300 border-rose-500/20',
    sky: 'bg-sky-500/10 text-sky-300 border-sky-500/20',
    violet: 'bg-violet-500/10 text-violet-300 border-violet-500/20',
    slate: 'bg-slate-700/50 text-slate-300 border-slate-600/30',
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${styles[variant] || styles.slate}`}>
      {children}
    </span>
  );
}

export function StatBox({ label, value, subtext, highlight }) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl shadow-slate-950/20">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-100">{value}</p>
      {subtext && <p className={`mt-2 text-xs ${highlight ? 'text-emerald-400' : 'text-slate-500'}`}>{subtext}</p>}
    </div>
  );
}

export function Table({ headers, children }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/90">
      <table className="w-full text-left text-sm text-slate-300">
        <thead className="border-b border-slate-800 bg-slate-950/50 uppercase tracking-wider text-xs text-slate-400">
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="px-6 py-4 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">{children}</tbody>
      </table>
    </div>
  );
}
