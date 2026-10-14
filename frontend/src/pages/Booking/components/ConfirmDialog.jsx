import React, { useEffect, useRef } from 'react';
import { formatVnd } from '../../../utils/shop';
import { dayLabel } from '../lib/dayStrip';
import Portal from './Portal';
import { FOCUSABLE, trapTarget } from './focusTrap';

/**
 * Hộp xác nhận đặt sân.
 *
 * `mode` quyết định nội dung và nút chính:
 *  · 'guest'    : cần đăng nhập, lựa chọn được giữ; nút chính "Đăng nhập để đặt sân"
 *  · 'customer' : nút chính "Xác nhận đặt sân"
 *  · 'staff'    : nhân viên đặt ở Quản Lý Đặt Sân; không có nút chính
 *
 * Nút chính chỉ bấm được khi có `onConfirm` (và không đang `busy`): hộp này
 * thuần trình bày, việc gọi API nằm ở trang. `resumed`: khách vừa đăng nhập xong
 * và lựa chọn được dựng lại.
 */
export default function ConfirmDialog({ open, summary, branchName, date, mode, user, error, busy, resumed, onClose, onConfirm }) {
  const closeRef = useRef(null);
  const dialogRef = useRef(null);
  const visible = Boolean(open && summary);

  // Mở: nhớ chỗ đang giữ tiêu điểm, chuyển vào hộp, khoá Tab trong hộp, Escape đóng.
  // Đóng: trả tiêu điểm về đúng nút đã mở hộp (người dùng bàn phím không bị rơi về đầu trang).
  useEffect(() => {
    if (!visible) return undefined;
    const opener = document.activeElement;
    closeRef.current?.focus();

    const onKey = (event) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const items = [...dialogRef.current.querySelectorAll(FOCUSABLE)];
      const target = trapTarget(items, document.activeElement, event.shiftKey);
      if (target) {
        event.preventDefault();
        target.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      // Nút mở hộp có thể đã bị khoá / gỡ (vd sau lỗi 409 lựa chọn bị bỏ): khi đó không ép tiêu điểm.
      if (opener && typeof opener.focus === 'function' && opener.isConnected && !opener.disabled) opener.focus();
    };
  }, [visible, onClose]);

  if (!visible) return null;

  const rows = [
    ['Chi nhánh', branchName || '—'],
    ['Sân', summary.courtName],
    ['Ngày', dayLabel(date)],
    ['Giờ', `${summary.label} (${summary.hours} giờ)`],
    ['Tạm tính', formatVnd(summary.total)]
  ];

  const primary =
    mode === 'guest' ? 'Đăng nhập để đặt sân' : mode === 'customer' ? 'Xác nhận đặt sân' : null;

  return (
    <Portal>
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dat-san-dialog-title"
        className="max-h-full w-full max-w-md overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/15 dark:bg-slate-900"
      >
        <h2 id="dat-san-dialog-title" className="font-kinetic text-xl font-black uppercase text-slate-900 dark:text-white">
          Xác nhận đặt sân
        </h2>

        {resumed && mode === 'customer' && (
          <p className="mt-3 rounded-xl border border-emerald-600/30 bg-emerald-500/10 p-3 text-sm text-slate-700 dark:border-emerald-400/30 dark:text-slate-300">
            Đã đăng nhập. Lựa chọn của bạn được giữ nguyên và khung giờ này vẫn còn trống.
          </p>
        )}

        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
          {rows.map(([label, value]) => (
            <React.Fragment key={label}>
              <dt className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</dt>
              <dd className="text-right font-bold text-slate-900 dark:text-white">{value}</dd>
            </React.Fragment>
          ))}
        </dl>

        {mode === 'customer' && user?.fullName && (
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
            Đặt dưới tên <strong className="text-slate-900 dark:text-white">{user.fullName}</strong>
            {user.phone ? ` • ${user.phone}` : ''}
          </p>
        )}

        <p
          className={`mt-4 rounded-xl border p-3 text-sm ${
            mode === 'staff'
              ? 'border-amber-600/40 bg-amber-500/10 text-amber-900 dark:border-amber-400/40 dark:text-amber-200'
              : 'border-emerald-600/30 bg-emerald-500/10 text-slate-700 dark:border-emerald-400/30 dark:text-slate-300'
          }`}
        >
          {mode === 'guest' &&
            'Bạn cần đăng nhập để đặt lịch. Lựa chọn hiện tại được giữ, đăng nhập xong sẽ quay lại đúng trang này.'}
          {mode === 'staff' && 'Tài khoản nhân viên vui lòng đặt lịch trong màn Quản Lý Đặt Sân.'}
          {mode === 'customer' &&
            'Tiền sân tính theo giờ chơi thực tế khi kết thúc. Cầu, vợt và nước gọi thêm cộng vào hoá đơn cuối buổi. Lịch mới ở trạng thái chờ xác nhận.'}
        </p>

        {error && (
          <p role="alert" className="mt-3 rounded-xl border border-rose-600/40 bg-rose-500/10 p-3 text-sm font-semibold text-rose-800 dark:border-rose-400/40 dark:text-rose-300">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full border border-slate-300 px-5 py-3 font-kinetic text-xs font-black uppercase tracking-wider text-slate-800 hover:border-emerald-600 dark:border-white/20 dark:text-white"
          >
            {mode === 'staff' ? 'Đóng' : 'Quay lại'}
          </button>
          {primary && (
            <button
              type="button"
              disabled={!onConfirm || busy}
              onClick={onConfirm}
              className="flex-1 rounded-full bg-gradient-to-br from-emerald-600 to-lime-600 px-5 py-3 font-kinetic text-xs font-black uppercase tracking-wider text-white shadow-md enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 dark:from-emerald-400 dark:to-lime-300 dark:text-slate-950"
            >
              {busy ? 'Đang đặt…' : primary}
            </button>
          )}
        </div>
      </div>
    </div>
    </Portal>
  );
}
