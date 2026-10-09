import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useCart } from '../../contexts/CartContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useCompetition } from '../../features/competition/context/CompetitionContext';
import SiteHeaderView from './SiteHeaderView';
import ScrollToTop from './ScrollToTop';
import { buildSiteNav } from './siteNav';

/**
 * Header chung của Trang chủ, Cửa hàng và Thi đấu (kế hoạch 28). Nối context vào SiteHeaderView.
 *  - `tone="dark"` + `overlay`: Trang chủ (luôn tối, đè lên ảnh, không có nút đổi giao diện vì trang chưa có bản sáng);
 *  - mặc định: theo giao diện sáng / tối của app, có nút đổi giao diện.
 */
export default function SiteHeader({ tone = 'auto', overlay = false }) {
  const location = useLocation();
  const navType = useNavigationType();
  const { user, logout } = useAuth();
  const { totalQuantity } = useCart();
  const themeCtx = useTheme();
  const { enabled: competitionOn } = useCompetition();
  const nav = useMemo(() => buildSiteNav({ user, competitionOn }), [user, competitionOn]);

  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (!overlay) return undefined;
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [overlay]);

  // Sang trang khác (bấm menu, tab, liên kết) thì cuộn về đầu trang. Trước đây vị trí cuộn bị giữ nguyên nếu trang đích đã nạp sẵn
  // (vd từ cuối trang Thi đấu bấm Cửa hàng vẫn nằm ở cuối), còn trang đang nạp thì tự co lại nên nhảy về đầu: lúc có lúc không.
  // Header này nằm trong mọi trang khách và dựng lại theo từng trang nên chạy đúng một lần mỗi lần đổi trang. Không đụng vào:
  // nút Back / Forward của trình duyệt (POP), liên kết có #mốc (trang đích tự cuộn tới mốc), và đổi ?bộ-lọc trong cùng một trang.
  useEffect(() => {
    if (navType === 'POP' || location.hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Đang ở trang chủ: bấm logo cuộn lên đầu thay vì không có gì xảy ra.
  const onLogoClick = (e) => {
    if (location.pathname === '/') {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <>
    <SiteHeaderView
      nav={nav}
      location={location}
      cartCount={totalQuantity}
      theme={themeCtx ? themeCtx.theme : undefined}
      onToggleTheme={themeCtx ? themeCtx.toggleTheme : undefined}
      showThemeToggle={tone !== 'dark' && Boolean(themeCtx)}
      onLogout={logout}
      tone={tone}
      overlay={overlay}
      scrolled={scrolled}
      onLogoClick={onLogoClick}
    />
    <ScrollToTop tone={tone} />
    </>
  );
}
