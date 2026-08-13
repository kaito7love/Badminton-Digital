import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import SidebarLayout from '../layouts/SidebarLayout';
import HomePage from '../pages/Home/HomePage';
import LoginPage from '../pages/Login/LoginPage';
import DashboardPage from '../pages/Dashboard/DashboardPage';
import CourtsPage from '../pages/Courts/CourtsPage';
import BookingsPage from '../pages/Bookings/BookingsPage';
import AccessoriesPage from '../pages/Accessories/AccessoriesPage';
import CustomersPage from '../pages/Customers/CustomersPage';
import EmployeesPage from '../pages/Employees/EmployeesPage';
import ReportsPage from '../pages/Reports/ReportsPage';
import SettingsPage from '../pages/Settings/SettingsPage';
import HistoryPage from '../pages/History/HistoryPage';

function ProtectedLayout({ children }) {
  return (
    <ProtectedRoute>
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

        {/* Protected Admin Routes */}
        <Route path="/dashboard" element={<ProtectedLayout><DashboardPage /></ProtectedLayout>} />
        <Route path="/courts" element={<ProtectedLayout><CourtsPage /></ProtectedLayout>} />
        <Route path="/bookings" element={<ProtectedLayout><BookingsPage /></ProtectedLayout>} />
        <Route path="/accessories" element={<ProtectedLayout><AccessoriesPage /></ProtectedLayout>} />
        <Route path="/customers" element={<ProtectedLayout><CustomersPage /></ProtectedLayout>} />
        <Route path="/employees" element={<ProtectedLayout><EmployeesPage /></ProtectedLayout>} />
        <Route path="/history" element={<ProtectedLayout><HistoryPage /></ProtectedLayout>} />
        <Route path="/reports" element={<ProtectedLayout><ReportsPage /></ProtectedLayout>} />
        <Route path="/settings" element={<ProtectedLayout><SettingsPage /></ProtectedLayout>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
