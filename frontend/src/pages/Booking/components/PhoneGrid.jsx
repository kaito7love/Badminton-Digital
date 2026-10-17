import React from 'react';
import { courtTitle, priceLine, slotLabel, slotPrice } from '../lib/gridModel';
import { isSelected } from '../lib/daySelection';
import { BOOKED_STRIPES, cellClass } from './cellStyles';

const WORD = { booked: 'Kín', passed: 'Qua', maintenance: 'Bảo trì' };

/**
 * Lưới gọn (điện thoại và máy tính bảng, dưới 1024 px): thẻ chuyển giữa các sân, mỗi sân một lưới 4 cột (6 cột từ 640 px) các giờ.
 * Không cuộn ngang; ô cao 56 px để chạm một ngón tay.
 */
export default function PhoneGrid({ day, courtId, onCourt, selection, onTap }) {
  const court = day.courts.find((c) => c.id === courtId) || day.courts[0];
  const kf = (n) => `${Math.round(n / 1000)}k`;

  return (
    <div>
      <div role="group" aria-label="Chọn sân" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-3 [scrollbar-width:thin] [scrollbar-color:rgba(100,116,139,0.55)_transparent]">
        {day.courts.map((c) => {
          const on = c.id === court.id;
          const { title, kind } = courtTitle(c);
          return (
            <button
              key={c.id}
              type="button"
              data-court-tab={c.id}
              aria-pressed={on}
              onClick={() => onCourt(c.id)}
              className={`shrink-0 rounded-2xl border px-4 py-2 text-left leading-tight transition-colors ${
                on
                  ? 'border-emerald-600 bg-emerald-500/10 ring-1 ring-emerald-600 dark:border-emerald-400 dark:bg-emerald-400/10 dark:ring-emerald-400'
                  : 'border-slate-300 bg-white dark:border-white/15 dark:bg-white/5'
              }`}
            >
              <span className="block font-kinetic text-sm font-black text-slate-900 dark:text-white">{title}</span>
              <span className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                {c.bookable ? kind || priceLine(c) : 'Bảo trì'}
              </span>
            </button>
          );
        })}
      </div>

      {!court.bookable ? (
        <div className="rounded-2xl border border-dashed border-amber-600/50 bg-amber-500/10 p-5 text-center dark:border-amber-400/40">
          <p className="font-kinetic text-base font-black text-amber-800 dark:text-amber-300">{court.name} đang bảo trì</p>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Bạn chọn sân khác nhé.</p>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6" role="group" aria-label={`Giờ của ${court.name}`}>
          {court.slots.map((slot) => {
            const selected = isSelected(selection, court, slot);
            const free = slot.state === 'free';
            return (
              <button
                key={slot.start}
                type="button"
                disabled={!free && !selected}
                aria-pressed={selected}
                aria-label={slotLabel(court, slot, { selected })}
                onClick={() => onTap(court, slot)}
                className={`flex h-14 flex-col items-center justify-center gap-0.5 rounded-xl font-kinetic ${cellClass(slot, selected)}`}
                style={slot.state === 'booked' && !selected ? BOOKED_STRIPES : undefined}
              >
                <span className="text-[15px] font-black leading-none">{slot.start}</span>
                <span className="text-[11px] font-semibold leading-none opacity-80">
                  {free || selected ? kf(slotPrice(court, slot)) : WORD[slot.state]}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
