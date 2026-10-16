import React from 'react';
import { formatVnd } from '../../../utils/shop';
import { dayLabel } from '../lib/dayStrip';
import { courtTitle } from '../lib/gridModel';
import Portal from './Portal';

/**
 * Thanh tóm tắt dính đáy: sân, khung giờ, tạm tính và nút đặt.
 *
 * Dưới 1024 px (có thanh tab dưới của header, cao 64 px) thanh nằm cố định ngay
 * trên thanh tab; từ 1024 px trở lên nó dính đáy khung nhìn trong cột nội dung.
 */
export default function SummaryBar({ summary, date, role, onBook, portal = false }) {
  // Dưới lg thanh `fixed` phải ra khỏi <main> (xem Portal); từ lg nó dính trong luồng nên ở lại.
  const wrap = (node) => (portal ? <Portal>{node}</Portal> : node);
  const shell =
    // Dưới lg: hai cột (tên | giá) rồi nút full hàng, chừa chỗ bên phải cho nút ↑ của header.
    'fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] z-30 mx-auto grid max-w-4xl grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 ' +
    'rounded-2xl border border-slate-300 bg-white/95 py-3 pl-4 pr-[4.5rem] shadow-xl backdrop-blur ' +
    'dark:border-white/15 dark:bg-slate-900/95 sm:pr-4 ' +
    'lg:sticky lg:inset-x-auto lg:bottom-4 lg:mt-5 lg:flex lg:max-w-none lg:flex-wrap lg:justify-between lg:gap-x-6 lg:p-4';

  if (!summary) {
    return wrap(
      <div className={shell} data-testid="summary-bar">
        <div className="min-w-0">
          <strong className="block font-kinetic text-base font-black text-slate-900 dark:text-white">Chưa chọn khung giờ</strong>
          <span className="text-xs text-slate-600 dark:text-slate-400">Chạm một ô trống trong lưới</span>
        </div>
        <button
          type="button"
          disabled
          className="rounded-full bg-slate-200 px-6 py-3 font-kinetic text-xs font-black uppercase tracking-wider text-slate-500 dark:bg-white/10 dark:text-slate-500"
        >
          Đặt sân
        </button>
      </div>
    );
  }

  const parts = [];
  if (summary.offpeakHours) parts.push(`${summary.offpeakHours} giờ thường`);
  if (summary.peakHours) parts.push(`${summary.peakHours} giờ cao điểm`);

  return wrap(
    <div className={shell} data-testid="summary-bar">
      <div className="min-w-0">
        {/* Khung giờ lên đầu: đó là thứ khách cần thấy nguyên vẹn, nên không để bị cắt ở màn hẹp. */}
        <strong className="block font-kinetic text-base font-black text-slate-900 dark:text-white">{summary.label}</strong>
        <span className="block line-clamp-2 text-xs text-slate-600 dark:text-slate-400">
          {courtTitle({ name: summary.courtName }).title} · {dayLabel(date)} · {summary.hours} giờ
        </span>
      </div>
      <div className="text-right">
        <b className="block font-kinetic text-xl font-black text-slate-900 dark:text-white">{formatVnd(summary.total)}</b>
        <span className="text-xs text-slate-600 dark:text-slate-400">{parts.join(' + ')} · tạm tính</span>
      </div>
      <button
        type="button"
        onClick={onBook}
        className="col-span-2 w-full rounded-full bg-gradient-to-br from-emerald-600 to-lime-600 px-6 py-3 font-kinetic text-xs font-black uppercase tracking-wider text-white shadow-md hover:brightness-110 dark:from-emerald-400 dark:to-lime-300 dark:text-slate-950 lg:col-auto lg:w-auto"
      >
        {role === 'guest' ? 'Đăng nhập để đặt' : 'Đặt sân'}
      </button>
    </div>
  );
}
