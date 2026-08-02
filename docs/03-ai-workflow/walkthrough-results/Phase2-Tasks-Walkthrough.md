# Phase 2 — Task List

> Trạng thái: ✅ COMPLETED

## ✅ Thiết Kế Kiến Trúc
- [x] Xác định kiến trúc 3-tier (Client – Application – Data)
- [x] Thiết kế Layered Architecture cho Backend (Route → Middleware → Controller → Service → Model)
- [x] Thiết kế Deployment Architecture với Docker Compose
- [x] Xác định Middleware stack: authMiddleware, roleMiddleware, validationMiddleware, errorHandler, uploadMiddleware

## ✅ Thiết Kế Database (ERD 13 Bảng)
- [x] `roles` — Phân quyền
- [x] `users` — Tài khoản đăng nhập
- [x] `employees` — Nhân viên (1-1 với users)
- [x] `customers` — Khách hàng (có hoặc không có tài khoản)
- [x] `courts` — Sân cầu lông
- [x] `bookings` — Lịch đặt sân trước
- [x] `court_sessions` — Phiên chơi thực tế
- [x] `extras` — Phụ kiện & Dịch vụ
- [x] `session_extras` — Phụ kiện đã dùng trong phiên chơi
- [x] `invoices` — Hóa đơn
- [x] `payments` — Giao dịch thanh toán
- [x] `settings` — Cấu hình hệ thống
- [x] `activity_logs` — Nhật ký hoạt động nhân viên
- [x] Đặc tả Index khuyến nghị cho hiệu năng truy vấn

## ✅ Đặc Tả API Design
- [x] Quy ước Base URL, Response Envelope, JWT Header
- [x] API 2: Authentication (6 endpoints)
- [x] API 3: Courts (9 endpoints)
- [x] API 4: Bookings (7 endpoints)
- [x] API 5: Customers (6 endpoints)
- [x] API 6: Employees (6 endpoints)
- [x] API 7: Accessories (5 endpoints)
- [x] API 8: Payments (4 endpoints)
- [x] API 9: Reports (6 endpoints)
- [x] API 10: Settings (5 endpoints)
