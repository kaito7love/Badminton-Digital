import React from 'react';

// Thành phần form dùng chung (Tailwind sáng / tối của màn hình nhân viên).

export const inputClass = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';

export const Field = ({ label, hint, children, className = '' }) => (
  <label className={`block text-xs font-semibold text-slate-600 dark:text-slate-300 ${className}`}>
    {label}
    <div className="mt-1">{children}</div>
    {hint && <small className="mt-1 block font-normal text-slate-500 dark:text-slate-400">{hint}</small>}
  </label>
);

export const Check = ({ checked, onChange, children, disabled, title }) => (
  <label className={`flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200 ${disabled ? 'opacity-50' : ''}`} title={title}>
    <input type="checkbox" className="mt-0.5 h-4 w-4 accent-emerald-500" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    <span>{children}</span>
  </label>
);

export const Fieldset = ({ legend, children }) => (
  <fieldset className="space-y-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
    <legend className="px-2 text-sm font-bold text-emerald-700 dark:text-emerald-400">{legend}</legend>
    {children}
  </fieldset>
);

/** Ô bấm kiểu "viên thuốc" để chọn / đổi chỗ (bốc thăm, xếp sân): `selected` = đang được chọn. */
export const chip = (selected) => `inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition cursor-pointer ${selected ? 'border-amber-500 bg-amber-500/20 text-amber-800 dark:text-amber-200' : 'border-slate-300 bg-slate-50 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800'}`;
