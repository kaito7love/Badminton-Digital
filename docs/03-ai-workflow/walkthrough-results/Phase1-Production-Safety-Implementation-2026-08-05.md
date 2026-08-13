# Phase 1 — Production Safety: Báo cáo triển khai

**Ngày cập nhật:** 05/08/2026  
**Phạm vi:** Chỉ Phase 1 — Production Blockers. Không triển khai Phase 2 Inventory Foundation hoặc các phase sau.

---

## 1. Bối cảnh và vấn đề ban đầu

Badminton Digital ban đầu là MVP quản lý sân một chi nhánh. Code có các migration M1–M3 cho kiến trúc mục tiêu, nhưng model, service và API đang chạy chưa dùng các cột mới. Các rủi ro chính được phát hiện:

1. Sau M1, các bảng vận hành có `branch_id NOT NULL`, nhưng application không ghi/lọc theo branch. Điều này làm thao tác ghi có thể lỗi hoặc rò dữ liệu giữa chi nhánh.
2. Sau M3, `invoices.invoice_no` là bắt buộc, nhưng checkout không sinh số hóa đơn.
3. Booking kiểm tra lịch trống theo kiểu đọc trước rồi ghi sau; hai request đồng thời có thể đặt cùng một sân.
4. Mở sân, chuyển sân, checkout và trừ tồn kho chưa khóa row đủ chặt.
5. Checkout không idempotent. Request retry có thể cộng chi tiêu khách hàng nhiều lần.
6. Chuyển khoản bị ghi `paid` ngay khi sinh QR, không chờ xác nhận thanh toán.
7. Middleware auth không tải `employee`/`customer` profile nên controller dùng fallback `employeeId = 1`.
8. Customer có thể thao tác hoặc xem dữ liệu không thuộc quyền sở hữu.
9. Audit log chỉ có cấu trúc tối thiểu, không ghi user, branch, giá trị cũ/mới hoặc request ID.
10. Nhiều thực thể có hard delete, làm mất lịch sử vận hành.

---

## 2. Nguyên tắc triển khai

- Giữ endpoint và payload cũ hoạt động tối đa có thể.
- Không hard-code branch hoặc employee trong code mới.
- Tất cả write path cốt lõi của Phase 1 dùng transaction.
- Các action ảnh hưởng doanh thu, sân, booking và phụ kiện có audit record.
- Không trộn StockMovement, warehouse, product catalog đầy đủ hoặc membership vào Phase 1.

---

## 3. Migration và database

### 3.1 Migration mới

Đã thêm migration:

`backend/src/migrations/20260805000004-p1-production-safety.js`

Migration này phụ thuộc vào M1–M3 và thêm các thành phần sau:

| Nhóm | Thay đổi |
|---|---|
| Số hóa đơn | Bảng `branch_document_sequences`, unique `(branch_id, document_type)` |
| Soft delete | Thêm `deleted_at` cho user, employee, customer, court, booking, session, extra, session extra, invoice và payment |
| Optimistic version | Thêm `version` cho các thực thể vận hành nói trên |
| Payment | Thêm `amount`, `currency`, `provider`, `provider_reference`, `confirmed_at`, `webhook_payload`; mở rộng state machine |
| Audit | Bổ sung `user_id`, `branch_id`, `old_values`, `new_values`, `request_id` cho `activity_logs` |
| Index | Unique payment provider reference, audit entity timeline và sequence theo branch |

### 3.2 Sự cố migration và cách xử lý

Lần chạy đầu M4 dừng ở `activity_logs.employee_id` với lỗi:

```text
Column 'employee_id' cannot be NOT NULL: needed in a foreign key constraint ... SET NULL
```

Nguyên nhân là MySQL yêu cầu cột FK phải nullable trước khi dùng `ON DELETE SET NULL`. Vì DDL của MySQL tự commit, phần đầu của M4 đã được áp dụng dù migration chưa được ghi vào `SequelizeMeta`.

Migration đã được sửa để:

1. Nhận biết schema Phase 1 đã được khởi tạo dở (`branch_document_sequences` đã tồn tại) và không tạo lại phần schema đã có.
2. Drop FK cũ `activity_logs_ibfk_1`.
3. Đổi `employee_id` thành nullable.
4. Tạo lại FK `fk_activity_logs_employee` với `ON DELETE SET NULL`.
5. Hoàn tất các cột và index audit còn thiếu.

### 3.3 Trạng thái database local sau cập nhật

Đã chạy:

```powershell
cd E:\Profile\Badminton-Digital\backend
npm run migrate
```

Kết quả: toàn bộ migration từ `20260723000001` đến `20260805000004-p1-production-safety.js` ở trạng thái `up` trên database development local.

---

## 4. Thay đổi model và association

### 4.1 Model mới

- `Branch`: biểu diễn chi nhánh đã có từ M1.
- `BranchDocumentSequence`: cấp số liên tục theo branch/document type cho invoice.

### 4.2 Model được cập nhật

- `Court`, `Booking`, `CourtSession`, `Customer`, `Employee`, `Invoice`, `Payment`: nhận `branchId` theo schema M1.
- `Invoice`: nhận `invoiceNo`, `status`, `salesOrderId` theo M3.
- `Payment`: nhận idempotency key, provider metadata, amount/currency/confirmed time và các trạng thái mới.
- Các model nghiệp vụ nhận `paranoid: true` và `version: true` phù hợp migration M4.
- `ActivityLog`: nhận actor user/employee, branch, old/new JSON values và request ID.

### 4.3 Association mới

`Branch` được liên kết với court, booking, court session, customer, employee, invoice, payment và document sequence. `ActivityLog` cũng liên kết với `User` và `Branch`.

---

## 5. Context, authorization và audit

### 5.1 Request ID

File: `backend/src/middleware/requestContextMiddleware.js`

- Đọc `X-Request-Id` nếu client gửi.
- Nếu không có thì tạo UUID.
- Trả lại header `X-Request-Id` trong response.
- Dùng ID này để liên kết audit log với request.

### 5.2 Employee và customer context

`authMiddleware` hiện include `Role`, `Employee` và `Customer`. Vì vậy controller/service biết được actor hiện tại là ai, employee profile nào và customer profile nào.

Đã loại bỏ fallback `employeeId = 1` trong mở sân và checkout.

### 5.3 Branch context

File: `backend/src/middleware/branchContextMiddleware.js`

Quy tắc:

1. Staff có thể gửi `X-Branch-Id`.
2. Nếu không gửi, branch được suy ra từ employee profile đã đăng nhập.
3. Employee không được chọn branch khác với branch được gán.
4. Branch phải tồn tại và đang active.
5. API cần branch sẽ trả lỗi thay vì âm thầm dùng branch ID cố định.

Middleware này được thêm vào các route nghiệp vụ: court, booking, accessory/session, customer, employee, payment/invoice, report và setting.

### 5.4 Ownership authorization

- Customer chỉ xem/sửa/hủy booking có `customer_id` thuộc customer profile của chính mình.
- Customer không thể đổi `customerId` của booking sang hồ sơ khác.
- Customer chỉ xem invoice có session thuộc chính họ.
- Staff query customer/employee/report được scope theo `branchId` khi branch context có mặt.

### 5.5 Audit log

File: `backend/src/services/AuditService.js`

Audit record lưu:

- Ai thao tác: `user_id`, `employee_id`.
- Khi nào: `created_at`.
- Ở chi nhánh nào: `branch_id`.
- Thao tác gì: `action`.
- Đối tượng: `target_type`, `target_id`.
- Dữ liệu cũ/mới: `old_values`, `new_values`.
- Request liên quan: `request_id`.

Các luồng Phase 1 đã ghi audit: quản lý sân, mở/đóng/chuyển sân, booking, thêm/hoàn phụ kiện, checkout/webhook payment và employee create/update/delete.

---

## 6. Court và booking concurrency

### 6.1 Court operation

File: `backend/src/services/CourtService.js`

- Create/update/delete court dùng transaction; delete là soft delete.
- Open court khóa row court bằng `FOR UPDATE` trước khi kiểm tra trạng thái và tạo session.
- Nếu mở từ booking, booking được khóa và phải có state `pending` hoặc `confirmed`.
- Customer của session phải thuộc branch hiện tại; customer truyền vào phải khớp customer của booking nếu booking đã có customer.
- Close court, transfer court và maintenance đều dùng transaction/row lock và audit log.

### 6.2 Booking

File: `backend/src/services/BookingService.js`

- Create/update booking dùng transaction `SERIALIZABLE`.
- Court row được khóa trước khi kiểm tra overlap; overlap query cũng chạy trong transaction.
- Bắt buộc `startTime < endTime`.
- Update chỉ cho phép booking `pending` hoặc `confirmed`.
- Confirm chỉ cho phép `pending -> confirmed`.
- Cancel chỉ cho phép booking chưa completed/cancelled.
- Đã thêm `updateBookingRules`; không cho cập nhật `status` trực tiếp qua endpoint update.

---

## 7. Phụ kiện và tồn kho MVP

File: `backend/src/services/AccessoryService.js`

- Add/return session extra khóa session và extra row bằng `FOR UPDATE`.
- Kiểm tra tồn kho và thay đổi số lượng diễn ra trong cùng transaction.
- Tạo/update/delete legacy `Extra` dùng transaction và audit log.
- Delete là soft delete.

Đây chỉ là bảo vệ an toàn cho cột tồn kho MVP. Stock movement ledger, warehouse, receiving, adjustment, FIFO và cost tracking **không thuộc Phase 1**; sẽ được thay bằng Phase 2 Inventory Foundation.

---

## 8. Payment, invoice number và webhook

### 8.1 Invoice number

File: `backend/src/utils/invoiceNumber.js`

Checkout khóa `branch_document_sequences` trong transaction và sinh số theo format:

```text
BD-<branchId>-<8 digit sequence>
```

Ví dụ: `BD-1-00000001`.

### 8.2 Idempotency

Endpoint checkout nhận header:

```http
Idempotency-Key: <client-generated-key>
```

- Nếu request retry dùng cùng key và cùng session, server trả lại kết quả checkout cũ.
- Nếu cùng key được dùng cho session khác, server trả `409 Conflict`.
- Để tương thích client cũ, khi header không có, server dùng key xác định theo `sessionId` thay vì dùng random ID.

### 8.3 Payment state machine

Trạng thái hỗ trợ:

```text
pending -> processing -> paid
pending/processing -> failed hoặc cancelled
paid -> refunded
```

Hiện tại:

- Cash checkout được ghi `paid` ngay và invoice chuyển `paid`.
- Transfer checkout được ghi `pending`; QR chỉ là yêu cầu thanh toán, không phải bằng chứng đã thanh toán.
- `total_spent`/loyalty chỉ cập nhật khi payment thực sự chuyển `paid`.

### 8.4 Payment webhook

Endpoint mới:

```http
POST /api/v1/payments/webhook
```

Payload tối thiểu:

```json
{
  "provider": "vietqr",
  "providerReference": "provider-transaction-id",
  "invoiceNo": "BD-1-00000001",
  "status": "paid"
}
```

Nếu cấu hình `PAYMENT_WEBHOOK_SECRET`, request phải gửi header:

```http
X-Webhook-Secret: <secret>
```

Webhook khóa invoice/payment, chỉ cho transition hợp lệ, ghi provider reference/payload, cập nhật invoice và customer spend trong cùng transaction, sau đó tạo audit log.

### 8.5 Frontend

File: `frontend/src/services/apiServices.js`

`paymentService.checkout` tự sinh `crypto.randomUUID()` khi caller chưa cung cấp `idempotencyKey`, rồi gửi dưới header `Idempotency-Key`. Caller retry cùng nghiệp vụ nên lưu và dùng lại key đó.

---

## 9. Employee, customer và reports

### 9.1 Employee

- Không còn default role ID hoặc default password trong service.
- Employee mới bắt buộc được gán branch từ request context.
- Create/update/delete employee được transaction-safe; update user email và employee profile nằm trong cùng transaction.
- Query employee/activity log được scope branch.

### 9.2 Customer

- Customer create nhận branch từ request context để đáp ứng `customers.branch_id NOT NULL`.
- Customer lookup/history kiểm tra ownership đối với customer role.
- Đã sửa lỗi import `Op` từ Sequelize cho customer search.

### 9.3 Reports

- Dashboard, revenue, top courts và top accessories đều yêu cầu branch context.
- Payment/court/session query được filter theo `branch_id`.
- Legacy low-stock widget vẫn dựa vào bảng `extras` toàn cục; vấn đề này được xử lý triệt để trong Phase 2 khi thay bằng inventory ledger theo warehouse/branch.

---

## 10. Thay đổi API và tương thích

| API/contract | Thay đổi |
|---|---|
| Operational APIs | Hỗ trợ `X-Branch-Id`; staff cũ không gửi header sẽ dùng branch của employee |
| `POST /payments/checkout` | Hỗ trợ `Idempotency-Key`; client cũ vẫn hoạt động với key theo session |
| `POST /payments/webhook` | Endpoint mới, không yêu cầu JWT nhưng có shared secret nếu cấu hình |
| `PUT /bookings/:id` | Có validation update; không được set status trực tiếp |
| `GET invoice/customer/booking` | Áp dụng ownership/branch checks |

Tài liệu API gốc được cập nhật tại `docs/APIDesign.md`. Tài liệu Phase 1 chi tiết khác nằm tại `backend/docs/architecture/PHASE1_PRODUCTION_SAFETY.md`.

---

## 11. Kiểm thử đã thực hiện

### 11.1 Backend

```powershell
cd E:\Profile\Badminton-Digital\backend
npm test -- --runInBand
```

Kết quả: `2` test suites, `4` tests pass.

- Price calculator tests hiện có.
- Test mới kiểm tra payment webhook validation: reject thiếu provider reference và accept payload hợp lệ.

### 11.2 Cú pháp và import

- Đã chạy `node --check` trên toàn bộ file JS dưới `backend/src`.
- Đã import trực tiếp booking/payment/report/employee routes để kiểm tra wiring.

### 11.3 Frontend

```powershell
cd E:\Profile\Badminton-Digital\frontend
npm run build
```

Build Vite production pass. Có cảnh báo bundle JavaScript khoảng 710 KB sau minify; không chặn Phase 1 nhưng nên code-split ở phase UI/report sau.

### 11.4 Database và login

- Kiểm tra `db:migrate:status`: M1, M2, M3 và M4 đều `up`.
- Query `User.findOne` đã chạy được sau M4.
- Đã gọi trực tiếp `AuthService.login` với seed admin để xác minh luồng login backend thành công.

---

## 12. Cách vận hành sau cập nhật

1. Backup database trước khi chạy migration ở staging/production.
2. Chạy migration:

```powershell
cd E:\Profile\Badminton-Digital\backend
npm run migrate
```

3. Cấu hình production tối thiểu:

```env
PAYMENT_WEBHOOK_SECRET=<random-secret>
JWT_ACCESS_SECRET=<strong-random-secret>
JWT_REFRESH_SECRET=<different-strong-random-secret>
```

4. Restart backend sau deploy/migration.
5. Với staff API, client nên gửi `X-Branch-Id` rõ ràng khi UI hỗ trợ chọn branch; hệ thống hiện tương thích bằng cách suy ra branch từ employee profile.
6. Khi retry checkout, client phải tái sử dụng cùng `Idempotency-Key`.

---

## 13. Giới hạn còn lại và phase tiếp theo

Phase 1 không giải quyết các module ngoài roadmap của nó. Các điểm sau vẫn cần thực hiện trước khi gọi toàn bộ SCMS là production-ready:

1. **Phase 2:** StockMovement, warehouse/location, supplier, purchase order, goods receipt, adjustment, inventory count, transfer order, batch/expiry và cost tracking. Legacy `extras.stock_quantity` chưa phải inventory ledger chuẩn.
2. **Payment provider:** Shared secret là lớp bảo vệ generic. Khi tích hợp VNPay/MoMo/VietQR provider cụ thể, cần verify signature theo chuẩn provider, replay protection và reconciliation job.
3. **Test database:** Cần integration test với MySQL test container cho migration, deadlock, duplicate booking, duplicate checkout, webhook retry và rollback. Unit test hiện chưa chứng minh hoàn toàn transaction behaviour ở database.
4. **RBAC đầy đủ:** Permission matrix, role-permission và branch assignments chính thức thuộc roadmap mở rộng; hiện dùng role-based checks và employee branch hiện có.
5. **Settings branch scope:** `branch_settings` đã tồn tại từ M1 nhưng setting service cũ chưa chuyển hoàn toàn sang bảng này.
6. **Observability và security platform:** Rate limit auth/webhook, security headers, log aggregation, backup/restore drill, alerting và secret management production cần hoàn thiện trong deployment phase.

Không bắt đầu Phase 2 trong cập nhật này để tuân thủ nguyên tắc triển khai từng phase.
