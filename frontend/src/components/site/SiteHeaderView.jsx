import React, { useEffect, useRef, useState } from 'react';
import BrandLogo from '../brand/BrandLogo';
import HeaderActions, { CartLink } from './HeaderActions';
import MobileMenu from './MobileMenu';
import MobileTabBar from './MobileTabBar';
import NavItem from './NavItem';
import useDropdown from './useDropdown';
import { resolveActive } from './siteNav';
import { TONES } from './siteTone';

/**
 * Phần vẽ của header chung (kế hoạch 28, hướng b) — thuần theo props, không đọc context, nên dựng thử bằng react-dom/server.
 *  - Máy tính (từ 1024 px): một thanh 96 px — logo · Trang chủ ▾ · Đặt sân · Cửa hàng ▾ · Thi đấu ▾ · (đổi giao diện) · giỏ · tài khoản.
 *  - Điện thoại: thanh 80 px (logo · giỏ · ☰) + menu ☰ + thanh tab dưới 5 ô.
 *  - `overlay` (Trang chủ): cố định, trong suốt ở đầu trang, thành kính mờ khi `scrolled`.
 * Chiều cao trang phía dưới do khung trang tự chừa chỗ: sticky chiếm chỗ thật; overlay thì hero tự đẩy xuống.
 */
export default function SiteHeaderView({
  nav, location, cartCount = 0, theme, onToggleTheme, showThemeToggle = false, onLogout = () => {},
  tone = 'auto', overlay = false, scrolled = false, onLogoClick
}) {
  const t = TONES[tone];
  const rootRef = useRef(null);
  const dropdown = useDropdown(rootRef);
  const [menuOpen, setMenuOpen] = useState(false);
  const activeKey = resolveActive(location);
  const loginState = { from: { pathname: (location && location.pathname) || '/' } };
  const closeMenu = () => setMenuOpen(false);

  // Đổi trang thì đóng mọi menu; Esc đóng menu ☰.
  const routeId = location ? `${location.pathname}${location.search || ''}${location.hash || ''}` : '';
  useEffect(() => { setMenuOpen(false); dropdown.close(); }, [routeId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const solid = !overlay || scrolled || menuOpen;
  const position = overlay ? 'fixed inset-x-0 top-0' : 'sticky top-0';

  return (
    <>
      <header
        ref={rootRef}
        data-site-header
        className={`${position} z-40 transition-colors duration-300 ${solid ? t.bar : t.barClear}`}
      >
        <div className="mx-auto flex h-20 max-w-7xl items-center gap-4 px-5 sm:px-6 lg:h-24">
          <BrandLogo tone={tone} onClick={onLogoClick} />

          <nav aria-label="Điều hướng chính" className="ml-2 hidden items-center gap-5 self-stretch lg:flex xl:ml-4 xl:gap-7">
            {nav.items.map((item) => (
              <NavItem
                key={item.key}
                item={item}
                active={activeKey === item.key}
                location={location}
                tone={tone}
                dropdown={dropdown}
              />
            ))}
          </nav>

          <div className="ml-auto hidden lg:block">
            <HeaderActions
              account={nav.account}
              cartCount={cartCount}
              theme={theme}
              onToggleTheme={onToggleTheme}
              showThemeToggle={showThemeToggle}
              tone={tone}
              loginState={loginState}
              dropdown={dropdown}
              onLogout={onLogout}
            />
          </div>

          <div className="ml-auto flex items-center gap-2 lg:hidden">
            <CartLink count={cartCount} tone={tone} onClick={closeMenu} />
            <button
              type="button"
              aria-label={menuOpen ? 'Đóng menu' : 'Mở menu điều hướng'}
              aria-expanded={menuOpen}
              aria-controls="site-mobile-menu"
              onClick={() => setMenuOpen((v) => !v)}
              className={`inline-flex h-10 w-10 items-center justify-center rounded-xl text-lg ${t.iconBtn}`}
            >
              {menuOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>

        {menuOpen && (
          <MobileMenu
            nav={nav}
            activeKey={activeKey}
            location={location}
            tone={tone}
            account={nav.account}
            cartCount={cartCount}
            theme={theme}
            onToggleTheme={onToggleTheme}
            showThemeToggle={showThemeToggle}
            loginState={loginState}
            onLogout={onLogout}
            onNavigate={closeMenu}
          />
        )}
      </header>

      <MobileTabBar tabs={nav.tabs} activeKey={activeKey} tone={tone} />
    </>
  );
}
