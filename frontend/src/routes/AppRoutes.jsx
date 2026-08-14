import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import SidebarLayout from '../layouts/SidebarLayout';
import HomePage from '../pages/Home/HomePage';
import LoginPage from '../pages/Login/LoginPage';
import RegisterPage from '../pages/Login/RegisterPage';
import ForgotPasswordPage from '../pages/Login/ForgotPasswordPage';
import ResetPasswordPage from '../pages/Login/ResetPasswordPage';
import DashboardPage from '../pages/Dashboard/DashboardPage';
import CourtsPage from '../pages/Courts/CourtsPage';
import BookingsPage from '../pages/Bookings/BookingsPage';
import AccessoriesPage from '../pages/Accessories/AccessoriesPage';
import CustomersPage from '../pages/Customers/CustomersPage';
import EmployeesPage from '../pages/Employees/EmployeesPage';
import ReportsPage from '../pages/Reports/ReportsPage';
import SettingsPage from '../pages/Settings/SettingsPage';
import HistoryPage from '../pages/History/HistoryPage';
import MyBookingsPage from '../pages/MyBookings/MyBookingsPage';
import { STAFF_ROLES } from '../utils/roles';

// Toàn bộ màn hình dưới đây là bàn làm việc của nhân viên: chặn theo vai trò ngay
// ở route để khách hàng không lọt vào rồi mới bị API trả 403.
function StaffLayout({ children }) {
  return (
    <ProtectedRoute roles={STAFF_ROLES}>
      <SidebarLayout>{children}</SidebarLayout>
    </ProtectedRoute>
  );
}

export default function AppRoutes() {
  return (
    <Router>
      <Routes>
        {/* Public Homepage Landing Page for Badminton Digital */}
        <Route path="/" element={<HomePage />} />

        {/* Auth Route */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Trang của khách hàng */}
        <Route path="/my-bookings" element={<ProtectedRoute roles={['customer']}><MyBookingsPage /></ProtectedRoute>} />

        {/* Bàn làm việc của nhân viên & quản trị */}
        {/* Dashboard đọc báo cáo — API chỉ mở cho admin, nên route cũng vậy */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute roles={['admin']}>
              <SidebarLayout><DashboardPage /></SidebarLayout>
            </ProtectedRoute>
          }
        />
        <Route path="/courts" element={<StaffLayout><CourtsPage /></StaffLayout>} />
        <Route path="/bookings" element={<StaffLayout><BookingsPage /></StaffLayout>} />
        <Route path="/accessories" element={<StaffLayout><AccessoriesPage /></StaffLayout>} />
        <Route path="/customers" element={<StaffLayout><CustomersPage /></StaffLayout>} />
        <Route
          path="/employees"
          element={
            <ProtectedRoute roles={['admin']}>
              <SidebarLayout><EmployeesPage /></SidebarLayout>
            </ProtectedRoute>
          }
        />
        <Route path="/history" element={<StaffLayout><HistoryPage /></StaffLayout>} />
        <Route
          path="/reports"
          element={
            <ProtectedRoute roles={['admin']}>
              <SidebarLayout><ReportsPage /></SidebarLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute roles={['admin']}>
              <SidebarLayout><SettingsPage /></SidebarLayout>
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
