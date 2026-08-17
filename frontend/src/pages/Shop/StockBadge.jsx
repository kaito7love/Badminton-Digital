import React from 'react';

export default function StockBadge({ inStock, labels = ['Còn hàng', 'Tạm hết'] }) {
  return (
    <span
      className={`rounded-full border px-3 py-1 font-kinetic text-[10px] font-black uppercase tracking-widest ${
        inStock
          ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-300'
          : 'border-white/10 bg-slate-950/80 text-slate-500'
      }`}
    >
      {inStock ? labels[0] : labels[1]}
    </span>
  );
}
