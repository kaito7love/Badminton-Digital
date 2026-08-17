import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCart } from '../contexts/CartContext';
import { roleOf, isStaff, homePathForRole } from '../utils/roles';

/**
 * Vỏ chung cho mặt tiền dành cho khách: cửa hàng, lịch đặt, tài khoản.
 *
 * Cố tình KHÔNG dùng SidebarLayout — khách không có việc gì với "Quản Lý Sân"
 * hay "Nhân Viên", bày ra chỉ tổ dẫn họ bấm vào rồi lãnh 403. Ngược lại nhân
 * viên lỡ ghé qua đây vẫn có một đường về bàn làm việc của mình.
 */

const NAV_ITEMS = [
  { path: '/', label: 'Trang chủ', icon: '🏠', public: true },
  { path: '/shop', label: 'Cửa hàng', icon: '🛍️', public: true },
  { path: '/cart', label: 'Giỏ hàng', icon: '🛒', public: true },
  { path: '/orders', label: 'Đơn mua', icon: '📦', public: false },
  { path: '/my-bookings', label: 'Lịch đặt', icon: '🎟️', public: false },
  { path: '/account', label: 'Tài khoản', icon: '👤', public: false }
];

const Logo = () => (
  <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-lime-400 p-0.5 group-hover:scale-110 transition-transform">
    <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
      <svg className="w-5 h-5 text-emerald-400" viewBox="0 0 100 100" fill="none">
        <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="8" fill="transparent" />
        <path d="M50 18 L68 45 L50 38 L32 45 Z" fill="#CCFF00" />
        <path d="M50 38 L50 82" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
      </svg>
    </div>
  </div>
);

export default function CustomerLayout({ eyebrow, title, subtitle, action, children }) {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { totalQuantity } = useCart();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isCustomer = roleOf(user) === 'customer';
  const visibleNav = NAV_ITEMS.filter((item) => item.public || isCustomer);
  const isActive = (path) => (path === '/' ? location.pathname === '/' : location.pathname.startsWith(path));
  // Số hàng trong giỏ chỉ gắn lên đúng mục giỏ hàng, và chỉ khi có hàng.
  const badgeFor = (path) => (path === '/cart' && totalQuantity > 0 ? totalQuantity : null);

  return (
    <div className="kinetic-surface nike-grid-bg flex flex-col">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/90 backdrop-blur-2xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-5 sm:px-6">
          <Link to="/" className="group flex items-center gap-3">
            <Logo />
            <div className="whitespace-nowrap font-kinetic text-base font-black uppercase tracking-tighter text-white sm:text-xl">
              BADMINTON <span className="text-gradient-nike">DIGITAL</span>
            </div>
          </Link>

          <nav className="hidden items-center gap-7 font-kinetic text-xs font-bold uppercase tracking-widest lg:flex">
            {visibleNav.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`transition-colors ${isActive(item.path) ? 'text-emerald-400' : 'text-slate-300 hover:text-emerald-400'}`}
              >
                {item.label}
                {badgeFor(item.path) && (
                  <span className="ml-1.5 rounded-full bg-emerald-400 px-1.5 py-0.5 text-[10px] font-black text-slate-950">
                    {badgeFor(item.path)}
                  </span>
                )}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            {user ? (
              <>
                <span className="hidden text-sm text-slate-400 sm:block">
                  Xin chào, <span className="font-bold text-slate-200">{user.fullName}</span>
                </span>
                {isStaff(user) && (
                  <Link
                    to={homePathForRole(user)}
                    className="hidden rounded-xl border border-white/15 px-4 py-2 font-kinetic text-[10px] font-black uppercase tracking-widest text-slate-300 transition hover:border-emerald-500/40 hover:text-emerald-400 sm:inline-block"
                  >
                    Bàn làm việc
                  </Link>
                )}
                <button
                  type="button"
                  onClick={logout}
                  className="whitespace-nowrap rounded-xl bg-slate-800 px-3 py-2 text-xs font-bold text-slate-300 transition hover:bg-slate-700 sm:px-4"
                >
                  Đăng xuất
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className="font-kinetic text-[10px] font-black uppercase tracking-widest text-slate-300 transition-colors hover:text-white sm:text-xs"
                >
                  Đăng nhập
                </Link>
                {/* Bọc ngoài để ẩn: .btn-nike-bolt nạp sau Tailwind nên tự đặt
                    display, class `hidden` gắn thẳng lên nút sẽ không ăn. */}
                <span className="hidden sm:inline-block">
                  <Link to="/register" className="btn-nike-bolt text-xs">
                    Đăng ký
                  </Link>
                </span>
              </>
            )}

            <button
              type="button"
              className="rounded-lg border border-white/20 px-3 py-2 text-xs font-bold text-white lg:hidden"
              onClick={() => setMobileMenuOpen((open) => !open)}
              aria-expanded={mobileMenuOpen}
              aria-controls="customer-mobile-nav"
              aria-label="Mở menu điều hướng"
            >
              ☰
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <nav
            id="customer-mobile-nav"
            aria-label="Điều hướng"
            className="grid grid-cols-2 gap-3 border-t border-white/10 bg-slate-950/95 px-5 py-4 font-kinetic text-xs font-bold uppercase tracking-widest lg:hidden"
          >
            {visibleNav.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                className={`transition-colors ${isActive(item.path) ? 'text-emerald-400' : 'text-slate-300 hover:text-emerald-400'}`}
              >
                {item.icon} {item.label}
                {badgeFor(item.path) ? ` (${badgeFor(item.path)})` : ''}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <main className="relative z-10 mx-auto w-full max-w-7xl flex-1 px-5 pb-28 pt-10 sm:px-6 lg:pb-20">
        {(title || eyebrow) && (
          <div className="mb-10 flex flex-wrap items-end justify-between gap-5">
            <div>
              {eyebrow && <div className="live-ticker mb-4">{eyebrow}</div>}
              {title && (
                <h1 className="font-kinetic text-4xl font-black uppercase tracking-tighter text-white sm:text-5xl">
                  {title}
                </h1>
              )}
              {subtitle && <p className="mt-3 max-w-2xl text-slate-400">{subtitle}</p>}
            </div>
            {action}
          </div>
        )}

        {children}
      </main>

      {/* Thanh điều hướng đáy trên mobile — cùng lối với bàn làm việc nhân viên */}
      <nav
        aria-label="Điều hướng nhanh"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-slate-950/95 backdrop-blur-xl lg:hidden"
      >
        <div className="mx-auto flex max-w-md items-center justify-around px-3 py-2.5">
          {visibleNav.slice(0, 5).map((item) => (
            <Link key={item.path} to={item.path} className="flex flex-col items-center gap-1 text-center">
              <span
                className={`relative inline-flex h-9 w-9 items-center justify-center rounded-xl text-base ${
                  isActive(item.path) ? 'bg-emerald-500' : 'bg-slate-900'
                }`}
              >
                {item.icon}
                {badgeFor(item.path) && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white">
                    {badgeFor(item.path)}
                  </span>
                )}
              </span>
              <span
                className={`text-[10px] font-bold ${isActive(item.path) ? 'text-emerald-400' : 'text-slate-500'}`}
              >
                {item.label}
              </span>
            </Link>
          ))}
        </div>
      </nav>

      <footer className="relative z-10 border-t border-white/10 bg-slate-950 py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 text-center sm:px-6 md:flex-row md:text-left">
          <div className="font-kinetic text-lg font-black uppercase text-white">
            BADMINTON <span className="text-gradient-nike">DIGITAL</span>
          </div>
          <p className="font-kinetic text-[10px] font-bold uppercase tracking-widest text-slate-500">
            © 2026 BADMINTON DIGITAL // NIKE KINETIC EDITION
          </p>
        </div>
      </footer>
    </div>
  );
}
