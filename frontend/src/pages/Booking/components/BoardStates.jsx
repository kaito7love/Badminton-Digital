import React from 'react';

const buttonClass =
  'rounded-full bg-gradient-to-br from-emerald-600 to-lime-600 px-6 py-3 font-kinetic text-xs font-black uppercase tracking-wider text-white shadow-md hover:brightness-110 dark:from-emerald-400 dark:to-lime-300 dark:text-slate-950';

function StateCard({ title, children, action }) {
  return (
    <div className="grid justify-items-center gap-3 px-4 py-12 text-center">
      <h3 className="font-kinetic text-xl font-black uppercase text-slate-900 dark:text-white">{title}</h3>
      <p className="max-w-md text-sm text-slate-600 dark:text-slate-400">{children}</p>
      {action}
    </div>
  );
}

/** Khung chờ: cùng số hàng với một chi nhánh 4 sân để trang không nhảy khi dữ liệu về. */
export function LoadingBoard() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-2 py-2">
      <span className="sr-only">Đang tải lịch sân…</span>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-11 animate-pulse rounded-lg bg-slate-200 dark:bg-white/10" />
      ))}
    </div>
  );
}

export function ErrorBoard({ message, onRetry }) {
  return (
    <StateCard
      title="Chưa tải được lịch sân"
      action={
        <button type="button" onClick={onRetry} className={buttonClass}>
          Thử lại
        </button>
      }
    >
      {message}
    </StateCard>
  );
}

/** Hôm nay: khung cuối cùng đã bắt đầu. */
export function OverBoard({ onNextDay }) {
  return (
    <StateCard
      title="Hôm nay đã hết giờ nhận đặt"
      action={
        onNextDay && (
          <button type="button" onClick={onNextDay} className={buttonClass}>
            Xem ngày mai
          </button>
        )
      }
    >
      Khung giờ cuối cùng của hôm nay đã bắt đầu. Chọn ngày khác để xem sân trống.
    </StateCard>
  );
}

export function NoCourtsBoard() {
  return (
    <StateCard title="Chi nhánh này chưa có sân nhận đặt">
      Hiện chưa có sân nào đang mở đặt ở chi nhánh này. Bạn chọn chi nhánh khác nhé.
    </StateCard>
  );
}
