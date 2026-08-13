import React, { createContext, useContext, useState, useEffect } from "react";
import apiClient from "../services/apiClient";

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

  const login = async (email, password) => {
    const res = await apiClient.post("/auth/login", { email, password });
    if (res.data?.success) {
      const { user: userData, accessToken, refreshToken } = res.data.data;
      localStorage.setItem("access_token", accessToken);
      localStorage.setItem("refresh_token", refreshToken);
      localStorage.setItem("user_info", JSON.stringify(userData));
      setUser(userData);
      return userData;
    }
    throw new Error(res.data?.message || "Đăng nhập thất bại");
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
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, setUser, loading, login, logout, checkAuth }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
