import React from 'react';

/** Bộ tăng/giảm số lượng, chặn trong 1–99 đúng bằng giới hạn của API đặt hàng. */
export default function QuantityStepper({ value, onChange, min = 1, max = 99, size = 'md' }) {
  const clamp = (next) => Math.max(min, Math.min(max, Number(next) || min));
  const buttonSize = size === 'sm' ? 'h-8 w-8 text-base' : 'h-11 w-11 text-lg';
  const inputSize = size === 'sm' ? 'h-8 w-12 text-sm' : 'h-11 w-16 text-base';

  return (
    <div className="inline-flex items-center overflow-hidden rounded-xl border border-white/10 bg-slate-950/70">
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        disabled={value <= min}
        aria-label="Giảm số lượng"
        className={`${buttonSize} font-bold text-slate-300 transition hover:bg-white/5 disabled:opacity-30`}
      >
        −
      </button>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(clamp(event.target.value))}
        aria-label="Số lượng"
        className={`${inputSize} border-x border-white/10 bg-transparent text-center font-bold text-white focus:outline-none`}
      />
      <button
        type="button"
        onClick={() => onChange(clamp(value + 1))}
        disabled={value >= max}
        aria-label="Tăng số lượng"
        className={`${buttonSize} font-bold text-slate-300 transition hover:bg-white/5 disabled:opacity-30`}
      >
        +
      </button>
    </div>
  );
}
