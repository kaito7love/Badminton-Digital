import React from 'react';

/**
 * Thông báo lỗi/ghi chú ngay trong trang, thay cho `alert()` của trình duyệt (báo cáo 40, F7).
 * Thuần trình bày: trang giữ state, `message` rỗng thì không vẽ gì.
 */
export default function InlineNotice({ message, onClose, tone = 'error', className = '' }) {
  if (!message) return null;
  const PALETTES = {
    error: 'border-rose-600/40 bg-rose-500/10 text-rose-800 dark:border-rose-400/40 dark:text-rose-300',
    warning: 'border-amber-600/40 bg-amber-500/10 text-amber-900 dark:border-amber-400/40 dark:text-amber-200',
    success: 'border-emerald-600/40 bg-emerald-500/10 text-emerald-800 dark:border-emerald-400/40 dark:text-emerald-300'
  };
  const palette = PALETTES[tone] || PALETTES.error;
  return (
    <div
      role="alert"
      className={`flex items-start justify-between gap-3 rounded-xl border p-3 text-sm font-semibold ${palette} ${className}`.trim()}
    >
      <span className="min-w-0 break-words">{message}</span>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng thông báo"
          className="shrink-0 rounded-md px-1.5 text-base leading-none opacity-70 hover:opacity-100"
        >
          ✕
        </button>
      )}
    </div>
  );
}
