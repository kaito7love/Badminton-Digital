import React from 'react';
import { Badge } from '../../../components/UIComponents';
import { MATCH_STATUS, SESSION_STATUS, TOURNAMENT_STATUS } from '../lib/labels';
import { teamText } from '../lib/format';

// Thành phần giao diện dùng chung của tính năng thi đấu (màn hình nhân viên: hệ Tailwind sáng / tối của SidebarLayout).

export const Spinner = ({ label = 'Đang tải…' }) => (
  <div className="flex items-center gap-3 p-6 text-sm font-semibold text-slate-500 dark:text-slate-400" role="status">
    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" aria-hidden="true" />
    {label}
  </div>
);

const NOTICE_STYLES = {
  error: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  warn: 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200',
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-200',
  ok: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
};

/** Thông báo trong trang. `error` nhận CompetitionError (hiện câu dễ hiểu, mã lỗi nhỏ phía sau). */
export function Notice({ kind = 'info', error, children, onRetry, onClose }) {
  const tone = error ? 'error' : kind;
  return (
    <div className={`flex flex-wrap items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${NOTICE_STYLES[tone]}`} role={tone === 'error' ? 'alert' : 'status'}>
      <div className="min-w-0 flex-1">
        {error ? error.message : children}
        {error?.code && !['NETWORK', 'CANCELED'].includes(error.code) && <span className="ml-2 text-[10px] opacity-60">{error.code}</span>}
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="rounded-lg border border-current px-3 py-1 text-xs font-bold hover:opacity-80">Thử lại</button>
      )}
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Đóng" className="text-xs font-bold opacity-70 hover:opacity-100">✕</button>
      )}
    </div>
  );
}

export const EmptyState = ({ title, children }) => (
  <div className="rounded-3xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
    {title && <p className="mb-1 font-bold text-slate-700 dark:text-slate-200">{title}</p>}
    {children}
  </div>
);

export const Card = ({ title, actions, children, className = '' }) => (
  <section className={`rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 ${className}`}>
    {(title || actions) && (
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        {title && <h3 className="text-base font-bold text-slate-900 dark:text-white">{title}</h3>}
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    )}
    {children}
  </section>
);

export const PageHeader = ({ title, subtitle, actions }) => (
  <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
    <div className="min-w-0">
      <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </header>
);

const STATUS_MAPS = { tournament: TOURNAMENT_STATUS, match: MATCH_STATUS, session: SESSION_STATUS };

/** Huy hiệu trạng thái giải / trận / buổi. */
export const StatusBadge = ({ status, kind = 'tournament' }) => {
  const [label, variant] = (STATUS_MAPS[kind] || {})[status] || [status, 'slate'];
  return <Badge variant={variant}>{label}</Badge>;
};

/** Tên đội: đơn "A", đôi "A + B"; chưa xác định thì chữ mờ. */
export const TeamNames = ({ team, empty = 'chờ xác định', className = '' }) => {
  const text = teamText(team);
  return text
    ? <span className={className}>{text}</span>
    : <span className={`italic text-slate-400 dark:text-slate-500 ${className}`}>{empty}</span>;
};

/** Dải "Có cập nhật mới — Tải lại" khi máy khác đổi dữ liệu mà người dùng đang dở thao tác (không tự tải lại). */
export const UpdateBanner = ({ onReload }) => (
  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-800 dark:text-amber-200" role="status">
    <span>Có cập nhật mới từ máy khác.</span>
    <button type="button" onClick={onReload} className="rounded-lg bg-amber-500 px-3 py-1 text-xs font-bold text-slate-950 hover:bg-amber-400">Tải lại</button>
  </div>
);

const CONNECTION = {
  live: ['Trực tiếp', 'bg-emerald-500'],
  connecting: ['Đang kết nối…', 'bg-slate-400'],
  reconnecting: ['Mất kết nối — đang nối lại', 'bg-amber-500'],
  idle: ['', '']
};

/** Chấm báo luồng tự cập nhật: xanh = trực tiếp, vàng = đang nối lại (trang tự poll dự phòng). */
export const ConnectionDot = ({ status }) => {
  const [label, color] = CONNECTION[status] || CONNECTION.idle;
  if (!label) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400" title={label}>
      <span className={`h-2 w-2 rounded-full ${color} ${status === 'live' ? 'animate-pulse' : ''}`} aria-hidden="true" />
      {label}
    </span>
  );
};

/** Nút dùng chung (khoá khi `busy`). */
export const Button = ({ variant = 'primary', busy, disabled, className = '', children, ...rest }) => {
  const styles = {
    primary: 'bg-emerald-500 text-slate-950 hover:bg-emerald-400',
    secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800',
    danger: 'bg-rose-500 text-white hover:bg-rose-400',
    link: 'text-emerald-600 hover:underline dark:text-emerald-400'
  };
  return (
    <button
      type="button"
      disabled={disabled || busy}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant] || styles.primary} ${className}`}
      {...rest}
    >
      {busy && <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />}
      {children}
    </button>
  );
};
