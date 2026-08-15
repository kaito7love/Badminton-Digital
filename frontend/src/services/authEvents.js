// apiClient.js là module thuần, không có quyền gọi thẳng setUser(null) trong
// AuthContext — pub/sub tối giản này là cầu nối để báo "phiên đăng nhập đã
// hết hiệu lực thật" (refresh token cũng không dùng được nữa) ra ngoài.
const listeners = new Set();

export const onAuthExpired = (callback) => {
  listeners.add(callback);
  return () => listeners.delete(callback);
};

export const emitAuthExpired = () => {
  listeners.forEach((callback) => callback());
};
