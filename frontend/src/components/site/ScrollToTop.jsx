import React, { useEffect, useState } from 'react';

/**
 * Nút "lên đầu trang" dùng chung cho mọi trang có header chung (Trang chủ, Cửa hàng, Thi đấu). Hiện khi đã cuộn quá ~40 px.
 * Trên điện thoại nằm trên thanh tab dưới (bottom-20), trên máy tính ở góc dưới phải. Giữ hình mũi tên cũ của nút ở Trang chủ.
 * `tone`: 'dark' luôn là bản tối (Trang chủ); 'auto' đi theo giao diện sáng / tối (nền trắng, mũi tên xanh rừng ở bản sáng).
 */
export default function ScrollToTop({ tone = 'auto' }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  if (!visible) return null;

  const dark = tone === 'dark';
  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="group fixed bottom-20 right-5 z-40 cursor-pointer border-0 bg-transparent lg:bottom-8 lg:right-8"
      aria-label="Scroll to top"
    >
      <div className="h-11 w-11 rounded-2xl bg-gradient-to-tr from-emerald-500 to-lime-400 p-0.5 shadow-2xl shadow-emerald-500/20 transition-transform group-hover:scale-110">
        <div className={`flex h-full w-full items-center justify-center rounded-[14px] ${dark ? 'bg-slate-950' : 'bg-white dark:bg-slate-950'}`}>
          <svg className={`h-6 w-6 ${dark ? 'text-emerald-400' : 'text-emerald-700 dark:text-emerald-400'}`} viewBox="0 0 100 100" fill="none" aria-hidden="true">
            <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="8" fill="transparent" />
            <path d="M50 18 L68 45 L50 38 L32 45 Z" fill={dark ? '#CCFF00' : undefined} className={dark ? undefined : 'fill-lime-600 dark:fill-[#CCFF00]'} />
            <path d="M50 38 L50 82" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </button>
  );
}
