import React from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { useTheme } from '../../../contexts/ThemeContext';
import { homePathForRole, isStaff, roleOf } from '../../../utils/roles';
import { useCompetition } from '../context/CompetitionContext';
import { hubPaths } from '../lib/publicHub';
import { EmptyState, Spinner } from './ui';
import BrandMark from '../../../components/BrandMark';

// Khung riêng của khu công khai "Thi đấu" (/thi-dau — plan 27): xem giải / buổi giao lưu của sân, đăng ký online. Cố tình KHÔNG dùng
// CustomerLayout hay SidebarLayout — không có menu bán hàng hay nhân viên, chỉ những gì khách của giải cần. Theo giao diện sáng / tối của app.

const LOGO = (
  <div className="h-10 w-10 shrink-0 rounded-2xl bg-gradient-to-tr from-emerald-500 to-lime-400 p-0.5">
    <div className="flex h-full w-full items-center justify-center rounded-[14px] bg-slate-950">
      <BrandMark className="h-5 w-5 text-emerald-400" />
    </div>
  </div>
);

const navClass = ({ isActive }) =>
  `whitespace-nowrap rounded-xl px-3 py-2 text-sm font-bold transition ${
    isActive
      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
  }`;

// "Trang chủ" là trang chủ của CẢ site (/), không phải trang chủ của khu Thi đấu — nên ở đây nó không bao giờ sáng. Trang tổng quan
// của khu này tên là "Thi đấu" (/thi-dau). Trước đây mục đầu tiên vừa tên "Trang chủ" vừa trỏ về /thi-dau: người dùng đang ở Thi đấu
// thấy "Trang chủ" sáng, còn bấm vào thì không ra trang chủ thật.
// Export riêng để test được thứ tự / trạng thái sáng của từng mục mà không phải dựng AuthContext.
export function NavItems({ isCustomer, onNavigate }) {
  const { pathname } = useLocation();
  // Hai mục dưới là mốc (#giai / #giao-luu) trên trang tổng quan nên NavLink không tự so được; chỉ sáng khi đang ở trang chi tiết tương ứng.
  const inTournament = pathname.startsWith(`${hubPaths.home}/giai/`);
  const inSession = pathname.startsWith(`${hubPaths.home}/giao-luu/`);
  return (
    <>
      <Link to="/" className={navClass({ isActive: false })} onClick={onNavigate}>Trang chủ</Link>
      <NavLink to={hubPaths.home} end className={navClass} onClick={onNavigate}>Thi đấu</NavLink>
      <Link to={`${hubPaths.home}#giai`} className={navClass({ isActive: inTournament })} onClick={onNavigate}>Giải đấu</Link>
      <Link to={`${hubPaths.home}#giao-luu`} className={navClass({ isActive: inSession })} onClick={onNavigate}>Giao lưu</Link>
      <NavLink to="/rankings" className={navClass} onClick={onNavigate}>Xếp hạng</NavLink>
      {isCustomer && <NavLink to="/my-tournaments" className={navClass} onClick={onNavigate}>Giải của tôi</NavLink>}
    </>
  );
}

export default function PublicShell({ children, title, subtitle }) {
  const { user, logout } = useAuth();
  const themeCtx = useTheme();
  const location = useLocation();
  const { enabled, loading } = useCompetition();
  const role = roleOf(user);
  const isCustomer = role === 'customer';
  const dark = themeCtx ? themeCtx.theme === 'dark' : true;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <Link to={hubPaths.home} className="flex items-center gap-3" aria-label="Thi đấu — trang chủ">
            {LOGO}
            <div className="leading-tight">
              <div className="text-base font-black uppercase tracking-tight text-slate-900 dark:text-white">Thi đấu</div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Badminton Digital</div>
            </div>
          </Link>
          <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Điều hướng chính">
            <NavItems isCustomer={isCustomer} />
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {themeCtx && (
              <button
                type="button"
                onClick={themeCtx.toggleTheme}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                aria-label={dark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
                title={dark ? 'Giao diện sáng' : 'Giao diện tối'}
              >
                {dark ? '☀️' : '🌙'}
              </button>
            )}
            {user ? (
              <>
                <span className="hidden max-w-[10rem] truncate text-sm font-semibold text-slate-600 dark:text-slate-300 lg:block">{user.fullName}</span>
                {isStaff(user) && (
                  <Link to={homePathForRole(user)} className="hidden rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800 sm:block">Bàn làm việc</Link>
                )}
                <button type="button" onClick={logout} className="rounded-xl bg-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">Đăng xuất</button>
              </>
            ) : (
              <>
                <Link to="/login" state={{ from: { pathname: location.pathname } }} className="rounded-xl px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">Đăng nhập</Link>
                <Link to="/register" state={{ from: { pathname: location.pathname } }} className="hidden rounded-xl bg-emerald-500 px-4 py-2 text-sm font-black text-slate-950 hover:bg-emerald-400 sm:block">Đăng ký</Link>
              </>
            )}
          </div>
        </div>
        {/* Điện thoại: menu cuộn ngang ngay dưới thanh trên */}
        <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-3 py-2 dark:border-slate-800/70 md:hidden" aria-label="Điều hướng nhanh">
          <NavItems isCustomer={isCustomer} />
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16 pt-6">
        {(title || subtitle) && (
          <div className="mb-5">
            {title && <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white sm:text-3xl">{title}</h1>}
            {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
          </div>
        )}
        {loading && <Spinner label="Đang kiểm tra tính năng thi đấu…" />}
        {!loading && !enabled && (
          <EmptyState title="Tính năng thi đấu chưa được bật">
            Hệ thống chưa cấu hình dịch vụ thi đấu. Các phần khác của app vẫn dùng bình thường.
          </EmptyState>
        )}
        {!loading && enabled && children}
      </main>

      <footer className="border-t border-slate-200 bg-white py-6 dark:border-slate-800 dark:bg-slate-950">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-center text-xs text-slate-500 dark:text-slate-400 sm:flex-row sm:text-left">
          <p>© 2026 Badminton Digital — Giải đấu &amp; giao lưu cầu lông của sân.</p>
          <div className="flex flex-wrap items-center justify-center gap-4 font-semibold">
            <Link to="/" className="hover:text-emerald-600 dark:hover:text-emerald-400">Trang chủ Badminton Digital</Link>
            <Link to="/rankings" className="hover:text-emerald-600 dark:hover:text-emerald-400">Bảng xếp hạng</Link>
            <Link to="/my-bookings" className="hover:text-emerald-600 dark:hover:text-emerald-400">Đặt sân</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
