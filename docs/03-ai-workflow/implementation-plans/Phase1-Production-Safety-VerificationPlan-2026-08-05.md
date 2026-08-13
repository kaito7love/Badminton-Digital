# Kế hoạch 1 — Đối chiếu và xác nhận Phase 1 Production Safety

**Mục đích:** Xác minh code, database và API đang chạy đúng với báo cáo Phase 1 trước khi bắt đầu Phase 2.  
**Không triển khai tính năng mới trong kế hoạch này.** Mọi phát hiện sai lệch phải được sửa hoặc ghi nhận rõ trước khi chuyển trạng thái sang đạt.

## 1. Nguồn đối chiếu

- Báo cáo triển khai: `docs/03-ai-workflow/walkthrough-results/Phase1-Production-Safety-Implementation-2026-08-05.md`
- Tài liệu kiến trúc Phase 1: `backend/docs/architecture/PHASE1_PRODUCTION_SAFETY.md`
- Migrations: M1 đến M4 (`20260805000001` đến `20260805000004`).
- Code runtime: models, middleware, services, controllers, routes, validation và frontend API client.

## 2. Tiêu chí trạng thái

| Trạng thái | Ý nghĩa |
|---|---|
| `Đạt` | Có code, schema và automated/integration evidence đúng với claim |
| `Đạt có điều kiện` | Code tồn tại nhưng chưa kiểm chứng bằng MySQL integration/concurrency test |
| `Chưa đạt` | Thiếu code, test hoặc behavior không đúng báo cáo |
| `Ngoài Phase 1` | Không dùng để fail Phase 1 nhưng phải nằm trong backlog Phase 2+ |

## 3. Ma trận đối chiếu Phase 1

| Hạng mục trong báo cáo | Evidence hiện có | Trạng thái ban đầu | Cách xác nhận/đóng |
|---|---|---|---|
| Migration M1–M4 | `db:migrate:status` local đã `up` | Đạt có điều kiện | Chạy trên database staging sạch và database có dữ liệu nâng cấp |
| Branch context | `branchContextMiddleware`, route wiring, model `branchId` | Đạt có điều kiện | Test employee không thể chọn branch khác; test request thiếu branch khi thao tác ghi |
| Employee context | `authMiddleware` include employee/customer; không còn fallback employee `1` | Đạt có điều kiện | API test mở sân/checkout với employee không có profile và employee đúng branch |
| Invoice number | `branch_document_sequences`, `nextInvoiceNumber` | Đạt có điều kiện | Concurrent checkout nhiều request cùng branch; verify không trùng/không mất số |
| Idempotency | `PaymentService.checkout`, frontend gửi `Idempotency-Key` | Đạt có điều kiện | Retry cùng key/same session trả cùng payment; key dùng cho session khác trả 409 |
| Payment state machine | Cash `paid`; transfer `pending`; webhook xác nhận | Đạt có điều kiện | Test pending → paid, duplicate webhook và transition không hợp lệ |
| Webhook protection | `PAYMENT_WEBHOOK_SECRET` tùy chọn | Chưa đạt hoàn toàn | Khi chọn provider thật, bổ sung verify chữ ký chuẩn provider và replay protection |
| Booking concurrency | Serializable transaction + court row lock | Đạt có điều kiện | MySQL integration test với hai request đồng thời cùng slot; chỉ một request 201 |
| Session concurrency | Court/session row lock | Đạt có điều kiện | Hai request open/close/transfer đồng thời; không được có hai session `playing` |
| Atomic accessory update | Session và extra row lock + transaction | Đạt có điều kiện | Concurrent sell/return test; tồn kho không âm và subtotal đúng |
| Ownership authorization | Booking/customer/invoice ownership checks | Đạt có điều kiện | API matrix: owner 200; user khác 403; employee branch khác 403 |
| Audit log | Actor, branch, old/new, request ID ở core paths | Chưa đạt hoàn toàn | Kiểm tra từng write endpoint; bổ sung audit cho customer/settings/auth và các legacy write path còn thiếu |
| Soft delete | Core operational models dùng `paranoid` | Đạt có điều kiện | Delete → không hiện ở read API, record vẫn tồn tại DB; FK/historical query đúng |
| Transaction safety | Court, booking, session extra, payment, employee core writes | Chưa đạt hoàn toàn | Rà từng write service còn lại: CustomerService, SettingService, AuthService và legacy paths phải được transaction/audit hóa hoặc đưa ra khỏi production scope |
| Reports branch scope | Payment/court/session report có branch filter | Đạt có điều kiện | Snapshot test report hai branch; low-stock legacy widget phải xử lý ở Phase 2 |
| Frontend idempotency | `paymentService.checkout` gửi header | Đạt có điều kiện | E2E retry test, bảo đảm caller tái dùng key trên cùng intent |

## 4. Trình tự audit bắt buộc

### Bước 1 — Snapshot và migration rehearsal

1. Backup database staging.
2. Khởi tạo MySQL trống, chạy M1–M4, seed dữ liệu.
3. Clone database có dữ liệu MVP, chạy nâng cấp M4.
4. Kiểm tra `SequelizeMeta`, foreign keys, indexes và schema `activity_logs`.
5. Rollback rehearsal chỉ ở development; production chỉ forward-fix migration.

**Điều kiện pass:** Không có schema drift, migration chạy lại an toàn sau lỗi đã biết, login query không lỗi cột.

### Bước 2 — Authentication và branch scope

1. Login admin, employee, customer.
2. Gọi API với branch đúng, branch sai và thiếu branch.
3. Kiểm tra employee/customer context từ JWT request.
4. Kiểm tra customer không thể truy cập booking/customer/invoice người khác.

**Điều kiện pass:** Không có hard-coded employee/branch; response sai quyền là 403; dữ liệu khác branch không bị lộ.

### Bước 3 — Booking và court race conditions

1. Gửi song song hai request tạo booking cùng court/date/time.
2. Gửi song song hai request mở cùng court.
3. Gửi close/transfer đồng thời trên một session.
4. Kiểm tra state, audit log, duration và court status sau mỗi test.

**Điều kiện pass:** Một booking/session active duy nhất; không deadlock không xử lý; transaction rollback sạch.

### Bước 4 — Payment và webhook

1. Checkout cash với một idempotency key, retry cùng request.
2. Reuse key cho session khác.
3. Checkout transfer, kiểm tra chưa cộng `total_spent` trước webhook.
4. Gửi webhook hợp lệ hai lần và webhook sai transition.
5. Kiểm tra invoice number unique theo branch và audit record.

**Điều kiện pass:** Không duplicate payment/spend; webhook duplicate không thay đổi số liệu; transition sai bị từ chối.

### Bước 5 — Accessory và soft delete

1. Sell/return phụ kiện đồng thời từ hai nhân viên.
2. Delete court/extra/employee, kiểm tra `deleted_at` và historical records.
3. Kiểm tra existing API list không trả soft-deleted record.

**Điều kiện pass:** Không tồn kho âm; không mất lịch sử; audit đủ actor/old/new values.

### Bước 6 — Closing review

1. Chạy backend unit/integration tests, frontend build và API smoke tests.
2. So sánh mọi claim Phase 1 với evidence.
3. Chỉ chuyển Phase 1 sang `Đạt` khi mọi item `Đạt có điều kiện` có evidence database/E2E hoặc được giảm phạm vi rõ ràng.

## 5. Deliverables của kế hoạch audit

- Bộ integration test MySQL/Supertest cho các race condition và ownership matrix.
- Báo cáo kết quả migration rehearsal.
- Bảng pass/fail cập nhật từ ma trận trên.
- Danh sách fix nhỏ còn lại, không trộn Phase 2.
- Quyết định chính thức: `Phase 1 accepted` hoặc `Phase 1 blocked`.

## 6. Definition of Done

Phase 1 chỉ được xem là đủ điều kiện chuyển phase khi:

1. M1–M4 chạy được trên staging và dữ liệu nâng cấp.
2. Các test concurrency/payment/ownership chạy với MySQL thực.
3. Không còn write endpoint trong production scope thiếu transaction/audit/authorization phù hợp.
4. Shared-secret webhook được thay bằng verify theo provider trước khi bật cổng thanh toán thật.
5. Evidence được lưu cùng báo cáo audit.
