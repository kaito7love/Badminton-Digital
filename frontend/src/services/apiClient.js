import axios from 'axios';
import { emitAuthExpired } from './authEvents';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request Interceptor: Attach Access Token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Chỉ admin dùng bộ chuyển chi nhánh nên mới có key này trong localStorage
    // (xem BranchContext.jsx) — nhân viên thường không set nên không gửi header.
    const selectedBranchId = localStorage.getItem('admin_selected_branch_id');
    if (selectedBranchId) {
      config.headers['X-Branch-Id'] = selectedBranchId;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Nhiều request bị 401 gần như đồng thời (rất phổ biến vì code hay dùng
// Promise.all([fetchA(), fetchB()])) phải dùng chung đúng 1 lần gọi
// refresh-token thay vì mỗi request tự gọi riêng — không sai (backend chấp
// nhận refresh token dùng lại nhiều lần), nhưng lãng phí không cần thiết.
let refreshPromise = null;

const requestRefresh = () => {
  if (!refreshPromise) {
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) {
      return Promise.reject(new Error('No refresh token available'));
    }
    refreshPromise = axios
      .post(`${import.meta.env.VITE_API_BASE_URL || '/api/v1'}/auth/refresh-token`, { refreshToken })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
};

/**
 * Lấy access token mới bằng refresh token — dùng chung cho interceptor dưới
 * đây và cho kết nối realtime (EventSource không đi qua axios nên không tự
 * refresh được, xem realtimeClient.js). Trả về token mới.
 *
 * Chỉ coi là HẾT PHIÊN (xoá phiên, báo AuthContext, lỗi mang `authExpired`)
 * khi server từ chối thật: không có refresh token, hoặc server trả 400/401/403.
 * Lỗi mạng / 5xx (server đang khởi động lại, Render đang "ngủ dậy") chỉ ném
 * lỗi cho nơi gọi thử lại — không đá người dùng ra trang đăng nhập vì một lần
 * server tạm vắng mặt.
 */
export const refreshAccessToken = async () => {
  try {
    const res = await requestRefresh();
    const newAccessToken = res.data?.success ? res.data?.data?.accessToken : null;
    if (!newAccessToken) throw Object.assign(new Error('Refresh token không trả về access token'), { rejected: true });
    localStorage.setItem('access_token', newAccessToken);
    return newAccessToken;
  } catch (err) {
    const status = err.response?.status;
    const rejected = err.rejected || !localStorage.getItem('refresh_token') || [400, 401, 403].includes(status);
    if (rejected) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user_info');
      // Báo AuthContext biết phiên đã hết hiệu lực thật để cập nhật UI
      // ngay (ProtectedRoute chuyển về /login) thay vì giữ giao diện
      // "đang đăng nhập" cũ cho tới khi người dùng tự F5.
      emitAuthExpired();
      err.authExpired = true;
    }
    throw err;
  }
};

// Response Interceptor: Auto Refresh Token on 401
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const newAccessToken = await refreshAccessToken();
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return apiClient(originalRequest);
      } catch {
        // refreshAccessToken đã xoá phiên và báo hết hạn — trả lỗi gốc.
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
