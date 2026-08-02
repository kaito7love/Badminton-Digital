# Phase 2: System Architecture & Database Design

- **Trạng thái:** ✅ COMPLETED
- **Tài liệu gốc liên quan:** [Architecture.md](../Architecture.md), [DatabaseDesign.md](../DatabaseDesign.md), [APIDesign.md](../APIDesign.md)

---

## 🎯 Mục Tiêu
Thiết kế kiến trúc tổng thể phần mềm 3 lớp (3-tier Architecture) và xây dựng sơ đồ cơ sở dữ liệu quan hệ ERD chuẩn hóa.

## 📋 Danh Sách Hạng Mục Đã Hoàn Thành
1. **Mô hình Kiến trúc 3 Lớp:**
   - Client Layer: React SPA + Axios + Tailwind CSS.
   - Application Layer: Node.js + Express.js (Phân lớp Route → Middleware → Controller → Service → Model).
   - Data Layer: MySQL 8 + Sequelize ORM.

2. **Thiết kế Cơ sở dữ liệu (13 Bảng Schema):**
   - Định danh & Phân quyền: `roles`, `users`, `employees`, `customers`.
   - Vận hành sân: `courts`, `bookings`, `court_sessions`.
   - Phụ kiện & Dịch vụ: `extras`, `session_extras`.
   - Thanh toán: `invoices`, `payments`.
   - Hệ thống & Nhật ký: `settings`, `activity_logs`.

3. **Đặc tả RESTful API Standards:**
   - Quy ước Base URL `/api/v1`, Response Envelope chuẩn JSON.
   - Quy chuẩn HTTP Status codes và định dạng JWT Tokens.
