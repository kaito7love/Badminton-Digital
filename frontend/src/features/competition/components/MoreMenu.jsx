import React from 'react';

// Nút "Thêm ▾": danh sách thao tác phụ (mục huỷ / huỷ chốt tô đỏ). `items` = [[khoá, nhãn]], `onPick(khoá)`.
export default function MoreMenu({ items, onPick }) {
  if (!items.length) return null;
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">Thêm ▾</summary>
      <div className="absolute right-0 z-20 mt-1 w-64 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
        {items.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`block w-full px-4 py-2.5 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800 ${['cancel', 'unfin'].includes(key) ? 'font-bold text-rose-600' : 'text-slate-700 dark:text-slate-200'}`}
            onClick={(e) => { e.currentTarget.closest('details').open = false; onPick(key); }}
          >
            {label}
          </button>
        ))}
      </div>
    </details>
  );
}
