import { refreshAccessToken } from '../../../services/apiClient';
import { nextBackoffMs, tokenExpiresWithin, isConnectionSilent } from '../../../services/realtimeClient';

// SSE của giải / buổi giao lưu qua cổng: /api/v1/competition/{tournaments|sessions}/:id/stream (docs/02 mục 2.9).
// EventSource không gửi được header nên token (và branchId của admin) đi qua query. Cùng cách xử lý như realtimeClient.js:
// token sắp hết hạn thì refresh TRƯỚC khi nối, mất kết nối thì lùi dần 2 → 30 giây, 60 giây không nhận được gì (kể cả `ping`)
// là kết nối đã chết, mỗi lần nối lại thì báo `onReconnect` để trang tải lại (có thể đã lỡ sự kiện `board`).
// Service đóng luồng đúng lúc token hết hạn (≤ 5 phút) — EventSource tự thấy `error` và ta nối lại bằng token mới.

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';
const REFRESH_MARGIN_SECONDS = 60;
const WATCHDOG_INTERVAL_MS = 10000;
export const STREAM_EVENTS = ['snapshot', 'score', 'board'];

/** URL luồng — hàm thuần để test. */
export const buildStreamUrl = ({ kind, id, token, branchId, publicView = false }) => {
  // Luồng công khai (plan 27): không cần đăng nhập, không kèm token — sự kiện chỉ là tỉ số và báo "có gì đổi" (không có tên người chơi);
  // dữ liệu thật vẫn tải bằng các lời gọi có token của người xem.
  if (publicView) return `${API_BASE}/competition/public/${kind}/${encodeURIComponent(id)}/stream`;
  const params = new URLSearchParams({ token });
  if (branchId) params.set('branchId', String(branchId));
  return `${API_BASE}/competition/${kind}/${encodeURIComponent(id)}/stream?${params.toString()}`;
};

/**
 * @param {{
 *   kind: 'tournaments'|'sessions', id: string, branchId?: string|number,
 *   onEvent: (name: 'snapshot'|'score'|'board', payload: any) => void,
 *   onReconnect?: () => void,
 *   onStatusChange?: (status: 'live'|'reconnecting') => void,
 * }} options
 * @returns {() => void} hàm đóng luồng — gọi lúc unmount
 */
export const connectCompetitionStream = ({ kind, id, branchId, publicView = false, onEvent, onReconnect, onStatusChange }) => {
  let source = null;
  let reconnectTimer = null;
  let closed = false;
  let attempt = 0;
  let hasConnectedBefore = false;
  let suspended = false; // trang đang rời đi (pagehide) — không mở lại cho tới khi được khôi phục từ bộ nhớ đệm trang (pageshow)
  let lastSeen = Date.now();

  const setStatus = (status) => onStatusChange?.(status);
  const scheduleReconnect = () => {
    if (closed) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(open, nextBackoffMs(attempt));
    attempt += 1;
  };
  const freshToken = async () => {
    const token = localStorage.getItem('access_token');
    if (token && !tokenExpiresWithin(token, REFRESH_MARGIN_SECONDS)) return token;
    return refreshAccessToken();
  };

  async function open() {
    if (closed || suspended) return;
    let token;
    try {
      token = publicView ? null : await freshToken();
    } catch (err) {
      if (err?.authExpired) { closed = true; return; } // hết phiên thật: apiClient đã đưa về trang đăng nhập
      setStatus('reconnecting');
      scheduleReconnect();
      return;
    }
    if (closed) return;

    source = new EventSource(buildStreamUrl({ kind, id, token, branchId, publicView }));
    lastSeen = Date.now();
    source.onopen = () => {
      lastSeen = Date.now();
      attempt = 0;
      setStatus('live');
      if (hasConnectedBefore) onReconnect?.();
      hasConnectedBefore = true;
    };
    source.addEventListener('ping', () => { lastSeen = Date.now(); });
    for (const name of STREAM_EVENTS) {
      source.addEventListener(name, (e) => {
        lastSeen = Date.now();
        try {
          onEvent?.(name, JSON.parse(e.data));
        } catch {
          /* payload hỏng — bỏ qua */
        }
      });
    }
    // Đóng hẳn rồi tự mở lại bằng token mới, không để EventSource tự retry bằng URL cũ (token trong đó có thể đã hết hạn).
    source.onerror = () => {
      source?.close();
      if (closed) return;
      setStatus('reconnecting');
      scheduleReconnect();
    };
  }

  // Rời trang (đổi URL, đóng tab) thì đóng luồng NGAY: trình duyệt có thể giữ tài liệu cũ trong bộ nhớ đệm trang (bfcache) cùng ổ kết nối SSE còn mở —
  // chạm giới hạn 6 kết nối / máy chủ thì trang kế tiếp treo ở "đang tải" (bắt được khi rà 18 màn hình liên tiếp trong một tab).
  const onPageHide = () => {
    suspended = true;
    clearTimeout(reconnectTimer);
    source?.close();
    source = null;
  };
  const onPageShow = (e) => {
    if (!e.persisted || !suspended || closed) return;
    suspended = false;
    attempt = 0;
    setStatus('reconnecting');
    open();
  };
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);

  open();
  const watchdog = setInterval(() => {
    if (closed || !source || source.readyState !== EventSource.OPEN) return;
    if (!isConnectionSilent(lastSeen)) return;
    source.close();
    setStatus('reconnecting');
    scheduleReconnect();
  }, WATCHDOG_INTERVAL_MS);

  return () => {
    closed = true;
    clearTimeout(reconnectTimer);
    clearInterval(watchdog);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
    source?.close();
  };
};
