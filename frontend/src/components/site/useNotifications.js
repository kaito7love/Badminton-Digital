import { useCallback, useEffect, useRef, useState } from 'react';
import { notificationService } from '../../services/apiServices';
import { applyRead, applyReadAll, NOTIFICATIONS_CHANGED_EVENT, NOTIFICATIONS_COUNT_EVENT } from './notificationView';

const POLL_MS = 60 * 1000;
const PREVIEW_LIMIT = 8;

/**
 * Thông báo của khách cho chuông ở header (kế hoạch 43). Không dùng SSE (khách không có ngữ cảnh chi nhánh): hỏi lại mỗi
 * 60 giây khi tab đang hiện, khi tab quay lại foreground và sau mỗi lần điều hướng (`routeKey`).
 * `enabled = false` (chưa đăng nhập / không phải khách) thì không gọi API nào và trả về null.
 */
export default function useNotifications({ enabled, routeKey }) {
  const [state, setState] = useState({ items: [], unreadCount: 0 });
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await notificationService.list({ limit: PREVIEW_LIMIT });
      const data = res.data?.data;
      if (alive.current && data) setState({ items: data.items || [], unreadCount: Number(data.unreadCount) || 0 });
      if (data) window.dispatchEvent(new CustomEvent(NOTIFICATIONS_COUNT_EVENT, { detail: { unreadCount: Number(data.unreadCount) || 0 } }));
    } catch {
      // Chuông chỉ là tiện ích: lỗi mạng/401 thì giữ số cũ, lần sau thử lại. Phiên hết hạn do apiClient xử lý.
    }
  }, [enabled]);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    if (!enabled) {
      setState({ items: [], unreadCount: 0 });
      return undefined;
    }
    refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, refresh);
    };
  }, [enabled, refresh, routeKey]);

  const markRead = useCallback(async (id) => {
    setState((s) => applyRead(s, id));
    try {
      await notificationService.markRead(id);
    } catch {
      // lỗi thì lấy lại số thật từ server
    }
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
  }, []);

  const markAllRead = useCallback(async () => {
    setState((s) => applyReadAll(s));
    try {
      await notificationService.markAllRead();
    } catch {
      // lỗi thì lấy lại số thật từ server
    }
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
  }, []);

  if (!enabled) return null;
  return { ...state, refresh, markRead, markAllRead };
}
