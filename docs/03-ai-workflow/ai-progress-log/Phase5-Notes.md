# Phase 5 Notes: Frontend Web Application

- **Ngày cập nhật:** 03/08/2026
- **Trạng thái:** ✅ DONE

## 📝 Tóm Tắt Các Công Việc Đã Thực Hiện

1. **Routing & Authen Architecture:**
   - Xây dựng hệ thống điều hướng SPA với React Router (`/login`, `/dashboard`, `/courts`, `/bookings`, `/accessories`, `/customers`, `/employees`, `/reports`, `/settings`).
   - Cấu hình `AuthContext` hỗ trợ lưu token JWT và thêm **Demo Mode** cho phép preview toàn bộ UI không cần login.

2. **UI Component System (`src/components/UIComponents.jsx`):**
   - Đã chuẩn hóa bộ giao diện dùng chung: `Modal`, `Badge`, `StatBox`, `Table`.

3. **API Service Layer (`src/services/apiServices.js`):**
   - Viết trọn bộ các hàm kết nối API Backend (`courtService`, `bookingService`, `accessoryService`, `customerService`, `employeeService`, `reportService`).

4. **Trang Sơ Đồ Sân Thời Gian Thực (`src/pages/Courts/CourtsPage.jsx`):**
   - Đồng hồ đếm giờ nhảy theo từng giây (`⏱ HH:MM:SS`).
   - Tự động làm tròn & tính tiền sân tạm tính + tiền dịch vụ đồ uống/phụ kiện.
   - Thao tác 1-click Modal: **Mở sân**, **Thêm Nước/Cầu**, **↩️ Trả lại đồ dư (Return items)**, **🔄 Đổi sân**, **🏁 Đóng sân & Tính tiền**.

5. **Trang Đặt Sân & Báo Cáo (`BookingsPage` & `ReportsPage`):**
   - Tích hợp Toggle giữa dạng Danh sách & Calendar View, Modal tạo lịch đặt sân mới.
   - Tích hợp thư viện biểu đồ **Recharts** và nút xuất báo cáo **Excel/PDF**.
