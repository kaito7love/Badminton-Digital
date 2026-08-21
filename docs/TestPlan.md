# Test Plan

## Dự án: Badminton Digital Management – Hệ thống quản lý sân cầu lông

**Phiên bản:** 1.1
**Ngày:** 16/08/2026 (từ v1.0 ngày 19/07/2026 — đối chiếu lại với `docs/04-workflows/` sau merge đa chi nhánh, kho hàng, bán lẻ POS và báo cáo chi tiết)
**Tài liệu tham chiếu:** `SRS.md`, `UseCase.md`, `APIDesign.md`, `DatabaseDesign.md`, `Architecture.md`, `docs/04-workflows/`

---

## 1. Mục tiêu kiểm thử

Đảm bảo Badminton Digital Management hoạt động đúng theo các yêu cầu chức năng (FR) và phi chức năng (NFR) đã đặc tả trong SRS, phát hiện lỗi sớm trước khi triển khai, và cung cấp bằng chứng chất lượng (test report, coverage) để đưa vào portfolio.

## 2. Phạm vi kiểm thử

### 2.1 Trong phạm vi

- Toàn bộ API Backend (Auth, Court, Booking, Customer, Employee, Accessories, Payment, Report, Settings, và module bán lẻ mới: Product/ProductCategory/SalesOrder — xem `docs/04-workflows/flows/WF-09-Retail.md`)
- Logic nghiệp vụ cốt lõi: tính tiền sân theo khung giờ, kiểm tra trùng lịch, checkout (cả checkout sân lẫn checkout đơn bán lẻ), phân quyền, đối chiếu kho
- Giao diện Frontend: luồng chính của từng module (smoke test + UI test trọng điểm), bao gồm quầy POS bán lẻ (`RetailPage`)
- Hiệu năng chịu tải cơ bản (K6)

### 2.2 Ngoài phạm vi

- Kiểm thử cổng thanh toán thực tế (không tích hợp ở phiên bản này)
- Kiểm thử bảo mật chuyên sâu (penetration testing) — chỉ áp dụng security checklist cơ bản

---

## 3. Chiến lược kiểm thử (Test Levels)

**Hiện trạng (đã triển khai, chạy trong CI):**

| Cấp độ      | Công cụ           | Phạm vi                                                                                                                                                                            |
| ----------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit Test   | Jest (Backend)    | Service/logic thuần, không phụ thuộc DB: tính tiền theo khung giờ, kiểm tra trùng lịch, validate SĐT/thanh toán, logic tồn kho (`InventoryService`) — xem mục 9 cho danh sách file |
| Unit Test   | Vitest (Frontend) | Hàm/logic thuần phía frontend — hiện chỉ có `src/utils/roles.test.js`                                                                                                              |
| Build check | `vite build`      | Đảm bảo frontend build production không lỗi (không phải test theo nghĩa assert hành vi)                                                                                            |

**Kế hoạch (chưa triển khai — đề xuất, không có trong CI hiện tại):**

| Cấp độ                | Công cụ                           | Phạm vi                                                                                                                                                       |
| --------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Integration Test      | Jest + Supertest                  | API endpoint kết hợp DB (dùng DB test riêng/SQLite in-memory hoặc MySQL test container) — CI hiện chưa có service DB nên chưa chạy được loại test này         |
| API/Manual Test       | Postman (Collection + Newman CLI) | Toàn bộ endpoint theo `APIDesign.md`, gồm case thành công và lỗi — thư mục `postman/` hiện chỉ có `.gitkeep`, chưa có collection thật                         |
| Load/Performance Test | K6                                | Endpoint tần suất cao: `/courts/:id/open`, `/courts/:id/close`, `/bookings`, `/payments/checkout` — thư mục `k6/` hiện chỉ có `.gitkeep`, chưa có script thật |
| UI/E2E Test           | (đề xuất) Cypress hoặc Playwright | Luồng chính: login → mở sân → checkout; tạo booking; xem báo cáo                                                                                              |
| Lint                  | ESLint                            | CI hiện không chạy bước lint riêng cho backend lẫn frontend                                                                                                   |
| Security Checklist    | Thủ công                          | Kiểm tra JWT, RBAC, input validation, SQL injection cơ bản — chưa tự động hóa trong CI                                                                        |

## 4. Môi trường kiểm thử

| Môi trường             | Mục đích                                              |
| ---------------------- | ----------------------------------------------------- |
| Local (Docker Compose) | Dev & unit/integration test                           |
| Staging                | Test thủ công (Postman), UAT trước khi trình bày demo |

---

## 5. Ma trận Test Case theo Use Case (mức tổng hợp)

> Đối chiếu lại với `docs/04-workflows/` (2026-08-16): bảng dưới đây đã sửa
> UC-18 (hệ thống không có khái niệm "mã giảm giá" — chỉ có số tiền/%% giảm
> giá nhập trực tiếp, không có validate hết hạn/sai mã) và bổ sung các UC
> trước đây chưa có dòng nào trong ma trận (UC-02 đến UC-25), dùng đúng
> thông báo lỗi/status code đã xác nhận trong code, không phải suy đoán.

| UC    | Use Case                           | Test case chính                                                                                                                        | Test case ngoại lệ                                                                                                                                                             |
| ----- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| UC-01 | Đăng nhập                          | Đăng nhập đúng thông tin (bằng SĐT hoặc email) → nhận Access+Refresh token                                                             | Sai mật khẩu, tài khoản khóa (`isActive=false`), identifier không tồn tại — cả 3 trả _cùng_ message 401 (trừ khóa tài khoản có message riêng); ≥ 11 lần trong 15 phút/IP → 429 |
| UC-02 | Đăng xuất                          | Gọi khi đang đăng nhập → `refreshToken` trên DB bị xoá, `/refresh-token` sau đó thất bại                                               | Gọi khi không có Access Token hợp lệ → 401 (chặn ở `authMiddleware` trước khi tới logic)                                                                                       |
| UC-03 | Quên mật khẩu                      | Nhập email hợp lệ → nhận link reset có TTL                                                                                             | Email không tồn tại (không lộ thông tin), token reset hết hạn/đã dùng → từ chối                                                                                                |
| UC-04 | Đổi mật khẩu                       | Đúng mật khẩu cũ + mật khẩu mới hợp lệ → cập nhật hash                                                                                 | Sai mật khẩu cũ → từ chối, không đổi                                                                                                                                           |
| UC-05 | CRUD sân                           | Thêm/sửa/xóa sân hợp lệ (role `admin`/`branch_manager`)                                                                                | `employee` gọi → 403; xóa sân đang có phiên chơi/đặt lịch → chặn                                                                                                               |
| UC-08 | Chuyển sân                         | Chuyển sang sân đích đang trống thành công                                                                                             | Sân đích đang chơi → 400 "Sân đích đang được sử dụng"; chuyển sang chính sân nguồn → 400                                                                                       |
| UC-09 | Đổi trạng thái khai thác sân       | active ↔ maintenance ↔ inactive khi sân không có phiên chơi                                                                            | Đổi trạng thái khi sân đang có phiên chơi → 400; giá trị `status` ngoài 3 giá trị → 400 (validation)                                                                           |
| UC-10 | Tạo booking                        | Đặt lịch khung giờ trống thành công → `status: 'pending'`                                                                              | Đặt trùng khung giờ đã `pending`/`confirmed` → 409; đặt sân `maintenance`/`inactive` → 400                                                                                     |
| UC-11 | Kiểm tra trùng lịch                | Overlap một phần, overlap toàn phần, liền kề (không overlap)                                                                           | Dữ liệu biên: booking kết thúc đúng lúc booking khác bắt đầu (không tính overlap)                                                                                              |
| UC-12 | Sửa/Hủy booking                    | Sửa giờ hợp lệ khi `pending`/`confirmed`; hủy → `status: 'cancelled'`                                                                  | Sửa/hủy booking đã `completed`/`cancelled` → 400; khách hàng sửa booking không phải của mình → 403                                                                             |
| UC-13 | Xác nhận booking                   | Pending → Confirmed thành công                                                                                                         | Khách hàng tự gọi endpoint confirm → 403 (chỉ nhân viên/branch_manager/admin)                                                                                                  |
| UC-14 | Quản lý khách hàng (CRUD)          | Tạo khách mới (SĐT chưa tồn tại toàn chuỗi) thành công                                                                                 | Trùng SĐT toàn chuỗi → 400; `employee` gọi `DELETE` → 403 (chỉ `admin`)                                                                                                        |
| UC-15 | Xem lịch sử & chi tiêu             | Khách xem lịch sử của chính mình → gộp mọi chi nhánh                                                                                   | Khách cố xem hồ sơ/lịch sử người khác → 403 "Bạn không có quyền truy cập khách hàng này"                                                                                       |
| UC-16 | Quản lý nhân viên (CRUD)           | Admin/`branch_manager` tạo nhân viên hợp lệ → role luôn là `employee`                                                                  | Email đã tồn tại → 400; SĐT đã có tài khoản khác → 409; `employee` gọi bất kỳ endpoint nào trong nhóm này → 403                                                                |
| UC-17 | Phụ kiện & tồn kho                 | Nhập kho (phiếu có ≥1 dòng hợp lệ) → cộng tồn kho + tính lại giá vốn BQ                                                                | Điều chỉnh kho vượt tồn hiện có → 400 "Không đủ tồn kho tại chi nhánh này. Hiện có: {N}"; thiếu lý do điều chỉnh (`note`) → 400                                                |
| UC-18 | Checkout (thanh toán sân)          | Tính đúng tổng tiền (sân cắt khung cao/thấp điểm + phụ kiện − giảm giá số tiền/%%)                                                     | Checkout 2 lần cùng `sessionId`/`Idempotency-Key` → trả lại đúng kết quả cũ, không tạo trùng; session đã có payment → 409                                                      |
| UC-19 | Dashboard                          | Số liệu hiển thị khớp với dữ liệu DB, gộp cả doanh thu bán lẻ (UC-24) và tồn kho thấp (Extra + ProductVariant)                         | Không có dữ liệu trong kỳ → hiển thị 0, không lỗi; thiếu `branchId` → 400                                                                                                      |
| UC-20 | Xuất báo cáo                       | Tải Excel/PDF thành công, đúng dữ liệu theo kỳ                                                                                         | Kỳ không hợp lệ (`period` ngoài daily/monthly/yearly) → dùng giá trị mặc định hoặc 400 tuỳ validation                                                                          |
| UC-21 | Cài đặt hệ thống                   | Admin cập nhật bảng giá/giờ hoạt động/thương hiệu thành công                                                                           | `employee`/`branch_manager` gọi `PUT /settings/*` → 403 (chỉ `admin`)                                                                                                          |
| UC-22 | Tự đăng ký tài khoản               | SĐT chưa có tài khoản → tạo User+Customer, trả token luôn                                                                              | SĐT đã có tài khoản → từ chối, gợi ý đăng nhập; SĐT trùng khách vãng lai cũ → gắn vào hồ sơ có sẵn (`mergedHistory: true`), không tạo hồ sơ mới                                |
| UC-23 | Chuyển đổi chi nhánh               | Admin chọn chi nhánh khác → mọi API sau đó trả đúng dữ liệu chi nhánh đó                                                               | `employee`/`branch_manager` tự gửi `X-Branch-Id` khác chi nhánh mình → 403                                                                                                     |
| UC-24 | Bán lẻ dụng cụ (POS)               | Tạo đơn → thêm dòng (trừ kho ngay) → checkout → Invoice/Payment tạo đúng, gộp vào doanh thu Dashboard                                  | Thêm dòng khi đơn không đủ tồn kho → 400; thêm dòng vào đơn đã `paid` → 400 "Đơn hàng ở trạng thái 'paid', không thể thêm sản phẩm"                                            |
| UC-25 | Doanh thu chi tiết / đối chiếu kho | `revenue-breakdown` tách đúng 4 nguồn (sân/phụ kiện-trong-sân/bán lẻ/giảm giá); `inventory-reconciliation` tính đúng `soldDiscrepancy` | Thiếu `branchId` → 400; `branch_manager` gửi `compareBranches=true` → bị ép về `false`, không lộ dữ liệu chi nhánh khác                                                        |
| RBAC  | Phân quyền                         | Employee gọi API Employee-only → 200                                                                                                   | Customer/Employee gọi API Admin-only → 403                                                                                                                                     |

---

## 6. Chi tiết Test Case mẫu (mức cao — dùng làm khuôn mẫu)

### TC-BOOK-01: Tạo booking hợp lệ

- **Tiền điều kiện:** Sân 1, ngày 20/07/2026, khung 18:00–19:00 còn trống.
- **Bước thực hiện:** Gửi `POST /bookings` với dữ liệu hợp lệ.
- **Kết quả mong đợi:** HTTP 201, booking status = "pending", dữ liệu lưu đúng vào DB.

### TC-BOOK-02: Tạo booking trùng lịch

- **Tiền điều kiện:** Khung 18:00–19:00 sân 1 đã có booking "confirmed".
- **Bước thực hiện:** Gửi `POST /bookings` với cùng sân, khung giờ overlap (VD 18:30–19:30).
- **Kết quả mong đợi:** HTTP 409, message **"Selected court and time slot is already booked"** (message thật của hệ thống — bằng tiếng Anh, không phải "Khung giờ đã được đặt" như bản cũ của tài liệu này ghi nhầm), không tạo booking mới. Nếu là sửa booking (`PUT`) trùng lịch: message khác — "Updated time slot conflicts with an existing booking" (xem `docs/04-workflows/flows/WF-03-BookingManagement.md` mục A).

### TC-PAY-01: Checkout tính đúng tiền cắt khung giờ

- **Tiền điều kiện:** Phiên chơi từ 17:30 (thấp điểm) đến 18:30 (cao điểm từ 18:00), đơn giá thấp điểm 60.000đ/h, cao điểm 90.000đ/h.
- **Bước thực hiện:** Đóng sân lúc 18:30.
- **Kết quả mong đợi:** courtFee = 30 phút × (60.000/h) + 30 phút × (90.000/h) = 30.000 + 45.000 = 75.000đ.

### TC-PAY-02: Checkout gọi lại với cùng Idempotency-Key không tạo trùng

- **Tiền điều kiện:** Phiên chơi đã đóng, chưa thanh toán.
- **Bước thực hiện:** Gửi `POST /payments/checkout` với header `Idempotency-Key: test-key-1`, sau đó gửi lại **y hệt** request đó (cùng key) lần 2.
- **Kết quả mong đợi:** Lần 1 trả HTTP 201 tạo Invoice/Payment mới. Lần 2 trả lại **đúng `invoiceId`/`totalAmount` của lần 1**, không tạo thêm Invoice/Payment nào trong DB (đếm số dòng trước/sau phải bằng nhau). Đây là test quan trọng nhất của cơ chế idempotency — mạng chập chờn khiến client gọi lại không được phép double-charge khách.

### TC-RETAIL-01: Bán lẻ — thêm sản phẩm vào giỏ trừ kho ngay (không đợi thanh toán)

- **Tiền điều kiện:** `ProductVariant` "Áo Yonex size L" còn tồn 10 tại chi nhánh đang đăng nhập.
- **Bước thực hiện:** `POST /sales-orders` tạo đơn → `POST /sales-orders/:id/lines` thêm 3 áo → (chưa checkout) kiểm tra `GET /inventory/product-stock-levels`.
- **Kết quả mong đợi:** Tồn kho hiển thị còn **7** ngay sau bước thêm dòng, TRƯỚC khi checkout — khác hẳn UC-18 (trừ tiền sân chỉ tính lúc đóng sân, không phải lúc mở). Xóa dòng đó (`DELETE .../lines/:lineId`) → tồn kho trả lại đúng 10.

### TC-RETAIL-02: Bán lẻ — không đủ tồn kho khi thêm dòng

- **Tiền điều kiện:** `ProductVariant` còn tồn 2 tại chi nhánh.
- **Bước thực hiện:** `POST /sales-orders/:id/lines` với `quantity: 5`.
- **Kết quả mong đợi:** HTTP 400, message "Không đủ tồn kho tại chi nhánh này. Hiện có: 2", không tạo `SalesOrderLine`, tồn kho không đổi.

### TC-RETAIL-03: Bán lẻ ẩn danh không cộng dồn hạng hội viên

- **Tiền điều kiện:** Khách hàng có hồ sơ sẵn, `totalSpent` hiện tại = 4.900.000đ (hạng `normal`, sắp lên `gold` ở mốc 5.000.000đ).
- **Bước thực hiện:** Nhân viên bán 1 đơn 200.000đ qua POS **không chọn khách hàng** (đúng hành vi mặc định của giao diện hiện tại — xem `WF-09-Retail.md` mục C), thanh toán tiền mặt.
- **Kết quả mong đợi:** Checkout thành công, nhưng `customer.totalSpent` của khách đó **không đổi** (vẫn 4.900.000đ, chưa lên hạng `gold`) vì đơn không gắn `customerId` — đây là hành vi đúng theo thiết kế hiện tại, không phải bug, nhưng cần test để tránh ai đó "sửa nhầm" thành tự động gán khách gần nhất.

### TC-REPORT-01: Đối chiếu kho phát hiện chênh lệch

- **Tiền điều kiện:** 1 `ProductVariant` có `stock_movements` ghi nhận `sale` = 5 (đã trừ kho khi thêm vào 1 `SalesOrder`), nhưng đơn đó **chưa từng checkout** (không có `Invoice`/`InvoiceLine` nào tham chiếu tới dòng đó).
- **Bước thực hiện:** `GET /reports/inventory-reconciliation`.
- **Kết quả mong đợi:** Item đó xuất hiện với `qtySoldLedger = 5`, `qtySoldInvoice = 0` → `soldDiscrepancy = 5` (tín hiệu thất thoát tiềm ẩn). Sau khi checkout đơn đó thành công, gọi lại API → `soldDiscrepancy` phải về **0**.

### TC-RBAC-01: Nhân viên không thể truy cập Settings

- **Tiền điều kiện:** Đăng nhập với tài khoản role = employee.
- **Bước thực hiện:** Gửi `PUT /settings/pricing`.
- **Kết quả mong đợi:** HTTP 403, không cập nhật dữ liệu.

---

## 7. Kiểm thử hiệu năng (K6)

| Kịch bản                 | Endpoint                                                     | Mục tiêu                                                                                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Load test thông thường   | `GET /courts`, `GET /bookings`                               | 100 VU đồng thời, response < 2s, error rate < 1%                                                                                                                                                                |
| Stress test checkout     | `POST /payments/checkout`, `POST /sales-orders/:id/checkout` | Tăng dần VU đến khi phát hiện điểm giới hạn (breaking point) — cả 2 endpoint cùng dùng transaction + lock hàng trong `Payment`/`SalesOrder`, đáng chạy chung 1 kịch bản                                         |
| Spike test               | `POST /bookings`                                             | Mô phỏng giờ cao điểm đặt sân đồng loạt                                                                                                                                                                         |
| Concurrency test tồn kho | `POST /sales-orders/:id/lines`, `POST /sessions/:id/extras`  | Nhiều VU cùng trừ kho 1 `ProductVariant`/`Extra` có tồn thấp đồng thời — xác nhận `SELECT ... FOR UPDATE` trong `InventoryService.postMovement` chặn được oversell (tổng số bán không bao giờ vượt tồn ban đầu) |

Tiêu chí đạt: p95 response time < 2 giây, tỉ lệ lỗi (5xx) < 1% ở tải mục tiêu (100 người dùng đồng thời — theo NFR trong SRS).

---

## 8. Security Checklist (kiểm tra thủ công)

- [ ] Mật khẩu không bao giờ trả về trong response API.
- [ ] Access token hết hạn đúng thời gian cấu hình.
- [ ] Endpoint được bảo vệ trả 401 khi không có token, 403 khi sai Role.
- [ ] Input được validate, thử inject ký tự đặc biệt (`' OR 1=1--`) vào các trường tìm kiếm.
- [ ] Upload file: từ chối file không đúng định dạng ảnh, giới hạn dung lượng.
- [x] Rate limiting trên `/auth/login`, `/auth/register`, `/auth/refresh-token`, `/auth/forgot-password`, `/auth/reset-password` — **đã triển khai** (`authRoutes.js`, tính theo IP qua `express-rate-limit`, xem `docs/04-workflows/flows/WF-01-Login.md` mục "Chống dò/spam"). Bản trước của tài liệu này ghi "khuyến nghị bổ sung" — không còn đúng, cần test xác nhận ngưỡng thật (10 request/15 phút cho login, 5/60 phút cho register, 30/15 phút cho refresh) chứ không phải kiểm tra "có hay không" nữa.
- [ ] Webhook thanh toán (`POST /payments/webhook`) chỉ chấp nhận đúng `X-Webhook-Secret` khớp `PAYMENT_WEBHOOK_SECRET` — thử gửi thiếu header/sai giá trị → phải 401, không xử lý webhook giả mạo để tự đánh dấu hóa đơn đã thanh toán.
- [ ] Idempotency key không bị dùng chéo giữa 2 đối tượng khác nhau — thử gửi lại đúng key của 1 lần checkout sân cho một `sessionId` khác, hoặc key của checkout đơn bán lẻ cho 1 `orderId` khác → phải bị từ chối (409), không trả nhầm kết quả của giao dịch khác.

---

## 9. Công cụ & Quy trình

### 9.1 Test file hiện có (backend — `backend/tests/*.test.js`, chạy bằng `npm test` → `jest`)

- `priceCalculator.test.js`
- `paymentValidation.test.js`
- `courtService.test.js`
- `dateTime.test.js`
- `phone.test.js`
- `inventoryService.test.js` — thêm cùng đợt merge hệ thống quản lý kho hàng (nhà cung cấp, phiếu nhập kho, tồn kho)
- `publicCatalogService.test.js`, `onlineOrderService.test.js`, `onlineOrderValidation.test.js` — luồng khách tự đặt hàng online + thanh toán chuyển khoản VietQR
- `voucherService.test.js`, `voucherValidation.test.js` — mã giảm giá (xem `TestCases-ThanhToanOnline-Voucher.md`)

Tất cả các file trên là unit test thuần logic, không kết nối DB thật (không có `NODE_ENV=test` + MySQL trong CI), phù hợp việc CI hiện tại không có service DB.

> **Khoảng trống cần bổ sung (2026-08-16):** Module bán lẻ (`SalesOrderService`,
> `ProductService` — `docs/04-workflows/flows/WF-09-Retail.md`) và 2 báo cáo
> mới (`ReportService.getRevenueBreakdown`, `getInventoryReconciliation` —
> `docs/04-workflows/flows/WF-08-ReportsSettings.md` §D.1/D.2) **chưa có unit
> test riêng nào**, dù logic tương đương (trừ kho ngay khi thêm dòng, tính
> giá vốn bình quân, đối chiếu ledger) đã được test cho `Extra`/`ExtraStock`
> trong `inventoryService.test.js`. Đề xuất thêm `salesOrderService.test.js`
> (đơn 'open' mới thêm được dòng, checkout 2 lần cùng idempotency key không
> tạo trùng — xem TC-RETAIL-\* mục 6) và `reportService.test.js` (phân loại
> đúng 4 nguồn doanh thu qua `REVENUE_SOURCE_CASE`, `soldDiscrepancy` tính
> đúng khi có/không có dòng hóa đơn tương ứng — xem TC-REPORT-01).

### 9.2 Test file hiện có (frontend — `frontend/src/**/*.test.*`, chạy bằng `npm test` → `vitest`)

- `src/utils/roles.test.js` — hiện là file test duy nhất ở frontend.

### 9.3 Postman & K6 (chưa populated)

- `postman/`: hiện chỉ có `.gitkeep`, **chưa có** collection Postman thật. Đường dẫn `postman/Badminton Digital Management.postman_collection.json` ở trên là dự kiến đặt tên khi tạo, không phải file đã tồn tại.
- `k6/`: hiện chỉ có `.gitkeep`, **chưa có** script K6 thật (`k6/checkout-load-test.js` là ví dụ dự kiến, chưa tạo).

### 9.4 CI/CD hiện tại (`.github/workflows/ci.yml`)

Chạy trên `push`/`pull_request` vào `main` và `develop`, gồm 2 job độc lập, không phụ thuộc nhau:

- `backend-test`: `npm ci` + `npm test` (Jest) trong thư mục `backend/` — không có service MySQL, không chạy migration, không lint.
- `frontend-build`: `npm ci` + `npm run build` (Vite) trong thư mục `frontend/` — chỉ kiểm tra build production thành công, không chạy `vitest`.

CI hiện **không** chạy: lint (ESLint), Postman/Newman, K6, hay bất kỳ bước nào cần kết nối DB (xem `.github/workflows/ci.yml`).

---

## 10. Tiêu chí chấp nhận (Acceptance Criteria) tổng thể

- 100% API trong `APIDesign.md` có ít nhất 1 test case thành công + 1 test case lỗi.
- Không còn lỗi mức Critical/High mở (open) trước khi coi là "release-ready".
- Coverage unit test tầng Service ≥ 70% (khuyến nghị, không bắt buộc tuyệt đối cho dự án cá nhân).
- Test hiệu năng đạt tiêu chí ở mục 7 với tải 100 người dùng đồng thời.

---

## 11. Rủi ro & Giả định

- Vì là dự án cá nhân/portfolio, không có đội QA riêng — người phát triển tự đóng vai trò viết và chạy test.
- Dữ liệu test cần được seed lại (reset) trước mỗi lần chạy bộ test để đảm bảo tính lặp lại (idempotent).
