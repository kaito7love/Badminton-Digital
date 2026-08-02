# Phase 5: Frontend Web Application

- **Trạng thái:** ⏳ PLANNED
- **Thư mục liên quan:** `frontend/src/`

---

## 🎯 Mục Tiêu
Xây dựng ứng dụng web React SPA đơn trang chuẩn hóa, giao diện hiện đại, responsive trên Desktop/Tablet/Mobile, kết nối mượt mà với Backend APIs.

## 📋 Danh Sách Màn Hình & Module Triển Khai
1. **Khởi Tạo UI Design System & Component Library:**
   - Button, Modal, Table, Badge, Card, StatBox, Chart Wrapper.
   - Layouts: `SidebarLayout` (Desktop), `BottomNavLayout` (Mobile).
   - Contexts: `AuthContext`, `ThemeContext` (Dark/Light mode).

2. **Các Trang Chức Năng (Pages):**
   - **Login Page:** Đăng nhập, lưu JWT Access/Refresh Token.
   - **Dashboard Page:** Thống kê doanh thu, biểu đồ, trạng thái sân thời gian thực.
   - **Courts Management Page:** Sơ đồ các sân, thao tác 1-click Mở sân / Đóng sân / Đổi sân / Gọi nước.
   - **Bookings Page:** Xem calendar view (ngày/tuần/tháng), đặt sân trước, kiểm tra trùng lịch.
   - **Accessories & Stock Page:** Quản lý danh sách phụ kiện, tồn kho & cảnh báo sắp hết hàng.
   - **Customers Page:** Danh sách khách hàng, tra cứu SĐT, xem lịch sử chơi & tổng chi tiêu.
   - **Employees Page:** Quản lý danh sách nhân viên, phân quyền role, xem activity log.
   - **Reports Page:** Báo cáo chi tiết doanh thu, xuất file Excel/PDF.
   - **Settings Page:** Cài đặt giờ mở cửa, cài đặt giá khung giờ cao điểm/thấp điểm.
