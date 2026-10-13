import React from 'react';
import { Link } from 'react-router-dom';
import { GHOST_BTN_BASE, PRIMARY_BTN, TONES } from './siteTone';

const ICON_BTN = 'relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base transition';

/** Giỏ hàng: biểu tượng + số lượng, có mặt ở cả ba khu (trước đây Trang chủ là biểu tượng, Cửa hàng là mục menu, Thi đấu không có). */
export function CartLink({ count, tone, onClick }) {
  const t = TONES[tone];
  return (
    <Link
      to="/cart"
      onClick={onClick}
      aria-label={count > 0 ? `Giỏ hàng, ${count} sản phẩm` : 'Giỏ hàng'}
      className={`${ICON_BTN} ${t.iconBtn}`}
    >
      🛒
      {count > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-emerald-400 px-1 font-kinetic text-[10px] font-black text-slate-950">
          {count}
        </span>
      )}
    </Link>
  );
}

export function ThemeToggle({ theme, onToggle, tone }) {
  const light = theme === 'light';
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`${ICON_BTN} ${TONES[tone].iconBtn}`}
      aria-label={light ? 'Chuyển sang giao diện tối' : 'Chuyển sang giao diện sáng'}
      title={light ? 'Giao diện tối' : 'Giao diện sáng'}
    >
      {light ? '🌙' : '☀️'}
    </button>
  );
}

/** Cụm bên phải trên máy tính: đổi giao diện, giỏ, rồi Đăng nhập (nổi bật) + Đăng ký, hoặc nút tên mở menu tài khoản. */
export default function HeaderActions({ account, cartCount, theme, onToggleTheme, showThemeToggle, tone, loginState, dropdown, onLogout }) {
  const t = TONES[tone];
  const open = dropdown.openKey === 'account';

  return (
    <div className="flex items-center gap-3">
      {showThemeToggle && <ThemeToggle theme={theme} onToggle={onToggleTheme} tone={tone} />}
      <CartLink count={cartCount} tone={tone} />
      {account ? (
        <div className="relative" onKeyDown={(e) => { if (e.key === 'Escape') dropdown.close(); }}>
          <button
            type="button"
            aria-haspopup="true"
            aria-expanded={open}
            aria-controls="site-account-menu"
            onClick={() => dropdown.toggle('account')}
            className={`flex h-10 max-w-[13rem] items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-bold transition ${t.userBtn}`}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-lime-400 text-[11px] font-black text-slate-950">
              {account.initials}
            </span>
            <span className="hidden truncate xl:inline">{account.name}</span>
            <svg viewBox="0 0 10 6" className={`h-2 w-2.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="currentColor" aria-hidden="true">
              <path d="M0 0h10L5 6z" />
            </svg>
          </button>
          {open && (
            <div id="site-account-menu" className="absolute right-0 top-full z-50 pt-2">
              <div className={`min-w-[13rem] rounded-2xl p-2 ${t.panel}`}>
                {account.menu.map((entry) =>
                  entry.action === 'logout' ? (
                    <button
                      key={entry.key}
                      type="button"
                      onClick={() => { dropdown.close(); onLogout(); }}
                      className={`block w-full rounded-xl px-3 py-2.5 text-left text-sm font-bold ${t.panelItem}`}
                    >
                      {entry.label}
                    </button>
                  ) : (
                    <Link key={entry.key} to={entry.to} onClick={dropdown.close} className={`block rounded-xl px-3 py-2.5 text-sm font-bold ${t.panelItem}`}>
                      {entry.label}
                    </Link>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <Link to="/login" state={loginState} className={PRIMARY_BTN}>Đăng nhập</Link>
          <Link to="/register" state={loginState} className={`${GHOST_BTN_BASE} ${t.ghostBtn}`}>Đăng ký</Link>
        </>
      )}
    </div>
  );
}
