import React, { useEffect, useMemo, useRef, useState } from 'react';
import { matchesQuery } from '../lib/format';

// Ô gõ tìm người (07, K5): gõ vài chữ (không cần dấu: "nguyen" ra "Nguyễn") → danh sách lọc ngay; Enter chọn dòng đầu;
// ↑ ↓ di chuyển. Người đang bận (note) xếp cuối và ghi chú ⚠.

/** Lọc + sắp xếp danh sách gợi ý — hàm thuần để test. */
export const filterPeople = (people, query, limit = 8) =>
  people
    .filter((x) => matchesQuery(query, x.label))
    .sort((a, b) => Number(Boolean(a.note)) - Number(Boolean(b.note)))
    .slice(0, limit);

export default function PersonPicker({ people, value, onChange, placeholder = 'Gõ tên…', autoFocus = false, inputRef, disabled = false }) {
  const [text, setText] = useState(value ? value.label : '');
  const [open, setOpen] = useState(false);
  const [hl, setHl] = useState(0);
  const localRef = useRef(null);
  const ref = inputRef || localRef;

  // Xoá chữ đang hiện sau khi đăng ký xong: nơi dùng đổi `key` để dựng lại ô.
  useEffect(() => { if (value) setText(value.label); }, [value]);

  const shown = useMemo(() => (open ? filterPeople(people, text) : []), [people, text, open]);

  const choose = (person) => {
    setText(person.label);
    setOpen(false);
    onChange(person);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!value && shown[hl]) choose(shown[hl]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHl((h) => Math.min(h + 1, Math.max(0, shown.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHl((h) => Math.max(0, h - 1));
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="relative min-w-[200px] flex-1">
      <input
        ref={ref}
        type="search"
        value={text}
        disabled={disabled}
        autoFocus={autoFocus}
        autoComplete="off"
        placeholder={placeholder}
        aria-label={placeholder}
        className={`w-full rounded-xl border px-3 py-2 text-sm outline-none transition focus:border-emerald-500 dark:bg-slate-950 dark:text-slate-100 ${value ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30' : 'border-slate-300 bg-white dark:border-slate-700'}`}
        onChange={(e) => { setText(e.target.value); setHl(0); setOpen(true); if (value) onChange(null); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
      />
      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900" role="listbox">
          {shown.length ? shown.map((x, i) => (
            <button
              key={x.id}
              type="button"
              role="option"
              aria-selected={i === hl}
              className={`block w-full px-3 py-2 text-left text-sm ${i === hl ? 'bg-emerald-500/10' : ''} hover:bg-emerald-500/10`}
              onMouseDown={(e) => { e.preventDefault(); choose(x); }}
            >
              <span className="font-semibold text-slate-900 dark:text-white">{x.label}</span>
              {x.sub && <small className="ml-2 text-slate-500 dark:text-slate-400">{x.sub}</small>}
              {x.note && <small className="mt-0.5 block font-semibold text-amber-600 dark:text-amber-400">⚠ {x.note}</small>}
            </button>
          )) : <div className="px-3 py-2 text-sm text-slate-500">Không thấy ai tên như vậy.</div>}
        </div>
      )}
    </div>
  );
}
