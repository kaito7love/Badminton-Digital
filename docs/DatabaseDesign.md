# Database Design & ERD
## Dự án: Badminton Digital Management – Hệ thống quản lý sân cầu lông

**Phiên bản:** 2.0
**Ngày cập nhật:** 11/08/2026 (từ v1.0 ngày 19/07/2026)
**Tài liệu tham chiếu:** `SRS.md`, `UseCase.md`, `APIDesign.md`, `Architecture.md`
**Công nghệ:** MySQL 8 + Sequelize ORM (paranoid soft-delete, optimistic locking)

---

## 1. Sơ đồ quan hệ tổng quan (ERD – dạng văn bản)

```
[Tương lai] Organizations 1───∞ Branches
                                    │
              Branches 1───∞ Courts ───∞ CourtSessions
              Branches 1───∞ Bookings
              Branches 1───∞ Customers
              Branches 1───∞ Employees ───1 Users
              Branches 1───∞ Invoices
              Branches 1───∞ Payments
              Branches 1───∞ ActivityLogs
              Branches 1───∞ BranchDocumentSequences

Roles 1───∞ Users 1───1 Employees
                 └───1 Customers (nullable, khách vãng lai không cần tài khoản)

Courts 1───∞ CourtSessions
CourtSessions (nullable) ∞───1 Bookings
CourtSessions 1───∞ SessionExtras ∞───1 Extras
CourtSessions 1───1 Invoices 1───1 Payments

Customers 1───∞ Bookings
Customers 1───∞ CourtSessions
Employees 1───∞ ActivityLogs
Employees 1───∞ CourtSessions (nhân viên mở/đóng sân)
Employees 1───∞ Payments (nhân viên thu ngân)
Users 1───∞ ActivityLogs (log cho cả non-employee users)

Settings (bảng cấu hình độc lập, không quan hệ FK trực tiếp)

[Tương lai] SalesOrders — được tham chiếu bởi invoices.sales_order_id
```

---

## 2. Danh sách bảng chi tiết

### 2.1 `roles`
| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| name | VARCHAR(50) | UNIQUE, NOT NULL | admin / employee / customer |
| description | VARCHAR(255) | NULL | |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |

### 2.2 `users`
| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| role_id | INT | FK → roles.id, NOT NULL | |
| email | VARCHAR(100) | UNIQUE, NOT NULL | |
| password_hash | VARCHAR(255) | NOT NULL | bcrypt |
| full_name | VARCHAR(100) | NOT NULL | |
| phone | VARCHAR(20) | NULL | |
| avatar_url | VARCHAR(255) | NULL | |
| is_active | BOOLEAN | DEFAULT true | |
| refresh_token | TEXT | NULL | TEXT thay VARCHAR(500); null khi logout |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |
| deleted_at | DATETIME | NULL | Soft delete (paranoid) |
| version | INT | DEFAULT 0 | Optimistic locking |

### 2.3 `employees`
| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| branch_id | INT | FK → branches.id, NOT NULL | Chi nhánh làm việc |
| user_id | INT | FK → users.id, UNIQUE, NOT NULL | 1-1 với users |
| position | VARCHAR(50) | NULL | VD: thu ngân, quản lý ca |
| shift | VARCHAR(50) | NULL | ca sáng/chiều/tối |
| hired_at | DATE | NULL | |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |
| deleted_at | DATETIME | NULL | Soft delete |
| version | INT | DEFAULT 0 | Optimistic locking |

### 2.4 `customers`
| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| branch_id | INT | FK → branches.id, NOT NULL | Chi nhánh phục vụ |
| user_id | INT | FK → users.id, NULL | NULL nếu khách vãng lai không có tài khoản |
| full_name | VARCHAR(100) | NOT NULL | |
| phone | VARCHAR(20) | NULL, UNIQUE theo `(branch_id, phone)` | Cho phép rỗng để khách vãng lai vẫn là khách hàng (hồ sơ thiếu thông tin). UNIQUE gắn với chi nhánh nên hai chi nhánh được trùng số |
| email | VARCHAR(100) | NULL | |
| total_spent | DECIMAL(12,2) | DEFAULT 0 | denormalized, cập nhật khi có Payment |
| loyalty_tier | VARCHAR(20) | DEFAULT 'normal' | **normal / silver / gold** |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |
| deleted_at | DATETIME | NULL | Soft delete |
| version | INT | DEFAULT 0 | Optimistic locking |

**Ngưỡng loyalty_tier:**
- `normal`: < 5,000,000 VND tổng chi tiêu
- `silver`: >= 5,000,000 VND
- `gold`: >= 15,000,000 VND

### 2.5 `courts`
| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| branch_id | INT | FK → branches.id, NOT NULL | Multi-branch |
| name | VARCHAR(50) | NOT NULL | VD: "Sân số 1" |
| status | ENUM | 'active','maintenance','inactive' | DEFAULT 'active'. Chỉ mô tả vòng đời khai thác. Việc sân có đang được chơi hay không **không lưu ở đây** mà suy ra từ `court_sessions` đang mở |
| peak_price_per_hour | DECIMAL(10,2) | NOT NULL | |
| offpeak_price_per_hour | DECIMAL(10,2) | NOT NULL | |
| note | VARCHAR(255) | NULL | |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |
| deleted_at | DATETIME | NULL | Soft delete |
| version | INT | DEFAULT 0 | Optimistic locking |

### 2.6 `bookings`
| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| branch_id | INT | FK → branches.id, NOT NULL | Multi-branch |
| court_id | INT | FK → courts.id, NOT NULL | |
| customer_id | INT | FK → customers.id, NULL | |
| booking_date | DATE | NOT NULL | |
| start_time | TIME | NOT NULL | |
| end_time | TIME | NOT NULL | |
| status | ENUM | 'pending','confirmed','cancelled','completed' | DEFAULT 'pending' |
| created_by | INT | FK → users.id, NOT NULL | ai tạo booking (NV hoặc chính khách) |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |
| deleted_at | DATETIME | NULL | Soft delete |
| version | INT | DEFAULT 0 | Optimistic locking |

**Index đề xuất:** `(court_id, booking_date, start_time, end_time)` — phục vụ kiểm tra trùng lịch (UC-11) nhanh.

### 2.7 `court_sessions`
| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| branch_id | INT | FK → branches.id, NOT NULL | Multi-branch |
| court_id | INT | FK → courts.id, NOT NULL | |
| booking_id | INT | FK → bookings.id, NULL | NULL nếu khách vãng lai |
| customer_id | INT | FK → customers.id, NULL | |
| employee_id | INT | FK → employees.id, NOT NULL | người mở/đóng sân |
| start_time | DATETIME | NOT NULL | |
| end_time | DATETIME | NULL | NULL khi đang chơi |
| duration_seconds | INT | NULL | tính khi đóng sân |
| court_fee | DECIMAL(12,2) | NULL | tính khi đóng sân |
| status | ENUM | 'playing','closed' | DEFAULT 'playing' |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |
| deleted_at | DATETIME | NULL | Soft delete |
| version | INT | DEFAULT 0 | Optimistic locking |

### 2.8 `extras` (phụ kiện)
| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| name | VARCHAR(100) | NOT NULL | VD: "Cầu lông Yonex", "Nước suối" |
| price | DECIMAL(10,2) | NOT NULL | |
| stock_quantity | INT | DEFAULT 0 | |
| low_stock_threshold | INT | DEFAULT 5 | cảnh báo sắp hết hàng |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |
| deleted_at | DATETIME | NULL | Soft delete |
| version | INT | DEFAULT 0 | Optimistic locking |

### 2.9 `session_extras`
| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| session_id | INT | FK → court_sessions.id, NOT NULL | |
| extra_id | INT | FK → extras.id, NOT NULL | |
| quantity | INT | NOT NULL | |
| unit_price | DECIMAL(10,2) | NOT NULL | snapshot giá tại thời điểm dùng |
| subtotal | DECIMAL(12,2) | NOT NULL | quantity × unit_price |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |
| deleted_at | DATETIME | NULL | Soft delete |
| version | INT | DEFAULT 0 | Optimistic locking |

### 2.10 `invoices`
| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| branch_id | INT | FK → branches.id, NOT NULL | Multi-branch |
| invoice_no | VARCHAR(32) | NOT NULL | Số hóa đơn tự sinh, format: `BD-{branchId}-{seq8digits}` |
| status | ENUM | 'draft','issued','paid','void' | Trạng thái vòng đời hóa đơn |
| sales_order_id | INT | NULL | **[Feature tương lai]** FK → sales_orders.id |
| session_id | INT | FK → court_sessions.id, UNIQUE, NOT NULL | |
| court_fee | DECIMAL(12,2) | NOT NULL | |
| extras_fee | DECIMAL(12,2) | NOT NULL | |
| discount_amount | DECIMAL(12,2) | DEFAULT 0 | |
| total_amount | DECIMAL(12,2) | NOT NULL | |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |
| deleted_at | DATETIME | NULL | Soft delete |
| version | INT | DEFAULT 0 | Optimistic locking |

### 2.11 `payments`
| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| branch_id | INT | FK → branches.id, NOT NULL | Multi-branch |
| invoice_id | INT | FK → invoices.id, UNIQUE, NOT NULL | |
| method | ENUM | 'cash','transfer' | |
| status | ENUM | 'pending','processing','paid','failed','cancelled','refunded' | Mở rộng 6 trạng thái |
| paid_at | DATETIME | NULL | |
| confirmed_at | DATETIME | NULL | Thời điểm xác nhận (dùng cho webhook) |
| employee_id | INT | FK → employees.id, NOT NULL | người thu ngân |
| idempotency_key | VARCHAR(64) | NULL | Chống duplicate payment — xem mục 3.8 |
| amount | DECIMAL(12,2) | NULL | Số tiền thực thu |
| currency | VARCHAR(3) | DEFAULT 'VND' | Đơn vị tiền tệ |
| provider | VARCHAR(50) | NULL | Cổng thanh toán (VietQR, MoMo, v.v.) |
| provider_reference | VARCHAR(128) | NULL | Mã tham chiếu từ cổng thanh toán |
| webhook_payload | JSON | NULL | Raw payload từ webhook — lưu để audit |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |
| deleted_at | DATETIME | NULL | Soft delete |
| version | INT | DEFAULT 0 | Optimistic locking |

### 2.12 `settings`
| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| key | VARCHAR(100) | UNIQUE, NOT NULL | VD: "operating_hours", "theme" |
| value | JSON | NOT NULL | linh hoạt cho nhiều loại cấu hình |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |

### 2.13 `activity_logs`
| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| employee_id | INT | FK → employees.id, NULL | NULL nếu action do admin không phải employee |
| user_id | INT | FK → users.id, NULL | Luôn có — kể cả non-employee user |
| branch_id | INT | FK → branches.id, NULL | Chi nhánh liên quan |
| action | VARCHAR(100) | NOT NULL | VD: "OPEN_COURT", "booking.cancelled" |
| target_type | VARCHAR(50) | NULL | VD: "court_session", "booking" |
| target_id | INT | NULL | |
| old_values | JSON | NULL | Trạng thái trước khi thay đổi |
| new_values | JSON | NULL | Trạng thái sau khi thay đổi |
| request_id | VARCHAR(64) | NULL | Tracing ID (từ X-Request-Id header) |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |

### 2.14 `branches` *(Mới từ v2.0)*
| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| organization_id | INT | NOT NULL | **[Feature tương lai]** FK → organizations.id |
| code | VARCHAR(32) | NOT NULL | Mã chi nhánh ngắn, VD: "HCM-01" |
| name | VARCHAR(255) | NOT NULL | Tên hiển thị chi nhánh |
| timezone | VARCHAR(64) | NOT NULL | VD: "Asia/Ho_Chi_Minh" |
| address | VARCHAR(500) | NULL | Địa chỉ vật lý |
| is_active | BOOLEAN | NOT NULL | DEFAULT true |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |

### 2.15 `branch_document_sequences` *(Mới từ v2.0)*
| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| branch_id | INT | FK → branches.id, NOT NULL | |
| document_type | VARCHAR(32) | NOT NULL | VD: "invoice" |
| next_value | BIGINT | NOT NULL | Giá trị kế tiếp, auto-increment per branch |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |

**Unique constraint:** `(branch_id, document_type)`

---

## 3. Ghi chú thiết kế quan trọng

### 3.1 Users vs Customers
Hệ thống tách `users` (dùng để đăng nhập: admin/nhân viên/khách có tài khoản) khỏi `customers` (hồ sơ khách hàng, có thể không có tài khoản đăng nhập — khách vãng lai). `customers.user_id` là **nullable** để hỗ trợ cả hai trường hợp.

### 3.2 Snapshot giá tại thời điểm giao dịch
`session_extras.unit_price` và việc tính `court_fee` đều **lưu snapshot** tại thời điểm phát sinh, không tham chiếu trực tiếp giá hiện tại của `extras`/`courts` — đảm bảo hóa đơn cũ không bị thay đổi khi giá cập nhật sau này.

### 3.3 Tính tiền theo khung giờ cao điểm/thấp điểm
`court_fee` được tính ở tầng Service (không phải trigger DB), cắt phiên chơi thành các đoạn 5 phút. Mỗi đoạn nhân với đơn giá tương ứng (`peak_price_per_hour` / `offpeak_price_per_hour`). Kết quả làm tròn về bội số 1,000 VND.

### 3.4 Tính nhất quán giao dịch
Các thao tác sau bọc trong **Sequelize transaction** (kể cả ghi `activity_logs`):
- Đóng sân → tạo Invoice → tạo Payment → cập nhật `customers.total_spent`.
- Checkout trừ tồn kho `extras.stock_quantity` đồng thời với tạo `session_extras`.
- Hủy booking / xác nhận booking → ghi audit log (atomically).

### 3.5 Index khuyến nghị
| Bảng | Index | Mục đích |
|---|---|---|
| bookings | (court_id, booking_date, start_time, end_time) | Kiểm tra trùng lịch nhanh |
| bookings | (branch_id, status) | Lọc booking theo chi nhánh & trạng thái |
| customers | (branch_id, phone) | UNIQUE — chống trùng số trong cùng chi nhánh, vẫn cho nhiều khách vãng lai không số |
| customers | (branch_id, loyalty_tier) | Phân tích khách VIP theo chi nhánh |
| court_sessions | (court_id, status) | Truy vấn sân đang chơi |
| court_sessions | (branch_id, status) | Dashboard theo chi nhánh |
| court_sessions | (open_court_id) | UNIQUE — chặn hai phiên cùng mở trên một sân ngay ở tầng DB. `open_court_id` là cột sinh tự động, mang `court_id` khi phiên đang mở và NULL khi đã đóng/xoá mềm |
| activity_logs | (employee_id, created_at) | Truy vấn log theo nhân viên/thời gian |
| activity_logs | (branch_id, created_at) | Audit log theo chi nhánh |
| payments | (idempotency_key) | UNIQUE — tra cứu idempotent request |

### 3.6 Multi-Branch Architecture *(Mới từ v2.0)*
Hầu hết các bảng nghiệp vụ (`courts`, `bookings`, `court_sessions`, `customers`, `employees`, `invoices`, `payments`, `activity_logs`) đều có cột `branch_id`. Middleware `branchContextMiddleware` đọc header `X-Branch-Id` từ request và attach `req.branchId` cho toàn bộ luồng xử lý. Mọi query ở tầng Service phải lọc theo `branchId` để đảm bảo data isolation giữa các chi nhánh.

### 3.7 Soft Delete & Optimistic Locking *(Mới từ v2.0)*
- **Soft Delete (`paranoid: true`)**: Các bảng nghiệp vụ chính dùng `deleted_at` thay vì xóa vật lý. Sequelize tự động thêm `WHERE deleted_at IS NULL` vào mọi query.
- **Optimistic Locking (`version`)**: Cột `version` tự tăng mỗi lần update, ngăn chặn lost-update trong môi trường concurrent. Sequelize sẽ throw `OptimisticLockError` nếu version không khớp.

### 3.8 Idempotent Payment Design *(Mới từ v2.0)*
`payments.idempotency_key` đảm bảo một request thanh toán không bị xử lý 2 lần dù client retry. Format mặc định: `session-{sessionId}`. Frontend gửi qua header `Idempotency-Key`. Backend kiểm tra trước khi tạo payment mới — nếu key đã tồn tại và khớp sessionId, trả về kết quả cũ mà không tạo bản ghi mới.

### 3.9 Vòng đời Hóa đơn (Invoice Lifecycle)
```
draft → issued → paid
           └──→ void
```
- `draft`: Invoice tạo nhưng chưa xuất (reserved cho future workflow)
- `issued`: Invoice đã xuất, chờ thanh toán
- `paid`: Đã thanh toán thành công
- `void`: Hủy hóa đơn

### 3.10 Feature Tương Lai (cần document để implement)

#### `organizations` table *(chưa có model — cần tạo)*
Bảng tổ chức quản lý nhiều chi nhánh. `branches.organization_id` hiện là NOT NULL nhưng chưa có FK constraint.
| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | INT PK | |
| name | VARCHAR(255) | Tên tổ chức/công ty |
| slug | VARCHAR(100) UNIQUE | VD: "badminton-digital-hcm" |
| plan | VARCHAR(50) | Gói dịch vụ: free/pro/enterprise |
| is_active | BOOLEAN | |
| created_at | DATETIME | |
| updated_at | DATETIME | |

#### `sales_orders` table *(chưa có model — cần tạo)*
`invoices.sales_order_id` dự kiến link tới sales order trong quy trình bán hàng phức tạp hơn (đặt trước, trả sau, nhiều invoice / 1 order).

---

## 4. Ánh xạ bảng ↔ API/Use Case

| Bảng | Use Case liên quan | API liên quan |
|---|---|---|
| branches, branch_document_sequences | Multi-branch management | Branch API (tương lai) |
| courts, court_sessions | UC-05, UC-06, UC-07, UC-08, UC-09 | Court API |
| bookings | UC-10, UC-11, UC-12, UC-13 | Booking API |
| customers | UC-14, UC-15 | Customer API |
| employees, activity_logs | UC-16 | Employee API |
| extras, session_extras | UC-17 | Accessories API |
| invoices, payments | UC-18 | Payment API |
| settings | UC-21 | Settings API |

---

## 5. Changelog

| Phiên bản | Ngày | Thay đổi chính |
|---|---|---|
| v1.0 | 19/07/2026 | Thiết kế ban đầu — 13 bảng |
| v2.0 | 11/08/2026 | Thêm `branches`, `branch_document_sequences`; thêm `branch_id` + soft-delete + version vào 8 bảng; mở rộng `invoices` (invoice_no, status, sales_order_id), `payments` (7 cột mới), `activity_logs` (user_id, branch_id, old/new_values, request_id); document feature tương lai: organizations, sales_orders |
