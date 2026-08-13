# Phase 5 Implementation Plan: Frontend Web Application

- **Trạng thái:** ✅ COMPLETED
- **Thư mục liên quan:** `frontend/src/`

---

## 🎯 Mục Tiêu
Xây dựng ứng dụng web React SPA hoàn chỉnh, giao diện responsive cao cấp, hỗ trợ đếm giờ thời gian thực (Realtime), tích hợp các tính năng nghiệp vụ nâng cao (Return items, Recharts Analytics) và sẵn sàng kết nối API Backend.

## 📋 Hạng Mục Triển Khai
1. **Khởi Tạo UI Design System & Component Library (`src/components/UIComponents.jsx`):**
   - Modal popup, Badges trạng thái sân, StatBox chỉ số, Table chuẩn hóa.
   - Thêm `AuthContext` hỗ trợ lưu token & Toggle Demo Mode xem UI công khai.

2. **Xây Dựng API Services (`src/services/apiServices.js`):**
   - Cấu hình Axios Interceptors tự động refresh token.
   - Định nghĩa các service: Court, Booking, Accessory, Customer, Employee, Report.

3. **Màn Hình Quản Lý Sân Realtime (`src/pages/Courts/CourtsPage.jsx`):**
   - Đồng hồ đếm giờ nhảy thời gian thực mỗi 1 giây (`HH:MM:SS`).
   - Tự động làm tròn & tính tiền sân tạm tính.
   - Modal 1-click: Mở sân, Thêm nước/phụ kiện, **Trả đồ dư (Return Items)**, Đổi sân, Đóng sân.

4. **Màn Hình Đặt Sân & Thống Kê (`BookingsPage.jsx`, `ReportsPage.jsx`):**
   - Calendar View toggle & Form Modal đặt sân.
   - Biểu đồ khu vực Recharts & nút xuất Excel / PDF.
