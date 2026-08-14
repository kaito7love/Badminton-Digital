# 🏸 Badminton Digital Management — Backend API

> **REST API** cho hệ thống quản lý sân cầu lông số hoá, xây dựng bằng **Node.js + Express + Sequelize + MySQL**.

---

## 📋 Mục lục

- [Tổng quan](#tổng-quan)
- [Tech Stack](#tech-stack)
- [Cấu trúc thư mục](#cấu-trúc-thư-mục)
- [Mô hình dữ liệu](#mô-hình-dữ-liệu)
- [Cài đặt & Chạy](#cài-đặt--chạy)
- [Biến môi trường](#biến-môi-trường)
- [API Endpoints](#api-endpoints)
- [Phân quyền](#phân-quyền)
- [Scripts](#scripts)

---

## Tổng quan

Hệ thống backend cung cấp REST API phục vụ ứng dụng quản lý sân cầu lông, bao gồm các chức năng:

- 🔐 **Xác thực** — Đăng nhập, refresh token, đổi mật khẩu (JWT)
- 🏟️ **Quản lý sân** — CRUD sân, mở/đóng sân, chuyển sân, bảo trì
- 📅 **Đặt sân** — Tạo/huỷ/xác nhận booking, kiểm tra khả dụng
- 🎒 **Phụ kiện** — Quản lý phụ kiện (vợt, cầu,...), thêm vào phiên chơi
- 👥 **Khách hàng** — CRUD khách hàng, xem lịch sử đặt sân
- 👨‍💼 **Nhân viên** — Quản lý nhân viên (chỉ admin), xem activity log
- 💳 **Thanh toán & Hoá đơn** — Checkout, xuất PDF hoá đơn
- 📊 **Báo cáo** — Dashboard, doanh thu, top sân, top phụ kiện
- ⚙️ **Cài đặt** — Giá, giờ hoạt động, thương hiệu

---

## Tech Stack

| Thành phần      | Công nghệ                          |
|-----------------|------------------------------------|
| Runtime         | Node.js                            |
| Framework       | Express.js `^4.19`                 |
| ORM             | Sequelize `^6.37`                  |
| Database        | MySQL (`mysql2 ^3.10`)             |
| Authentication  | JSON Web Token (`jsonwebtoken ^9`) |
| Password Hashing| bcrypt `^5.1`                      |
| File Upload     | Multer `^1.4`                      |
| Validation      | express-validator `^7.1`           |
| API Docs        | Swagger UI Express `^5.0`          |
| Dev             | Nodemon, Jest, Supertest           |

---

## Cấu trúc thư mục

```
backend/
├── .env                    # Biến môi trường (không commit)
├── .env.example            # Mẫu biến môi trường
├── .sequelizerc            # Cấu hình đường dẫn Sequelize CLI
├── package.json
└── src/
    ├── server.js           # Entry point — khởi động Express & kết nối DB
    ├── config/             # Cấu hình database (Sequelize config.js)
    ├── models/             # Sequelize models & associations
    │   ├── index.js        # Khởi tạo Sequelize, định nghĩa quan hệ
    │   ├── Role.js
    │   ├── User.js
    │   ├── Employee.js
    │   ├── Customer.js
    │   ├── Court.js
    │   ├── Booking.js
    │   ├── CourtSession.js
    │   ├── Extra.js
    │   ├── SessionExtra.js
    │   ├── Invoice.js
    │   ├── Payment.js
    │   ├── Setting.js
    │   └── ActivityLog.js
    ├── controllers/        # Xử lý request/response
    ├── services/           # Business logic
    ├── routes/             # Định nghĩa API routes
    ├── middleware/         # Auth, Role, Error handler
    ├── validations/        # Validation rules (express-validator)
    ├── migrations/         # Sequelize migration files
    ├── seeders/            # Sequelize seeder files
    ├── uploads/            # Thư mục lưu file upload
    ├── utils/              # Tiện ích dùng chung
    └── logs/               # Log files
```

---

## Mô hình dữ liệu

Tài liệu kiến trúc mục tiêu và lộ trình migration: [`docs/architecture/README.md`](docs/architecture/README.md).

```
Role ──< User >──── Employee ──< ActivityLog
                │           └──< Payment
                └──── Customer

Court ──< Booking ──< CourtSession ──< SessionExtra >── Extra
                               └── Invoice ── Payment
Customer ──< Booking
Customer ──< CourtSession
Employee ──< CourtSession
```

### Quan hệ chính

| Model          | Quan hệ                                                           |
|----------------|-------------------------------------------------------------------|
| `Role`         | hasMany `User`                                                    |
| `User`         | hasOne `Employee`, hasOne `Customer`                              |
| `Court`        | hasMany `Booking`, hasMany `CourtSession`                         |
| `Booking`      | hasOne `CourtSession`                                             |
| `CourtSession` | hasMany `SessionExtra`, hasOne `Invoice`                          |
| `Extra`        | hasMany `SessionExtra`                                            |
| `Invoice`      | hasOne `Payment`                                                  |
| `Employee`     | hasMany `CourtSession`, hasMany `Payment`, hasMany `ActivityLog`  |

---

## Cài đặt & Chạy

### Yêu cầu

- Node.js >= 18
- MySQL >= 8.0

### Các bước

```bash
# 1. Cài dependencies
npm install

# 2. Tạo file .env từ mẫu
cp .env.example .env
# Chỉnh sửa .env với thông tin database của bạn

# 3. Chạy migration (tạo bảng)
npm run migrate

# 4. (Tuỳ chọn) Seed dữ liệu mẫu
npm run seed

# 5. Chạy server ở chế độ development
npm run dev

# Hoặc production
npm start
```

Server sẽ chạy tại: `http://localhost:5000`

### Health Check

```
GET /health
GET /api/v1/health
```

---

## Biến môi trường

Tạo file `.env` từ `.env.example`:

```env
NODE_ENV=development
PORT=5000

# Database
DB_HOST=localhost
DB_PORT=3306
DB_NAME=badminton_digital_management
DB_USER=root
DB_PASSWORD=

# JWT
JWT_ACCESS_SECRET=change_me
JWT_REFRESH_SECRET=change_me_too
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d

# Mail (tuỳ chọn)
MAIL_HOST=
MAIL_PORT=587
MAIL_USER=
MAIL_PASSWORD=

# Upload
UPLOAD_DIR=./src/uploads
```

---

## API Endpoints

Base URL: `/api/v1`

### 🔐 Auth — `/api/v1/auth`

| Method | Endpoint           | Mô tả                              | Auth |
|--------|--------------------|------------------------------------|------|
| POST   | `/login`           | Đăng nhập, trả về JWT              | ❌    |
| POST   | `/refresh-token`   | Làm mới access token               | ❌    |
| GET    | `/me`              | Lấy thông tin người dùng hiện tại  | ✅    |
| PUT    | `/change-password` | Đổi mật khẩu                       | ✅    |

---

### 🏟️ Courts — `/api/v1/courts`

| Method | Endpoint             | Mô tả                      | Quyền           |
|--------|----------------------|----------------------------|-----------------|
| GET    | `/`                  | Danh sách sân              | Đã đăng nhập    |
| GET    | `/:id`               | Chi tiết sân               | Đã đăng nhập    |
| POST   | `/`                  | Tạo sân mới                | admin           |
| PUT    | `/:id`               | Cập nhật sân               | admin           |
| DELETE | `/:id`               | Xoá sân                    | admin           |
| POST   | `/:id/open`          | Mở sân (bắt đầu phiên)     | admin, employee |
| POST   | `/:id/close`         | Đóng sân (kết thúc phiên)  | admin, employee |
| POST   | `/:id/transfer`      | Chuyển khách sang sân khác | admin, employee |
| PUT    | `/:id/status`        | Đổi vòng đời khai thác (active/maintenance/inactive) | admin, employee |

---

### 📅 Bookings — `/api/v1/bookings`

| Method | Endpoint            | Mô tả                  | Quyền                     |
|--------|---------------------|------------------------|---------------------------|
| GET    | `/`                 | Danh sách booking      | Đã đăng nhập              |
| GET    | `/availability`     | Kiểm tra sân khả dụng  | Đã đăng nhập              |
| GET    | `/:id`              | Chi tiết booking       | Đã đăng nhập              |
| POST   | `/`                 | Tạo booking mới        | admin, employee, customer |
| PUT    | `/:id`              | Cập nhật booking       | admin, employee, customer |
| DELETE | `/:id`              | Huỷ booking            | admin, employee, customer |
| PUT    | `/:id/confirm`      | Xác nhận booking       | admin, employee           |

---

### 🎒 Accessories — `/api/v1/accessories`

| Method | Endpoint | Mô tả              | Quyền        |
|--------|----------|--------------------|--------------|
| GET    | `/`      | Danh sách phụ kiện | Đã đăng nhập |
| GET    | `/:id`   | Chi tiết phụ kiện  | Đã đăng nhập |
| POST   | `/`      | Thêm phụ kiện mới  | admin        |
| PUT    | `/:id`   | Cập nhật phụ kiện  | admin        |
| DELETE | `/:id`   | Xoá phụ kiện       | admin        |

---

### 🎯 Sessions Extras — `/api/v1/sessions`

| Method | Endpoint                 | Mô tả                           | Quyền           |
|--------|--------------------------|---------------------------------|-----------------|
| POST   | `/:sessionId/extras`     | Thêm phụ kiện vào phiên chơi   | admin, employee |
| GET    | `/:sessionId/extras`     | Danh sách phụ kiện trong phiên | admin, employee |

---

### 👥 Customers — `/api/v1/customers`

| Method | Endpoint       | Mô tả                | Quyền           |
|--------|----------------|----------------------|-----------------|
| GET    | `/`            | Danh sách khách hàng | admin, employee |
| GET    | `/:id`         | Chi tiết khách hàng  | Đã đăng nhập    |
| GET    | `/:id/history` | Lịch sử đặt sân      | Đã đăng nhập    |
| POST   | `/`            | Tạo khách hàng mới   | admin, employee |
| PUT    | `/:id`         | Cập nhật thông tin   | admin, employee |
| DELETE | `/:id`         | Xoá khách hàng       | admin           |

---

### 👨‍💼 Employees — `/api/v1/employees`

> Toàn bộ endpoint yêu cầu quyền **admin**

| Method | Endpoint              | Mô tả                   |
|--------|-----------------------|-------------------------|
| GET    | `/`                   | Danh sách nhân viên     |
| GET    | `/:id`                | Chi tiết nhân viên      |
| GET    | `/:id/activity-logs`  | Log hoạt động nhân viên |
| POST   | `/`                   | Thêm nhân viên mới      |
| PUT    | `/:id`                | Cập nhật nhân viên      |
| DELETE | `/:id`                | Xoá nhân viên           |

---

### 💳 Payments — `/api/v1/payments`

| Method | Endpoint     | Mô tả            | Quyền           |
|--------|--------------|------------------|-----------------|
| POST   | `/checkout`  | Thanh toán phiên | admin, employee |

---

### 🧾 Invoices — `/api/v1/invoices`

| Method | Endpoint          | Mô tả            | Quyền           |
|--------|-------------------|------------------|-----------------|
| GET    | `/:id`            | Chi tiết hoá đơn | Đã đăng nhập    |
| GET    | `/:id/export-pdf` | Xuất PDF hoá đơn | admin, employee |

---

### 📊 Reports — `/api/v1/reports`

> Toàn bộ endpoint yêu cầu quyền **admin**

| Method | Endpoint           | Mô tả                           |
|--------|--------------------|---------------------------------|
| GET    | `/dashboard`       | Tổng quan dashboard             |
| GET    | `/revenue`         | Báo cáo doanh thu               |
| GET    | `/top-courts`      | Top sân được sử dụng nhiều nhất |
| GET    | `/top-accessories` | Top phụ kiện bán chạy           |

---

### ⚙️ Settings — `/api/v1/settings`

> Toàn bộ endpoint yêu cầu quyền **admin**

| Method | Endpoint             | Mô tả                           |
|--------|----------------------|---------------------------------|
| GET    | `/`                  | Lấy cài đặt hệ thống            |
| PUT    | `/`                  | Cập nhật cài đặt chung          |
| PUT    | `/pricing`           | Cập nhật bảng giá               |
| PUT    | `/operating-hours`   | Cập nhật giờ hoạt động          |
| PUT    | `/branding`          | Cập nhật thông tin thương hiệu  |

---

## Phân quyền

Hệ thống có 3 vai trò:

| Role       | Mô tả                                                       |
|------------|-------------------------------------------------------------|
| `admin`    | Toàn quyền — quản lý sân, nhân viên, báo cáo, cài đặt      |
| `employee` | Vận hành — mở/đóng sân, booking, thanh toán, khách hàng    |
| `customer` | Giới hạn — xem & tạo booking của bản thân                  |

**Luồng xác thực:**

1. Đăng nhập qua `POST /api/v1/auth/login` → nhận `accessToken` (15 phút) + `refreshToken` (7 ngày)
2. Gửi `Authorization: Bearer <accessToken>` trong header cho các request cần auth
3. Khi access token hết hạn, dùng `POST /api/v1/auth/refresh-token` để lấy token mới

---

## Scripts

```bash
npm run dev       # Chạy server development với nodemon (hot reload)
npm start         # Chạy server production
npm test          # Chạy unit tests với Jest
npm run migrate   # Chạy Sequelize migrations
npm run seed      # Seed dữ liệu mẫu vào database
```

---

## Tests

Tests được đặt trong thư mục `tests/`, chạy bằng **Jest** + **Supertest**.

```bash
npm test
```

---

*© Badminton Digital Management — Backend v1.0.0*
