# Database Design & ERD
## Dự án: Badminton Digital Management – Hệ thống quản lý sân cầu lông

**Phiên bản:** 1.0
**Ngày:** 19/07/2026
**Tài liệu tham chiếu:** `SRS.md`, `UseCase.md`, `APIDesign.md`, `Architecture.md`
**Công nghệ:** MySQL 8 + Sequelize ORM

---

## 1. Sơ đồ quan hệ tổng quan (ERD – dạng văn bản)

```
Roles 1───∞ Users 1───1 Employees
                │
                └───1 Customers (Users đóng vai trò Customer, hoặc Customers độc lập – xem mục 3.1)

Courts 1───∞ CourtSessions ∞───1 Bookings (nullable, nếu phiên phát sinh từ booking)
CourtSessions 1───∞ SessionExtras ∞───1 Extras
CourtSessions 1───1 Invoices 1───1 Payments

Customers 1───∞ Bookings
Customers 1───∞ CourtSessions (khách gắn với phiên chơi)
Employees 1───∞ ActivityLogs
Employees 1───∞ CourtSessions (nhân viên phụ trách mở/đóng sân)

Settings (bảng cấu hình độc lập, không quan hệ FK trực tiếp)
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
| refresh_token | VARCHAR(500) | NULL | có thể tách bảng riêng nếu multi-device |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |

### 2.3 `employees`
| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| user_id | INT | FK → users.id, UNIQUE, NOT NULL | 1-1 với users |
| position | VARCHAR(50) | NULL | VD: thu ngân, quản lý ca |
| shift | VARCHAR(50) | NULL | ca sáng/chiều/tối |
| hired_at | DATE | NULL | |

### 2.4 `customers`
| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| user_id | INT | FK → users.id, NULL | NULL nếu khách vãng lai không có tài khoản |
| full_name | VARCHAR(100) | NOT NULL | |
| phone | VARCHAR(20) | UNIQUE, NOT NULL | dùng để tra cứu nhanh |
| email | VARCHAR(100) | NULL | |
| total_spent | DECIMAL(12,2) | DEFAULT 0 | denormalized, cập nhật khi có Payment |
| loyalty_tier | VARCHAR(20) | DEFAULT 'normal' | normal / silver / gold |
| created_at | DATETIME | NOT NULL | |

### 2.5 `courts`
| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| name | VARCHAR(50) | NOT NULL | VD: "Sân số 1" |
| status | ENUM | 'empty','playing','maintenance' | DEFAULT 'empty' |
| peak_price_per_hour | DECIMAL(10,2) | NOT NULL | |
| offpeak_price_per_hour | DECIMAL(10,2) | NOT NULL | |
| note | VARCHAR(255) | NULL | |
| created_at | DATETIME | NOT NULL | |

### 2.6 `bookings`
| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| court_id | INT | FK → courts.id, NOT NULL | |
| customer_id | INT | FK → customers.id, NULL | |
| booking_date | DATE | NOT NULL | |
| start_time | TIME | NOT NULL | |
| end_time | TIME | NOT NULL | |
| status | ENUM | 'pending','confirmed','cancelled','completed' | DEFAULT 'pending' |
| created_by | INT | FK → users.id, NOT NULL | ai tạo booking (NV hoặc chính khách) |
| created_at | DATETIME | NOT NULL | |

**Index đề xuất:** `(court_id, booking_date, start_time, end_time)` — phục vụ kiểm tra trùng lịch (UC-11) nhanh.

### 2.7 `court_sessions`
| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| court_id | INT | FK → courts.id, NOT NULL | |
| booking_id | INT | FK → bookings.id, NULL | NULL nếu khách vãng lai |
| customer_id | INT | FK → customers.id, NULL | |
| employee_id | INT | FK → employees.id, NOT NULL | người mở/đóng sân |
| start_time | DATETIME | NOT NULL | |
| end_time | DATETIME | NULL | NULL khi đang chơi |
| duration_seconds | INT | NULL | tính khi đóng sân |
| court_fee | DECIMAL(12,2) | NULL | tính khi đóng sân |
| status | ENUM | 'playing','closed' | DEFAULT 'playing' |

### 2.8 `extras` (phụ kiện)
| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| name | VARCHAR(100) | NOT NULL | VD: "Cầu lông Yonex", "Nước suối" |
| price | DECIMAL(10,2) | NOT NULL | |
| stock_quantity | INT | DEFAULT 0 | |
| low_stock_threshold | INT | DEFAULT 5 | cảnh báo sắp hết hàng |
| created_at | DATETIME | NOT NULL | |

### 2.9 `session_extras`
| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| session_id | INT | FK → court_sessions.id, NOT NULL | |
| extra_id | INT | FK → extras.id, NOT NULL | |
| quantity | INT | NOT NULL | |
| unit_price | DECIMAL(10,2) | NOT NULL | snapshot giá tại thời điểm dùng |
| subtotal | DECIMAL(12,2) | NOT NULL | quantity × unit_price |

### 2.10 `invoices`
| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| session_id | INT | FK → court_sessions.id, UNIQUE, NOT NULL | |
| court_fee | DECIMAL(12,2) | NOT NULL | |
| extras_fee | DECIMAL(12,2) | NOT NULL | |
| discount_amount | DECIMAL(12,2) | DEFAULT 0 | |
| total_amount | DECIMAL(12,2) | NOT NULL | |
| created_at | DATETIME | NOT NULL | |

### 2.11 `payments`
| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| invoice_id | INT | FK → invoices.id, UNIQUE, NOT NULL | |
| method | ENUM | 'cash','transfer' | |
| status | ENUM | 'pending','paid','failed' | DEFAULT 'paid' |
| paid_at | DATETIME | NULL | |
| employee_id | INT | FK → employees.id, NOT NULL | người thu ngân |

### 2.12 `settings`
| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| key | VARCHAR(100) | UNIQUE, NOT NULL | VD: "operating_hours", "theme" |
| value | JSON | NOT NULL | linh hoạt cho nhiều loại cấu hình |
| updated_at | DATETIME | NOT NULL | |

### 2.13 `activity_logs`
| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| employee_id | INT | FK → employees.id, NOT NULL | |
| action | VARCHAR(100) | NOT NULL | VD: "OPEN_COURT", "CHECKOUT" |
| target_type | VARCHAR(50) | NULL | VD: "court_session" |
| target_id | INT | NULL | |
| created_at | DATETIME | NOT NULL | |

---

## 3. Ghi chú thiết kế quan trọng

### 3.1 Users vs Customers
Hệ thống tách `users` (dùng để đăng nhập: admin/nhân viên/khách có tài khoản) khỏi `customers` (hồ sơ khách hàng, có thể không có tài khoản đăng nhập — khách vãng lai). `customers.user_id` là **nullable** để hỗ trợ cả hai trường hợp.

### 3.2 Snapshot giá tại thời điểm giao dịch
`session_extras.unit_price` và việc tính `court_fee` đều **lưu snapshot** tại thời điểm phát sinh, không tham chiếu trực tiếp giá hiện tại của `extras`/`courts` — đảm bảo hóa đơn cũ không bị thay đổi khi giá cập nhật sau này.

### 3.3 Tính tiền theo khung giờ cao điểm/thấp điểm
`court_fee` được tính ở tầng Service (không phải trigger DB), có thể cắt một phiên chơi thành nhiều đoạn thời gian nếu phiên đó vắt qua ranh giới khung giờ, mỗi đoạn nhân với đơn giá tương ứng (`peak_price_per_hour` / `offpeak_price_per_hour`).

### 3.4 Tính nhất quán giao dịch
Các thao tác sau cần bọc trong **transaction** (Sequelize `transaction`):
- Đóng sân → tạo Invoice → tạo Payment → cập nhật `customers.total_spent`.
- Checkout trừ tồn kho `extras.stock_quantity` đồng thời với tạo `session_extras`.

### 3.5 Index khuyến nghị
| Bảng | Index | Mục đích |
|---|---|---|
| bookings | (court_id, booking_date, start_time, end_time) | Kiểm tra trùng lịch nhanh |
| customers | (phone) | Tìm kiếm khách hàng |
| court_sessions | (court_id, status) | Truy vấn sân đang chơi |
| activity_logs | (employee_id, created_at) | Truy vấn log theo nhân viên/thời gian |

---

## 4. Ánh xạ bảng ↔ API/Use Case

| Bảng | Use Case liên quan | API liên quan |
|---|---|---|
| courts, court_sessions | UC-05, UC-06, UC-07, UC-08, UC-09 | Court API |
| bookings | UC-10, UC-11, UC-12, UC-13 | Booking API |
| customers | UC-14, UC-15 | Customer API |
| employees, activity_logs | UC-16 | Employee API |
| extras, session_extras | UC-17 | Accessories API |
| invoices, payments | UC-18 | Payment API |
| settings | UC-21 | Settings API |

---

## 5. Việc cần làm ở bước tiếp theo (Phase 3 — Backend)
- Chuyển các bảng trên thành **Sequelize Migrations** (`database/migrations/`).
- Viết **Seeders** cho dữ liệu mẫu: roles mặc định, vài sân, vài phụ kiện (`database/seeders/`).
- Vẽ ERD trực quan (VD: dùng dbdiagram.io hoặc MySQL Workbench) và lưu ảnh vào `database/ERD/`.
