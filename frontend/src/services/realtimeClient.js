/**
 * Kết nối SSE dùng chung tới event bus phía backend
 * (`backend/src/utils/realtimeBus.js`) — generic theo tên sự kiện, không
 * riêng cho trang Sân, để trang khác (Đặt sân, Kho...) dùng lại được sau
 * này chỉ bằng cách lắng nghe thêm tên sự kiện mới.
 *
 * `EventSource` của trình duyệt không set được header Authorization/
 * X-Branch-Id tuỳ ý như Axios, nên cả token lẫn branchId (chỉ admin cần,
 * xem BranchContext.jsx) đều truyền qua query string.
 *
 * Nguyên tắc dùng: sự kiện chỉ nên là tín hiệu "có gì đó vừa đổi, fetch lại
 * đi" — KHÔNG tự ráp state từ nội dung payload, vì sự kiện mạng có thể đến
 * sai thứ tự (xem mục (a), docs/05-extra/01-audit/RealtimeCourtSync.md).
 *
 * Mở lại kết nối (RUN-01): server tự đóng sau 20 phút còn access token chỉ
 * sống 15 phút, và EventSource không đi qua axios nên không tự refresh. Trước
 * đây client mở lại bằng token cũ, ăn 401 rồi thử lại mỗi 2 giây mãi mãi,
 * trang Sân đứng im. Giờ: token sắp hết hạn thì refresh trước khi mở lại, lùi
 * dần thời gian chờ, và báo trang fetch lại khi kết nối được lại.
 */
import { refreshAccessToken } from './apiClient';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';
const BASE_DELAY_MS = 2000;
const MAX_DELAY_MS = 30000;
const REFRESH_MARGIN_SECONDS = 60;
// Server gửi sự kiện `ping` mỗi 25 giây. Quá khoảng này không nhận được gì là
// kết nối đã chết mà không báo lỗi (proxy vẫn giữ phía trình duyệt mở) — đóng
// và mở lại, không ngồi chờ mãi trên một kết nối câm.
const SILENCE_TIMEOUT_MS = 60000;
const WATCHDOG_INTERVAL_MS = 10000;

/** Kết nối đã im lặng quá lâu chưa (quá SILENCE_TIMEOUT_MS kể từ lần nhận cuối). */
export const isConnectionSilent = (lastSeenMs, nowMs = Date.now()) => nowMs - lastSeenMs > SILENCE_TIMEOUT_MS;

/** Thời gian chờ trước lần mở lại thứ `attempt` (0, 1, 2...): 2s, 4s, 8s... tối đa 30s. */
export const nextBackoffMs = (attempt) => Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.max(0, attempt));

/**
 * Token JWT hết hạn (hoặc sẽ hết trong `seconds` giây) chưa? Đọc `exp` trong
 * payload — không kiểm chữ ký, chỉ để quyết định có cần refresh trước khi mở
 * kết nối. Token không đọc được thì coi như đã hết hạn.
 */
export const tokenExpiresWithin = (token, seconds, nowMs = Date.now()) => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return !payload.exp || payload.exp * 1000 - nowMs <= seconds * 1000;
  } catch {
    return true;
  }
};

/**
 * @param {{
 *   branchId?: number|string,
 *   onEvent: (eventName: string, payload: any) => void,
 *   onReconnect?: () => void,
 *   onStatusChange?: (status: 'live' | 'reconnecting') => void,
 * }} options
 * @returns {() => void} hàm đóng kết nối, gọi lúc unmount
 */
export const connectRealtimeStream = ({ branchId, onEvent, onReconnect, onStatusChange } = {}) => {
  let source = null;
  let reconnectTimer = null;
  let closed = false;
  let attempt = 0;
  let hasConnectedBefore = false;
  let lastSeen = Date.now();
  let watchdog = null;

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
    if (closed) return;
    let token;
    try {
      token = await freshToken();
    } catch (err) {
      if (err?.authExpired) {
        // Server từ chối refresh token: phiên đã hết thật, apiClient đã báo
        // AuthContext đưa về trang đăng nhập — dừng hẳn, không thử lại nữa.
        closed = true;
        return;
      }
      // Server tạm vắng mặt (đang khởi động lại, đang "ngủ dậy") — thử lại sau.
      setStatus('reconnecting');
      scheduleReconnect();
      return;
    }
    if (closed) return;

    const params = new URLSearchParams({ token });
    if (branchId) params.set('branchId', String(branchId));
    source = new EventSource(`${API_BASE}/realtime/stream?${params.toString()}`);
    lastSeen = Date.now();

    source.onopen = () => {
      lastSeen = Date.now();
      attempt = 0;
      setStatus('live');
      // Mở lại sau khi mất kết nối: có thể đã lỡ sự kiện trong lúc đó.
      if (hasConnectedBefore) onReconnect?.();
      hasConnectedBefore = true;
    };

    source.addEventListener('ping', () => {
      lastSeen = Date.now();
    });

    source.addEventListener('court:updated', (e) => {
      lastSeen = Date.now();
      try {
        onEvent?.('court:updated', JSON.parse(e.data));
      } catch {
        // Payload lỗi định dạng — bỏ qua, không phải lỗi nghiêm trọng.
      }
    });

    // Mất kết nối (server đóng sau 20 phút, mất mạng, tab bị hệ điều hành tạm
    // dừng...) — đóng hẳn kết nối cũ rồi tự mở lại bằng token còn hạn, thay vì
    // để EventSource tự retry bằng đúng URL cũ (token trong đó có thể đã hết).
    source.onerror = () => {
      source?.close();
      if (closed) return;
      setStatus('reconnecting');
      scheduleReconnect();
    };
  }

  open();

  watchdog = setInterval(() => {
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
    source?.close();
  };
};
