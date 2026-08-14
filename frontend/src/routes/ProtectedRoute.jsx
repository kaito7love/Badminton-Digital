import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { roleOf, homePathForRole } from '../utils/roles';

/**
 * `roles` bỏ trống nghĩa là chỉ cần đăng nhập. Truyền vào thì chặn luôn ở tầng
 * route: sai vai trò sẽ được đưa về đúng trang chủ của mình, thay vì vào rồi mới
 * lãnh 403 từ API và ngồi nhìn màn hình trắng.
 */
export default function ProtectedRoute({ children, roles = null }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
        <div className="animate-pulse rounded-xl bg-slate-900 p-8 shadow-xl shadow-slate-900/40">
          Đang kiểm tra quyền truy cập...
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (roles && !roles.includes(roleOf(user))) {
    return <Navigate to={homePathForRole(user)} replace />;
  }

  return children;
}
