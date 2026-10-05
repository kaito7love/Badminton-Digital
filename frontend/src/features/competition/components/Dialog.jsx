import React, { useEffect } from 'react';
import { Button, Notice } from './ui';

// Hộp thoại dùng chung (Modal có sẵn của app chỉ có một cỡ và không có chân nút). `size`: md | lg | xl.
// Esc đóng. Không đóng khi bấm nền — người dùng đang gõ dở thì bấm trượt không được mất dữ liệu.

const SIZES = { md: 'max-w-xl', lg: 'max-w-4xl', xl: 'max-w-6xl' };

export function Dialog({ open = true, title, onClose, size = 'md', children, actions, error }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/60 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`my-auto w-full ${SIZES[size] || SIZES.md} rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900`}>
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Đóng" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white">✕</button>
        </div>
        <div className="space-y-4 px-5 py-4 text-sm text-slate-700 dark:text-slate-300">
          {error && <Notice error={error} />}
          {children}
        </div>
        {actions && actions.length > 0 && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-800">
            {actions.map((a) => (
              <Button key={a.label} variant={a.variant || 'secondary'} busy={a.busy} disabled={a.disabled} onClick={a.onClick}>{a.label}</Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Hỏi xác nhận trước thao tác khó hoàn tác. `onConfirm` trả Promise; khoá nút khi đang chạy. */
export function ConfirmDialog({ title, text, confirmLabel = 'Đồng ý', danger = false, busy, error, onConfirm, onClose }) {
  return (
    <Dialog
      title={title}
      onClose={onClose}
      error={error}
      actions={[
        { label: 'Thôi', onClick: onClose },
        { label: confirmLabel, variant: danger ? 'danger' : 'primary', busy, onClick: onConfirm }
      ]}
    >
      <p>{text}</p>
    </Dialog>
  );
}
