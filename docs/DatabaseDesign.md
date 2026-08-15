# Database Design & ERD
## Dự án: Badminton Digital Management – Hệ thống quản lý sân cầu lông

**Phiên bản:** 2.1
**Ngày cập nhật:** 15/08/2026 (từ v2.0 ngày 11/08/2026)
**Tài liệu tham chiếu:** `SRS.md`, `UseCase.md`, `APIDesign.md`, `Architecture.md`
**Công nghệ:** MySQL 8 + Sequelize ORM (paranoid soft-delete, optimistic locking)

---

## 1. Sơ đồ quan hệ tổng quan (ERD – dạng văn bản)

```
[Tương lai] Organizations 1───∞ Branches
                                    │
              Branches 1───∞ Courts ───∞ CourtSessions
              Branches 1───∞ Bookings
              Branches 1───∞ Employees ───1 Users
              Branches 1───∞ Invoices
              Branches 1───∞ Payments
              Branches 1───∞ ActivityLogs
              Branches 1───∞ BranchDocumentSequences
              Branches 1───∞ ExtraStocks (tồn kho riêng theo chi nhánh)
              Branches 1───∞ StockMovements
              Branches 1───∞ GoodsReceipts

Roles 1───∞ Users 1───1 Employees
                 └───1 Customers (nullable, khách vãng lai không cần tài khoản)

Courts 1───∞ CourtSessions
CourtSessions (nullable) ∞───1 Bookings
CourtSessions 1───∞ SessionExtras ∞───1 Extras
CourtSessions 1───1 Invoices 1───1 Payments

Customers — dùng chung toàn chuỗi (KHÔNG có branch_id, xem mục 3.6):
Customers 1───∞ Bookings
Customers 1───∞ CourtSessions
Employees 1───∞ ActivityLogs
Employees 1───∞ CourtSessions (nhân viên mở/đóng sân)
Employees 1───∞ Payments (nhân viên thu ngân)
Users 1───∞ ActivityLogs (log cho cả non-employee users)
Users 1───∞ StockMovements (actor_user_id — ai thao tác kho)
Users 1───∞ GoodsReceipts (received_by_user_id — ai nhận hàng)

Extras 1───∞ ExtraStocks ∞───1 Branches (tồn kho + giá vốn BQ, theo từng chi nhánh)
Extras 1───∞ StockMovements (sổ nhật ký xuất/nhập)
Extras 1───∞ GoodsReceiptItems
Suppliers 1───∞ GoodsReceipts 1───∞ GoodsReceiptItems

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
| extra_id | INT | FK → extras.id, NOT NULL | |
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

**Index:** `(branch_id, extra_id, created_at)` — truy vấn lịch sử theo chi
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
| extra_id | INT | FK → extras.id, NOT NULL | |
| quantity | INT | NOT NULL | |
| unit_cost | DECIMAL(10,2) | NOT NULL | Đơn giá nhập của dòng này |
| subtotal | DECIMAL(12,2) | NOT NULL | quantity × unit_cost |
| created_at | DATETIME | NOT NULL | |
| updated_at | DATETIME | NOT NULL | |

Mỗi dòng khi tạo sẽ kéo theo đúng 1 `StockMovement` (`type: purchase_receipt`)
qua `InventoryService.postMovement`, trong cùng transaction với việc tạo
`GoodsReceipt`/`GoodsReceiptItem` (`GoodsReceiptService.createGoodsReceipt`).

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
- Gọi/trả phụ kiện vào phiên chơi → `InventoryService.postMovement` (loại `sale`/`sale_return`) đồng thời với tạo/xoá `session_extras`.
- Tạo phiếu nhập kho → tạo `GoodsReceipt` + từng `GoodsReceiptItem` → 1 `StockMovement` (`purchase_receipt`) mỗi dòng, trong cùng transaction.
- Hủy booking / xác nhận booking → ghi audit log (atomically).

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

### 3.6 Multi-Branch Architecture *(Mới từ v2.0, cập nhật v2.1)*
Hầu hết các bảng nghiệp vụ (`courts`, `bookings`, `court_sessions`, `employees`, `invoices`, `payments`, `activity_logs`, `extra_stocks`, `stock_movements`, `goods_receipts`) đều có cột `branch_id`. Middleware `branchContextMiddleware` đọc header `X-Branch-Id` từ request và attach `req.branchId` cho toàn bộ luồng xử lý. Mọi query ở tầng Service phải lọc theo `branchId` để đảm bảo data isolation giữa các chi nhánh.

**Ngoại lệ: `customers` không có `branch_id`** (từ v2.1 — xem mục 2.4/3.1). Khách
hàng là danh tính dùng chung toàn chuỗi; chỉ các bảng giao dịch
(`bookings`, `court_sessions`, `invoices`, `payments`) mới gắn `branch_id` để
biết giao dịch phát sinh ở chi nhánh nào. `suppliers` và `extras` (danh mục)
cũng không có `branch_id` — dùng chung mọi chi nhánh, chỉ tồn kho
(`extra_stocks`) mới tách theo chi nhánh.

**Admin chuyển chi nhánh:** chỉ role `admin` được gửi `X-Branch-Id` khác chi
nhánh gốc của mình (quản lý cả chuỗi); `employee`/`branch_manager` bị khoá
cứng vào đúng `branchId` trong hồ sơ `employees` của họ — gửi header khác đi
bị chặn `403` ngay ở `branchContextMiddleware`, không âm thầm bỏ qua.

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

### 3.11 Feature Tương Lai (cần document để implement)

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
| branches, branch_document_sequences | UC-23 (Chuyển chi nhánh) | Branch API (`GET /api/v1/branches`, admin-only) |
| courts, court_sessions | UC-05, UC-06, UC-07, UC-08, UC-09 | Court API |
| bookings | UC-10, UC-11, UC-12, UC-13 | Booking API |
| customers, customer_merge_audit | UC-14, UC-15, UC-22 (Tự đăng ký) | Customer API |
| employees, activity_logs | UC-16 | Employee API |
| extras, session_extras | UC-17 | Accessories API |
| suppliers, extra_stocks, stock_movements, goods_receipts, goods_receipt_items | UC-17 | Inventory/Supplier/GoodsReceipt API |
| invoices, payments | UC-18 | Payment API |
| settings | UC-21 | Settings API |

---

## 5. Changelog

| Phiên bản | Ngày | Thay đổi chính |
|---|---|---|
| v1.0 | 19/07/2026 | Thiết kế ban đầu — 13 bảng |
| v2.0 | 11/08/2026 | Thêm `branches`, `branch_document_sequences`; thêm `branch_id` + soft-delete + version vào 8 bảng; mở rộng `invoices` (invoice_no, status, sales_order_id), `payments` (7 cột mới), `activity_logs` (user_id, branch_id, old/new_values, request_id); document feature tương lai: organizations, sales_orders |
| v2.1 | 15/08/2026 | Hệ thống kho hàng: thêm `suppliers`, `extra_stocks`, `stock_movements`, `goods_receipts`, `goods_receipt_items`; xóa `extras.stock_quantity` (tồn kho chuyển sang `extra_stocks`, tách theo chi nhánh + giá vốn bình quân gia quyền). Gộp `customers` thành chuỗi dùng chung — xóa cột `customers.branch_id`, đổi unique index `phone` từ `(branch_id, phone)` sang toàn hệ thống; thêm bảng audit `customer_merge_audit`. Thêm role `branch_manager` vào `roles` |
