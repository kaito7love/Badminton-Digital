# Phase 3 — Backend Core & Auth Module: Kế Hoạch Triển Khai

- **Trạng thái:** ✅ COMPLETED
- **Thời gian:** 23/07/2026
- **Thư mục code:** `backend/src/`

---

## 🎯 Mục Tiêu
Khởi tạo nền tảng Backend — cấu hình Sequelize ORM, dựng toàn bộ 13 bảng Schema qua Migrations, nạp dữ liệu mẫu và hoàn thiện Module Xác thực JWT + RBAC. Đảm bảo hệ thống kết nối thông suốt Frontend ↔ Backend ↔ MySQL trước khi phát triển các Business APIs.

## 📦 Phạm Vi Phase 3
| Hạng Mục | Files Được Tạo / Sửa |
|---|---|
| Cấu hình Sequelize & ORM Base | `.sequelizerc`, `.env`, `config/config.js`, `models/index.js` |
| 13 Sequelize Migrations | `migrations/20260723000001` → `20260723000013` |
| 13 Sequelize Models | `models/Role.js` → `models/ActivityLog.js` |
| Database Seeder | `seeders/20260723000001-seed-initial-data.js` |
| JWT Utility | `utils/jwt.js` |
| Auth Middlewares | `middleware/authMiddleware.js`, `middleware/roleMiddleware.js`, `middleware/errorHandler.js` |
| Auth Service + Controller | `services/AuthService.js`, `controllers/authController.js` |
| Auth Validation + Routes | `validations/authValidation.js`, `routes/authRoutes.js` |
| Entry Point | `server.js` |
| Frontend Base Setup | `vite.config.js`, `index.html`, `tailwind.config.js`, `src/index.css` |
| Frontend API Client | `src/services/apiClient.js` (Axios + Interceptors) |
| Frontend Auth Context | `src/contexts/AuthContext.jsx` |

## 📋 Kết Quả Đầu Ra (Deliverables) — Tài Khoản Mẫu Seed
| Email | Password | Role |
|---|---|---|
| `admin@badminton.com` | `Admin@123` | admin |
| `employee@badminton.com` | `Employee@123` | employee |
| `customer@badminton.com` | `Customer@123` | customer |
