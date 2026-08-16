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

### 6. `feat/retail-catalog-inventory` — backend xong, **frontend chưa làm** (nhánh riêng, chưa commit)
Nguồn: định hướng hệ thống của chủ dự án — 3 trụ cột (thuê sân / bán lẻ dụng
cụ cầu lông / quản lý kho cho bán lẻ). Plan đầy đủ ở
`07-ke-hoach-ban-le-phu-kien.md`. Sửa lại schema catalog M2 (từng suýt bị xoá
nhầm coi là dead code — xem đính chính ở `01-ke-hoach-dead-code-cleanup.md`)
để dùng thật, và tổng quát hoá ledger kho M4 để dùng chung cho cả 2 trụ.

Quyết định đã chốt qua trao đổi: kho dùng chung ledger (không tách riêng),
biến thể sản phẩm đầy đủ size+màu, cần POS checkout thật ngay đợt đầu,
catalog dùng chung toàn chuỗi nhưng tồn kho tách theo từng chi nhánh, nhập
kho hỗ trợ sản phẩm bán lẻ ngay từ đầu.

- Migration `20260816100001-retail-catalog-inventory.js`: xoá data snapshot
  chết của M2 (2026-08-05), bỏ `branch_id` khỏi `products`/`product_categories`
  (catalog dùng chung toàn chuỗi), bỏ `product_variants.stock_quantity` (thiếu
  chiều chi nhánh — lỗi thiết kế M2 gốc), thêm `size`/`color`, bảng mới
  `product_stocks` (tồn kho theo chi nhánh, cùng mẫu `extra_stocks`), tổng
  quát hoá `stock_movements`/`goods_receipt_items` nhận cả `extra_id` lẫn
  `product_variant_id` (CHECK đúng 1 trong 2), `invoices.session_id` cho phép
  NULL + CHECK loại trừ lẫn nhau với `sales_order_id` (bán lẻ không gắn phiên
  sân). Đã test `db:migrate`/`db:migrate:undo` sạch trên DB dev thật.
- Model mới: `Product`, `ProductVariant`, `ProductCategory`, `ProductStock`,
  `SalesOrder`, `SalesOrderLine` + associations trong `models/index.js`.
  `Invoice.salesOrderId` (từng coi là cột mồ côi) nay dùng thật, trỏ đơn bán
  lẻ khi checkout.
- `InventoryService.postMovement` tổng quát hoá nhận `extraId` HOẶC
  `productVariantId` (đúng 1 trong 2) — giữ nguyên 100% hành vi cũ cho
  `extraId`, có test hồi quy trước/sau khi sửa. `GoodsReceiptService` tổng
  quát hoá tương tự.
- `SalesOrderService` mới: tạo đơn (channel `pos`) → thêm/xoá dòng (trừ/hoàn
  kho ngay, giống mẫu `AccessoryService.addSessionExtra`) → checkout (tạo
  `Invoice`+`Payment`+`invoice_lines`, tái dùng hạ tầng từ
  `feat/invoice-line-items`, không tạo cơ chế hoá đơn riêng).
- Route mới `/api/v1/product-categories`, `/api/v1/products`,
  `/api/v1/sales-orders`, `/api/v1/inventory/product-stock-levels`.
- **Bằng chứng test thật** (server thật, API thật, DB dev thật): tạo danh
  mục → sản phẩm 2 biến thể (size M/L) → nhập kho (goods receipt) → tồn kho
  đúng theo chi nhánh → tạo đơn bán lẻ → thêm 2 dòng → tồn kho trừ đúng →
  checkout (giảm giá 100.000đ) → `invoice_lines` đúng 3 dòng, `SUM(amount)`
  khớp `totalAmount` (650.000), `invoice.sessionId = NULL`,
  `invoice.salesOrderId` đúng đơn; test lại idempotency checkout (gọi lại
  cùng key → cùng invoice, không tạo trùng); test xoá dòng → hoàn kho đúng;
  test bán vượt tồn kho → bị chặn đúng lỗi 400. **Hồi quy trụ 1**: goods
  receipt cho `extraId` vẫn cộng kho đúng sau khi generalize; mở sân walk-in
  → checkout qua `PaymentService.checkout` vẫn tạo hoá đơn đúng (CHECK
  constraint mới không chặn nhầm luồng cũ). `npm test` 38/38 pass trong suốt
  quá trình. Đã dọn sạch toàn bộ dữ liệu test khỏi DB dev sau khi xong.
- **2 lỗi phát hiện lúc test, đã sửa ngay:** model `GoodsReceiptItem`/
  `StockMovement` quên cập nhật `extraId` sang nullable sau migration (gây lỗi
  `notNull Violation` khi nhập kho sản phẩm bán lẻ); model `SalesOrder` khai
  `version: true` nhưng migration quên thêm cột — đã vá migration + model,
  test lại xác nhận đúng.

**Frontend (2026-08-16, cùng ngày):** đã xong, test qua UI thật trên trình
duyệt (không chỉ đọc code).

- Trang mới `/retail` ("Bán Lẻ" trên sidebar/mobile nav), 3 tab: **Bán hàng**
  (POS — chọn sản phẩm theo danh mục, giỏ hàng, giảm giá, thanh toán, huỷ
  giỏ hoàn kho), **Kho bán lẻ** (grid tồn kho theo chi nhánh + form nhập
  kho), **Danh mục sản phẩm** (CRUD category/product/variant — chỉ
  admin/branch_manager thấy tab này, POS + kho mọi nhân viên đều dùng được).
- `apiServices.js` thêm `productCategoryService`, `productService`,
  `salesOrderService`, mở rộng `inventoryService.getProductStockLevels`.
- Thêm seeder `20260816200001-seed-retail-sample-products.js` — 4 danh mục,
  7 sản phẩm, 11 biến thể mẫu (vợt, áo 2 màu × 2 size, quần, quấn cán, túi
  vợt, băng cổ tay), có tồn kho ban đầu qua phiếu nhập kho thật — dùng để
  demo/test tay, theo đúng mẫu seeder inventory trước đó (tra id bằng khoá
  tự nhiên, guard chống chạy đè lên dữ liệu thật).
- **Test thật qua Browser** (đăng nhập admin thật, không giả lập): vào
  `/retail` → tab Bán hàng, bấm thêm "Quấn Cán Vợt Yonex" vào giỏ (network
  log xác nhận `POST /sales-orders` + `POST .../lines` đều `201`) → bấm
  Thanh toán (`POST .../checkout` → `201`, banner "Thanh toán thành công —
  Hoá đơn BD-1-00000025" hiện đúng) → sang tab Kho bán lẻ, gọi API tồn kho
  xác nhận số dư giảm đúng 60→59 → tab Danh mục sản phẩm hiển thị đúng 7 sản
  phẩm/4 danh mục, modal "Thêm Danh Mục" mở đúng. Không có lỗi console.
  `npm test` 38/38 pass sau cùng. Đã dọn sạch đơn/hoá đơn test tạo qua UI,
  khôi phục lại tồn kho.

**Lịch sử đơn bán lẻ (cùng ngày, theo yêu cầu bổ sung):** thêm tab "🛍️ Bán
Lẻ" vào trang `/history` sẵn có (cùng chỗ xem lịch sử phiên chơi/đặt sân) —
lọc theo ngày/trạng thái, bảng hiển thị hoá đơn/thời gian/khách hàng/nhân
viên bán/sản phẩm/tổng tiền/trạng thái thanh toán, cùng khuôn mẫu tab
"Phiên Chơi" đã có.

- `SalesOrderService.listOrders` mới (phân trang, lọc `status`/`from`/`to`,
  include đủ `lines`+`variant`+`product`, `customer`, `cashier`→`user`,
  `invoice`→`payment`) + route `GET /api/v1/sales-orders`.
- Test thật qua trình duyệt: tab hiện đúng "2 đơn hàng" thật đang có trong DB
  dev (1 đơn đã thanh toán hoá đơn `BD-1-00000026` hiển thị đúng tên sản
  phẩm/số lượng/tổng tiền/badge "Đã thanh toán", 1 đơn đang mở chưa
  checkout). Không lỗi console. `npm test` 38/38 pass.

Nhánh `feat/retail-catalog-inventory` **chưa commit, chưa merge** — toàn bộ
backend + frontend + seeder đã sẵn sàng, chờ chủ dự án xem lại trước khi
duyệt commit/merge.

---

## Chưa làm — xem plan riêng từng phần

| Việc | File plan | Ưu tiên gốc |
|---|---|---|
| Dọn 3 hàm API mồ côi ở frontend (đã đính chính — không còn xoá bảng catalog, xem đầu file) | `01-ke-hoach-dead-code-cleanup.md` | Nhóm A — kế tiếp |
| `dateTime.js` hiện dùng giờ server, không theo `branch.timezone` | `02-ke-hoach-branch-timezone.md` | Nhóm A |
| Bundle frontend ~800KB, chưa code-split theo route | `03-ke-hoach-frontend-code-splitting.md` | Nhóm A |
| Báo cáo doanh thu chi tiết + tổng kết nhập-tồn kho dùng `invoice_lines` | `04-ke-hoach-invoice-reporting.md` | Phụ thuộc mục 5 ở trên, làm sau khi có đủ dữ liệu itemized |
| 4 việc cần quyết định chính sách kinh doanh trước (discount guardrail, onboarding branch_manager, luồng hoàn tiền/void, cấu hình tài khoản ngân hàng) | `05-backlog-nhom-b.md` | Nhóm B — cuối cùng, chưa lên plan chi tiết |
| Frontend cho bán lẻ (trang danh mục sản phẩm, POS, mở rộng trang tồn kho) — backend đã xong, xem mục 6 ở trên | `07-ke-hoach-ban-le-phu-kien.md` | Việc mới, chủ dự án ưu tiên |

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
