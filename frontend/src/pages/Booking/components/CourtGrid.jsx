import React from 'react';
import { courtTitle, hourHeaders, priceLine, slotLabel } from '../lib/gridModel';
import { isSelected } from '../lib/daySelection';
import { BOOKED_STRIPES, cellClass, cellGlyph } from './cellStyles';

/**
 * Lưới desktop: hàng = sân, cột = từng giờ trong giờ mở cửa.
 *
 * Số cột lấy từ dữ liệu (giờ mở cửa là setting, không phải hằng số). Cột tên
 * sân co từ 168 xuống 112 px để ở 1024 px ô giờ vẫn rộng ~38 px; cả lưới nằm
 * trong khung riêng nên không bao giờ làm trang cuộn ngang.
 *
 * `highlightCourtId`: hàng của sân khách vừa chạm trên sơ đồ mặt bằng, được tô sáng trong ít giây.
 * Ô tên sân nhận tiêu điểm lập trình (`tabIndex=-1`, không nằm trong thứ tự Tab) để trình đọc màn hình
 * đọc ra sân đó sau khi trang cuộn tới.
 */
export default function CourtGrid({ day, selection, onTap, highlightCourtId = null }) {
  const headers = hourHeaders(day);
  const columns = `minmax(112px, 168px) repeat(${headers.length}, minmax(0, 1fr))`;

  return (
    <div role="group" aria-label="Lưới sân theo giờ" className="min-w-0">
      <div className="grid items-end gap-1" style={{ gridTemplateColumns: columns }}>
        <div className="pb-2 pl-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Giờ bắt đầu
        </div>
        {headers.map((h) => (
          <div
            key={h.start}
            className={`border-b-2 pb-2 text-center font-kinetic text-xs font-black ${
              h.peak
                ? 'border-lime-600 text-lime-800 dark:border-lime-300/60 dark:text-lime-200'
                : 'border-transparent text-slate-600 dark:text-slate-400'
            }`}
          >
            {h.label}
          </div>
        ))}
      </div>

      <div className="mt-1 space-y-1">
        {day.courts.map((court) => {
          const { title, kind } = courtTitle(court);
          const lit = highlightCourtId != null && court.id === highlightCourtId;
          return (
            <div
              key={court.id}
              className={`grid items-stretch gap-1 rounded-lg transition-shadow ${
                lit ? 'bg-emerald-500/10 ring-2 ring-emerald-600 dark:ring-emerald-400' : ''
              }`}
              style={{ gridTemplateColumns: columns }}
            >
              <div
                data-court-title={court.id}
                tabIndex={-1}
                className="flex flex-col justify-center py-1 pl-1 pr-2 leading-tight outline-none"
              >
                <strong className="font-kinetic text-[15px] font-black text-slate-900 dark:text-white">{title}</strong>
                <span className="text-xs text-slate-600 dark:text-slate-400">
                  {kind ? `${kind} · ` : ''}
                  {priceLine(court)}
                </span>
              </div>

              {!court.bookable ? (
                <div
                  className="flex min-h-[44px] items-center rounded-lg border border-dashed border-amber-600/50 bg-amber-500/10 px-3 text-sm font-bold text-amber-800 dark:border-amber-400/40 dark:text-amber-300"
                  style={{ gridColumn: '2 / -1' }}
                >
                  Bảo trì{court.note ? ` · ${court.note.replace(/^Đang bảo trì,?\s*/i, '')}` : ''}
                </div>
              ) : (
                court.slots.map((slot) => {
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
                      className={`h-11 rounded-lg font-kinetic text-xs font-black ${cellClass(slot, selected)}`}
                      style={slot.state === 'booked' && !selected ? BOOKED_STRIPES : undefined}
                    >
                      {cellGlyph(slot, selected)}
                    </button>
                  );
                })
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
