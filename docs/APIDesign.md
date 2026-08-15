# API Design Specification

## Phase 1 production-safety additions

- Branch-scoped APIs support `X-Branch-Id`. `employee`/`branch_manager` are locked to their own branch (a different value is rejected with 403); `admin` has no home branch and may send `X-Branch-Id` for any active branch to view/operate on it (see `GET /branches`). If omitted, the branch assigned to the logged-in employee is used.
- `POST /payments/checkout` supports the `Idempotency-Key` header. Reuse the key when retrying a request.
- `POST /payments/webhook` accepts `provider`, `providerReference`, `invoiceNo`, and `status: "paid"`. Configure `PAYMENT_WEBHOOK_SECRET` and pass it as `X-Webhook-Secret` in production.

## Multi-branch & inventory additions (`2ca2672`)

- A fourth role, `branch_manager`, now appears in `roleMiddleware([...])` on most branch-scoped routes (see §1.7).
- Customer profiles are chain-wide (no `branch_id`); `Booking`/`CourtSession`/`Invoice`/`Payment` still carry `branch_id`.
- Login accepts phone number or email in a single `identifier` field; customers can self-register (see §2).
- Accessory stock moved from a flat `extras.stock_quantity` column to a per-branch ledger (`suppliers`, `goods-receipts`, `inventory/*` — see §8).

## Dự án: Badminton Digital Management – Hệ thống quản lý sân cầu lông

**Phiên bản:** 1.0
**Ngày:** 19/07/2026
**Tài liệu tham chiếu:** `SRS.md`, `UseCase.md`

---

## 1. Quy ước chung

### 1.1 Base URL
```
/api/v1
```

### 1.2 Định dạng dữ liệu
- Request/Response: `application/json`
- Ngày giờ: ISO 8601 (`YYYY-MM-DDTHH:mm:ssZ`)

### 1.3 Authentication
- Header: `Authorization: Bearer <access_token>`
- Access Token (JWT): hạn ngắn (~15 phút)
- Refresh Token: hạn dài (~7 ngày). Trả về trong body của `POST /auth/login` (không phải cookie) — client tự lưu (frontend hiện dùng `localStorage`) và gửi lại trong body `{ "refreshToken": "..." }` khi gọi `POST /auth/refresh-token`.
- Đăng nhập nhận **số điện thoại hoặc email** trong cùng một field `identifier` (xem §2).

### 1.4 Response Envelope chuẩn
```json
{
  "success": true,
  "data": { },
  "message": "string",
  "errors": null
}
```

Lỗi:
```json
{
  "success": false,
  "data": null,
  "message": "Validation failed",
  "errors": [
    { "field": "email", "message": "Email không hợp lệ" }
  ]
}
```

### 1.5 Mã trạng thái HTTP dùng chung
| Code | Ý nghĩa |
|---|---|
| 200 | Thành công |
| 201 | Tạo mới thành công |
| 400 | Dữ liệu không hợp lệ |
| 401 | Chưa xác thực / token hết hạn |
| 403 | Không có quyền truy cập |
| 404 | Không tìm thấy tài nguyên |
| 409 | Xung đột (VD: trùng lịch) |
| 500 | Lỗi hệ thống |

### 1.6 Phân trang (Pagination)
Query params dùng chung cho các API danh sách:
```
?page=1&limit=20&sortBy=createdAt&order=desc&search=keyword
```
Response kèm:
```json
"meta": { "page": 1, "limit": 20, "total": 132, "totalPages": 7 }
```

### 1.7 Phân quyền
Mỗi endpoint có cột **Role** quy định vai trò được phép gọi: `Admin`, `BranchManager` (`branch_manager` — quản lý vận hành trong phạm vi 1 chi nhánh, thêm từ merge quản lý kho/đa chi nhánh), `Employee`, `Customer`, hoặc `Public` (không cần token). Đây vẫn là kiểm tra theo tên vai trò cố định trong `roleMiddleware([...])`, chưa có bảng `permissions`/`role_permissions` riêng.

---

## 2. Authentication API

| Method | Endpoint | Role | Mô tả |
|---|---|---|---|
| POST | `/auth/register` | Public | Khách hàng tự đăng ký tài khoản bằng SĐT (tài khoản nhân viên vẫn do Admin tạo qua `/employees`) |
| POST | `/auth/login` | Public | Đăng nhập bằng SĐT hoặc email, trả về access + refresh token |
| GET | `/auth/me` | Authenticated | Lấy hồ sơ người dùng hiện tại (kèm role, employee/branch hoặc customer) |
| POST | `/auth/logout` | Authenticated | Thu hồi refresh token hiện tại |
| POST | `/auth/refresh-token` | Public (cần refresh token hợp lệ) | Cấp lại access token mới |
| POST | `/auth/forgot-password` | Public | Gửi email đặt lại mật khẩu |
| POST | `/auth/reset-password` | Public (cần reset token) | Đặt lại mật khẩu mới |
| PUT | `/auth/change-password` | Authenticated | Đổi mật khẩu khi đã đăng nhập |

**POST /auth/login**
```json
// Request — "identifier" nhận cả SĐT lẫn email trong cùng 1 ô (trường "email" cũ
// vẫn được chấp nhận để không phá client cũ, nhưng "identifier" là field chính)
{ "identifier": "0901234567", "password": "••••••" }

// Response 200
{
  "success": true,
  "data": {
    "user": {
      "id": 1,
      "email": "admin@badmintondigitalmanagement.vn",
      "fullName": "Admin",
      "phone": "0901234567",
      "avatarUrl": null,
      "role": "admin"
    },
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "eyJhbGciOi..."
  },
  "message": "Đăng nhập thành công.",
  "errors": null
}
```
Sai SĐT/email hoặc sai mật khẩu đều trả về **cùng một** message 401
`"Số điện thoại/email hoặc mật khẩu không chính xác."` — không phân biệt hai
trường hợp để tránh lộ số nào đã có tài khoản.

**POST /auth/register**
```json
// Request
{ "fullName": "Nguyễn Văn A", "phone": "0901234567", "email": "a@example.com", "password": "••••••" }
// email là optional

// Response 201 — mergedHistory=true nếu số điện thoại này đã có hồ sơ khách vãng
// lai (đặt sân tại quầy) ở bất kỳ chi nhánh nào; hồ sơ đó được gắn vào tài khoản
// mới thay vì tạo hồ sơ trùng, giữ lại lịch sử chơi cũ
{
  "success": true,
  "data": {
    "user": { "id": 42, "email": "a@example.com", "fullName": "Nguyễn Văn A", "phone": "0901234567", "avatarUrl": null, "role": "customer" },
    "customerId": 17,
    "mergedHistory": true,
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "eyJhbGciOi..."
  },
  "message": "Tạo tài khoản thành công. Lịch sử chơi trước đây của bạn đã được gắn vào tài khoản này.",
  "errors": null
}
```
SĐT đã có tài khoản → 409 `"Số điện thoại này đã có tài khoản. Bạn hãy đăng
nhập hoặc dùng chức năng quên mật khẩu."`; email đã dùng cho tài khoản khác →
409 `"Email này đã được dùng cho tài khoản khác."`

---

## 3. Branch API

| Method | Endpoint | Role | Mô tả |
|---|---|---|---|
| GET | `/branches` | Admin | Danh sách chi nhánh đang hoạt động, cho bộ chuyển chi nhánh trên UI Admin |

Route này không branch-scoped (không áp dụng `branchContextMiddleware`/`X-Branch-Id`)
— chỉ Admin gọi được, để lấy toàn bộ danh sách chi nhánh mà mình có thể chuyển
sang xem/thao tác. `Employee`/`branch_manager` không gọi được endpoint này; họ
không cần chọn chi nhánh vì đã bị khoá cố định vào chi nhánh của mình.

```json
// Response 200
{
  "success": true,
  "data": [
    { "id": 1, "code": "HN01", "name": "Chi nhánh Hà Nội 1", "isActive": true },
    { "id": 2, "code": "HN02", "name": "Chi nhánh Hà Nội 2", "isActive": true }
  ],
  "message": "Branches retrieved successfully"
}
```

---

## 4. Court API

| Method | Endpoint | Role | Mô tả |
|---|---|---|---|
| GET | `/courts` | Authenticated | Danh sách sân (kèm trạng thái) — chi nhánh xác định bởi `X-Branch-Id` |
| GET | `/courts/:id` | Authenticated | Chi tiết một sân |
| POST | `/courts` | Admin, BranchManager | Tạo sân mới |
| PUT | `/courts/:id` | Admin, BranchManager | Cập nhật thông tin sân |
| DELETE | `/courts/:id` | Admin, BranchManager | Xóa sân |
| POST | `/courts/:id/open` | Admin, BranchManager, Employee | Mở sân cho khách chơi (UC-06) |
| POST | `/courts/:id/close` | Admin, BranchManager, Employee | Đóng sân & tính tiền (UC-07) |
| PUT | `/courts/:id/status` | Admin, BranchManager, Employee | Đổi vòng đời khai thác: `active` / `maintenance` / `inactive` |
| POST | `/courts/:id/transfer` | Admin, BranchManager, Employee | Chuyển khách sang sân khác |

**POST /courts/:id/open**
```json
// Request
{ "customerId": 12 }   // optional, null nếu khách vãng lai

// Response 201
{
  "success": true,
  "data": {
    "sessionId": 501,
    "courtId": 3,
    "startTime": "2026-07-19T14:00:00Z",
    "status": "playing"
  }
}
```

**POST /courts/:id/close**
```json
// Response 200
{
  "success": true,
  "data": {
    "sessionId": 501,
    "durationSeconds": 5400,
    "courtFee": 90000,
    "extrasFee": 30000,
    "totalBeforeDiscount": 120000
  }
}
```

---

## 5. Booking API

| Method | Endpoint | Role | Mô tả |
|---|---|---|---|
| GET | `/bookings` | Authenticated | Danh sách booking (filter theo ngày/sân/trạng thái) |
| GET | `/bookings/:id` | Authenticated | Chi tiết booking |
| POST | `/bookings` | Admin, BranchManager, Employee, Customer | Tạo booking mới (UC-10) |
| PUT | `/bookings/:id` | Admin, BranchManager, Employee, Customer (chỉ booking của mình) | Sửa booking |
| DELETE | `/bookings/:id` | Admin, BranchManager, Employee, Customer (chỉ booking của mình) | Hủy booking |
| PUT | `/bookings/:id/confirm` | Admin, BranchManager, Employee | Xác nhận booking (UC-13) |
| GET | `/bookings/availability` | Authenticated | Kiểm tra khung giờ trống (UC-11) |

**GET /bookings/availability**
```
?courtId=3&date=2026-07-20&startTime=18:00&endTime=19:00
```
```json
// Response 200
{ "success": true, "data": { "available": false, "conflictBookingId": 88 } }
```

---

## 6. Customer API

Khách hàng dùng chung một hồ sơ toàn chuỗi (không còn `branchId` trên
`Customer` — xem `backend/docs/architecture/MIGRATION_ROADMAP.md`).
`GET /customers/:id` và `GET /customers/:id/history` không khai báo
`roleMiddleware`, nên mọi vai trò đã đăng nhập gọi được; `CustomerService`
tự chặn ở tầng service (`assertOwnership`) khi actor là `customer` và không
phải hồ sơ của chính mình → 403 "Bạn không có quyền truy cập hồ sơ này"
(kiểu thông báo tương tự cách `PaymentService.getInvoiceById` chặn hóa đơn).

| Method | Endpoint | Role | Mô tả |
|---|---|---|---|
| GET | `/customers` | Admin, BranchManager, Employee | Danh sách khách hàng (search theo tên/SĐT) |
| GET | `/customers/:id` | Authenticated (Customer chỉ xem chính mình) | Chi tiết khách hàng |
| POST | `/customers` | Admin, BranchManager, Employee | Thêm khách hàng |
| PUT | `/customers/:id` | Admin, BranchManager, Employee | Cập nhật thông tin |
| DELETE | `/customers/:id` | Admin | Xóa khách hàng |
| GET | `/customers/:id/history` | Authenticated (Customer chỉ xem chính mình) | Lịch sử chơi & chi tiêu |

---

## 7. Employee API

Toàn bộ nhóm route yêu cầu `roleMiddleware(['admin', 'branch_manager'])` ở
mức router (`employeeRoutes.js`) — `branch_manager` quản lý nhân viên trong
phạm vi chi nhánh của mình qua cùng `branchContextMiddleware` như các route
khác.

| Method | Endpoint | Role | Mô tả |
|---|---|---|---|
| GET | `/employees` | Admin, BranchManager | Danh sách nhân viên |
| GET | `/employees/:id` | Admin, BranchManager | Chi tiết nhân viên |
| POST | `/employees` | Admin, BranchManager | Thêm nhân viên |
| PUT | `/employees/:id` | Admin, BranchManager | Cập nhật thông tin/phân quyền |
| DELETE | `/employees/:id` | Admin, BranchManager | Xóa nhân viên |
| GET | `/employees/:id/activity-logs` | Admin, BranchManager | Nhật ký hoạt động của nhân viên |

---

## 8. Accessories & Inventory API

Từ merge "hệ thống quản lý kho hàng" (`2ca2672`), tồn kho không còn là một cột
phẳng `extras.stockQuantity` — nó tách khỏi danh mục sản phẩm và được quản lý
theo từng chi nhánh, có sổ nhật ký xuất/nhập (`extra_stocks` + `stock_movements`,
migration `20260815000002-inventory-foundation.js`). `extras` vẫn là danh mục
sản phẩm dùng chung mọi chi nhánh (tên, giá, `lowStockThreshold`); chỉ số
lượng tồn/giá vốn mới tách theo chi nhánh. Chi tiết đầy đủ ở
`docs/04-workflows/flows/WF-07-Accessories.md`; phần dưới đây tóm tắt bề mặt API.

### 8.1 Accessories (danh mục sản phẩm)

| Method | Endpoint | Role | Mô tả |
|---|---|---|---|
| GET | `/accessories` | Authenticated | Danh sách phụ kiện, kèm tồn kho + giá vốn bình quân **của chi nhánh hiện tại** (`X-Branch-Id`) |
| GET | `/accessories/:id` | Authenticated | Chi tiết một phụ kiện |
| POST | `/accessories` | Admin | Thêm phụ kiện mới (tồn kho khởi tạo = 0, xem §8.2 để nhập kho) |
| PUT | `/accessories/:id` | Admin | Cập nhật tên/giá/ngưỡng cảnh báo (**không** còn sửa trực tiếp tồn kho ở đây) |
| DELETE | `/accessories/:id` | Admin | Xóa phụ kiện |

**POST /accessories** — payload hiện tại **không có** field tồn kho:
```json
// Request
{ "name": "Nước Aquafina", "price": 15000, "lowStockThreshold": 10 }
```

### 8.2 Suppliers (nhà cung cấp)

Không gắn theo chi nhánh — 1 danh sách dùng chung toàn chuỗi.

| Method | Endpoint | Role | Mô tả |
|---|---|---|---|
| GET | `/suppliers` | Admin, BranchManager, Employee | Danh sách nhà cung cấp |
| GET | `/suppliers/:id` | Admin, BranchManager, Employee | Chi tiết nhà cung cấp |
| POST | `/suppliers` | Admin | Thêm nhà cung cấp |
| PUT | `/suppliers/:id` | Admin | Cập nhật thông tin |
| DELETE | `/suppliers/:id` | Admin | Xóa (soft-delete, `paranoid`) |

```json
// POST /suppliers request — chỉ "name" bắt buộc
{ "name": "Cty TNHH Cầu Lông Việt", "phone": "0281234567", "email": "sales@cauviet.vn", "address": "...", "taxCode": "0312xxxxxx", "note": "..." }
```
`email` sai định dạng → 400 `"Invalid email"`; thiếu `name` → 400
`"Supplier name is required"`.

### 8.3 Goods Receipts (phiếu nhập kho)

| Method | Endpoint | Role | Mô tả |
|---|---|---|---|
| GET | `/goods-receipts` | Admin, BranchManager, Employee | Danh sách phiếu nhập kho của chi nhánh hiện tại |
| GET | `/goods-receipts/:id` | Admin, BranchManager, Employee | Chi tiết một phiếu (kèm các dòng hàng) |
| POST | `/goods-receipts` | Admin, BranchManager, Employee | Tạo phiếu nhập kho mới |

**POST /goods-receipts**
```json
// Request
{
  "supplierId": 3,
  "note": "Nhập cầu lông tháng 8",
  "items": [
    { "extraId": 2, "quantity": 50, "unitCost": 18000 },
    { "extraId": 5, "quantity": 20, "unitCost": 12500 }
  ]
}

// Response 201
{
  "success": true,
  "data": {
    "id": 101,
    "branchId": 1,
    "code": "GR-1-00000012",
    "supplierId": 3,
    "receivedByUserId": 7,
    "totalCost": 1150000
  },
  "message": "Goods receipt created successfully"
}
```
Mã phiếu sinh tự động dạng `GR-{branchId}-{00000001, ...}` qua
`branch_document_sequences` (cùng cơ chế sinh số hoá đơn `BD-...`). Mỗi dòng
hàng tạo kèm một `stock_movements` (`type: purchase_receipt`) và cập nhật lại
giá vốn bình quân gia quyền của `extra_stocks`. Lỗi validate: `items` rỗng →
400 `"Goods receipt must have at least 1 line item"`; `quantity`/`unitCost`
sai kiểu → 400 tương ứng `"quantity must be at least 1"` /
`"unitCost must be a non-negative number"`.

### 8.4 Inventory (tồn kho & điều chỉnh)

| Method | Endpoint | Role | Mô tả |
|---|---|---|---|
| GET | `/inventory/stock-levels` | Admin, BranchManager, Employee | Tồn kho hiện tại theo sản phẩm, của chi nhánh hiện tại |
| GET | `/inventory/movements` | Admin, BranchManager, Employee | Lịch sử biến động kho (filter `?extraId=&type=&from=&to=&page=`) |
| POST | `/inventory/adjustments` | Admin, BranchManager, Employee | Điều chỉnh kho thủ công (tăng/giảm, hàng hỏng, thất lạc) |

**POST /inventory/adjustments**
```json
// Request — "note" (lý do) bắt buộc
{ "extraId": 2, "type": "damaged", "quantity": 3, "note": "Vỡ khi vận chuyển" }

// Response 201
{
  "success": true,
  "data": {
    "movement": { "id": 550, "branchId": 1, "extraId": 2, "type": "damaged", "quantity": 3, "note": "Vỡ khi vận chuyển" },
    "stock": { "extraId": 2, "branchId": 1, "quantity": 47, "averageCost": 18000 }
  },
  "message": "Stock adjustment recorded successfully"
}
```
`type` phải thuộc `["adjustment_in", "adjustment_out", "damaged", "lost"]`;
thiếu `note` → 400 `"note (lý do điều chỉnh) is required"`; điều chỉnh loại
"ra" vượt tồn hiện có → 400 `"Không đủ tồn kho tại chi nhánh này. Hiện có: {N}"`.

### 8.5 Session extras (phụ kiện trong phiên chơi)

| Method | Endpoint | Role | Mô tả |
|---|---|---|---|
| POST | `/sessions/:sessionId/extras` | Admin, BranchManager, Employee | Thêm phụ kiện vào phiên chơi đang diễn ra |
| GET | `/sessions/:sessionId/extras` | Admin, BranchManager, Employee | Danh sách phụ kiện đã gọi trong phiên |
| POST | `/sessions/:sessionId/extras/return` | Admin, BranchManager, Employee | Trả lại phụ kiện chưa dùng (mới, từ merge quản lý kho) |

```json
// POST /sessions/:sessionId/extras — { extraId, quantity }
// POST /sessions/:sessionId/extras/return — { extraId, returnQuantity }
```
Cả hai đều trừ/hoàn trực tiếp qua `InventoryService.postMovement` (`type: sale`
/ `sale_return`) trên tồn kho của **chi nhánh phiên chơi** (`session.branchId`),
không phải chi nhánh trong header request. Không đủ tồn kho → 400
`"Không đủ tồn kho tại chi nhánh này. Hiện có: {N}"` (thay cho message cũ
`"Insufficient stock. Available: N"`). Response của `POST .../extras` không
còn kèm flag `low_stock` như bản cũ — cảnh báo tồn thấp nay chỉ tính khi xem
lại `GET /accessories`.

---

## 9. Payment API

| Method | Endpoint | Role | Mô tả |
|---|---|---|---|
| POST | `/payments/checkout` | Admin, BranchManager, Employee | Tính tổng và tạo Payment (UC-18) |
| POST | `/payments/webhook` | Public (bảo vệ bằng `X-Webhook-Secret` nếu cấu hình `PAYMENT_WEBHOOK_SECRET`) | Xác nhận thanh toán chuyển khoản từ cổng VietQR |
| GET | `/invoices/:id` | Authenticated (Customer chỉ xem hóa đơn của mình) | Xem chi tiết hóa đơn |
| GET | `/invoices/:id/export-pdf` | Admin, BranchManager, Employee | Xuất hóa đơn PDF |

**POST /payments/checkout** — không còn `discountCode`; giảm giá là số tiền/%
nhân viên nhập trực tiếp tại quầy, không có hệ thống mã giảm giá:
```json
// Request
{ "sessionId": 501, "paymentMethod": "transfer", "discountAmount": 10, "isDiscountPercent": true }
// paymentMethod ∈ ["cash", "transfer"]; discountAmount/isDiscountPercent optional (mặc định 0/false)
// Header tuỳ chọn: Idempotency-Key — dùng lại khi retry cùng 1 lần checkout

// Response 201
{
  "success": true,
  "data": {
    "invoiceId": 9001,
    "sessionId": 501,
    "courtName": "Sân 3",
    "totalBeforeDiscount": 120000,
    "courtFee": 90000,
    "extrasFee": 30000,
    "discountAmount": 12000,
    "totalAmount": 108000,
    "paymentMethod": "transfer",
    "paymentStatus": "pending",
    "invoiceNo": "BD-1-00000009",
    "qrCodeUrl": "https://.../qr?..."
  }
}
```
`paymentMethod: "cash"` → `paymentStatus` được xác nhận `paid` ngay;
`"transfer"` → `pending` cho tới khi `POST /payments/webhook` xác nhận
(`qrCodeUrl: null` sau khi đã `paid`). Endpoint `POST /payments/:id/apply-discount`
mô tả ở bản tài liệu trước **không tồn tại** trong code — giảm giá nằm luôn
trong request `checkout` (`discountAmount`/`isDiscountPercent`), không phải
một bước riêng sau khi đã tạo Payment.

---

## 10. Report API

Toàn bộ route yêu cầu `roleMiddleware(['admin', 'branch_manager'])`; báo cáo
scope theo chi nhánh hiện tại (`X-Branch-Id`) giống các route khác.

| Method | Endpoint | Role | Mô tả |
|---|---|---|---|
| GET | `/reports/dashboard` | Admin, BranchManager | Số liệu tổng quan cho Dashboard |
| GET | `/reports/revenue` | Admin, BranchManager | Doanh thu theo ngày/tuần/tháng/năm (query `?period=`) |
| GET | `/reports/top-courts` | Admin, BranchManager | Top sân được thuê nhiều nhất |
| GET | `/reports/top-accessories` | Admin, BranchManager | Top phụ kiện bán chạy |
| GET | `/reports/export-excel` | Admin, BranchManager | Xuất báo cáo Excel |
| GET | `/reports/export-pdf` | Admin, BranchManager | Xuất báo cáo PDF |

---

## 11. Settings API

| Method | Endpoint | Role | Mô tả |
|---|---|---|---|
| GET | `/settings` | Admin | Lấy toàn bộ cấu hình hệ thống |
| PUT | `/settings` | Admin | Cập nhật một nhóm cấu hình theo key (generic) |
| PUT | `/settings/pricing` | Admin | Cài đặt giá sân theo khung giờ |
| PUT | `/settings/operating-hours` | Admin | Giờ hoạt động |
| PUT | `/settings/branding` | Admin | Tên sân, logo, theme, dark mode |

Endpoint `PUT /settings/accessory-pricing` mô tả ở bản tài liệu trước không có
route riêng trong `settingRoutes.js` — giá phụ kiện được sửa qua
`PUT /accessories/:id` (§8.1).

---

## 12. Xử lý lỗi đặc thù theo nghiệp vụ

| Trường hợp | HTTP Code | Message mẫu |
|---|---|---|
| Trùng lịch khi tạo booking | 409 | "Khung giờ đã được đặt" |
| Mở sân đang bảo trì | 400 | "Sân đang bảo trì, không thể mở" |
| Đóng sân chưa mở | 400 | "Sân chưa có phiên chơi nào đang diễn ra" |
| Không đủ tồn kho (gọi phụ kiện / nhập kho / điều chỉnh) | 400 | "Không đủ tồn kho tại chi nhánh này. Hiện có: {N}" |
| Nhân viên gửi `X-Branch-Id` khác chi nhánh của mình | 403 | "Nhân viên không được phép thao tác tại chi nhánh này." |
| Không đủ quyền (VD: Employee gọi API Admin) | 403 | "Bạn không có quyền thực hiện thao tác này" |
| Token hết hạn | 401 | "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại" |

---

## 13. Ghi chú triển khai
- Toàn bộ endpoint (trừ nhóm Auth/Public/`payments/webhook`) đều yêu cầu middleware xác thực JWT + middleware kiểm tra Role.
- Tài liệu này sẽ được đồng bộ thành file `swagger.yaml`/`openapi.json` ở giai đoạn Backend (Phase 3) để sinh Swagger UI tự động.
- Endpoint `checkout`, `open/close` court, nhập kho (`goods-receipts`) và điều chỉnh tồn kho (`inventory/adjustments`) đều dùng Sequelize transaction + row lock để tránh lệch dữ liệu khi có nhiều request đồng thời.
