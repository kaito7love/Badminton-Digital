import React from 'react';
import { Link } from 'react-router-dom';
import { TONES } from './siteTone';
import { badgeText, bellLabel, notificationTarget, relativeTime, typeIcon } from './notificationView';

const ICON_BTN = 'relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base transition';

function Badge({ count }) {
  const text = badgeText(count);
  if (!text) return null;
  return (
    <span
      data-testid="notification-badge"
      className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-rose-500 px-1 font-kinetic text-[10px] font-black text-white"
    >
      {text}
    </span>
  );
}

/**
 * Chuông thông báo của khách (kế hoạch 43). Thuần theo props — dữ liệu và việc gọi API do SiteHeader/useNotifications lo.
 *  - variant "link": thanh 80 px trên điện thoại, chỉ là liên kết tới /notifications;
 *  - variant "dropdown": máy tính, bấm mở bảng 8 thông báo mới nhất (dùng chung `useDropdown` của header, nên
 *    mở bảng này thì menu khác tự đóng).
 */
export default function NotificationBell({
  variant = 'dropdown', tone, unreadCount = 0, items = [], open = false, onToggle, onClose, onItemClick, onMarkAllRead, onNavigate, now
}) {
  const t = TONES[tone];

  if (variant === 'link') {
    return (
      <Link to="/notifications" onClick={onNavigate} aria-label={bellLabel(unreadCount)} className={`${ICON_BTN} ${t.iconBtn}`}>
        🔔
        <Badge count={unreadCount} />
      </Link>
    );
  }

  return (
    <div className="relative" onKeyDown={(e) => { if (e.key === 'Escape') onClose?.(); }}>
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="site-notification-panel"
        aria-label={bellLabel(unreadCount)}
        onClick={onToggle}
        className={`${ICON_BTN} ${t.iconBtn}`}
      >
        🔔
        <Badge count={unreadCount} />
      </button>
      {open && (
        <div id="site-notification-panel" className="absolute right-0 top-full z-50 pt-2">
          <div className={`w-80 max-w-[calc(100vw-2rem)] rounded-2xl p-2 ${t.panel}`}>
            <div className="flex items-center justify-between px-3 pb-1 pt-2">
              <strong className="text-sm font-black">Thông báo</strong>
              {unreadCount > 0 && (
                <button type="button" onClick={onMarkAllRead} className="text-xs font-bold underline-offset-2 hover:underline">
                  Đánh dấu đã đọc hết
                </button>
              )}
            </div>
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm opacity-70">Chưa có thông báo nào.</p>
            ) : (
              <ul className="max-h-96 overflow-y-auto">
                {items.map((n) => (
                  <li key={n.id}>
                    <Link
                      to={notificationTarget(n)}
                      onClick={() => onItemClick?.(n)}
                      className={`flex gap-3 rounded-xl px-3 py-2.5 text-left ${t.panelItem}`}
                    >
                      <span aria-hidden="true" className="mt-0.5 text-base">{typeIcon(n.type)}</span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-sm ${n.readAt ? 'font-semibold' : 'font-black'}`}>
                          {!n.readAt && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-rose-500 align-middle" aria-label="chưa đọc" />}
                          {n.title}
                        </span>
                        <span className="mt-0.5 block text-xs opacity-80 line-clamp-2">{n.body}</span>
                        <span className="mt-0.5 block text-[11px] opacity-60">{relativeTime(n.createdAt, now)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link to="/notifications" onClick={onClose} className={`mt-1 block rounded-xl px-3 py-2.5 text-center text-sm font-bold ${t.panelItem}`}>
              Xem tất cả
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
