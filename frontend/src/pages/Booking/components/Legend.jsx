import React from 'react';
import { BOOKED_STRIPES, CELL_STYLE } from './cellStyles';

const ITEMS = [
  { key: 'free', label: 'Trống', className: CELL_STYLE.free },
  { key: 'peak', label: 'Trống, giờ cao điểm', className: CELL_STYLE.peak },
  { key: 'selected', label: 'Bạn chọn', className: CELL_STYLE.selected },
  { key: 'booked', label: 'Đã kín', className: CELL_STYLE.booked, style: BOOKED_STRIPES },
  { key: 'passed', label: 'Đã qua', className: CELL_STYLE.passed },
  { key: 'maintenance', label: 'Bảo trì', className: CELL_STYLE.maintenance }
];

/** Chú thích màu. Dùng đúng lớp của ô lưới nên không thể lệch với lưới. */
export default function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-slate-600 dark:text-slate-400" aria-label="Chú thích">
      {ITEMS.map((item) => (
        <li key={item.key} className="inline-flex items-center gap-2">
          <span aria-hidden="true" className={`inline-block h-4 w-4 rounded ${item.className}`} style={item.style} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
