import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useCompetition } from '../../features/competition/context/CompetitionContext';
import { buildSiteNav } from './siteNav';
import { TONES } from './siteTone';

export const FOOTER_TAGLINE = '© 2026 Badminton Digital — Đặt sân, cửa hàng và giải đấu cầu lông.';

/**
 * Chân trang chung của khu khách (kế hoạch 31), lấy footer của /thi-dau làm chuẩn: một hàng, dòng bản quyền bên trái, các
 * liên kết chính bên phải; dưới `sm` xếp dọc, căn giữa. Chừa `pb-24` cho thanh tab dưới trên điện thoại (`lg` thì không có
 * thanh đó). Bề rộng `max-w-7xl` + lề như header để chân trang thẳng hàng với logo và menu ở mọi trang.
 *
 * `clearBottomBar`: trang có thêm một thanh `fixed` nằm trên thanh tab dưới (thanh tóm tắt của /dat-san, cao tới ~206 px tính từ đáy
 * màn hình khi đã chọn khung giờ) — cuối trang thanh đó đè lên chân trang nên liên kết không bấm được; thêm đệm để chúng nằm trên thanh.
 *
 * Thuần: nhận sẵn danh sách liên kết (từ `buildSiteNav(...).footerLinks`) nên test được không cần context.
 * `tone`: 'dark' luôn là bản tối (Trang chủ); 'auto' theo giao diện sáng / tối của app.
 */
export function SiteFooterView({ links, tone = 'auto', clearBottomBar = false }) {
  const t = TONES[tone] || TONES.auto;
  // Viết nguyên chuỗi từng lớp để Tailwind sinh được CSS.
  const bottomPad = clearBottomBar ? 'pb-56' : 'pb-24';
  return (
    <footer className={`relative z-10 ${bottomPad} pt-6 lg:py-6 ${t.foot}`}>
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-5 text-center text-xs sm:flex-row sm:px-6 sm:text-left">
        <p>{FOOTER_TAGLINE}</p>
        <nav aria-label="Liên kết chân trang">
          <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 font-semibold">
            {links.map((link) => (
              <li key={link.key}>
                <Link to={link.to} className={t.footLink}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}

/** Nối context vào SiteFooterView: mục Thi đấu biến mất khi dịch vụ thi đấu tắt, cùng quy tắc với menu header. */
export default function SiteFooter({ tone = 'auto', clearBottomBar = false }) {
  const { enabled: competitionOn } = useCompetition();
  const links = useMemo(() => buildSiteNav({ competitionOn }).footerLinks, [competitionOn]);
  return <SiteFooterView links={links} tone={tone} clearBottomBar={clearBottomBar} />;
}
