// Màu của ô lưới theo trạng thái. Mọi lớp viết nguyên văn (Tailwind chỉ sinh CSS
// cho lớp đọc được trong mã nguồn, không sinh cho chuỗi ghép) và luôn đủ cặp
// sáng / tối như các trang khách khác (kế hoạch 28: không có `text-white` trần).
//
// Một chỗ duy nhất cho cả lưới desktop, lưới điện thoại và chú thích màu, để ba
// nơi không thể lệch nhau.

const BASE = 'border transition-colors duration-100';

export const CELL_STYLE = {
  free:
    `${BASE} border-emerald-600/45 bg-emerald-500/10 text-emerald-800 hover:bg-emerald-500/25 ` +
    'dark:border-emerald-400/40 dark:bg-emerald-400/10 dark:text-emerald-200 dark:hover:bg-emerald-400/20',
  peak:
    `${BASE} border-lime-700/55 bg-lime-500/15 text-lime-900 hover:bg-lime-500/30 ` +
    'dark:border-lime-300/50 dark:bg-lime-300/10 dark:text-lime-100 dark:hover:bg-lime-300/20',
  booked:
    `${BASE} border-transparent bg-slate-200 text-slate-500 cursor-not-allowed ` +
    'dark:bg-white/5 dark:text-slate-500',
  passed:
    `${BASE} border-dashed border-slate-300 bg-transparent text-slate-400 opacity-70 cursor-not-allowed ` +
    'dark:border-white/15 dark:text-slate-500',
  maintenance:
    `${BASE} border-amber-600/45 bg-amber-500/10 text-amber-800 cursor-not-allowed ` +
    'dark:border-amber-400/40 dark:text-amber-300',
  selected:
    'border border-transparent bg-gradient-to-br from-emerald-600 to-lime-600 text-white shadow-md ' +
    'dark:from-emerald-400 dark:to-lime-300 dark:text-slate-950 dark:shadow-[0_0_18px_rgba(0,255,102,0.35)]'
};

/** Sọc chéo cho ô đã kín: nhìn khác ô "đã qua" mà không cần dựa vào màu. */
export const BOOKED_STRIPES = {
  backgroundImage:
    'repeating-linear-gradient(135deg, transparent 0 5px, rgba(100,116,139,0.28) 5px 6px)'
};

/** Lớp màu cho một ô: đang chọn thắng, rồi tới trạng thái (trống + cao điểm → peak). */
export const cellClass = (slot, selected) => {
  if (selected) return CELL_STYLE.selected;
  if (slot.state === 'free') return slot.peak ? CELL_STYLE.peak : CELL_STYLE.free;
  return CELL_STYLE[slot.state] || CELL_STYLE.passed;
};

/** Chữ trong ô lưới desktop (ô hẹp: chỉ một ký hiệu). */
export const cellGlyph = (slot, selected) => {
  if (selected || slot.state === 'free') return slot.start.slice(0, 2);
  if (slot.state === 'booked') return '×';
  if (slot.state === 'maintenance') return '·';
  return '–';
};
