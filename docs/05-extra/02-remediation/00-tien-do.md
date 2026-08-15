# Tiến độ sửa lỗi — đã làm gì, còn gì chưa làm

**Cập nhật:** 2026-08-16. Tài liệu này là nguồn sự thật duy nhất về tiến độ —
nếu khác với những gì `01-audit/*.md` mô tả, tin tài liệu này (audit là ảnh
chụp lúc phát hiện, không được cập nhật lại).

Quy trình áp dụng cho mọi nhánh dưới đây (đã thống nhất và giữ nguyên suốt):
tạo nhánh riêng từ `main` → viết plan → chờ duyệt ("code đi") → code + test
thật (chạy server thật, gọi API thật, truy vấn DB thật — không chỉ đọc code)
→ báo cáo kết quả → chờ duyệt merge ("merge vào main đi") → merge cục bộ vào
`main`. **Không có nhánh nào tự merge khi chưa được duyệt.**

`main` hiện **chưa được push lên `origin`** kể từ commit `2ca2672` — mọi
merge dưới đây chỉ nằm ở máy cục bộ, chưa lên remote. Có push hay không tuỳ
quyết định của chủ dự án.

---

## Đã xong và đã merge vào `main`

### 1. `fix/security-critical` (merge tại `36545f8`)
Nguồn: các phát hiện 🔴 trong `../01-audit/SecurityAudit.md`. **Cố ý bỏ qua
mọi thứ liên quan thanh toán online** (webhook secret...) — module thanh
toán online sẽ tách riêng sau, chưa tích hợp.

- Bỏ JWT secret hardcode mặc định (`backend/src/utils/jwt.js`) — giờ bắt
  buộc phải có `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` ≥ 32 ký tự trong
  `.env`, thiếu là server không khởi động được.
- Thêm rate limit (`express-rate-limit`) cho `/login`, `/forgot-password`,
  `/reset-password` (10 lần/15 phút), `/register` (5 lần/giờ),
  `/refresh-token` (30 lần/15 phút).
- Chặn formula injection khi xuất Excel/CSV báo cáo (`reportExporter.js`) —
  giá trị ô bắt đầu bằng `= + - @` được thêm `'` phía trước.

### 2. `fix/data-integrity` (merge tại `294c228`)
Nguồn: các phát hiện trong `../01-audit/StabilityAudit.md` về race condition
và thiếu transaction.

- `CustomerService.updateCustomer` — bọc transaction + khoá dòng
  (`LOCK.UPDATE`), theo đúng mẫu đã dùng ở `BookingService.createBooking`.
- `BookingService.cancelBooking`/`confirmBooking` — tái cấu trúc để mở
  transaction và khoá dòng **trước** khi kiểm tra trạng thái/quyền sở hữu
  (tránh 2 request đồng thời cùng đọc trạng thái cũ).
- Thêm index `(branch_id, status, paid_at)` cho `payments` — trong lúc test
  migration `down()` phát hiện `payments.branch_id` trước đó không có index
  riêng nào backing 2 ràng buộc khoá ngoại, đã vá thêm.
- Cấu hình `pool` (max/min/acquire/idle) cho Sequelize theo từng môi trường.

### 3. `chore/docker-hardening` (merge tại `cff7ef4`)
Yêu cầu cụ thể của chủ dự án: MySQL chỉ bind `127.0.0.1:3306` (vẫn debug
được từ máy host), backend nối MySQL qua service name `mysql` trong mạng
Docker.

- `docker-compose.yml`: MySQL `ports: ["127.0.0.1:3306:3306"]`, thêm
  `healthcheck` (mysqladmin ping); backend/frontend thêm `restart:
  unless-stopped`.
- Container backend chạy quyền `USER node` (non-root).
- `.dockerignore` mới cho backend + frontend — chặn `.env`, `node_modules`,
  `.git` lọt vào image.
- **2 lỗi có sẵn từ trước, không liên quan phạm vi hardening, phát hiện khi
  test thật** (`docker compose up --build` trước đó **chưa từng chạy được**):
  thiếu đường dẫn `dockerfile:` trong compose, và `DB_HOST` sai (đọc
  `localhost` từ `.env` dev thay vì `mysql`) — đã sửa cùng đợt, có báo lại
  minh bạch với chủ dự án.
- Đã test thật: bật Docker Desktop, `docker compose up --build` chạy được
  hết end-to-end (mysql healthy → backend connect → frontend serve).

### 4. `chore/frontend-resilience` (merge tại `9051666`)
Nguồn: phần "xử lý lỗi/observability còn sơ khai" trong
`../01-audit/StabilityAudit.md`.

- `ErrorBoundary` (class component) bọc toàn bộ `<AppRoutes />` — có giao
  diện fallback tiếng Việt + nút tải lại. **Đã test trực quan thật trên
  trình duyệt** theo yêu cầu chủ dự án (route test tạm `/__test-error-boundary`,
  đã xoá sau khi xác nhận, `git diff` rỗng).
- Gộp nhiều request 401 đồng thời thành đúng 1 lần gọi `/refresh-token`
  (dedupe qua `refreshPromise` module-level trong `apiClient.js`), tránh gọi
  refresh thừa khi nhiều API chạy song song (`Promise.all`).
- `authEvents.js` (pub/sub tối giản) — khi refresh token thật sự hết hạn,
  báo ngay cho `AuthContext` để chuyển về màn hình đăng nhập, không cần đợi
  người dùng tự F5.
- Backend: bắt lỗi 404 trả đúng envelope JSON chuẩn `{success,data,message,errors}`
  thay vì HTML mặc định của Express; lỗi 500 không phải operational error chỉ
  hiện message thật khi `NODE_ENV !== 'production'`.

---

## Đã code + test xong, **chưa merge** — chờ duyệt

### 5. `feat/invoice-line-items` (commit `49177ff` trên nhánh riêng)
Nguồn: yêu cầu trực tiếp của chủ dự án — hoá đơn hiện chỉ có 4 cột tổng hợp,
thiếu dữ liệu chi tiết từng dòng để sau này làm báo cáo doanh thu và tổng
kết nhập-tồn kho. Bảng `invoice_lines` đã có sẵn trong schema từ migration M3
nhưng chưa từng có model, chưa từng được ghi dữ liệu — nhánh này nối nó vào.

Phạm vi đã chốt với chủ dự án (4 câu hỏi khi lập plan): **không** thêm
thuế/VAT, **không** backfill hoá đơn cũ, **không** làm báo cáo mới, **không**
làm UI xem hoá đơn ở frontend — chỉ xây nền tảng ghi dữ liệu itemized.

- Model mới `backend/src/models/InvoiceLine.js`, đăng ký + quan hệ
  `Invoice.hasMany(InvoiceLine, {as:'lines'})` trong `models/index.js`.
- `PaymentService.checkout` ghi dòng chi tiết trong cùng transaction lúc
  thanh toán: 1 dòng `court_time`, N dòng `product` (từ `sessionExtras`),
  1 dòng `discount` (amount âm) nếu có giảm giá. Re-checkout (idempotency
  retry) xoá dòng cũ rồi dựng lại, không nhân đôi.
- **Bằng chứng test thật:** checkout thật qua API (mở sân → gọi 2 phụ kiện →
  giảm giá 10.000đ) → đúng 4 dòng, `SUM(amount)` khớp chính xác
  `invoices.total_amount` (70.000 = 70.000); test riêng nhánh re-checkout
  (xoá Payment giả lập retry, checkout lại với idempotency key khác) → hoá
  đơn được tái sử dụng, `invoice_lines` không nhân đôi; xác nhận hoá đơn tạo
  trước nhánh này không có dòng mới nào (đúng quyết định không backfill).
  `npm test` 38/38 pass.

**Việc còn lại:** báo cáo doanh thu/tồn kho tiêu thụ `invoice_lines` chưa
làm — xem `04-ke-hoach-invoice-reporting.md`.

---

## Chưa làm — xem plan riêng từng phần

| Việc | File plan | Ưu tiên gốc |
|---|---|---|
| Xoá 5 bảng DB thật sự chết (`product_categories`, `products`, `product_variants`, `sales_orders`, `sales_order_lines`) + `Invoice.salesOrderId`, dọn 3 hàm API mồ côi ở frontend | `01-ke-hoach-dead-code-cleanup.md` | Nhóm A — kế tiếp |
| `dateTime.js` hiện dùng giờ server, không theo `branch.timezone` | `02-ke-hoach-branch-timezone.md` | Nhóm A |
| Bundle frontend ~800KB, chưa code-split theo route | `03-ke-hoach-frontend-code-splitting.md` | Nhóm A |
| Báo cáo doanh thu chi tiết + tổng kết nhập-tồn kho dùng `invoice_lines` | `04-ke-hoach-invoice-reporting.md` | Phụ thuộc mục 5 ở trên, làm sau khi có đủ dữ liệu itemized |
| 4 việc cần quyết định chính sách kinh doanh trước (discount guardrail, onboarding branch_manager, luồng hoàn tiền/void, cấu hình tài khoản ngân hàng) | `05-backlog-nhom-b.md` | Nhóm B — cuối cùng, chưa lên plan chi tiết |

## Cố ý bỏ qua / đã hoãn — không tự ý làm lại nếu chưa hỏi lại chủ dự án

- Bảo mật webhook thanh toán (secret, chống giả mạo) — cả module thanh toán
  online chưa tích hợp, sẽ tách riêng sau.
- Refresh token hỗ trợ nhiều phiên đăng nhập cùng lúc (sửa được lỗi bị đăng
  xuất khi đăng nhập nơi thứ 2) — chủ dự án đã xem bằng chứng test thật và
  chủ động chọn "thôi không cần đâu" (xem `../01-audit/SessionRefreshIssue.md`).
- Thuế/VAT trên hoá đơn — hoãn, chưa cần.
- Backfill dữ liệu `invoice_lines` cho hoá đơn cũ — chủ động chọn không làm.
- UI xem/in hoá đơn chi tiết ở frontend — hoãn, làm sau khi có báo cáo dùng
  tới dữ liệu này.
- Đồng bộ realtime đa thiết bị (mở sân ở máy A không tự cập nhật máy B) —
  đã điều tra và có phương án ở `../01-audit/RealtimeCourtSync.md`, nhưng
  **chưa lên plan trong `02-remediation/`** vì chưa được chủ dự án chốt ưu
  tiên — cần hỏi lại trước khi lên nhánh riêng.
