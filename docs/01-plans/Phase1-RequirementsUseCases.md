# Phase 1: Requirements & Use Cases Specification

- **Trạng thái:** ✅ COMPLETED
- **Tài liệu gốc liên quan:** [SRS.md](../SRS.md), [UseCase.md](../UseCase.md)

---

## 🎯 Mục Tiêu
Phân tích yêu cầu hệ thống và quy trình vận hành thương mại thực tế của sân cầu lông.

## 📋 Danh Sách Hạng Mục Đã Hoàn Thành
1. **Đặc tả Yêu cầu Phần mềm (SRS):**
   - Xác định phạm vi dự án: Web Full-Stack quản lý sân, đặt lịch, bán phụ kiện, thanh toán & báo cáo.
   - Phân quyền 3 vai trò chính: Admin, Employee, Customer.
   - Đặc tả yêu cầu phi chức năng: Hiệu năng (<2s), Bảo mật (JWT, bcrypt, anti-SQL injection), Responsive UI.

2. **Đặc tả 21 Use Cases Cốt lõi:**
   - Auth: Đăng nhập, đổi/quên mật khẩu, refresh token.
   - Court: Xem danh sách, mở sân, đóng sân, chuyển sân, bảo trì sân.
   - Booking: Đặt sân trước, kiểm tra trùng lịch (conflict check), xem calendar view.
   - Extras: Quản lý tồn kho phụ kiện, gọi thêm đồ uống tại sân.
   - Payment: Checkout hóa đơn, tính tiền khung giờ, tạo QR chuyển khoản.
   - Reports: Dashboard thống kê doanh thu, lượt khách, xuất file Excel/PDF.
