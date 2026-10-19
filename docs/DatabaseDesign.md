# Database Design & ERD
## Dự án: Badminton Digital Management – Hệ thống quản lý sân cầu lông

**Phiên bản:** 2.2
**Ngày cập nhật:** 18/10/2026 (từ v2.1 ngày 15/08/2026, v2.0 ngày 11/08/2026 — lịch sử ở mục 5)
**Tài liệu tham chiếu:** `SRS.md`, `UseCase.md`, `APIDesign.md`, `Architecture.md`
**Công nghệ:** MySQL 8 + Sequelize ORM (paranoid soft-delete, optimistic locking)
**Phạm vi:** CSDL của **app chính** (`badminton_digital_management`, 34 bảng nghiệp vụ + `SequelizeMeta`, do 44 migration tạo ra). Dịch vụ thi đấu có CSDL riêng (`competition_service`, 21 bảng) — tóm tắt ở mục 6, thiết kế đầy đủ ở `services/competition-service/docs/01-kien-truc.md` mục 5.
**Lưu ý đọc tài liệu:** mọi cột `DATETIME` lưu **UTC** (migration `20260821400001-store-datetime-as-utc.js`), riêng `bookings.booking_date`/`start_time`/`end_time` là giờ treo tường của chi nhánh (`DATE`/`TIME`). Các bảng có `created_at`/`updated_at` (`DATETIME NOT NULL`) không liệt kê lại ở bảng mới.

---

## 1. Sơ đồ quan hệ tổng quan (ERD – dạng văn bản)

```
Organizations 1───∞ Branches            (bảng có thật từ migration M1; chưa có model/API — xem 3.11)
                       │
   Branches 1───∞ Courts ───∞ CourtSessions
   Branches 1───∞ Bookings
   Branches 1───∞ Employees ───1 Users
   Branches 1───∞ Invoices
   Branches 1───∞ Payments
   Branches 1───∞ ActivityLogs
   Branches 1───∞ BranchDocumentSequences
   Branches 1───∞ ExtraStocks            (tồn kho phụ kiện riêng theo chi nhánh)
   Branches 1───∞ ProductStocks          (tồn kho hàng bán lẻ riêng theo chi nhánh)
   Branches 1───∞ StockMovements
   Branches 1───∞ GoodsReceipts
   Branches 1───∞ SalesOrders

Roles 1───∞ Users 1───1 Employees
                 └───1 Customers (nullable, khách vãng lai không cần tài khoản)

Customers — dùng chung toàn chuỗi (KHÔNG có branch_id, xem mục 3.6):
Customers 1───∞ Bookings
Customers 1───∞ CourtSessions
Customers 1───∞ SalesOrders
Customers 1───∞ CustomerNotifications   (booking_id tham chiếu mềm, không khoá ngoại)
Employees 1───∞ ActivityLogs
Employees 1───∞ CourtSessions           (nhân viên mở/đóng sân)
Employees 1───∞ Payments                (thu ngân; NULL với thanh toán online)
Employees 1───∞ SalesOrders             (cashier_employee_id)
Users 1───∞ ActivityLogs                (log cho cả non-employee users)
Users 1───∞ StockMovements              (actor_user_id — ai thao tác kho)
Users 1───∞ GoodsReceipts               (received_by_user_id — ai nhận hàng)

Thuê sân:
Courts 1───∞ CourtSessions
CourtSessions (nullable) ∞───1 Bookings
CourtSessions 1───∞ SessionExtras ∞───1 Extras

Hoá đơn — mỗi hoá đơn có đúng MỘT nguồn (chk_invoices_one_source):
CourtSessions 1───0..1 Invoices         (thuê sân)
SalesOrders   1───0..1 Invoices         (bán lẻ POS hoặc đơn online)
Invoices 1───∞ InvoiceLines             (tiền sân, hàng, giảm giá… — căn cứ báo cáo doanh thu chi tiết)
Invoices 1───1 Payments

Bán lẻ (danh mục dùng chung toàn chuỗi):
ProductCategories 1───∞ Products 1───∞ ProductVariants
ProductVariants 1───∞ ProductStocks ∞───1 Branches
ProductVariants 1───∞ SalesOrderLines ∞───1 SalesOrders
Vouchers 1───∞ SalesOrders              (voucher_id)
SalesOrders ∞───0..1 CourtSessions      (channel = 'session': phụ kiện gọi trong phiên chơi)

Kho:
Extras 1───∞ ExtraStocks ∞───1 Branches (tồn kho + giá vốn BQ, theo từng chi nhánh)
Extras 1───∞ StockMovements             (sổ nhật ký xuất/nhập)
Extras 1───∞ GoodsReceiptItems
Suppliers 1───∞ GoodsReceipts 1───∞ GoodsReceiptItems
StockMovements và GoodsReceiptItems trỏ tới Extra HOẶC ProductVariant, không bao giờ cả hai
(chk_stock_movements_one_item, chk_goods_receipt_items_one_item)

Tích hợp với dịch vụ thi đấu (không có khoá ngoại sang CSDL kia):
IntegrationOutbox                       (sự kiện bd.customer.* chờ gửi đi)
IntegrationInbox                        (sự kiện competition.* đã nhận, chống xử lý trùng)

Bảng độc lập: Settings, BranchSettings (cấu hình, không có khoá ngoại trực tiếp), CustomerMergeAudit (chỉ ghi bởi migration)
```

---

## 2. Danh sách bảng chi tiết

### 2.1 `roles`
| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| name | VARCHAR(50) | UNIQUE, NOT NULL | `admin` / `branch_manager` / `employee` / `customer` (tạo bởi migration, kể cả `branch_manager` từ `20260815300002` và bước đảm bảo `20260912100001-ensure-core-roles`) |
| description | VARCHAR(255) | NULL | |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |

### 2.2 `users`
| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| role_id | INT | FK → roles.id, NOT NULL | |
| email | VARCHAR(100) | UNIQUE, NULL | Có thể NULL (đăng nhập bằng SĐT, khách tự đăng ký không bắt buộc email) |
| password_hash | VARCHAR(255) | NOT NULL | bcrypt. `defaultScope` của model loại cột này; chỉ `AuthService` nạp qua `User.scope('withSecrets')` |
| full_name | VARCHAR(100) | NOT NULL | |
| phone | VARCHAR(20) | UNIQUE (`uq_users_phone`), NULL | Đã chuẩn hoá (bỏ khoảng trắng, dấu gạch, tiền tố +84) |
| avatar_url | VARCHAR(255) | NULL | |
| is_active | BOOLEAN | DEFAULT true | |
| refresh_token | TEXT | NULL | **Chỉ lưu sha256 của refresh token hiện hành**; NULL khi đăng xuất. Cũng bị `defaultScope` loại |
| previous_refresh_token | VARCHAR(64) | NULL | sha256 của refresh token liền trước — còn hiệu lực trong 30 giây để hai tab làm mới cùng lúc không đá nhau (xem 3.13) |
| previous_refresh_expires_at | DATETIME | NULL | Hết hạn của khoảng "ân hạn" trên |
| token_version | INT | NOT NULL, DEFAULT 0 | Số phiên bản phiên đăng nhập; access token mang `tv` và bị từ chối nếu lệch. Đăng xuất, đổi và đặt lại mật khẩu tăng số này (xem 3.13) |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |
| deleted_at | DATETIME | NULL | Soft delete (paranoid) |
| version | INT | DEFAULT 0 | Optimistic locking |

Ràng buộc CHECK `chk_users_login_identity`: `email IS NOT NULL OR phone IS NOT NULL` — tài khoản luôn có ít nhất một cách đăng nhập.

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

### 2.4 `customers` *(dùng chung toàn chuỗi từ v2.1 — xem mục 3.6)*
| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| user_id | INT | FK → users.id, NULL | NULL nếu khách vãng lai không có tài khoản |
| full_name | VARCHAR(100) | NOT NULL | |
| phone | VARCHAR(20) | NULL, UNIQUE toàn hệ thống (`uk_customers_phone`) | Cho phép rỗng để khách vãng lai vẫn là khách hàng (hồ sơ thiếu thông tin). **Không còn `branch_id`** — 1 khách hàng dùng chung 1 hồ sơ ở mọi chi nhánh; MySQL cho phép nhiều NULL trong unique index nên nhiều khách vãng lai không số vẫn tồn tại song song |
| email | VARCHAR(100) | NULL | |
| total_spent | DECIMAL(12,2) | DEFAULT 0 | denormalized, cập nhật khi có Payment (gộp trên mọi chi nhánh) |
| loyalty_tier | VARCHAR(20) | DEFAULT 'normal' | **normal / gold / vip** |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |
| deleted_at | DATETIME | NULL | Soft delete |
| version | INT | DEFAULT 0 | Optimistic locking |

**Ngưỡng loyalty_tier** (tính ở `PaymentService`, dựa trên `total_spent` cộng dồn toàn chuỗi):
- `normal`: < 5,000,000 VND tổng chi tiêu
- `gold`: >= 5,000,000 VND
- `vip`: >= 15,000,000 VND

> **Đăng ký tự phục vụ không gắn hồ sơ cũ.** Khi khách tự đăng ký, tài khoản luôn nhận một hồ sơ `customers` mới. Nếu số điện thoại đã thuộc một hồ sơ khác (khách tại quầy) thì hồ sơ mới để `phone = NULL` (vì `uk_customers_phone`); nhân viên xác minh rồi gộp bằng `CustomerService.mergeIntoAccount` (chuyển `court_sessions`, `bookings`, `sales_orders`, cộng `total_spent`, tính lại hạng, xoá mềm hồ sơ cũ, ghi `activity_logs` hành động `customer.merged`).

> Cột `branch_id` bị bỏ hẳn khỏi bảng này ở migration
> `20260815300001-unify-customers-chain-wide.js` — trước đó một khách đặt sân
> ở 2 chi nhánh bị tách thành 2 hồ sơ riêng (unique theo `(branch_id, phone)`),
> khiến loyalty/tổng chi tiêu không gộp được. `Booking`/`CourtSession`/
> `Invoice`/`Payment` vẫn giữ `branch_id` riêng để biết giao dịch diễn ra ở
> đâu — chỉ danh tính khách hàng là dùng chung.

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

**Index thực tế:** `idx_bookings_conflict_check (court_id, booking_date, start_time, end_time)` — phục vụ kiểm tra trùng lịch (UC-11) nhanh; `idx_bookings_branch_court_date (branch_id, court_id, booking_date)` — lưới sân × giờ của một ngày.

**Ghi chú nghiệp vụ** (không có ràng buộc ở tầng DB, kiểm trong `BookingService`): lịch `pending` do **khách tự đặt** mà chưa được duyệt sẽ tự chuyển `cancelled` theo `booking_policy` (xem 3.15); khách chỉ đặt trước tối đa 14 ngày và tối đa 3 giờ mỗi lần; một khách giữ tối đa 5 lịch `pending`/`confirmed` chưa kết thúc.

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
| billed_from | DATETIME | NULL | Mốc bắt đầu của đoạn chưa tính tiền; đổi sân thì đoạn đã chơi được chốt vào `accrued_court_fee` rồi mốc này dời sang lúc chuyển |
| accrued_court_fee | DECIMAL(12,2) | NOT NULL, DEFAULT 0 | Tiền sân của các đoạn đã chơi ở sân trước khi chuyển sân; mọi chỗ tính tiền một phiên phải đi qua `calculateSessionCourtFee`, không tính lại từ `start_time` |
| open_court_id | INT | UNIQUE (`uq_court_sessions_open_court`), cột sinh tự động | Bằng `court_id` khi phiên đang mở, NULL khi đã đóng hoặc xoá mềm — chặn hai phiên cùng mở trên một sân ngay ở DB |
| status | ENUM | 'playing','closed' | DEFAULT 'playing' |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |
| deleted_at | DATETIME | NULL | Soft delete |
| version | INT | DEFAULT 0 | Optimistic locking |

### 2.8 `extras` (danh mục phụ kiện — dùng chung mọi chi nhánh)
| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| name | VARCHAR(100) | NOT NULL | VD: "Cầu lông Yonex", "Nước suối" |
| price | DECIMAL(10,2) | NOT NULL | |
| low_stock_threshold | INT | DEFAULT 5 | cảnh báo sắp hết hàng |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |
| deleted_at | DATETIME | NULL | Soft delete |
| version | INT | DEFAULT 0 | Optimistic locking |

> **`stock_quantity` đã bị xóa** khỏi bảng này ở migration
> `20260815000002-inventory-foundation.js`. Số lượng tồn không còn là 1 số
> toàn hệ thống — nó chuyển sang bảng `extra_stocks` (1 dòng theo mỗi cặp
> sản phẩm/chi nhánh), xem mục 2.16. `extras` giờ chỉ còn là danh mục
> (tên, giá bán, ngưỡng cảnh báo) dùng chung cho mọi chi nhánh.

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
| invoice_no | VARCHAR(32) | NOT NULL | Số hóa đơn tự sinh, format: `BD-{branchId}-{seq8digits}`; unique theo `(branch_id, invoice_no)` (`uk_invoices_branch_invoice_no`) |
| status | ENUM | 'draft','issued','paid','void' | DEFAULT 'issued' — vòng đời hóa đơn (xem 3.9) |
| sales_order_id | INT | FK → sales_orders.id, NULL | Có giá trị với hoá đơn của đơn bán lẻ (POS hoặc đơn online) |
| session_id | INT | FK → court_sessions.id, UNIQUE, NULL | Có giá trị với hoá đơn thuê sân. Đúng một trong `session_id`/`sales_order_id` khác NULL (`chk_invoices_one_source`) |
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
| employee_id | INT | FK → employees.id, NULL | Người thu ngân; NULL với đơn online chuyển khoản không cần nhân viên |
| idempotency_key | VARCHAR(64) | UNIQUE, NULL | Chống duplicate payment — xem mục 3.8 |
| amount | DECIMAL(12,2) | NULL | Số tiền thực thu |
| currency | VARCHAR(3) | DEFAULT 'VND' | Đơn vị tiền tệ |
| provider | VARCHAR(50) | NULL | Cổng thanh toán (VietQR, MoMo, v.v.) |
| provider_reference | VARCHAR(128) | NULL | Mã tham chiếu từ cổng thanh toán; unique theo `(provider, provider_reference)` — một mã giao dịch không xác nhận được hai thanh toán |
| webhook_payload | JSON | NULL | Raw payload từ webhook — lưu để audit |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |
| deleted_at | DATETIME | NULL | Soft delete |
| version | INT | DEFAULT 0 | Optimistic locking |

### 2.12 `settings`
| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| key | VARCHAR(100) | UNIQUE, NOT NULL | Các khoá đang dùng: `pricing`, `operating_hours`, `branding`, `discount_policy`, `booking_policy`, `notification_policy` |
| value | JSON | NOT NULL | linh hoạt cho nhiều loại cấu hình |

Giá trị của ba khoá chính sách (mặc định khi chưa có hoặc sai kiểu):
- `discount_policy`: `{ employeeMaxPercent }` — trần giảm giá tay của `employee`, 0–100, mặc định 10.
- `booking_policy`: `{ maxActivePerCustomer, pendingExpiryHours, pendingExpireBeforeStartMinutes }` — mặc định 5, 24, 60; `0` là tắt quy tắc đó.
- `notification_policy`: `{ email }` — công tắc gửi email thông báo, mặc định bật.
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

Nhật ký không bao giờ chứa mật khẩu hay token (migration `20260814110001-scrub-secrets-from-activity-logs` đã dọn dữ liệu cũ). Index `idx_activity_logs_entity_timeline (branch_id, target_type, target_id, created_at)` phục vụ xem lịch sử của một đối tượng.

### 2.14 `branches` *(Mới từ v2.0)*
| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| organization_id | INT | FK → organizations.id, NOT NULL | Hiện chỉ có một tổ chức (xem 3.11) |
| code | VARCHAR(32) | NOT NULL | Mã chi nhánh ngắn, VD: "HCM-01"; unique theo `(organization_id, code)` |
| name | VARCHAR(255) | NOT NULL | Tên hiển thị chi nhánh |
| timezone | VARCHAR(64) | NOT NULL, DEFAULT 'Asia/Ho_Chi_Minh' | Múi giờ của chi nhánh: "hôm nay", giờ cao điểm, giờ mở cửa và gộp báo cáo đều tính theo đây |
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

### 2.16 `suppliers` *(Mới từ v2.1 — hệ thống quản lý kho hàng)*
| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| name | VARCHAR(150) | NOT NULL | Tên nhà cung cấp |
| phone | VARCHAR(20) | NULL | |
| email | VARCHAR(150) | NULL | |
| address | VARCHAR(255) | NULL | |
| tax_code | VARCHAR(50) | NULL | Mã số thuế |
| note | VARCHAR(255) | NULL | |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |
| deleted_at | DATETIME | NULL | Soft delete |
| version | INT | DEFAULT 0 | Optimistic locking |

Không gắn `branch_id` — 1 danh sách nhà cung cấp dùng chung cho mọi chi nhánh
khi tạo phiếu nhập kho.

### 2.17 `extra_stocks` *(Mới từ v2.1)*
| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| extra_id | INT | FK → extras.id, NOT NULL | |
| branch_id | INT | FK → branches.id, NOT NULL | |
| quantity | INT | NOT NULL, DEFAULT 0 | Tồn kho hiện tại của sản phẩm này **tại chi nhánh này** |
| average_cost | DECIMAL(10,2) | NULL | Giá vốn bình quân gia quyền, `NULL` nếu chưa từng nhập kho ở chi nhánh này |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |
| version | INT | DEFAULT 0 | Optimistic locking |

**Unique constraint:** `(extra_id, branch_id)` (`uk_extra_stocks_extra_branch`) —
mỗi sản phẩm có đúng 1 dòng tồn kho trên mỗi chi nhánh.

`InventoryService.postMovement` là **entry point duy nhất** được phép đổi
`quantity`/`average_cost` — khoá dòng (`SELECT ... FOR UPDATE`) trong
transaction trước khi cập nhật, xem mục 3.4.

### 2.18 `stock_movements` *(Mới từ v2.1 — sổ nhật ký xuất/nhập kho)*
| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| branch_id | INT | FK → branches.id, NOT NULL | |
| extra_id | INT | FK → extras.id, NULL | Phụ kiện trong sân; NULL khi dòng này của hàng bán lẻ |
| product_variant_id | INT | FK → product_variants.id, NULL | Biến thể hàng bán lẻ; đúng một trong `extra_id`/`product_variant_id` khác NULL (`chk_stock_movements_one_item`) |
| type | ENUM | NOT NULL | 8 giá trị — xem bảng bên dưới |
| quantity | INT | NOT NULL | Luôn dương; chiều tăng/giảm suy ra từ `type` |
| unit_cost | DECIMAL(10,2) | NULL | Chỉ có ý nghĩa với `purchase_receipt` — dùng để tính lại `average_cost` |
| note | VARCHAR(255) | NULL | Bắt buộc nhập ở tầng service cho các loại điều chỉnh thủ công |
| reference_type | VARCHAR(32) | NULL | VD: `goods_receipt`, `session_extra`, `manual` |
| reference_id | INT | NULL | ID của bản ghi nguồn gốc (phiếu nhập, session_extra...) |
| actor_user_id | INT | FK → users.id, NULL | Người thực hiện thao tác |
| created_at | DATETIME | NOT NULL | Không có `updated_at` — bản ghi bất biến (ledger) |

**8 loại giao dịch** (`StockMovement.MOVEMENT_TYPES`), chia theo chiều tác động lên `extra_stocks.quantity`:

| `type` | Chiều | Khi nào phát sinh |
|---|---|---|
| `opening_balance` | Vào | Khởi tạo tồn đầu kỳ |
| `purchase_receipt` | Vào | Tạo phiếu nhập kho — duy nhất loại làm thay đổi `average_cost` |
| `sale_return` | Vào | Trả lại phụ kiện chưa dùng từ phiên chơi |
| `adjustment_in` | Vào | Điều chỉnh thủ công tăng |
| `sale` | Ra | Gọi phụ kiện vào phiên chơi (`SessionExtra`) |
| `adjustment_out` | Ra | Điều chỉnh thủ công giảm |
| `damaged` | Ra | Hàng hỏng |
| `lost` | Ra | Thất lạc |

**Index:** `(branch_id, extra_id, created_at)` và `(branch_id, product_variant_id, created_at)` — truy vấn lịch sử theo chi
nhánh/sản phẩm/thời gian; `(reference_type, reference_id)` — tra ngược từ
phiếu nhập/session_extra về các dòng movement liên quan.

### 2.19 `goods_receipts` (phiếu nhập kho) *(Mới từ v2.1)*
| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| branch_id | INT | FK → branches.id, NOT NULL | |
| code | VARCHAR(32) | NOT NULL | Mã phiếu tự sinh: `GR-{branchId}-{seq8digits}`, cùng cơ chế `BranchDocumentSequence` với `invoice_no` |
| supplier_id | INT | FK → suppliers.id, NULL | Không bắt buộc |
| received_by_user_id | INT | FK → users.id, NULL | Người nhập kho |
| note | VARCHAR(255) | NULL | |
| total_cost | DECIMAL(12,2) | NOT NULL, DEFAULT 0 | Σ (quantity × unit_cost) của các dòng `goods_receipt_items` |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |
| version | INT | DEFAULT 0 | Optimistic locking |

**Unique constraint:** `(branch_id, code)` (`uk_goods_receipts_branch_code`).

### 2.20 `goods_receipt_items` *(Mới từ v2.1)*
| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| goods_receipt_id | INT | FK → goods_receipts.id, NOT NULL, ON DELETE CASCADE | |
| extra_id | INT | FK → extras.id, NULL | Phụ kiện; NULL nếu dòng này nhập hàng bán lẻ |
| product_variant_id | INT | FK → product_variants.id, NULL | Biến thể hàng bán lẻ; đúng một trong hai cột này khác NULL (`chk_goods_receipt_items_one_item`) |
| quantity | INT | NOT NULL | |
| unit_cost | DECIMAL(10,2) | NOT NULL | Đơn giá nhập của dòng này |
| subtotal | DECIMAL(12,2) | NOT NULL | quantity × unit_cost |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |

Mỗi dòng khi tạo sẽ kéo theo đúng 1 `StockMovement` (`type: purchase_receipt`)
qua `InventoryService.postMovement`, trong cùng transaction với việc tạo
`GoodsReceipt`/`GoodsReceiptItem` (`GoodsReceiptService.createGoodsReceipt`).

### 2.21 `invoice_lines` *(Mới từ v2.2 — hoá đơn nhiều dòng)*
| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | INT | PK, AUTO_INCREMENT | |
| invoice_id | INT | FK → invoices.id, NOT NULL | Index `idx_invoice_lines_invoice` |
| line_kind | ENUM | NOT NULL, DEFAULT 'other' | `court_time`, `product`, `rental`, `discount`, `tax`, `other` — nguồn của dòng; báo cáo doanh thu chi tiết tách 4 nhóm từ cột này |
| description | VARCHAR(255) | NOT NULL | VD: "Giảm giá: khách quen" |
| quantity | INT | NOT NULL, DEFAULT 1 | |
| unit_price | DECIMAL(12,2) | NOT NULL | |
| amount | DECIMAL(12,2) | NOT NULL | Thành tiền (dòng giảm giá mang số âm) |
| reference_type / reference_id | VARCHAR(50) / INT | NULL | Tham chiếu mềm về bản ghi nguồn (dòng đơn, phụ kiện trong phiên…) |

Chỉ có dữ liệu từ 16/08/2026; hoá đơn tạo trước mốc này không có dòng (cố ý không backfill) nên không xuất hiện trong báo cáo doanh thu chi tiết, nhưng vẫn tính đủ ở báo cáo doanh thu tổng.

### 2.22 `product_categories`, `products`, `product_variants` *(Mới từ v2.2 — danh mục bán lẻ, dùng chung toàn chuỗi)*
**`product_categories`:** `id`, `name` VARCHAR(100) NOT NULL, `sort_order` INT NOT NULL DEFAULT 0 (phẳng, không phân cấp).

**`products`:**
| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | INT | PK | |
| category_id | INT | FK → product_categories.id, NULL | |
| product_type | ENUM | NOT NULL, DEFAULT 'retail' | `retail`, `consumable`, `rental`, `service`; trang khách chỉ hiện `retail` đang mở bán |
| name | VARCHAR(150) | NOT NULL | |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | Ngừng bán |
| legacy_extra_id | INT | UNIQUE, NULL | Dấu vết của phụ kiện cũ (`extras`) đã chuyển sang danh mục mới (migration `20260805000002-m2-catalog-sales-orders`) |

**`product_variants`:**
| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | INT | PK | |
| product_id | INT | FK → products.id, NOT NULL | |
| sku | VARCHAR(64) | UNIQUE, NOT NULL | |
| size / color | VARCHAR(50) | NULL | Thuộc tính biến thể |
| list_price | DECIMAL(12,2) | NOT NULL | Giá bán niêm yết; giá của đơn luôn lấy từ đây phía máy chủ, không tin giá client gửi |
| track_inventory | BOOLEAN | NOT NULL, DEFAULT true | Không theo dõi thì luôn coi là còn hàng và không trừ kho |
| low_stock_threshold | INT | NOT NULL, DEFAULT 5 | Ngưỡng cảnh báo sắp hết |

### 2.23 `product_stocks` *(Mới từ v2.2)*
Tương tự `extra_stocks` (2.17) cho hàng bán lẻ: `product_variant_id` + `branch_id` (unique `uk_product_stocks_variant_branch`), `quantity` NOT NULL DEFAULT 0, `average_cost` DECIMAL(10,2) NULL, `version`. Số lượng chỉ đổi qua `InventoryService.postMovement`, cùng sổ `stock_movements` với phụ kiện.

### 2.24 `sales_orders` và `sales_order_lines` *(Mới từ v2.2 — bán lẻ POS, đơn online và phụ kiện trong phiên chơi)*
**`sales_orders`:**
| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | INT | PK | |
| branch_id | INT | FK → branches.id, NOT NULL | Chi nhánh bán / nhận hàng |
| channel | ENUM | NOT NULL, DEFAULT 'session' | `session` (phụ kiện gọi trong phiên chơi), `pos` (bán tại quầy), `online` (khách tự đặt trên web) |
| session_id | INT | FK → court_sessions.id, NULL | Chỉ với `channel = 'session'` |
| customer_id | INT | FK → customers.id, NULL | Đơn POS mặc định không gắn khách nên không cộng vào `total_spent` |
| cashier_employee_id | INT | FK → employees.id, NULL | Người bán (POS) |
| contact_name / contact_phone / customer_note | VARCHAR(100) / VARCHAR(20) / VARCHAR(500) | NULL | Chỉ dùng cho đơn online |
| payment_method | ENUM | NULL | `cash`, `transfer` (đơn online) |
| payment_deadline_at | DATETIME | NULL | Hạn thanh toán 30 phút của đơn online chuyển khoản; quá hạn thì tự huỷ |
| voucher_id / voucher_code / voucher_discount_amount | INT / VARCHAR(32) / DECIMAL(12,2) | NULL | Mã giảm giá đã áp (chụp lại mã và số tiền giảm tại thời điểm áp) |
| status | ENUM | NOT NULL, DEFAULT 'open' | `draft`, `open`, `paid`, `cancelled` |
| version | INT | NOT NULL, DEFAULT 0 | Optimistic locking |

**`sales_order_lines`:** `sales_order_id` (index `idx_sales_order_lines_order`), `variant_id` → `product_variants`, `quantity`, `unit_price` (giá chốt lúc thêm dòng), `line_total`, `legacy_session_extra_id` (liên kết ngược `session_extras` cũ). Thêm dòng trừ kho **ngay**; xoá dòng, huỷ hoặc hết hạn đơn thì hoàn kho.

### 2.25 `vouchers` *(Mới từ v2.2)*
| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | INT | PK | |
| code | VARCHAR(32) | UNIQUE, NOT NULL | Chuẩn hoá về chữ hoa |
| description | VARCHAR(255) | NULL | |
| discount_type | ENUM | NOT NULL | `percent` hoặc `flat` |
| discount_value | DECIMAL(12,2) | NOT NULL | % hoặc số tiền cố định |
| max_discount_amount | DECIMAL(12,2) | NULL | Trần số tiền giảm khi `percent` |
| min_order_amount | DECIMAL(12,2) | NOT NULL, DEFAULT 0 | Giá trị đơn tối thiểu |
| starts_at / ends_at | DATETIME | NULL | Thời hạn hiệu lực |
| usage_limit / per_customer_limit | INT | NULL | Tổng lượt và lượt tối đa mỗi khách |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | |
| version | INT | NOT NULL, DEFAULT 0 | |

**Không có bảng "lượt đã dùng"**: số lượt đếm trực tiếp bằng `COUNT` trên `sales_orders.voucher_id` — đơn `paid` cộng đơn chuyển khoản đang chờ trả — nên huỷ hoặc hết hạn một đơn tự nhả lại đúng một lượt.

### 2.26 `customer_notifications` *(Mới từ v2.2 — thông báo trong ứng dụng cho khách)*
| Cột | Kiểu | Ràng buộc | Ghi chú |
|---|---|---|---|
| id | INT | PK | |
| customer_id | INT | FK → customers.id, NOT NULL | Chỉ khách có tài khoản mới nhận |
| branch_id | INT | NULL | |
| type | VARCHAR(40) | NOT NULL | `booking.confirmed`, `booking.expired`, `booking.cancelled_by_staff`, `booking.rescheduled` |
| title / body | VARCHAR(160) / VARCHAR(500) | NOT NULL | Chỉ chứa tên sân, ngày, giờ — không có tên nhân viên hay số điện thoại |
| booking_id | INT | NULL | Tham chiếu mềm, không khoá ngoại |
| read_at | DATETIME | NULL | NULL = chưa đọc |

Index `idx_customer_notifications_inbox (customer_id, read_at, created_at)`. Thông báo được ghi **trong cùng transaction** với thay đổi lịch. Dọn dẹp mỗi 5 phút: xoá thông báo đã đọc quá 30 ngày và mọi thông báo quá 90 ngày.

### 2.27 `integration_outbox` và `integration_inbox` *(Mới từ v2.2 — tích hợp với dịch vụ thi đấu)*
**`integration_outbox`:** `event_id` CHAR(36) UNIQUE, `type` (`bd.customer.updated`/`merged`/`deleted`), `subject` (đối tượng, giữ thứ tự theo từng `subject`), `payload` JSON, `status` (`pending`/`sent`/`dead`), `attempts`, `next_attempt_at`, `last_error`, `sent_at`. Index `idx_integration_outbox_due (status, next_attempt_at)` và `(subject, status)`. Hàng được ghi trong cùng transaction với thay đổi khách hàng, **kể cả khi tích hợp đang tắt**; bộ gửi ký HMAC, lùi dần khi lỗi, quá số lần thì chuyển `dead`.

**`integration_inbox`:** `event_id` UNIQUE (chống xử lý trùng), `type`, `status` (`processed`/`ignored`), `received_at`. Sự kiện `competition.*` nhận về (giải chốt, buổi đóng, huỷ…) được ghi thành dòng `activity_logs`.

### 2.28 `organizations` và `branch_settings` *(có trong CSDL, chưa có model)*
- `organizations`: `id`, `code` UNIQUE, `legal_name`, `tax_id`. Do migration M1 tạo và `branches.organization_id` đã có khoá ngoại tới đây, nhưng chưa có model hay API — mô hình multi-tenant nhiều tổ chức vẫn là hướng mở rộng (xem 3.11).
- `branch_settings`: `branch_id`, `key`, `value` JSON, unique `(branch_id, key)`. Dự phòng cho cấu hình riêng từng chi nhánh; hiện chưa có code nào đọc hay ghi, mọi cấu hình đang nằm ở `settings` toàn chuỗi.

---

## 3. Ghi chú thiết kế quan trọng

### 3.1 Users vs Customers
Hệ thống tách `users` (dùng để đăng nhập: admin/nhân viên/khách có tài khoản) khỏi `customers` (hồ sơ khách hàng, có thể không có tài khoản đăng nhập — khách vãng lai). `customers.user_id` là **nullable** để hỗ trợ cả hai trường hợp.

### 3.2 Snapshot giá tại thời điểm giao dịch
`session_extras.unit_price` và việc tính `court_fee` đều **lưu snapshot** tại thời điểm phát sinh, không tham chiếu trực tiếp giá hiện tại của `extras`/`courts` — đảm bảo hóa đơn cũ không bị thay đổi khi giá cập nhật sau này.

### 3.3 Tính tiền theo khung giờ cao điểm/thấp điểm
`court_fee` được tính ở tầng Service (không phải trigger DB) bằng **phần giao của khoảng thời gian chơi với khung giờ cao điểm của từng ngày**, theo giờ của chi nhánh (`priceCalculator.calculateCourtFee`; không còn chia lát 5 phút như bản đầu). Phần trong khung cao điểm nhân `peak_price_per_hour`, phần còn lại nhân `offpeak_price_per_hour`; cộng với `court_sessions.accrued_court_fee` của các đoạn đã chơi trước khi đổi sân; làm tròn về bội số 1,000 VND **một lần** ở cuối. Mọi chỗ tính tiền một phiên phải đi qua `calculateSessionCourtFee`.

### 3.4 Tính nhất quán giao dịch
Các thao tác sau bọc trong **Sequelize transaction** (kể cả ghi `activity_logs`):
- Đóng sân → tạo Invoice → tạo Payment → cập nhật `customers.total_spent`.
- Gọi/trả phụ kiện vào phiên chơi → `InventoryService.postMovement` (loại `sale`/`sale_return`) đồng thời với tạo/xoá `session_extras`.
- Tạo phiếu nhập kho → tạo `GoodsReceipt` + từng `GoodsReceiptItem` → 1 `StockMovement` (`purchase_receipt`) mỗi dòng, trong cùng transaction.
- Hủy booking / xác nhận booking / đổi lịch / tự huỷ lịch hết hạn giữ chỗ → ghi audit log và (với khách có tài khoản) ghi `customer_notifications` trong cùng transaction.
- Thêm/xoá dòng đơn bán lẻ → `InventoryService.postMovement` (`sale`/`sale_return`) cùng transaction; checkout đơn → `invoices` + `invoice_lines` + `payments`.
- Đổi hoặc gộp khách hàng → ghi `integration_outbox` (`bd.customer.*`) trong cùng transaction với thay đổi.
- Đặt booking của khách chạy ở mức cô lập SERIALIZABLE để đếm số lịch đang giữ và kiểm trùng lịch không bị hai request cùng lọt.

**`InventoryService.postMovement` là entry point duy nhất được phép đổi
`extra_stocks.quantity`/`average_cost`** — không service nào khác được UPDATE
2 cột này trực tiếp. Mỗi lần gọi bắt buộc có transaction đang mở, khoá dòng
`extra_stocks` (`SELECT ... FOR UPDATE`) rồi luôn tạo kèm đúng 1 dòng
`stock_movements` trong cùng transaction với nghiệp vụ gốc.

### 3.5 Index khuyến nghị
| Bảng | Index | Mục đích |
|---|---|---|
| bookings | (court_id, booking_date, start_time, end_time) | Kiểm tra trùng lịch nhanh |
| bookings | (branch_id, status) | Lọc booking theo chi nhánh & trạng thái |
| customers | (phone) | UNIQUE toàn hệ thống (`uk_customers_phone`, từ v2.1) — chống trùng số trên toàn chuỗi, vẫn cho nhiều khách vãng lai không số |
| customers | (loyalty_tier) | Phân tích khách VIP toàn chuỗi |
| court_sessions | (court_id, status) | Truy vấn sân đang chơi |
| court_sessions | (branch_id, status) | Dashboard theo chi nhánh |
| court_sessions | (open_court_id) | UNIQUE — chặn hai phiên cùng mở trên một sân ngay ở tầng DB. `open_court_id` là cột sinh tự động, mang `court_id` khi phiên đang mở và NULL khi đã đóng/xoá mềm |
| activity_logs | (employee_id, created_at) | Truy vấn log theo nhân viên/thời gian |
| activity_logs | (branch_id, created_at) | Audit log theo chi nhánh |
| payments | (idempotency_key) | UNIQUE — tra cứu idempotent request |
| extra_stocks | (extra_id, branch_id) | UNIQUE (`uk_extra_stocks_extra_branch`) — 1 dòng tồn kho / sản phẩm / chi nhánh |
| stock_movements | (branch_id, extra_id, created_at) | Lịch sử kho theo chi nhánh/sản phẩm/thời gian |
| stock_movements | (reference_type, reference_id) | Tra ngược từ phiếu nhập/session_extra về movement |
| goods_receipts | (branch_id, code) | UNIQUE (`uk_goods_receipts_branch_code`) — mã phiếu không trùng trong cùng chi nhánh |
| invoices | (branch_id, invoice_no) | UNIQUE (`uk_invoices_branch_invoice_no`) — số hoá đơn không trùng trong chi nhánh |
| payments | (provider, provider_reference) | UNIQUE (`uk_payments_provider_reference`) — một mã giao dịch của dịch vụ báo có chỉ xác nhận một thanh toán |
| payments | (branch_id, status, paid_at) | Báo cáo doanh thu theo chi nhánh/kỳ |
| users | (phone) | UNIQUE (`uq_users_phone`) |
| product_variants | (sku) | UNIQUE |
| product_stocks | (product_variant_id, branch_id) | UNIQUE (`uk_product_stocks_variant_branch`) |
| vouchers | (code) | UNIQUE |
| customer_notifications | (customer_id, read_at, created_at) | Hộp thư của khách, đếm chưa đọc |
| integration_outbox | (status, next_attempt_at) và (subject, status) | Chọn sự kiện đến hạn gửi; giữ thứ tự theo từng đối tượng |
| activity_logs | (branch_id, target_type, target_id, created_at) | Lịch sử của một đối tượng |

### 3.6 Multi-Branch Architecture *(Mới từ v2.0, cập nhật v2.1)*
Hầu hết các bảng nghiệp vụ (`courts`, `bookings`, `court_sessions`, `employees`, `invoices`, `payments`, `activity_logs`, `extra_stocks`, `product_stocks`, `stock_movements`, `goods_receipts`, `sales_orders`) đều có cột `branch_id` (NOT NULL — các migration `20260821*` đã siết chặt, và gỡ các khoá ngoại trùng lặp). Middleware `branchContextMiddleware` đọc header `X-Branch-Id` từ request và attach `req.branchId` cho toàn bộ luồng xử lý. Mọi query ở tầng Service phải lọc theo `branchId` để đảm bảo data isolation giữa các chi nhánh.

**Ngoại lệ: `customers` không có `branch_id`** (từ v2.1 — xem mục 2.4/3.1). Khách
hàng là danh tính dùng chung toàn chuỗi; chỉ các bảng giao dịch
(`bookings`, `court_sessions`, `invoices`, `payments`) mới gắn `branch_id` để
biết giao dịch phát sinh ở chi nhánh nào. `suppliers`, `extras`, `products`,
`product_variants`, `product_categories` và `vouchers` cũng không có `branch_id` —
dùng chung mọi chi nhánh, chỉ tồn kho (`extra_stocks`, `product_stocks`) mới tách theo chi nhánh.

**Admin chuyển chi nhánh:** chỉ role `admin` được gửi `X-Branch-Id` khác chi
nhánh gốc của mình (quản lý cả chuỗi); `employee`/`branch_manager` bị khoá
cứng vào đúng `branchId` trong hồ sơ `employees` của họ — gửi header khác đi
bị chặn `403` ngay ở `branchContextMiddleware`, không âm thầm bỏ qua. Token của **khách** gửi `X-Branch-Id` cũng bị `403`, và tài khoản `employee`/`branch_manager` chưa có dòng `employees` (chưa gán chi nhánh) bị `403` ở mọi route có phạm vi chi nhánh.

### 3.7 Soft Delete & Optimistic Locking *(Mới từ v2.0)*
- **Soft Delete (`paranoid: true`)**: Các bảng nghiệp vụ chính dùng `deleted_at` thay vì xóa vật lý. Sequelize tự động thêm `WHERE deleted_at IS NULL` vào mọi query.
- **Optimistic Locking (`version`)**: Cột `version` tự tăng mỗi lần update, ngăn chặn lost-update trong môi trường concurrent. Sequelize sẽ throw `OptimisticLockError` nếu version không khớp.

### 3.8 Idempotent Payment Design *(Mới từ v2.0)*
`payments.idempotency_key` đảm bảo một request thanh toán không bị xử lý 2 lần dù client retry. Format mặc định: `session-{sessionId}`. Frontend gửi qua header `Idempotency-Key`; khoá không được dùng chéo giữa hai đối tượng khác nhau (khoá của phiên sân này không trả nhầm kết quả của phiên khác). Backend kiểm tra trước khi tạo payment mới — nếu key đã tồn tại và khớp sessionId, trả về kết quả cũ mà không tạo bản ghi mới.

### 3.9 Vòng đời Hóa đơn (Invoice Lifecycle)
```
draft → issued → paid
           └──→ void
```
- `draft`: Invoice tạo nhưng chưa xuất (reserved cho future workflow)
- `issued`: Invoice đã xuất, chờ thanh toán
- `paid`: Đã thanh toán thành công
- `void`: Hủy hóa đơn (`PaymentService.voidInvoice`). Bắt buộc có lý do. Hoá đơn chuyển `void`, `payments.status` chuyển `refunded`, tổng chi tiêu của khách được trừ lại, hàng bán lẻ của đơn được hoàn kho; **lịch đặt liên quan vẫn là `completed`** (buổi chơi đã diễn ra) — trạng thái tiền nằm ở hoá đơn và thanh toán, lịch đặt không có trạng thái "đã hoàn tiền". Hoàn tiền thực tế do quầy làm thủ công.
- Đơn online chuyển khoản: `issued` + `payments.pending` cho tới khi webhook xác nhận (`paid`) hoặc quá hạn 30 phút (`void`, `payments.cancelled`, hoàn kho).

### 3.10 Bảng audit gộp khách hàng (`customer_merge_audit`) *(Mới từ v2.1)*
Bảng phụ, chỉ ghi một lần bởi migration `20260815300001-unify-customers-chain-wide.js`
khi gộp các hồ sơ `customers` trùng số điện thoại ở nhiều chi nhánh về 1 hồ sơ
duy nhất (xem mục 2.4/3.6). Không có model Sequelize, không có FK, không nằm
trong luồng nghiệp vụ — chỉ để đối chiếu/điều tra sau này.

| Cột | Kiểu | Ghi chú |
|---|---|---|
| id | INT PK | |
| phone | VARCHAR(30) | Số điện thoại bị trùng |
| action | VARCHAR(30) | `merged` (tự động gộp) hoặc `conflict_needs_review` (≥2 hồ sơ có tài khoản đăng nhập cùng trùng SĐT — không tự gộp, cần admin đối chiếu tay) |
| survivor_customer_id | INT, NULL | Hồ sơ sống sót sau khi gộp (NULL nếu `conflict_needs_review`) |
| affected_customer_id | INT | Hồ sơ bị gộp/bị gỡ số điện thoại |
| affected_user_id | INT, NULL | Tài khoản đăng nhập gắn với hồ sơ bị ảnh hưởng, nếu có |
| affected_total_spent | DECIMAL(12,2), NULL | `total_spent` của hồ sơ bị ảnh hưởng tại thời điểm gộp |
| note | VARCHAR(255), NULL | |
| created_at | DATETIME | |

### 3.11 Hướng mở rộng (chưa làm)

- **Multi-tenant nhiều tổ chức độc lập.** Bảng `organizations` (`code`, `legal_name`, `tax_id`) và khoá ngoại `branches.organization_id` đã có ở tầng CSDL nhưng chưa có model, API hay cách ly dữ liệu theo tổ chức; hiện cả chuỗi là một tổ chức. Làm thật cần thêm `organization_id` vào lớp phân quyền và `branchContextMiddleware`.
- **Cấu hình theo chi nhánh.** `branch_settings` đã có bảng nhưng chưa được dùng.
- **`queue_seq` cho danh sách chờ của thi đấu** — thuộc CSDL thi đấu, xem `docs/05-extra/02-remediation/00-tien-do.md` mục "Chưa làm".

### 3.12 Lưu thời gian ở UTC
Từ migration `20260821400001-store-datetime-as-utc.js` mọi cột `DATETIME` lưu UTC và Sequelize được ghim `timezone: '+00:00'` (`config/config.js`). Nhờ vậy đổi múi giờ máy chủ không làm hiểu sai dữ liệu cũ. Việc hiển thị, "hôm nay", giờ cao điểm, giờ mở cửa và gộp báo cáo theo ngày đổi sang múi giờ của **chi nhánh** (`branches.timezone`). Riêng `bookings.booking_date`/`start_time`/`end_time` là `DATE`/`TIME` giờ treo tường của chi nhánh, không đổi sang UTC. Khi viết SQL thô phải truyền chuỗi UTC chứ không truyền đối tượng `Date` (driver sẽ định dạng theo múi giờ tiến trình Node — đã từng gây thử lại tức thì ở bộ gửi sự kiện).

### 3.13 Phiên đăng nhập: xoay vòng và thu hồi
- Refresh token chỉ lưu dạng sha256 (`users.refresh_token`). Mỗi lần `POST /auth/refresh-token` cấp cặp token mới và giữ hash cũ ở `previous_refresh_token` trong 30 giây (`previous_refresh_expires_at`); trong khoảng này token cũ chỉ đổi được lấy access token mới, không nhận refresh token mới. Phép so sánh-và-đổi nguyên tử trong `AuthService.refreshAccessToken` đảm bảo chỉ một bên thắng khi hai tab làm mới cùng lúc.
- Access token mang `tv` = `users.token_version`. `authMiddleware` và `sseAuthMiddleware` (hai nơi duy nhất xác minh access token; cổng thi đấu cũng đi qua) từ chối token lệch phiên bản. Đăng xuất, đổi và đặt lại mật khẩu tăng `token_version` nên access token bị đánh cắp chết ngay. Token cấp trước khi có cột (không có `tv`) coi như `tv = 0`.
- Mỗi tài khoản vẫn chỉ giữ **một** refresh token đang hiệu lực (đăng nhập ở máy khác làm máy trước phải đăng nhập lại sau khi access token hết hạn); hỗ trợ nhiều phiên cần một bảng refresh token riêng — chủ dự án đã cân nhắc và hoãn.

### 3.14 Hộp thư sự kiện (outbox/inbox)
Thay đổi khách hàng cần đồng bộ sang dịch vụ thi đấu được ghi vào `integration_outbox` **trong cùng transaction** với thay đổi gốc, nên không mất sự kiện dù dịch vụ kia đang tắt. Bộ gửi (`dispatcher.js`) chọn các dòng đến hạn, ký HMAC, giữ thứ tự theo từng `subject`, lùi dần khi lỗi và đánh dấu `dead` sau số lần thử tối đa. Chiều ngược lại, `integration_inbox` lưu `event_id` đã nhận để xử lý trùng không tạo nhật ký lần hai. Không có khoá ngoại sang CSDL thi đấu: hồ sơ thi đấu chỉ trỏ lại bằng chuỗi `bd:customer:<id>`.

### 3.15 Việc nền định kỳ (mỗi 5 phút, trong tiến trình backend)
- Tự huỷ lịch `pending` **do khách tự đặt** quá hạn giữ chỗ: hạn = `max(tạo + 15 phút, min(tạo + pendingExpiryHours, giờ bắt đầu − pendingExpireBeforeStartMinutes))`; lịch do nhân viên tạo không bao giờ tự huỷ. Ghi `activity_logs` `booking.expired` không có user.
- Tự huỷ đơn online chuyển khoản quá `payment_deadline_at`: đơn `cancelled`, hoá đơn `void`, thanh toán `cancelled`, hoàn kho.
- Tự huỷ và hoàn kho đơn POS `open` không có thay đổi nào quá 6 giờ (`sales_order.abandoned_released`).
- Dọn `customer_notifications` (xem 2.26).

---

## 4. Ánh xạ bảng ↔ API/Use Case

| Bảng | Use Case liên quan | API liên quan |
|---|---|---|
| branches, branch_document_sequences, organizations | UC-23 (Chuyển chi nhánh) | Branch API (`GET /api/v1/branches`, admin-only), `GET /public/branches` |
| courts, court_sessions | UC-05, UC-06, UC-07, UC-08, UC-09 | Court API |
| bookings | UC-10, UC-11, UC-12, UC-13 | Booking API |
| customers, customer_merge_audit | UC-14, UC-15, UC-22 (Tự đăng ký) | Customer API |
| employees, activity_logs | UC-16 | Employee API |
| extras, session_extras | UC-17 | Accessories API |
| suppliers, extra_stocks, stock_movements, goods_receipts, goods_receipt_items | UC-17 | Inventory/Supplier/GoodsReceipt API |
| invoices, invoice_lines, payments | UC-18, UC-25 | Payment API, Invoice API (kể cả void), Report API |
| product_categories, products, product_variants, product_stocks | UC-24 | Product, Product Category, Inventory API, `/public/products` |
| sales_orders, sales_order_lines | UC-24, UC-26 | Sales Order API (POS), My Orders API (đơn online) |
| vouchers | UC-24, UC-26 | Voucher API |
| customer_notifications | UC-27 | Notification API |
| integration_outbox, integration_inbox | UC-28 (Thi đấu) | Cổng nối thi đấu, webhook nhận sự kiện |
| settings | UC-21 | Settings API |
| activity_logs | UC-16 | Activity Log API, `/employees/:id/activity-logs` |

---

## 5. Changelog

| Phiên bản | Ngày | Thay đổi chính |
|---|---|---|
| v1.0 | 19/07/2026 | Thiết kế ban đầu — 13 bảng |
| v2.0 | 11/08/2026 | Thêm `branches`, `branch_document_sequences`; thêm `branch_id` + soft-delete + version vào 8 bảng; mở rộng `invoices` (invoice_no, status, sales_order_id), `payments` (7 cột mới), `activity_logs` (user_id, branch_id, old/new_values, request_id); document feature tương lai: organizations, sales_orders |
| v2.1 | 15/08/2026 | Hệ thống kho hàng: thêm `suppliers`, `extra_stocks`, `stock_movements`, `goods_receipts`, `goods_receipt_items`; xóa `extras.stock_quantity` (tồn kho chuyển sang `extra_stocks`, tách theo chi nhánh + giá vốn bình quân gia quyền). Gộp `customers` thành chuỗi dùng chung — xóa cột `customers.branch_id`, đổi unique index `phone` từ `(branch_id, phone)` sang toàn hệ thống; thêm bảng audit `customer_merge_audit`. Thêm role `branch_manager` vào `roles` |
| v2.2 | 18/10/2026 | Đồng bộ với 44 migration hiện có (34 bảng nghiệp vụ). Bán lẻ: `product_categories`, `products`, `product_variants`, `product_stocks`, `sales_orders`, `sales_order_lines`, `vouchers`; `invoice_lines`; `invoices.session_id` thành NULL + `sales_order_id` có khoá ngoại thật + `chk_invoices_one_source`; `stock_movements`/`goods_receipt_items` hỗ trợ cả `product_variant_id`. Khách: `customer_notifications`. Tích hợp: `integration_outbox`, `integration_inbox`. `users`: `token_version`, `previous_refresh_token`, `previous_refresh_expires_at`, `phone` unique, `email` nullable, `chk_users_login_identity`. `court_sessions`: `billed_from`, `accrued_court_fee`, `open_court_id`. `payments`: unique `(provider, provider_reference)`, `employee_id` nullable. `branches.timezone` mặc định; `organizations` và `branch_settings` có bảng nhưng chưa có model. Sửa cách tính tiền sân (giao với khung cao điểm, không còn lát 5 phút). Thêm mục 3.12–3.15 (UTC, phiên đăng nhập, outbox/inbox, việc nền) và mục 6 (CSDL thi đấu) |

---

## 6. CSDL của dịch vụ thi đấu (tóm tắt)

Dịch vụ thi đấu có CSDL riêng `competition_service` (21 bảng, 15 migration riêng, `SequelizeMeta` riêng), **không có khoá ngoại** sang CSDL của app chính; hồ sơ thi đấu trỏ khách bằng chuỗi `bd:customer:<id>`. Mọi khoá chính là UUIDv7 (`CHAR(36)`), mọi bảng nghiệp vụ có `tenant_id` (mỗi chi nhánh là một tenant: `bd:branch:<id>`), thời gian lưu UTC. Thiết kế đầy đủ (cột, ràng buộc, lý do): `services/competition-service/docs/01-kien-truc.md` mục 5 và `05-ho-so-nguoi-choi-va-bang-xep-hang.md`.

| Nhóm | Bảng |
|---|---|
| Người chơi và trình độ | `players`, `player_stats`, `player_ratings`, `assessments`, `rating_changes` |
| Trận đấu | `matches`, `match_participants`, `match_live_scores` |
| Giải đấu | `tournaments`, `tournament_entries`, `tournament_teams`, `tournament_placements` |
| Bảng xếp hạng | `ranking_results`, `leaderboard_snapshots` |
| Buổi giao lưu | `play_sessions`, `play_session_players`, `session_signups` |
| Hạ tầng | `audit_log`, `outbox_events`, `inbox_events`, `idempotency_keys` |
