import React from 'react';
import { Link } from 'react-router-dom';
import { useCompetition } from '../context/CompetitionContext';
import { EmptyState, Spinner } from './ui';
import SiteHeader from '../../../components/site/SiteHeader';

// Khung riêng của khu công khai "Thi đấu" (/thi-dau — plan 27): xem giải / buổi giao lưu của sân, đăng ký online. Cố tình KHÔNG dùng
// CustomerLayout hay SidebarLayout — không có menu bán hàng hay nhân viên. Theo giao diện sáng / tối của app.
//
// Header và thanh tab dưới trên điện thoại là SiteHeader dùng chung với Trang chủ và khung khách (kế hoạch 28): khu này không còn
// header riêng, tên thương hiệu không bị chữ "Thi đấu" thay chỗ, và "Trang chủ" luôn dẫn về trang chủ của cả site ("/") và không
// bao giờ sáng ở đây — các quy tắc đó nay nằm trong components/site/siteNav.js và có test ở đó.
export default function PublicShell({ children, title, subtitle }) {
  const { enabled, loading } = useCompetition();

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 lg:pb-16">
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

      <footer className="border-t border-slate-200 bg-white pb-24 pt-6 dark:border-slate-800 dark:bg-slate-950 lg:py-6">
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
