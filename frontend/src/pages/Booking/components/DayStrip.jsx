import React from 'react';

/** Dải ngày: hôm nay … ngày cuối được đặt. Cuộn ngang trong chính nó, không làm trang tràn. */
export default function DayStrip({ days, value, onChange }) {
  return (
    <div role="group" aria-label="Chọn ngày" className="flex min-w-0 gap-2 overflow-x-auto pb-2 pt-1 [scrollbar-width:thin] [scrollbar-color:rgba(100,116,139,0.55)_transparent]">
      {days.map((d) => {
        const on = d.date === value;
        return (
          <button
            key={d.date}
            type="button"
            aria-pressed={on}
            aria-label={`${d.label}${d.isToday ? ', hôm nay' : ''}`}
            onClick={() => onChange(d.date)}
            className={`min-w-[64px] shrink-0 rounded-2xl border px-3 py-2 text-center leading-tight transition-colors ${
              on
                ? 'border-emerald-600 bg-emerald-500/10 ring-1 ring-emerald-600 dark:border-emerald-400 dark:bg-emerald-400/10 dark:ring-emerald-400'
                : 'border-slate-300 bg-white text-slate-700 hover:border-emerald-600 dark:border-white/15 dark:bg-white/5 dark:text-slate-200 dark:hover:border-emerald-400'
            }`}
          >
            <span className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">{d.weekday}</span>
            <span className="block font-kinetic text-lg font-black text-slate-900 dark:text-white">{d.day}</span>
            <span
              className={`block text-[10px] font-bold ${
                d.isToday ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {d.isToday ? 'Hôm nay' : `Thg ${Number(d.month)}`}
            </span>
          </button>
        );
      })}
    </div>
  );
}
