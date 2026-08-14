import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { MoonIcon, SunIcon, ChartBarIcon, HomeIcon, TicketIcon, ClipboardListIcon, UserGroupIcon, BuildingOfficeIcon, FileChartBarIcon, Cog6ToothIcon, HistoryIcon } from './icons';
import { roleOf } from '../utils/roles';

// `roles` bỏ trống = mọi nhân sự đều thấy. Những mục chỉ admin mới gọi được API
// thì cũng chỉ hiện với admin — bày ra một đường dẫn chắc chắn trả 403 là mời
// người ta bấm vào chỗ hỏng.
const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: HomeIcon, roles: ['admin'] },
  { path: '/courts', label: 'Quản Lý Sân', icon: BuildingOfficeIcon },
  { path: '/bookings', label: 'Đặt Sân', icon: TicketIcon },
  { path: '/accessories', label: 'Dịch Vụ & Kho', icon: ClipboardListIcon },
  { path: '/customers', label: 'Khách Hàng', icon: UserGroupIcon },
  { path: '/employees', label: 'Nhân Viên', icon: ChartBarIcon, roles: ['admin'] },
  { path: '/history', label: 'Lịch Sử', icon: HistoryIcon },
  { path: '/reports', label: 'Báo Cáo', icon: FileChartBarIcon, roles: ['admin'] },
  { path: '/settings', label: 'Cài Đặt', icon: Cog6ToothIcon, roles: ['admin'] }
];

export default function SidebarLayout({ children }) {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const role = roleOf(user);
  const visibleNavItems = navItems.filter((item) => !item.roles || item.roles.includes(role));

  return (
    <div className="min-h-screen bg-[#070A11] text-slate-100 font-sans selection:bg-emerald-500 selection:text-slate-950">
      
      {/* Ambient background glows matching Homepage */}
      <div className="fixed top-0 left-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none z-0"></div>
      <div className="fixed bottom-0 right-0 w-96 h-96 bg-lime-500/10 rounded-full blur-[120px] pointer-events-none z-0"></div>

      <div className="relative z-10 flex min-h-screen max-w-[1700px] mx-auto overflow-hidden">
        
        {/* SIDEBAR NAVIGATION */}
        <aside className="hidden md:flex w-72 flex-col border-r border-slate-800/80 bg-slate-950/70 backdrop-blur-2xl p-6">
          <Link to="/" className="flex items-center gap-3 pb-8 pt-2 group">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-lime-400 p-0.5 group-hover:scale-105 transition-transform">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-400" viewBox="0 0 100 100" fill="none">
                  <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="8" fill="transparent"/>
                  <path d="M50 18 L68 45 L50 38 L32 45 Z" fill="#CCFF00"/>
                  <path d="M50 38 L50 82" stroke="currentColor" strokeWidth="8" strokeLinecap="round"/>
                </svg>
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase font-black tracking-widest text-slate-400">Badminton</p>
              <h1 className="text-lg font-black text-white tracking-tight">Digital <span className="text-emerald-400">Admin</span></h1>
            </div>
          </Link>

          <div className="space-y-1.5 flex-1">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const active = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`group flex items-center gap-3.5 rounded-2xl px-4 py-3.5 text-sm font-semibold transition-all ${
                    active 
                      ? 'bg-gradient-to-r from-emerald-500/20 to-emerald-500/5 text-emerald-300 border border-emerald-500/30 shadow-lg shadow-emerald-500/10' 
                      : 'text-slate-400 hover:bg-slate-900/80 hover:text-white border border-transparent'
                  }`}
                >
                  <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl transition ${
                    active ? 'bg-emerald-500 text-slate-950 font-bold' : 'bg-slate-900/90 text-slate-400 group-hover:text-white group-hover:bg-slate-800'
                  }`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </div>

          <div className="mt-auto space-y-4 border-t border-slate-800/80 pt-6">
            <Link to="/" className="flex items-center justify-between rounded-2xl border border-slate-800/80 bg-slate-900/60 p-3.5 text-xs font-semibold text-slate-300 hover:border-emerald-500/40 transition">
              <span>🌐 Xem Trang Chủ Landing</span>
              <span className="text-emerald-400 font-bold">➔</span>
            </Link>

            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/80 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="truncate">
                  <p className="text-[10px] uppercase font-bold tracking-widest text-slate-500">Tài khoản</p>
                  <p className="mt-0.5 text-sm font-bold text-white truncate">{user?.fullName || user?.full_name || user?.username || user?.name || 'Admin User'}</p>
                </div>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="rounded-xl border border-slate-800 bg-slate-950 p-2 text-slate-300 transition hover:border-emerald-500/40"
                >
                  {theme === 'dark' ? <SunIcon className="h-4 w-4 text-amber-400" /> : <MoonIcon className="h-4 w-4 text-emerald-400" />}
                </button>
              </div>
            </div>

            <button
              onClick={logout}
              className="w-full rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-center text-xs font-bold text-rose-400 transition hover:bg-rose-500/20 hover:border-rose-500/40"
            >
              Đăng Xuất
            </button>
          </div>
        </aside>

        {/* MAIN CONTENT AREA */}
        <main className="flex-1 overflow-y-auto p-6 md:p-10">
          {children}
        </main>
      </div>

      {/* MOBILE BOTTOM NAV BAR */}
      <div className="fixed inset-x-0 bottom-0 z-40 block md:hidden border-t border-slate-800/90 bg-slate-950/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-md items-center justify-around px-4 py-2.5">
          {visibleNavItems.slice(0, 5).map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.path;
            return (
              <Link key={item.path} to={item.path} className="flex flex-col items-center gap-1 text-center text-[10px] font-semibold transition">
                <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${active ? 'bg-emerald-500 text-slate-950' : 'bg-slate-900 text-slate-400'}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className={active ? 'text-emerald-400 font-bold' : 'text-slate-500'}>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

    </div>
  );
}
