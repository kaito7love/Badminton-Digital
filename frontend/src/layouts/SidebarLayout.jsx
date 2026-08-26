import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useBranch } from '../contexts/BranchContext';
import { MoonIcon, SunIcon, ChartBarIcon, HomeIcon, TicketIcon, ClipboardListIcon, UserGroupIcon, BuildingOfficeIcon, FileChartBarIcon, Cog6ToothIcon, HistoryIcon, ShoppingBagIcon, ClipboardCheckIcon, MapIcon } from './icons';
import { roleOf } from '../utils/roles';
import ErrorBoundary from '../components/ErrorBoundary';
import { scheduleAdminPrefetch } from '../routes/adminPrefetch';

// Fallback cho lúc chờ tải chunk của 1 trang admin — chỉ thay vùng nội dung
// (đặt trong Suspense bọc riêng <Outlet/>), sidebar/header ở ngoài boundary
// nên không biến mất theo. Dùng đúng convention loading text + animate-pulse
// đã có sẵn khắp các trang (vd DashboardPage.jsx, CourtsPage.jsx).
const RouteLoadingFallback = () => (
  <div className="p-8 text-slate-500 dark:text-slate-400 font-semibold animate-pulse">
    ⏳ Đang tải trang...
  </div>
);

const COLLAPSE_KEY = 'admin_sidebar_collapsed';

// `roles` bỏ trống = mọi nhân sự đều thấy. Những mục chỉ admin mới gọi được API
// thì cũng chỉ hiện với admin — bày ra một đường dẫn chắc chắn trả 403 là mời
// người ta bấm vào chỗ hỏng. Nhóm theo đúng chức năng thật, không phải để
// trang trí — 11 mục xếp phẳng thì không ai lướt nổi.
const NAV_GROUPS = [
  {
    label: 'Tổng quan',
    items: [{ path: '/dashboard', label: 'Dashboard', icon: HomeIcon, roles: ['admin', 'branch_manager'] }],
  },
  {
    label: 'Vận hành',
    items: [
      { path: '/courts', label: 'Quản Lý Sân', icon: BuildingOfficeIcon },
      { path: '/courts/layout', label: 'Sơ Đồ Mặt Bằng', icon: MapIcon, roles: ['admin', 'branch_manager'] },
      { path: '/bookings', label: 'Đặt Sân', icon: TicketIcon },
      { path: '/accessories', label: 'Dịch Vụ & Kho', icon: ClipboardListIcon },
      { path: '/retail', label: 'Bán Lẻ', icon: ShoppingBagIcon },
      { path: '/customers', label: 'Khách Hàng', icon: UserGroupIcon },
    ],
  },
  {
    label: 'Quản lý',
    items: [
      { path: '/employees', label: 'Nhân Viên', icon: ChartBarIcon, roles: ['admin', 'branch_manager'] },
      { path: '/reports', label: 'Báo Cáo', icon: FileChartBarIcon, roles: ['admin', 'branch_manager'] },
      { path: '/history', label: 'Lịch Sử', icon: HistoryIcon },
      { path: '/activity-log', label: 'Nhật Ký Hoạt Động', icon: ClipboardCheckIcon, roles: ['admin', 'branch_manager'] },
    ],
  },
  {
    label: 'Hệ thống',
    items: [{ path: '/settings', label: 'Cài Đặt', icon: Cog6ToothIcon, roles: ['admin'] }],
  },
];

const MOBILE_QUICK_ACCESS_COUNT = 4;

/**
 * 1 mục nav — dùng chung cho sidebar mở rộng/sheet mobile ('full'), rail thu
 * gọn ('rail') và bottom-nav mobile ('bottom'), tránh lặp lại y hệt JSX
 * icon/label/active-state ở nhiều chỗ như trước.
 */
function NavLink({ item, active, variant = 'full', onNavigate }) {
  const Icon = item.icon;
  const iconBox = (
    <span
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition ${
        active
          ? 'bg-emerald-500 text-slate-950 font-bold'
          : 'bg-slate-100 text-slate-500 group-hover:text-slate-900 group-hover:bg-slate-200 dark:bg-slate-900/90 dark:text-slate-400 dark:group-hover:text-white dark:group-hover:bg-slate-800'
      }`}
    >
      <Icon className="h-4 w-4" />
    </span>
  );

  if (variant === 'bottom') {
    return (
      <Link to={item.path} onClick={onNavigate} className="flex flex-col items-center gap-1 text-center text-[10px] font-semibold">
        {iconBox}
        <span className={active ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-slate-500 dark:text-slate-400'}>
          {item.label}
        </span>
      </Link>
    );
  }

  const rail = variant === 'rail';
  return (
    <Link
      to={item.path}
      onClick={onNavigate}
      title={rail ? item.label : undefined}
      className={`group flex items-center gap-3.5 rounded-2xl px-4 py-3.5 text-sm font-semibold transition-all ${
        rail ? 'justify-center px-0' : ''
      } ${
        active
          ? 'bg-gradient-to-r from-emerald-500/20 to-emerald-500/5 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 shadow-lg shadow-emerald-500/10'
          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900/80 dark:hover:text-white border border-transparent'
      }`}
    >
      {iconBox}
      {!rail && item.label}
    </Link>
  );
}

export default function SidebarLayout() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { isAdmin: canSwitchBranch, branches, selectedBranchId, selectBranch } = useBranch() || {};
  const role = roleOf(user);

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, String(next));
      } catch {
        // localStorage có thể bị chặn (chế độ ẩn danh) — không đáng để vỡ UI vì việc này
      }
      return next;
    });
  };

  // Lọc theo role 1 lần, dùng lại cho cả sidebar desktop lẫn sheet mobile —
  // nhóm nào không còn mục nào sau khi lọc thì bỏ hẳn tiêu đề nhóm, tránh
  // hiện 1 dòng tiêu đề trơ trọi không có gì bên dưới.
  const visibleGroups = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => !item.roles || item.roles.includes(role)),
      })).filter((group) => group.items.length > 0),
    [role],
  );
  const visibleFlatItems = useMemo(() => visibleGroups.flatMap((g) => g.items), [visibleGroups]);
  const mobileQuickItems = visibleFlatItems.slice(0, MOBILE_QUICK_ACCESS_COUNT);
  const mobileOverflowCount = visibleFlatItems.length - mobileQuickItems.length;

  // SidebarLayout giờ là route cha (nested route + Outlet) nên chỉ mount 1
  // lần cho cả phiên làm việc trong khu vực admin, không mount lại mỗi lần
  // chuyển trang — đúng thời điểm để bắt đầu prefetch nền các trang hay dùng.
  useEffect(() => {
    const cancel = scheduleAdminPrefetch();
    return cancel;
  }, []);

  // Sheet mobile đang mở mà user bấm 1 link admin khác trên desktop (đổi
  // kích thước cửa sổ, hiếm nhưng có thể) thì không để sheet kẹt lại mở.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  const accountBlock = (
    <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800/80 dark:bg-slate-900/80 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="truncate">
          <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400 dark:text-slate-500">Tài khoản</p>
          <p className="mt-0.5 text-sm font-bold text-slate-900 dark:text-white truncate">
            {user?.fullName || user?.full_name || user?.username || user?.name || 'Admin User'}
          </p>
        </div>
        <button
          type="button"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Chuyển giao diện sáng' : 'Chuyển giao diện tối'}
          className="rounded-xl border border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 p-2 transition hover:border-emerald-500/40"
        >
          {theme === 'dark' ? <SunIcon className="h-4 w-4 text-amber-400" /> : <MoonIcon className="h-4 w-4 text-emerald-400" />}
        </button>
      </div>
    </div>
  );

  const logoutButton = (
    <button
      onClick={logout}
      className="w-full rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-center text-xs font-bold text-rose-600 dark:text-rose-400 transition hover:bg-rose-500/20 hover:border-rose-500/40"
    >
      Đăng Xuất
    </button>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#070A11] dark:text-slate-100 font-sans selection:bg-emerald-500 selection:text-slate-950">

      {/* Ambient background glows matching Homepage */}
      <div className="fixed top-0 left-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none z-0 opacity-0 dark:opacity-100"></div>
      <div className="fixed bottom-0 right-0 w-96 h-96 bg-lime-500/10 rounded-full blur-[120px] pointer-events-none z-0 opacity-0 dark:opacity-100"></div>

      {/* h-screen (không phải min-h-screen) là bắt buộc ở đây: aside/main bên
          dưới dùng overflow-y-auto để tự cuộn riêng, nhưng overflow-y-auto
          chỉ có tác dụng khi ancestor bị CHẶN chiều cao thật sự — min-h-screen
          chỉ đặt chiều cao tối thiểu, nội dung dư vẫn đẩy cả trang cao thêm
          thay vì cuộn bên trong, nên danh sách nav dài (11 mục) sẽ đè lên
          khối tài khoản/đăng xuất phía dưới trên màn hình thấp. */}
      <div className="relative z-10 flex h-screen max-w-[1700px] mx-auto overflow-hidden">

        {/* SIDEBAR NAVIGATION */}
        <aside
          className={`hidden md:flex shrink-0 flex-col border-r border-slate-200 bg-white/80 dark:border-slate-800/80 dark:bg-slate-950/70 backdrop-blur-2xl p-6 transition-[width] duration-200 ${
            collapsed ? 'w-24 px-3' : 'w-72'
          }`}
        >
          <div className={`flex items-center pb-8 pt-2 ${collapsed ? 'justify-center' : 'justify-between'}`}>
            <Link to="/" className="flex items-center gap-3 group" title={collapsed ? 'Badminton Digital Admin' : undefined}>
              <div className="w-10 h-10 shrink-0 rounded-2xl bg-gradient-to-tr from-emerald-500 to-lime-400 p-0.5 group-hover:scale-105 transition-transform">
                <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                  <svg className="w-5 h-5 text-emerald-400" viewBox="0 0 100 100" fill="none">
                    <circle cx="50" cy="50" r="45" stroke="currentColor" strokeWidth="8" fill="transparent"/>
                    <path d="M50 18 L68 45 L50 38 L32 45 Z" fill="#CCFF00"/>
                    <path d="M50 38 L50 82" stroke="currentColor" strokeWidth="8" strokeLinecap="round"/>
                  </svg>
                </div>
              </div>
              {!collapsed && (
                <div>
                  <p className="text-[10px] uppercase font-black tracking-widest text-slate-500 dark:text-slate-400">Badminton</p>
                  <h1 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">Digital <span className="text-emerald-600 dark:text-emerald-400">Admin</span></h1>
                </div>
              )}
            </Link>
            {!collapsed && (
              <button
                type="button"
                onClick={toggleCollapsed}
                title="Thu gọn sidebar"
                className="shrink-0 rounded-xl border border-slate-200 dark:border-slate-800 p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900 transition"
              >
                <span className="block h-4 w-4 text-center leading-4">◀</span>
              </button>
            )}
          </div>
          {collapsed && (
            <button
              type="button"
              onClick={toggleCollapsed}
              title="Mở rộng sidebar"
              className="mb-6 self-center rounded-xl border border-slate-200 dark:border-slate-800 p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900 transition"
            >
              <span className="block h-4 w-4 text-center leading-4">▶</span>
            </button>
          )}

          <div className="sidebar-scroll flex-1 min-h-0 overflow-y-auto space-y-5 -mx-1 px-1">
            {visibleGroups.map((group) => (
              <div key={group.label} className="space-y-1.5">
                {!collapsed && (
                  <p className="px-4 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-600">
                    {group.label}
                  </p>
                )}
                {group.items.map((item) => (
                  <NavLink key={item.path} item={item} active={location.pathname === item.path} variant={collapsed ? 'rail' : 'full'} />
                ))}
              </div>
            ))}
          </div>

          <div className="mt-auto space-y-4 border-t border-slate-200 dark:border-slate-800/80 pt-6">
            {!collapsed && (
              <Link to="/" className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800/80 dark:bg-slate-900/60 p-3.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:border-emerald-500/40 transition">
                <span>🌐 Xem Trang Chủ Landing</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">➔</span>
              </Link>
            )}

            {collapsed ? (
              <div className="flex justify-center">
                <button
                  onClick={logout}
                  title="Đăng xuất"
                  className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-2.5 text-rose-600 dark:text-rose-400 transition hover:bg-rose-500/20 hover:border-rose-500/40"
                >
                  ⏻
                </button>
              </div>
            ) : (
              logoutButton
            )}
          </div>
        </aside>

        {/* MAIN CONTENT AREA */}
        <main className="content-scroll flex-1 min-w-0 overflow-y-auto p-6 pb-24 md:pb-10 md:p-10">
          {/* Chi nhánh + tài khoản dời từ chân sidebar lên đây — góc trên
              bên phải luôn thấy được bất kể sidebar đang thu gọn hay không,
              không còn chiếm chỗ của danh sách nav. Chỉ hiện ở desktop, mobile
              đã có 2 mục này trong bottom sheet riêng. */}
          <div className="mb-6 hidden md:flex flex-wrap items-center justify-end gap-3">
            {canSwitchBranch && branches?.length > 0 && (
              <div className="flex items-center gap-2 rounded-2xl border border-sky-500/30 bg-sky-500/10 px-3.5 py-2">
                <span className="text-xs">🏬</span>
                <select
                  value={selectedBranchId || ''}
                  onChange={(e) => selectBranch(Number(e.target.value))}
                  className="bg-transparent text-xs font-semibold text-sky-700 dark:text-sky-200 focus:outline-none"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id} className="text-slate-900">{b.name}</option>
                  ))}
                </select>
              </div>
            )}
            {accountBlock}
          </div>
          <ErrorBoundary fullScreen={false}>
            <Suspense fallback={<RouteLoadingFallback />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>

      {/* MOBILE BOTTOM NAV BAR — chỉ vài mục hay dùng nhất + nút "Thêm" mở
          sheet đầy đủ, vì cắt cứng slice(0,5) trước đây khiến admin/branch_
          manager không có cách nào chạm tới 6+ trang còn lại trên mobile. */}
      <div className="fixed inset-x-0 bottom-0 z-40 block md:hidden border-t border-slate-200 bg-white/95 dark:border-slate-800/90 dark:bg-slate-950/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-md items-center justify-around px-4 py-2.5">
          {mobileQuickItems.map((item) => (
            <NavLink key={item.path} item={item} active={location.pathname === item.path} variant="bottom" />
          ))}
          {mobileOverflowCount > 0 && (
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="flex flex-col items-center gap-1 text-center text-[10px] font-semibold text-slate-500 dark:text-slate-400"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-900">☰</span>
              Thêm
            </button>
          )}
        </div>
      </div>

      {/* MOBILE FULL NAV SHEET */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 flex items-end md:hidden">
          <div
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="relative w-full max-h-[80vh] overflow-y-auto rounded-t-3xl border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 p-6 pb-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Menu</h2>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-900"
              >
                ✕
              </button>
            </div>

            <div className="space-y-5">
              {visibleGroups.map((group) => (
                <div key={group.label} className="space-y-1.5">
                  <p className="px-4 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-600">
                    {group.label}
                  </p>
                  {group.items.map((item) => (
                    <NavLink
                      key={item.path}
                      item={item}
                      active={location.pathname === item.path}
                      variant="full"
                      onNavigate={() => setMobileNavOpen(false)}
                    />
                  ))}
                </div>
              ))}
            </div>

            <div className="mt-6 space-y-3 border-t border-slate-200 dark:border-slate-800 pt-6">
              {accountBlock}
              {logoutButton}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
