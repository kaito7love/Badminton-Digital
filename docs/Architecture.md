# System Architecture
## Dự án: Badminton Digital Management – Hệ thống quản lý sân cầu lông

**Phiên bản:** 1.0
**Ngày:** 19/07/2026
**Tài liệu tham chiếu:** `SRS.md`, `UseCase.md`, `APIDesign.md`

---

## 1. Tổng quan kiến trúc

Badminton Digital Management sử dụng kiến trúc **Client-Server 3 lớp (3-tier)**, tách biệt rõ Frontend – Backend – Database, giao tiếp qua RESTful API.

```
┌──────────────────────────┐
│        CLIENT LAYER      │
│   React SPA (Frontend)   │
│  - Pages / Components    │
│  - Context API (state)   │
│  - Axios (services/)     │
└─────────────┬─────────────┘
              │ HTTPS / REST (JSON)
              ▼
┌──────────────────────────┐
│     APPLICATION LAYER    │
│   Node.js + Express      │
│  - Routes                │
│  - Middleware (auth, val)│
│  - Controllers           │
│  - Services (business)   │
└─────────────┬─────────────┘
              │ Sequelize ORM
              ▼
┌──────────────────────────┐
│        DATA LAYER        │
│         MySQL            │
│  - Tables / Migrations   │
│  - Seeders                │
└──────────────────────────┘
```

---

## 2. Kiến trúc Frontend

### 2.1 Nguyên tắc tổ chức
- **Pages**: mỗi module nghiệp vụ (Dashboard, Courts, Bookings, Customers, Employees, History, Reports, Settings, Login) là một thư mục page độc lập.
- **Components**: các thành phần UI dùng chung (Button, Modal, Table, Chart wrapper...).
- **Contexts**: quản lý state toàn cục — `AuthContext` (user, token, role), `ThemeContext` (dark mode).
- **Hooks**: custom hooks tái sử dụng (`useAuth`, `useBooking`, `useDebounce`...).
- **Services**: lớp gọi API (Axios instance có interceptor tự gắn token + tự refresh token khi 401).
- **Routes**: định nghĩa route kèm bảo vệ theo Role (`PrivateRoute`, `RoleGuard`).

### 2.2 Luồng dữ liệu Frontend
```
Component → Hook/Service (gọi API) → Context (cập nhật state) → Re-render Component
```

### 2.3 Chiến lược Responsive
- Tailwind CSS breakpoints (`sm/md/lg/xl`).
- Layout riêng cho Mobile (bottom nav) và Desktop (sidebar).

---

## 3. Kiến trúc Backend

### 3.1 Mô hình phân lớp (Layered Architecture)
```
Request
  → Route          (định nghĩa endpoint, gắn middleware)
  → Middleware     (auth, RBAC, validation)
  → Controller     (nhận request, gọi service, trả response)
  → Service        (logic nghiệp vụ: tính tiền, kiểm tra trùng lịch...)
  → Model (Sequelize) (truy vấn database)
Response
```

Nguyên tắc: **Controller không chứa business logic** — mọi tính toán (tính giờ chơi, tính tiền, kiểm tra trùng lịch) nằm ở tầng Service để dễ test độc lập (unit test).

### 3.2 Middleware chính
| Middleware | Chức năng |
|---|---|
| `authMiddleware` | Xác thực JWT, giải mã user từ token |
| `roleMiddleware(roles)` | Kiểm tra Role có quyền truy cập endpoint |
| `validationMiddleware` | Validate request body/query (Express Validator) |
| `errorHandler` | Bắt lỗi tập trung, trả response chuẩn hóa |
| `uploadMiddleware` (Multer) | Xử lý upload logo, ảnh phụ kiện |

### 3.3 Modules/Services nghiệp vụ chính
- `AuthService`: login, refresh token, reset password
- `CourtService`: mở/đóng sân, tính tiền theo khung giờ, chuyển sân
- `BookingService`: tạo booking, kiểm tra trùng lịch (UC-11)
- `PaymentService`: tính tổng hóa đơn, áp dụng giảm giá, tạo Invoice
- `ReportService`: tổng hợp số liệu Dashboard, doanh thu, export Excel/PDF

---

## 4. Kiến trúc dữ liệu (tổng quan)

Bảng chi tiết và quan hệ được đặc tả đầy đủ trong `DatabaseDesign.md`. Ở mức kiến trúc, các nhóm bảng chính:

- **Nhóm định danh & phân quyền**: Users, Roles, Employees, Customers
- **Nhóm vận hành sân**: Courts, CourtSessions, Bookings
- **Nhóm phụ kiện & thanh toán**: Extras, SessionExtras, Payments, Invoices
- **Nhóm hệ thống**: Settings, ActivityLogs, Reports (denormalized/cache nếu cần)

---

## 5. Luồng xử lý nghiệp vụ trọng yếu (End-to-End)

### 5.1 Luồng "Khách vãng lai chơi sân"
```
Nhân viên mở sân (UC-06)
  → CourtSession tạo, status = playing
  → Khách chơi, có thể order thêm phụ kiện (SessionExtras)
  → Nhân viên đóng sân (UC-07)
  → CourtService tính courtFee theo thời lượng + khung giờ
  → PaymentService tổng hợp courtFee + extrasFee → checkout (UC-18)
  → Invoice + Payment được tạo, lưu DB
  → ReportService cập nhật số liệu doanh thu (real-time hoặc theo batch)
```

### 5.2 Luồng "Đặt lịch trước"
```
Customer/Nhân viên tạo Booking (UC-10)
  → BookingService gọi kiểm tra trùng lịch (UC-11)
  → Nếu hợp lệ: Booking status = pending → Nhân viên xác nhận (UC-13) → confirmed
  → Đến giờ hẹn: Nhân viên mở sân dựa trên Booking (liên kết CourtSession với Booking)
```

---

## 6. Kiến trúc bảo mật

- **Authentication**: JWT access token (ngắn hạn) + refresh token (HttpOnly cookie, dài hạn).
- **Authorization**: Role-based, kiểm tra ở middleware Backend (không tin tưởng việc ẩn UI ở Frontend).
- **Password**: bcrypt hash, salt rounds ≥ 10.
- **Input validation**: Express Validator ở mọi endpoint nhận input.
- **SQL Injection**: phòng chống nhờ Sequelize (parameterized query), không dùng raw query nối chuỗi.
- **File upload**: giới hạn định dạng/kích thước qua Multer, lưu ngoài webroot hoặc cloud storage.

---

## 7. Kiến trúc triển khai (Deployment Architecture)

```
┌───────────────────────────────────────────────┐
│                 Docker Compose                  │
│                                                  │
│  ┌───────────┐   ┌───────────┐   ┌───────────┐ │
│  │ frontend  │   │  backend  │   │  mysql    │ │
│  │ (Nginx +  │   │ (Node.js  │   │ (MySQL 8) │ │
│  │  React    │──▶│  Express) │──▶│           │ │
│  │  build)   │   │           │   │           │ │
│  └───────────┘   └───────────┘   └───────────┘ │
└───────────────────────────────────────────────┘
```

- **CI/CD**: GitHub Actions — chạy lint/test khi push/PR, build Docker image, (tùy chọn) deploy tự động lên server/hosting.
- **Environment Config**: `.env` riêng cho từng service (DB credentials, JWT secret, mail service).
- **Logging**: log tập trung tại `backend/src/logs/`, có thể mở rộng sang ELK stack ở giai đoạn sau.

---

## 8. Khả năng mở rộng (Scalability Considerations)

| Hướng mở rộng | Cách tiếp cận kiến trúc hỗ trợ |
|---|---|
| Thêm chi nhánh (multi-branch) | Thêm bảng `Branches`, mọi bảng Courts/Employees gắn `branch_id` |
| Tích hợp cổng thanh toán thực tế | `PaymentService` thiết kế dạng interface, dễ thêm adapter (VNPay, Momo) |
| Tăng tải người dùng | Tách Backend thành stateless service → dễ scale ngang sau Load Balancer |
| Realtime cập nhật trạng thái sân | Có thể bổ sung WebSocket/Socket.IO ở phase sau mà không đổi kiến trúc tổng thể |

---

## 9. Sơ đồ ánh xạ kiến trúc ↔ cấu trúc thư mục

| Lớp kiến trúc | Thư mục tương ứng |
|---|---|
| Client Layer | `frontend/src/pages`, `components`, `contexts`, `services` |
| Application Layer – Route | `backend/src/routes` |
| Application Layer – Middleware | `backend/src/middleware` |
| Application Layer – Controller | `backend/src/controllers` |
| Application Layer – Service | `backend/src/services` |
| Data Layer | `backend/src/models`, `database/migrations`, `database/seeders` |
| Tài liệu | `docs/` |
| Kiểm thử API | `postman/`, `k6/` |
| Triển khai | `docker/`, `.github/workflows/` |

---

## 10. Ghi chú
- Kiến trúc này giữ nguyên theo đúng stack và cấu trúc thư mục đã thống nhất trong dự án (React, Node/Express, MySQL/Sequelize, Docker, GitHub Actions).
- Chi tiết bảng/quan hệ dữ liệu sẽ được đặc tả trong `DatabaseDesign.md`.
