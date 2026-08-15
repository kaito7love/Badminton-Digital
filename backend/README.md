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

- 🔐 **Xác thực** — Đăng nhập bằng số điện thoại hoặc email, tự đăng ký (khách hàng), refresh token, quên/đổi mật khẩu (JWT)
- 🏢 **Đa chi nhánh** — Quản lý nhiều chi nhánh (`Branch`), admin chuyển đổi chi nhánh đang thao tác qua header `X-Branch-Id`
- 🏟️ **Quản lý sân** — CRUD sân, mở/đóng sân, chuyển sân, bảo trì
- 📅 **Đặt sân** — Tạo/huỷ/xác nhận booking, kiểm tra khả dụng
- 🎒 **Phụ kiện & Kho hàng** — Danh mục phụ kiện, gọi/trả vào phiên chơi, nhà cung cấp, phiếu nhập kho, tồn kho theo chi nhánh, sổ nhật ký xuất/nhập, điều chỉnh kho thủ công
- 👥 **Khách hàng** — CRUD khách hàng (hồ sơ dùng chung toàn chuỗi), xem lịch sử đặt sân
- 👨‍💼 **Nhân viên** — Quản lý nhân viên (admin, quản lý chi nhánh), xem activity log
- 💳 **Thanh toán & Hoá đơn** — Checkout, xuất PDF hoá đơn
- 📊 **Báo cáo** — Dashboard, doanh thu, top sân, top phụ kiện, xuất Excel/PDF
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
| Email           | Nodemailer `^9` (quên mật khẩu)    |
| PDF / Excel xuất báo cáo | PDFKit `^0.19`, ExcelJS `^4.4` |
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
    │   ├── ActivityLog.js
    │   ├── Branch.js
    │   ├── BranchDocumentSequence.js
    │   ├── Supplier.js
    │   ├── ExtraStock.js          # Tồn kho theo (extraId, branchId)
    │   ├── StockMovement.js       # Sổ nhật ký xuất/nhập kho
    │   ├── GoodsReceipt.js        # Phiếu nhập kho
    │   └── GoodsReceiptItem.js
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

Nguồn xác thực cho quan hệ giữa các model là `src/models/index.js` — sơ đồ và
bảng dưới đây được rút ra từ đó, không phải ngược lại.

```
Branch ──< Court ──< Booking ──< CourtSession ──< SessionExtra >── Extra
       ├─< Employee ──< ActivityLog
       │           └──< Payment
       ├─< Invoice ── Payment
       ├─< ExtraStock >── Extra          (tồn kho theo chi nhánh)
       ├─< StockMovement >── Extra       (sổ nhật ký xuất/nhập)
       ├─< GoodsReceipt >── Supplier
       │        └──< GoodsReceiptItem >── Extra
       └─< BranchDocumentSequence        (sinh mã hoá đơn/phiếu nhập tuần tự)

Role ──< User ──── Employee
              └──── Customer   (KHÔNG gắn branchId — 1 hồ sơ dùng chung toàn chuỗi)

Customer ──< Booking
Customer ──< CourtSession
CourtSession ── Invoice (1-1)
```

### Quan hệ chính

| Model             | Quan hệ                                                                 |
|-------------------|--------------------------------------------------------------------------|
| `Role`            | hasMany `User`                                                           |
| `User`            | hasOne `Employee`, hasOne `Customer`, hasMany `Booking` (creator), hasMany `GoodsReceipt`, hasMany `StockMovement` (actor) |
| `Branch`          | hasMany `Court`, `Booking`, `CourtSession`, `Employee`, `Invoice`, `Payment`, `ExtraStock`, `StockMovement`, `GoodsReceipt`, `BranchDocumentSequence` |
| `Court`           | hasMany `Booking`, hasMany `CourtSession`                                |
| `Booking`         | hasOne `CourtSession`                                                    |
| `CourtSession`    | hasMany `SessionExtra`, hasOne `Invoice`                                 |
| `Customer`        | hasMany `Booking`, hasMany `CourtSession` — **không** thuộc `Branch`     |
| `Extra`           | hasMany `SessionExtra`, hasMany `ExtraStock`, hasMany `StockMovement`, hasMany `GoodsReceiptItem` |
| `ExtraStock`      | belongsTo `Branch`, belongsTo `Extra` — 1 dòng tồn kho / (extra, chi nhánh) |
| `StockMovement`   | belongsTo `Branch`, `Extra`, `User` (actor) — nhật ký mọi lần đổi tồn kho |
| `Supplier`        | hasMany `GoodsReceipt`                                                   |
| `GoodsReceipt`    | belongsTo `Branch`, `Supplier`, `User` (receivedBy); hasMany `GoodsReceiptItem` |
| `GoodsReceiptItem`| belongsTo `GoodsReceipt`, belongsTo `Extra`                              |
| `Invoice`         | hasOne `Payment`                                                         |
| `Employee`        | hasMany `CourtSession`, hasMany `Payment`, hasMany `ActivityLog`; belongsTo `Branch` |

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
JWT_RESET_EXPIRES=15m

# URL frontend — dùng để dựng link đặt lại mật khẩu gửi qua email
FRONTEND_URL=http://localhost:5173

# SMTP gửi mail "Quên mật khẩu" (bắt buộc để tính năng này hoạt động)
MAIL_HOST=
MAIL_PORT=587
MAIL_USER=
MAIL_PASSWORD=
MAIL_FROM=Badminton Digital <no-reply@badminton.com>

# Upload
UPLOAD_DIR=./src/uploads
```

---

## API Endpoints

Base URL: `/api/v1`

### 🔐 Auth — `/api/v1/auth`

| Method | Endpoint            | Mô tả                                          | Auth |
|--------|---------------------|-------------------------------------------------|------|
| POST   | `/register`         | Khách hàng tự đăng ký tài khoản                | ❌    |
| POST   | `/login`            | Đăng nhập, trả về JWT — `identifier` nhận cả số điện thoại lẫn email | ❌    |
| POST   | `/refresh-token`    | Làm mới access token                           | ❌    |
| POST   | `/forgot-password`  | Gửi email đặt lại mật khẩu                     | ❌    |
| POST   | `/reset-password`   | Đặt lại mật khẩu bằng token từ email           | ❌    |
| GET    | `/me`               | Lấy thông tin người dùng hiện tại              | ✅    |
| POST   | `/logout`           | Đăng xuất                                       | ✅    |
| PUT    | `/change-password`  | Đổi mật khẩu                                   | ✅    |

> `/register` chỉ tạo tài khoản `customer`. Tài khoản nhân viên/quản lý chi
> nhánh vẫn phải do admin tạo qua `/employees` — endpoint tự đăng ký không
> cho tự nâng quyền.

---

### 🏢 Branches — `/api/v1/branches`

| Method | Endpoint | Mô tả                                              | Quyền |
|--------|----------|-----------------------------------------------------|-------|
| GET    | `/`      | Danh sách chi nhánh đang hoạt động (cho bộ chuyển chi nhánh) | admin |

> Mọi route khác (courts, bookings, customers, accessories, sessions...) đều
> đọc chi nhánh đang thao tác từ header `X-Branch-Id` qua
> `branchContextMiddleware`: admin gửi header này để chuyển chi nhánh đang
> xem; nhân viên/quản lý chi nhánh bị khoá cứng vào `branchId` của chính họ
> (gửi header khác đi bị chặn 403).

---

### 🏟️ Courts — `/api/v1/courts`

| Method | Endpoint             | Mô tả                      | Quyền           |
|--------|----------------------|----------------------------|-----------------|
| GET    | `/`                  | Danh sách sân              | Đã đăng nhập    |
| GET    | `/:id`               | Chi tiết sân               | Đã đăng nhập    |
| POST   | `/`                  | Tạo sân mới                | admin, branch_manager |
| PUT    | `/:id`               | Cập nhật sân               | admin, branch_manager |
| DELETE | `/:id`               | Xoá sân                    | admin, branch_manager |
| POST   | `/:id/open`          | Mở sân (bắt đầu phiên)     | admin, branch_manager, employee |
| POST   | `/:id/close`         | Đóng sân (kết thúc phiên)  | admin, branch_manager, employee |
| POST   | `/:id/transfer`      | Chuyển khách sang sân khác | admin, branch_manager, employee |
| PUT    | `/:id/status`        | Đổi vòng đời khai thác (active/maintenance/inactive) | admin, branch_manager, employee |

---

### 📅 Bookings — `/api/v1/bookings`

| Method | Endpoint            | Mô tả                  | Quyền                     |
|--------|---------------------|------------------------|---------------------------|
| GET    | `/`                 | Danh sách booking      | Đã đăng nhập              |
| GET    | `/availability`     | Kiểm tra sân khả dụng  | Đã đăng nhập              |
| GET    | `/:id`              | Chi tiết booking       | Đã đăng nhập              |
| POST   | `/`                 | Tạo booking mới        | admin, branch_manager, employee, customer |
| PUT    | `/:id`              | Cập nhật booking       | admin, branch_manager, employee, customer |
| DELETE | `/:id`              | Huỷ booking            | admin, branch_manager, employee, customer |
| PUT    | `/:id/confirm`      | Xác nhận booking       | admin, branch_manager, employee           |

---

### 🎒 Accessories (danh mục sản phẩm) — `/api/v1/accessories`

| Method | Endpoint | Mô tả              | Quyền        |
|--------|----------|--------------------|--------------|
| GET    | `/`      | Danh sách phụ kiện (giá + tồn kho của chi nhánh hiện tại) | Đã đăng nhập |
| GET    | `/:id`   | Chi tiết phụ kiện  | Đã đăng nhập |
| POST   | `/`      | Thêm phụ kiện mới (tồn kho khởi tạo = 0) | admin        |
| PUT    | `/:id`   | Cập nhật phụ kiện (tên/giá/ngưỡng cảnh báo — không sửa tồn kho ở đây) | admin |
| DELETE | `/:id`   | Xoá phụ kiện       | admin        |

> Kể từ hệ thống kho hàng, `Extra` chỉ còn là danh mục dùng chung mọi chi
> nhánh; số lượng tồn kho tách sang `ExtraStock` (1 dòng theo mỗi cặp
> sản phẩm/chi nhánh), không còn field `stockQuantity` trên `Extra`.

---

### 📦 Inventory (tồn kho) — `/api/v1/inventory`

| Method | Endpoint          | Mô tả                                              | Quyền                            |
|--------|-------------------|------------------------------------------------------|-----------------------------------|
| GET    | `/stock-levels`   | Tồn kho hiện tại theo sản phẩm, chi nhánh hiện tại   | admin, branch_manager, employee |
| GET    | `/movements`      | Sổ nhật ký xuất/nhập kho (lọc theo sản phẩm/loại/khoảng ngày) | admin, branch_manager, employee |
| POST   | `/adjustments`    | Điều chỉnh kho thủ công (tăng/giảm, hàng hỏng, thất lạc — bắt buộc lý do) | admin, branch_manager, employee |

---

### 🧾 Goods Receipts (phiếu nhập kho) — `/api/v1/goods-receipts`

| Method | Endpoint | Mô tả                                                              | Quyền                            |
|--------|----------|----------------------------------------------------------------------|-----------------------------------|
| GET    | `/`      | Danh sách phiếu nhập kho                                             | admin, branch_manager, employee |
| GET    | `/:id`   | Chi tiết phiếu nhập kho                                              | admin, branch_manager, employee |
| POST   | `/`      | Tạo phiếu nhập kho (nhiều dòng sản phẩm, cộng tồn kho, cập nhật giá vốn bình quân gia quyền) | admin, branch_manager, employee |

---

### 🏭 Suppliers (nhà cung cấp) — `/api/v1/suppliers`

| Method | Endpoint | Mô tả                                          | Quyền                            |
|--------|----------|---------------------------------------------------|-------------------------------------|
| GET    | `/`      | Danh sách nhà cung cấp (dùng chung toàn chuỗi)    | admin, branch_manager, employee |
| GET    | `/:id`   | Chi tiết nhà cung cấp                             | admin, branch_manager, employee |
| POST   | `/`      | Thêm nhà cung cấp                                 | admin                               |
| PUT    | `/:id`   | Cập nhật nhà cung cấp                             | admin                               |
| DELETE | `/:id`   | Xoá nhà cung cấp (soft-delete)                    | admin                               |

---

### 🎯 Sessions Extras — `/api/v1/sessions`

| Method | Endpoint                    | Mô tả                                  | Quyền                            |
|--------|------------------------------|-------------------------------------------|-------------------------------------|
| GET    | `/history`                  | Lịch sử các phiên chơi                    | admin, branch_manager, employee |
| GET    | `/:sessionId`                | Chi tiết phiên chơi                       | admin, branch_manager, employee |
| POST   | `/:sessionId/extras`         | Thêm phụ kiện vào phiên chơi (trừ kho)    | admin, branch_manager, employee |
| GET    | `/:sessionId/extras`         | Danh sách phụ kiện trong phiên            | admin, branch_manager, employee |
| POST   | `/:sessionId/extras/return`  | Trả lại phụ kiện chưa dùng (hoàn kho)     | admin, branch_manager, employee |

---

### 👥 Customers — `/api/v1/customers`

| Method | Endpoint       | Mô tả                | Quyền           |
|--------|----------------|----------------------|-----------------|
| GET    | `/`            | Danh sách khách hàng | admin, branch_manager, employee |
| GET    | `/:id`         | Chi tiết khách hàng  | Đã đăng nhập    |
| GET    | `/:id/history` | Lịch sử đặt sân      | Đã đăng nhập    |
| POST   | `/`            | Tạo khách hàng mới   | admin, branch_manager, employee |
| PUT    | `/:id`         | Cập nhật thông tin   | admin, branch_manager, employee |
| DELETE | `/:id`         | Xoá khách hàng       | admin           |

> Khách hàng không còn gắn `branchId` — 1 hồ sơ (khớp theo số điện thoại) dùng
> chung cho mọi chi nhánh trong chuỗi (xem migration
> `20260815300001-unify-customers-chain-wide.js`).

---

### 👨‍💼 Employees — `/api/v1/employees`

> Toàn bộ endpoint yêu cầu quyền **admin** hoặc **branch_manager**

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

| Method | Endpoint     | Mô tả                          | Quyền                            |
|--------|--------------|-----------------------------------|-------------------------------------|
| POST   | `/webhook`   | Webhook cổng thanh toán (không qua authMiddleware) | ❌ (xác thực bằng chữ ký webhook riêng) |
| POST   | `/checkout`  | Thanh toán phiên                  | admin, branch_manager, employee   |

---

### 🧾 Invoices — `/api/v1/invoices`

| Method | Endpoint          | Mô tả            | Quyền                            |
|--------|-------------------|------------------|-------------------------------------|
| GET    | `/:id`            | Chi tiết hoá đơn | Đã đăng nhập                       |
| GET    | `/:id/export-pdf` | Xuất PDF hoá đơn | admin, branch_manager, employee   |

---

### 📊 Reports — `/api/v1/reports`

> Toàn bộ endpoint yêu cầu quyền **admin** hoặc **branch_manager**

| Method | Endpoint           | Mô tả                           |
|--------|--------------------|----------------------------------|
| GET    | `/dashboard`       | Tổng quan dashboard             |
| GET    | `/revenue`         | Báo cáo doanh thu               |
| GET    | `/top-courts`      | Top sân được sử dụng nhiều nhất |
| GET    | `/top-accessories` | Top phụ kiện bán chạy           |
| GET    | `/export-excel`    | Xuất báo cáo ra Excel           |
| GET    | `/export-pdf`      | Xuất báo cáo ra PDF             |

---

### 🌐 Public — `/api/v1/public`

Nhóm route **duy nhất** không đi qua `authMiddleware` — chỉ trả dữ liệu
chỉ-đọc, công khai (phục vụ trang chủ trước khi đăng nhập/đăng ký).

| Method | Endpoint         | Mô tả                                        |
|--------|------------------|-------------------------------------------------|
| GET    | `/courts`        | Danh sách sân (lọc theo `branchId` tuỳ chọn)   |
| GET    | `/availability`  | Kiểm tra khung giờ khả dụng của 1 sân          |

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

Hệ thống có 4 vai trò:

| Role             | Mô tả                                                                 |
|------------------|--------------------------------------------------------------------------|
| `admin`          | Toàn quyền, mọi chi nhánh — quản lý sân, nhân viên, báo cáo, cài đặt, chuyển đổi chi nhánh đang xem qua `X-Branch-Id` |
| `branch_manager` | Toàn quyền trong 1 chi nhánh — như `admin` (sân, nhân viên, báo cáo, kho hàng) nhưng khoá cứng vào `branchId` của chính mình, không có quyền `settings` |
| `employee`       | Vận hành trong 1 chi nhánh — mở/đóng sân, booking, thanh toán, khách hàng, kho hàng; không quản lý nhân viên/báo cáo |
| `customer`       | Giới hạn — xem & tạo booking của bản thân, tự đăng ký tài khoản           |

> `branch_manager` được thêm ở migration `20260815300002-add-branch-manager-role.js`
> và seed `20260815300003-seed-branch-managers.js`. Hầu hết route đã gate theo
> vai trò này (`roleMiddleware(['admin', 'branch_manager', ...])`) nhưng nó
> **không** được `branchContextMiddleware` coi là admin — vẫn bị khoá vào chi
> nhánh của mình như `employee`, chỉ khác ở tập quyền rộng hơn.

**Luồng xác thực:**

1. Đăng nhập qua `POST /api/v1/auth/login` với `identifier` (số điện thoại hoặc email) + `password` → nhận `accessToken` (15 phút) + `refreshToken` (7 ngày)
2. Khách hàng có thể tự tạo tài khoản qua `POST /api/v1/auth/register` (chỉ tạo vai trò `customer`)
3. Gửi `Authorization: Bearer <accessToken>` trong header cho các request cần auth
4. Khi access token hết hạn, dùng `POST /api/v1/auth/refresh-token` để lấy token mới
5. Quên mật khẩu: `POST /api/v1/auth/forgot-password` (gửi email) → `POST /api/v1/auth/reset-password` (dùng token trong email)

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
