import React, { createContext, useContext, useState, useEffect } from "react";
import apiClient from "../services/apiClient";
import { onAuthExpired } from "../services/authEvents";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("user_info");
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(true);

  const checkAuth = async () => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const res = await apiClient.get("/auth/me");
      if (res.data?.success) {
        setUser(res.data.data);
        localStorage.setItem("user_info", JSON.stringify(res.data.data));
      }
    } catch (err) {
      setUser(null);
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("user_info");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  // apiClient tự xoá localStorage khi refresh token thật sự hết hiệu lực —
  // đồng bộ lại state ở đây để UI phản ứng ngay (ProtectedRoute chuyển về
  // /login) thay vì tiếp tục hiển thị như đang đăng nhập.
  useEffect(() => {
    const unsubscribe = onAuthExpired(() => setUser(null));
    return unsubscribe;
  }, []);

  // `identifier` nhận cả số điện thoại lẫn email — backend tự phân biệt.
  const login = async (identifier, password) => {
    // Xoá chi nhánh đã chọn của phiên đăng nhập trước (nếu có) — tránh gửi
    // nhầm X-Branch-Id của admin cũ sang tài khoản vừa đăng nhập trên cùng
    // trình duyệt. BranchContext sẽ tự đặt lại mặc định nếu user mới là admin.
    localStorage.removeItem("admin_selected_branch_id");

    const res = await apiClient.post("/auth/login", { identifier, password });
    if (res.data?.success) {
      const { accessToken, refreshToken } = res.data.data;
      localStorage.setItem("access_token", accessToken);
      localStorage.setItem("refresh_token", refreshToken);

      // /auth/login trả bản rút gọn (không có employee.branch) — lấy lại
      // profile đầy đủ ngay để bộ chuyển chi nhánh/badge chi nhánh có dữ
      // liệu ngay sau khi đăng nhập, không cần F5.
      const me = await apiClient.get("/auth/me");
      const fullUser = me.data.data;
      localStorage.setItem("user_info", JSON.stringify(fullUser));
      setUser(fullUser);
      return fullUser;
    }
    throw new Error(res.data?.message || "Đăng nhập thất bại");
  };

  /** Khách tự đăng ký bằng SĐT — đăng ký xong là đã đăng nhập luôn. */
  const register = async (payload) => {
    const res = await apiClient.post("/auth/register", payload);
    if (res.data?.success) {
      const { user: userData, accessToken, refreshToken } = res.data.data;
      localStorage.setItem("access_token", accessToken);
      localStorage.setItem("refresh_token", refreshToken);
      localStorage.setItem("user_info", JSON.stringify(userData));
      setUser(userData);
      return { user: userData, mergedHistory: res.data.data.mergedHistory };
    }
    throw new Error(res.data?.message || "Đăng ký thất bại");
  };

  const logout = async () => {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // Vẫn logout local dù API có lỗi (ví dụ token đã hết hạn)
    } finally {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user_info');
      localStorage.removeItem('admin_selected_branch_id');
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, setUser, loading, login, register, logout, checkAuth }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
