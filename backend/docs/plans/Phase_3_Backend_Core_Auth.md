# Phase 3: Backend Core Setup & Auth Module

- **Trạng thái:** ✅ COMPLETED
- **Thư mục liên quan:** `backend/src/`

---

## 🎯 Mục Tiêu
Khởi tạo nền tảng backend, thiết lập kết nối Sequelize ORM, khởi tạo 13 Migrations & Seeders, hoàn thiện module xác thực Auth (JWT + RBAC).

## 📋 Danh Sách Hạng Mục Đã Hoàn Thành
1. **Khởi tạo Cấu hình & ORM Base:**
   - `.sequelizerc`, `.env`, `config/config.js`.
   - `models/index.js` tự động nạp 13 Models và thiết lập toàn bộ Associations.

2. **Database Migrations (13 Bảng):**
   - Đã tạo đủ 13 file migration chuẩn Sequelize trong `backend/src/migrations/`.

3. **Database Seeders:**
   - File `20260723000001-seed-initial-data.js`: Nạp dữ liệu mẫu cho Roles, Users, Employees, Customers, Courts, Extras, và Settings.

4. **Module Xác thực (Auth Module):**
   - Utility `jwt.js` (Access Token 15 phút, Refresh Token 7 ngày).
   - Middlewares: `authMiddleware.js`, `roleMiddleware.js`, `errorHandler.js`.
   - Controller & Service: `AuthService.js`, `authController.js`, `authValidation.js`, `authRoutes.js`.
   - Integration: `server.js` kiểm tra tự động kết nối MySQL `sequelize.authenticate()`.
