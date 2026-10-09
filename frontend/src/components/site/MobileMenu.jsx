import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { resolveActiveChild } from './siteNav';
import { GHOST_BTN_BASE, PRIMARY_BTN, TONES } from './siteTone';

const Chevron = ({ open }) => (
  <svg viewBox="0 0 10 6" className={`h-2.5 w-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="currentColor" aria-hidden="true">
    <path d="M0 0h10L5 6z" />
  </svg>
);

/**
 * Menu ☰ dưới 1024 px. Nền đặc (nền trong suốt làm chữ của trang lọt qua). Mục có con là hàng bấm được cả hàng để mở / gập,
 * mũi tên nằm ngay cạnh chữ và không có nền riêng; chỉ mục của khu đang đứng mở sẵn. Cao tối đa bằng khoảng trống thật
 * (màn hình trừ thanh trên 4rem và thanh tab dưới 4rem), cuộn bên trong, nên mục cuối (Đăng xuất) luôn cuộn tới được.
 */
export default function MobileMenu({ nav, activeKey, location, tone, account, cartCount, theme, onToggleTheme, showThemeToggle, loginState, onLogout, onNavigate }) {
  const t = TONES[tone];
  const [open, setOpen] = useState(() => (activeKey ? { [activeKey]: true } : {}));
  const toggle = (key) => setOpen((cur) => ({ ...cur, [key]: !cur[key] }));

  return (
    <div
      id="site-mobile-menu"
      className={`absolute inset-x-0 top-full z-50 overflow-y-auto overscroll-contain px-4 pb-4 pt-2 shadow-2xl lg:hidden ${t.sheet} ${t.sheetLine} border-b`}
      style={{ maxHeight: 'calc(100dvh - 8rem)' }}
    >
      {nav.items.map((item) => {
        const hasChildren = item.children.length > 0;
        const isOpen = hasChildren && !!open[item.key];
        const on = activeKey === item.key;
        const activeChild = hasChildren ? resolveActiveChild(item, location) : null;
        return (
          <div key={item.key}>
            {hasChildren ? (
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => toggle(item.key)}
                className={`flex min-h-[3rem] w-full items-center gap-2 rounded-xl px-3 text-left text-base font-bold ${on ? t.sheetRowOn : t.sheetRow}`}
              >
                {item.label}
                <Chevron open={isOpen} />
              </button>
            ) : (
              <Link
                to={item.to}
                onClick={onNavigate}
                aria-current={on ? 'page' : undefined}
                className={`flex min-h-[3rem] items-center rounded-xl px-3 text-base font-bold ${on ? t.sheetRowOn : t.sheetRow}`}
              >
                {item.label}
              </Link>
            )}
            {isOpen && (
              <div className={`mb-1 ml-4 border-l-2 pl-2 ${t.sheetSub}`}>
                {item.children.map((child) => (
                  <Link
                    key={child.key}
                    to={child.to}
                    onClick={onNavigate}
                    aria-current={activeChild === child.key ? 'page' : undefined}
                    className={`flex min-h-[2.75rem] items-center rounded-lg px-3 text-sm font-semibold ${activeChild === child.key ? t.sheetRowOn : t.sheetRow}`}
                  >
                    {child.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <div className={`my-2 border-t ${t.sheetLine}`} />

      {showThemeToggle && (
        <button type="button" onClick={onToggleTheme} className={`flex min-h-[3rem] w-full items-center rounded-xl px-3 text-left text-base font-bold ${t.sheetRow}`}>
          {theme === 'light' ? '🌙 Giao diện tối' : '☀️ Giao diện sáng'}
        </button>
      )}
      <Link to="/cart" onClick={onNavigate} className={`flex min-h-[3rem] items-center rounded-xl px-3 text-base font-bold ${t.sheetRow}`}>
        🛒 Giỏ hàng{cartCount > 0 ? ` (${cartCount})` : ''}
      </Link>

      {account ? (
        <>
          <div className={`px-3 pb-1 pt-3 text-sm font-semibold ${t.sheetMuted}`}>{account.name}</div>
          {account.menu.map((entry) =>
            entry.action === 'logout' ? (
              <button key={entry.key} type="button" onClick={() => { onNavigate(); onLogout(); }} className={`flex min-h-[3rem] w-full items-center rounded-xl px-3 text-left text-base font-bold ${t.sheetRow}`}>
                {entry.label}
              </button>
            ) : (
              <Link key={entry.key} to={entry.to} onClick={onNavigate} className={`flex min-h-[3rem] items-center rounded-xl px-3 text-base font-bold ${t.sheetRow}`}>
                {entry.label}
              </Link>
            )
          )}
        </>
      ) : (
        <div className="grid grid-cols-2 gap-3 px-1 pt-3">
          <Link to="/login" state={loginState} onClick={onNavigate} className={PRIMARY_BTN}>Đăng nhập</Link>
          <Link to="/register" state={loginState} onClick={onNavigate} className={`${GHOST_BTN_BASE} ${t.ghostBtn}`}>Đăng ký</Link>
        </div>
      )}
    </div>
  );
}
