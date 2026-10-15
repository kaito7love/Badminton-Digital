import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import CustomerLayout from '../../layouts/CustomerLayout';
import { notificationService } from '../../services/apiServices';
import { serverMessage } from '../../utils/serverMessage';
import {
  applyRead, applyReadAll, notificationTarget, relativeTime, typeIcon, NOTIFICATIONS_CHANGED_EVENT
} from '../../components/site/notificationView';

// Trang "Thông báo" của khách (kế hoạch 43): danh sách đầy đủ — cũng là nơi điện thoại tới từ chuông.

export default function NotificationsPage() {
  const [state, setState] = useState({ items: [], unreadCount: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await notificationService.list({ limit: 50 });
      const data = res.data?.data;
      setState({ items: data?.items || [], unreadCount: Number(data?.unreadCount) || 0 });
    } catch (err) {
      setError(serverMessage(err, 'Không tải được thông báo'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const markRead = async (n) => {
    if (n.readAt) return;
    setState((s) => applyRead(s, n.id));
    try {
      await notificationService.markRead(n.id);
    } catch {
      load();
    }
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
  };

  const markAll = async () => {
    setState((s) => applyReadAll(s));
    try {
      await notificationService.markAllRead();
    } catch {
      load();
    }
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
  };

  return (
    <CustomerLayout
      eyebrow="Thông báo"
      title={
        <>
          THÔNG <span className="text-gradient-nike">BÁO</span>
        </>
      }
      subtitle="Cập nhật về lịch đặt sân của bạn: được xác nhận, bị huỷ hoặc đổi giờ."
      action={
        state.unreadCount > 0 ? (
          <button type="button" onClick={markAll} className="btn-nike-bolt text-xs">
            Đánh dấu đã đọc hết ({state.unreadCount})
          </button>
        ) : null
      }
    >
      {loading ? (
        <p className="py-16 text-center text-slate-600 dark:text-slate-400">⏳ Đang tải thông báo...</p>
      ) : error ? (
        <p role="alert" className="py-16 text-center font-bold text-rose-600 dark:text-rose-400">{error}</p>
      ) : state.items.length === 0 ? (
        <div className="nike-card-static p-12 text-center">
          <p className="font-kinetic text-xl font-black uppercase text-slate-900 dark:text-white">Chưa có thông báo nào</p>
          <p className="mt-3 text-slate-600 dark:text-slate-400">Khi cửa hàng xác nhận, huỷ hoặc đổi lịch của bạn, thông báo sẽ hiện ở đây.</p>
          <Link to="/dat-san" className="btn-nike-bolt mt-6 text-xs">Đặt sân ⚡</Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {state.items.map((n) => (
            <li key={n.id}>
              <Link
                to={notificationTarget(n)}
                onClick={() => markRead(n)}
                className={`nike-card flex gap-4 p-5 ${n.readAt ? 'opacity-80' : ''}`}
              >
                <span aria-hidden="true" className="text-2xl">{typeIcon(n.type)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    {!n.readAt && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-rose-500" aria-label="chưa đọc" />}
                    <strong className="font-kinetic text-sm font-black uppercase tracking-wide text-slate-900 dark:text-white">{n.title}</strong>
                  </span>
                  <span className="mt-1 block text-sm text-slate-700 dark:text-slate-300">{n.body}</span>
                  <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{relativeTime(n.createdAt)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </CustomerLayout>
  );
}
