/**
 * Bảng lớp Tailwind của header chung, theo "tone":
 *  - 'auto': đi theo giao diện sáng / tối của app (mỗi lớp có cặp `dark:`), dùng ở Cửa hàng và Thi đấu;
 *  - 'dark': luôn là bản tối, dùng ở Trang chủ (trang chỉ có bản tối, không đọc ThemeContext nên `html.dark` có thể không có).
 * Mọi lớp viết nguyên chuỗi: Tailwind chỉ sinh CSS cho những gì đọc được nguyên văn trong mã nguồn.
 */
export const TONES = {
  auto: {
    bar: 'border-b border-slate-200 bg-white/90 text-slate-900 backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/90 dark:text-white',
    barClear: 'border-b border-transparent bg-transparent text-slate-900 dark:text-white',
    link: 'border-transparent text-slate-700 hover:text-emerald-700 dark:text-slate-300 dark:hover:text-emerald-400',
    linkOn: 'border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-400',
    caret: 'text-slate-500 hover:text-emerald-700 dark:text-slate-400 dark:hover:text-emerald-400',
    panel: 'border border-slate-200 bg-white shadow-xl shadow-slate-900/10 dark:border-white/10 dark:bg-slate-900 dark:shadow-black/50',
    panelItem: 'text-slate-900 hover:bg-slate-100 dark:text-white dark:hover:bg-white/10',
    panelItemOn: 'bg-slate-100 text-emerald-700 dark:bg-white/10 dark:text-emerald-400',
    hint: 'text-slate-500 dark:text-slate-400',
    iconBtn: 'border border-slate-300 text-slate-900 hover:bg-slate-100 dark:border-white/15 dark:text-white dark:hover:bg-white/10',
    ghostBtn: 'border border-slate-300 text-slate-800 hover:bg-slate-100 dark:border-white/20 dark:text-white dark:hover:bg-white/10',
    userBtn: 'border border-slate-300 text-slate-900 hover:bg-slate-100 dark:border-white/15 dark:text-white dark:hover:bg-white/10',
    sheet: 'bg-white text-slate-900 dark:bg-slate-950 dark:text-white',
    sheetLine: 'border-slate-200 dark:border-white/10',
    sheetRow: 'text-slate-900 hover:bg-slate-100 dark:text-white dark:hover:bg-white/10',
    sheetRowOn: 'bg-slate-100 text-emerald-700 dark:bg-white/10 dark:text-emerald-400',
    sheetSub: 'border-slate-200 text-slate-600 dark:border-white/10 dark:text-slate-300',
    sheetMuted: 'text-slate-500 dark:text-slate-400',
    tabs: 'border-t border-slate-200 bg-white/95 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/95',
    tab: 'text-slate-600 dark:text-slate-400',
    tabOn: 'text-emerald-700 dark:text-emerald-400'
  },
  dark: {
    bar: 'border-b border-white/10 bg-slate-950/90 text-white shadow-2xl backdrop-blur-2xl',
    barClear: 'border-b border-transparent bg-transparent text-white',
    link: 'border-transparent text-slate-300 hover:text-emerald-400',
    linkOn: 'border-emerald-400 text-emerald-400',
    caret: 'text-slate-400 hover:text-emerald-400',
    panel: 'border border-white/10 bg-slate-900 shadow-2xl shadow-black/50',
    panelItem: 'text-white hover:bg-white/10',
    panelItemOn: 'bg-white/10 text-emerald-400',
    hint: 'text-slate-400',
    iconBtn: 'border border-white/15 text-white hover:bg-white/10',
    ghostBtn: 'border border-white/20 text-white hover:bg-white/10',
    userBtn: 'border border-white/15 text-white hover:bg-white/10',
    sheet: 'bg-slate-950 text-white',
    sheetLine: 'border-white/10',
    sheetRow: 'text-white hover:bg-white/10',
    sheetRowOn: 'bg-white/10 text-emerald-400',
    sheetSub: 'border-white/10 text-slate-300',
    sheetMuted: 'text-slate-400',
    tabs: 'border-t border-white/10 bg-slate-950/95 backdrop-blur-xl',
    tab: 'text-slate-400',
    tabOn: 'text-emerald-400'
  }
};

// Nút chính (Đăng nhập) giống nhau ở cả hai tone: dải xanh lục - chanh trên chữ tối.
export const PRIMARY_BTN =
  'inline-flex items-center justify-center whitespace-nowrap rounded-xl bg-gradient-to-r from-[#00ff66] to-[#ccff00] px-4 py-2.5 font-kinetic text-xs font-black uppercase tracking-widest text-slate-950 shadow-[0_0_20px_rgba(0,255,102,0.25)] transition hover:brightness-105';

export const GHOST_BTN_BASE =
  'inline-flex items-center justify-center whitespace-nowrap rounded-xl px-4 py-2.5 font-kinetic text-xs font-black uppercase tracking-widest transition';
