import React from 'react';
import { useTheme } from '../contexts/ThemeContext';
import SiteHeader from '../components/site/SiteHeader';

/**
 * Vỏ chung cho mặt tiền dành cho khách: cửa hàng, lịch đặt, tài khoản.
 *
 * Cố tình KHÔNG dùng SidebarLayout — khách không có việc gì với "Quản Lý Sân"
 * hay "Nhân Viên", bày ra chỉ tổ dẫn họ bấm vào rồi lãnh 403. Ngược lại nhân
 * viên lỡ ghé qua đây vẫn có một đường về bàn làm việc của mình (menu tên ở header).
 *
 * Header và thanh tab dưới trên điện thoại là SiteHeader dùng chung với Trang chủ và khu Thi đấu (kế hoạch 28); mọi mục
 * menu nằm trong components/site/siteNav.js, không khai báo ở đây.
 *
 * Giao diện sáng / tối: theo ThemeContext như bàn làm việc. Chế độ sáng gắn lớp `.kinetic-light` lên gốc để
 * styles/kinetic.css đổi bảng màu của skin chỉ trong khung này (trang chủ cũng dùng kinetic.css nhưng không
 * gắn lớp đó nên giữ nguyên bản tối). Mọi trang trong khung phải có cặp màu sáng/tối (`text-slate-900 dark:text-white`...).
 */

export default function CustomerLayout({ eyebrow, title, subtitle, action, children }) {
  const themeCtx = useTheme();
  // Không có ThemeProvider (test, nhúng riêng) → như mặc định của app là tối.
  const light = Boolean(themeCtx) && themeCtx.theme === 'light';

  return (
    <div className={`kinetic-surface nike-grid-bg flex flex-col${light ? ' kinetic-light' : ''}`}>
      <SiteHeader />

      <main className="relative z-10 mx-auto w-full max-w-7xl flex-1 px-5 pb-28 pt-10 sm:px-6 lg:pb-20">
        {(title || eyebrow) && (
          <div className="mb-10 flex flex-wrap items-end justify-between gap-5">
            <div>
              {eyebrow && <div className="live-ticker mb-4">{eyebrow}</div>}
              {title && (
                <h1 className="font-kinetic text-4xl font-black uppercase tracking-tighter text-slate-900 dark:text-white sm:text-5xl">
                  {title}
                </h1>
              )}
              {subtitle && <p className="mt-3 max-w-2xl text-slate-600 dark:text-slate-400">{subtitle}</p>}
            </div>
            {action}
          </div>
        )}

        {children}
      </main>

      <footer className="relative z-10 border-t border-slate-200 dark:border-white/10 bg-white pb-24 pt-10 dark:bg-slate-950 lg:py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 text-center sm:px-6 md:flex-row md:text-left">
          <div className="font-kinetic text-lg font-black uppercase text-slate-900 dark:text-white">
            BADMINTON <span className="text-gradient-nike">DIGITAL</span>
          </div>
          <p className="font-kinetic text-[10px] font-bold uppercase tracking-widest text-slate-600 dark:text-slate-500">
            © 2026 BADMINTON DIGITAL // NIKE KINETIC EDITION
          </p>
        </div>
      </footer>
    </div>
  );
}
