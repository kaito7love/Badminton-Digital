import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import SidebarLayout from '../layouts/SidebarLayout';
// Home + Login là 2 điểm vào đầu tiên của phần lớn người dùng (khách xem
// trang chủ, nhân viên đăng nhập) — giữ static import để không có vòng
// loading thừa trên đường dẫn phổ biến nhất. 12 trang còn lại lazy-load theo
// route, đặc biệt các trang chỉ admin/branch_manager mới vào được.
import HomePage from '../pages/Home/HomePage';
import LoginPage from '../pages/Login/LoginPage';
import { STAFF_ROLES } from '../utils/roles';

const RegisterPage = lazy(() => import('../pages/Login/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('../pages/Login/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('../pages/Login/ResetPasswordPage'));
const DashboardPage = lazy(() => import('../pages/Dashboard/DashboardPage'));
const CourtsPage = lazy(() => import('../pages/Courts/CourtsPage'));
const BookingsPage = lazy(() => import('../pages/Bookings/BookingsPage'));
const AccessoriesPage = lazy(() => import('../pages/Accessories/AccessoriesPage'));
const RetailPage = lazy(() => import('../pages/Retail/RetailPage'));
const CustomersPage = lazy(() => import('../pages/Customers/CustomersPage'));
const EmployeesPage = lazy(() => import('../pages/Employees/EmployeesPage'));
const ReportsPage = lazy(() => import('../pages/Reports/ReportsPage'));
const SettingsPage = lazy(() => import('../pages/Settings/SettingsPage'));
const HistoryPage = lazy(() => import('../pages/History/HistoryPage'));
const MyBookingsPage = lazy(() => import('../pages/MyBookings/MyBookingsPage'));
const AccountPage = lazy(() => import('../pages/Account/AccountPage'));
const ShopPage = lazy(() => import('../pages/Shop/ShopPage'));
const ProductDetailPage = lazy(() => import('../pages/Shop/ProductDetailPage'));
const CartPage = lazy(() => import('../pages/Cart/CartPage'));
const CheckoutPage = lazy(() => import('../pages/Cart/CheckoutPage'));
const OrdersPage = lazy(() => import('../pages/Orders/OrdersPage'));
const OrderDetailPage = lazy(() => import('../pages/Orders/OrderDetailPage'));

const RouteFallback = () => (
  <div className="flex min-h-[60vh] items-center justify-center text-slate-500 dark:text-slate-400">
    ⏳ Đang tải trang...
  </div>
);

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
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* Public Homepage Landing Page for Badminton Digital */}
          <Route path="/" element={<HomePage />} />
          {/* Kệ hàng phụ kiện mở cho cả khách chưa đăng nhập — xem giá trước khi tới quán.
              Giỏ hàng cũng công khai: chặn đăng nhập ở bước đặt đơn là đủ, bắt đăng nhập
              từ lúc bỏ hàng vào giỏ chỉ tổ đuổi khách đi. */}
          <Route path="/shop" element={<ShopPage />} />
          <Route path="/shop/:id" element={<ProductDetailPage />} />
          <Route path="/cart" element={<CartPage />} />

          {/* Auth Route */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Trang của khách hàng */}
          <Route path="/my-bookings" element={<ProtectedRoute roles={['customer']}><MyBookingsPage /></ProtectedRoute>} />
          <Route path="/account" element={<ProtectedRoute roles={['customer']}><AccountPage /></ProtectedRoute>} />
          <Route path="/checkout" element={<ProtectedRoute roles={['customer']}><CheckoutPage /></ProtectedRoute>} />
          <Route path="/orders" element={<ProtectedRoute roles={['customer']}><OrdersPage /></ProtectedRoute>} />
          <Route path="/orders/:id" element={<ProtectedRoute roles={['customer']}><OrderDetailPage /></ProtectedRoute>} />

          {/* Bàn làm việc của nhân viên & quản trị */}
          {/* Dashboard đọc báo cáo — API mở cho admin và branch_manager, route cũng vậy */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute roles={['admin', 'branch_manager']}>
                <SidebarLayout><DashboardPage /></SidebarLayout>
              </ProtectedRoute>
            }
          />
          <Route path="/courts" element={<StaffLayout><CourtsPage /></StaffLayout>} />
          <Route path="/bookings" element={<StaffLayout><BookingsPage /></StaffLayout>} />
          <Route path="/accessories" element={<StaffLayout><AccessoriesPage /></StaffLayout>} />
          <Route path="/retail" element={<StaffLayout><RetailPage /></StaffLayout>} />
          <Route path="/customers" element={<StaffLayout><CustomersPage /></StaffLayout>} />
          <Route
            path="/employees"
            element={
              <ProtectedRoute roles={['admin', 'branch_manager']}>
                <SidebarLayout><EmployeesPage /></SidebarLayout>
              </ProtectedRoute>
            }
          />
          <Route path="/history" element={<StaffLayout><HistoryPage /></StaffLayout>} />
          <Route
            path="/reports"
            element={
              <ProtectedRoute roles={['admin', 'branch_manager']}>
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
      </Suspense>
    </Router>
  );
}
