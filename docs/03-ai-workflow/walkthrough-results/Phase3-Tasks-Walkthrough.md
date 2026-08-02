# Phase 3 — Task List

> Trạng thái: ✅ COMPLETED

## ✅ Cấu Hình Sequelize ORM
- [x] Tạo `.sequelizerc` — định nghĩa đường dẫn config/models/migrations/seeders
- [x] Tạo `.env` — biến môi trường DB + JWT Secret
- [x] Cập nhật `config/config.js` — hỗ trợ development/test/production

## ✅ Database Migrations (13 Bảng)
- [x] `20260723000001-create-roles.js`
- [x] `20260723000002-create-users.js`
- [x] `20260723000003-create-employees.js`
- [x] `20260723000004-create-customers.js`
- [x] `20260723000005-create-courts.js`
- [x] `20260723000006-create-bookings.js` (+ index conflict check)
- [x] `20260723000007-create-court-sessions.js` (+ index court_id, status)
- [x] `20260723000008-create-extras.js`
- [x] `20260723000009-create-session-extras.js`
- [x] `20260723000010-create-invoices.js`
- [x] `20260723000011-create-payments.js`
- [x] `20260723000012-create-settings.js`
- [x] `20260723000013-create-activity-logs.js`

## ✅ Sequelize Models (13 Models)
- [x] `Role.js`, `User.js`, `Employee.js`, `Customer.js`
- [x] `Court.js`, `Booking.js`, `CourtSession.js`
- [x] `Extra.js`, `SessionExtra.js`
- [x] `Invoice.js`, `Payment.js`
- [x] `Setting.js`, `ActivityLog.js`
- [x] `models/index.js` — Associations đầy đủ tất cả quan hệ 1-1, 1-N

## ✅ Database Seeder
- [x] Seed 3 Roles (admin, employee, customer)
- [x] Seed 3 Users mẫu (đã hash bcrypt)
- [x] Seed 2 Employees (chủ sân + thu ngân)
- [x] Seed 2 Customers
- [x] Seed 4 Courts (Sân 1,2,3,VIP)
- [x] Seed 4 Extras (Cầu Yonex, Thuê Vợt, Nước suối, Nước điện giải)
- [x] Seed 2 Settings (operating_hours, store_info)

## ✅ Auth Module
- [x] `utils/jwt.js` — generateAccessToken, generateRefreshToken, verifyToken
- [x] `middleware/authMiddleware.js` — xác thực Bearer Token
- [x] `middleware/roleMiddleware.js` — kiểm tra Role RBAC
- [x] `middleware/errorHandler.js` — Error handler tập trung
- [x] `services/AuthService.js` — login, refreshToken, getProfile, changePassword
- [x] `controllers/authController.js`
- [x] `validations/authValidation.js` — validate input với express-validator
- [x] `routes/authRoutes.js` — 4 endpoints Auth

## ✅ Server & Integration
- [x] `server.js` — mount routes, CORS, sequelize.authenticate() health check
- [x] Endpoint `GET /health` và `GET /api/v1/health`

## ✅ Frontend Base Setup
- [x] `index.html` — entry HTML cho Vite
- [x] `vite.config.js` — Proxy `/api` → `localhost:5000`
- [x] `tailwind.config.js` + `postcss.config.js`
- [x] `src/index.css` — import Tailwind
- [x] `src/main.jsx` — import css
- [x] `frontend/.env` — VITE_API_BASE_URL=/api/v1
- [x] `src/services/apiClient.js` — Axios + interceptors auto JWT & refresh
- [x] `src/contexts/AuthContext.jsx` — login, logout, checkAuth state
- [x] `src/App.jsx` — System Diagnostics Dashboard (test connectivity)
