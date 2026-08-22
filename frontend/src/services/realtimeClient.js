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
 */
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';
const RECONNECT_DELAY_MS = 2000;

/**
 * @param {{ branchId?: number|string, onEvent: (eventName: string, payload: any) => void }} options
 * @returns {() => void} hàm đóng kết nối, gọi lúc unmount
 */
export const connectRealtimeStream = ({ branchId, onEvent } = {}) => {
  let source = null;
  let reconnectTimer = null;
  let closed = false;

  const open = () => {
    const token = localStorage.getItem('access_token');
    if (!token || closed) return;

    const params = new URLSearchParams({ token });
    if (branchId) params.set('branchId', String(branchId));
    source = new EventSource(`${API_BASE}/realtime/stream?${params.toString()}`);

    source.addEventListener('court:updated', (e) => {
      try {
        onEvent?.('court:updated', JSON.parse(e.data));
      } catch {
        // Payload lỗi định dạng — bỏ qua, không phải lỗi nghiêm trọng.
      }
    });

    // Mất kết nối (mất mạng, chuyển mạng, tab bị hệ điều hành tạm dừng trên
    // di động, token hết hạn giữa chừng...) — đóng hẳn kết nối cũ rồi tự mở
    // lại bằng token mới nhất từ localStorage sau một khoảng lùi ngắn, thay
    // vì để EventSource tự retry bằng đúng URL cũ (token có thể đã đổi).
    source.onerror = () => {
      source?.close();
      if (!closed) {
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(open, RECONNECT_DELAY_MS);
      }
    };
  };

  open();

  return () => {
    closed = true;
    clearTimeout(reconnectTimer);
    source?.close();
  };
};
