# Tiến độ sửa lỗi — đã làm gì, còn gì chưa làm

**Cập nhật:** 2026-09-13 (mục 13 đã merge; mục 15 — nhóm sửa 3 — xong trên nhánh, chờ duyệt merge). Tài liệu này là nguồn sự thật duy nhất về tiến độ —
nếu khác với những gì `01-audit/*.md` mô tả, tin tài liệu này (audit là ảnh
chụp lúc phát hiện, không được cập nhật lại).

Quy trình áp dụng cho mọi nhánh dưới đây (đã thống nhất và giữ nguyên suốt):
tạo nhánh riêng từ `main` → viết plan → chờ duyệt ("code đi") → code + test
thật (chạy server thật, gọi API thật, truy vấn DB thật — không chỉ đọc code)
→ báo cáo kết quả → chờ duyệt merge ("merge vào main đi") → merge cục bộ vào
`main`. **Không có nhánh nào tự merge khi chưa được duyệt.**

`main` đã được push lên `origin` (đồng bộ tới commit `2ea7ae2` — mục 10 + 11
bên dưới) — cập nhật so với ghi chú "chưa push" ở các mục trước đó trong file
này, vốn đúng tại thời điểm viết nhưng chủ dự án đã quyết định push sau đó.

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

### 5. `feat/invoice-line-items` (merge tại `2aed2bf`)
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

**Việc còn lại:** báo cáo doanh thu/tồn kho tiêu thụ `invoice_lines` — đã
code + test xong, xem mục 7 bên dưới (`feat/invoice-reporting`).

### 6. `feat/retail-catalog-inventory` (merge tại `124f108`, fast-forward)
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

**Frontend:** đã xong, test qua UI thật trên trình duyệt (không chỉ đọc code).

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

**Lịch sử đơn bán lẻ (bổ sung theo yêu cầu):** thêm tab "🛍️ Bán Lẻ" vào
trang `/history` sẵn có (cùng chỗ xem lịch sử phiên chơi/đặt sân) — lọc theo
ngày/trạng thái, bảng hiển thị hoá đơn/thời gian/khách hàng/nhân viên
bán/sản phẩm/tổng tiền/trạng thái thanh toán, cùng khuôn mẫu tab "Phiên
Chơi" đã có.

- `SalesOrderService.listOrders` mới (phân trang, lọc `status`/`from`/`to`,
  include đủ `lines`+`variant`+`product`, `customer`, `cashier`→`user`,
  `invoice`→`payment`) + route `GET /api/v1/sales-orders`.
- Test thật qua trình duyệt: tab hiện đúng "2 đơn hàng" thật đang có trong DB
  dev (1 đơn đã thanh toán hoá đơn `BD-1-00000026` hiển thị đúng tên sản
  phẩm/số lượng/tổng tiền/badge "Đã thanh toán", 1 đơn đang mở chưa
  checkout). Không lỗi console. `npm test` 38/38 pass.

**Đính chính thứ tự (2026-08-16):** bản trước của file này để
`feat/invoice-line-items` (mục 5) ở mục "chưa merge — chờ duyệt", **sai** —
tra lại `git log` xác nhận nhánh đó đã merge vào `main` tại `2aed2bf`
**trước khi có phiên làm việc dựng nhánh `feat/retail-catalog-inventory`**
(mục này). Đây là lý do `SalesOrderService.checkout` ở mục này có sẵn
`InvoiceLine` để tái dùng ngay — không phải trùng hợp.

Commit thành 2 phần: `08af2e9` (đính chính docs) + `124f108` (toàn bộ backend
+ frontend + seeder). Merge vào `main` bằng fast-forward (không có commit
merge riêng, không conflict) — `124f108` chính là commit đầu `main` sau khi
merge. `main` vẫn **chưa push lên `origin`**, giống mọi nhánh trước.

### 7. `feat/invoice-reporting` (merge tại `8423f2b`, fast-forward)
Nguồn: đích cuối của `feat/invoice-line-items` (mục 5) — báo cáo doanh thu
chi tiết + đối chiếu nhập-tồn kho. Plan đầy đủ (4 câu hỏi thiết kế đã trả
lời) ở `04-ke-hoach-invoice-reporting.md`.

- `GET /reports/revenue-breakdown` — doanh thu theo kỳ, tách 4 nguồn (tiền
  sân / phụ kiện trong sân / bán lẻ quầy / giảm giá) qua `line_kind` +
  `reference_type` của `invoice_lines`; `compareBranches=true` (chỉ admin)
  group theo từng chi nhánh; kèm danh sách chi tiết từng dòng giảm giá
  (hoá đơn + tên nhân viên, **không có** trường lý do — dữ liệu chưa được
  lưu, đây là giới hạn có chủ đích, không phải thiếu sót).
- `GET /reports/inventory-reconciliation` — dùng `stock_movements` làm
  nguồn chính (đầy đủ từ 2026-08-15, không bị giới hạn "chưa backfill" như
  `invoice_lines`): nhập/bán(sổ kho)/trả lại/điều chỉnh theo item × chi
  nhánh, đối chiếu với bán theo hoá đơn (chỉ từ 2026-08-16) — chênh lệch là
  tín hiệu "đã trừ kho nhưng chưa từng thanh toán" (giỏ hàng/phiên bỏ dở),
  không phải lỗi sổ kho nội bộ.
- Frontend: 2 tab mới trong `Reports` ("Doanh thu chi tiết", "Đối chiếu
  kho"), tách `ReportsPage.jsx` cũ thành `OverviewTab.jsx` (nội dung gốc,
  không đổi hành vi) + 2 tab mới, dùng chung khuôn mẫu tab đã có ở
  Accessories/Retail/History.
- **Bằng chứng test thật** (server thật, API thật, DB dev thật, trình
  duyệt thật): gọi `revenue-breakdown` xác nhận đúng 4 nhóm nguồn + chi
  tiết giảm giá kèm tên nhân viên; `compareBranches=true` trả đúng
  `branchId` trên mọi dòng. Test đối chiếu kho phát hiện đúng 2 lệch thật
  đang có trong DB dev (dữ liệu lịch sử trước mốc backfill) — **phát hiện
  và vá ngay 1 bug lúc test**: công thức lệch ban đầu không trừ số đã trả
  lại (`qtyReturned`), khiến 1 sản phẩm thêm-giỏ-rồi-xoá bị báo nhầm lệch
  10 dù tồn kho ròng không đổi — sửa xong, test lại đúng 0. Test cố ý tạo
  lệch thật (mở giỏ hàng, thêm 4 sản phẩm, **không checkout**) → báo cáo
  phát hiện đúng chênh lệch = 4, dọn sạch sau khi xác nhận. Test qua trình
  duyệt: cả 2 tab mới hiển thị đúng dữ liệu khớp API, tab Tổng quan cũ
  không hồi quy, không lỗi console. `npm test` 38/38 pass xuyên suốt.

**Bổ sung theo yêu cầu chủ dự án — dữ liệu mẫu + dashboard dùng dữ liệu
thật:**

- Seeder mới `20260816300001-seed-sample-sales-history.js` — 14 giao dịch
  bán lẻ trải dài 7 ngày qua, cả 3 chi nhánh (bao gồm seed tồn kho ban đầu
  cho chi nhánh 2/3 vốn chưa có), vài đơn có giảm giá — ghi trực tiếp bằng
  SQL tính tay trong 1 transaction (dùng `LAST_INSERT_ID()` để lấy id vừa
  tạo, không tra lại bằng `created_at` vì Date object qua replacements bị
  lệch múi giờ so với giá trị mysql2 tự serialize lúc INSERT — phát hiện
  lỗi này ngay lần chạy đầu, đã dọn dữ liệu dở dang và sửa lại bằng
  transaction trước khi chạy lại thành công). Kiểm tra lại: `revenue-breakdown`
  giờ có 23 dòng trải 3 chi nhánh, 5 dòng giảm giá; `inventory-reconciliation`
  có 15 sản phẩm phát sinh.
- **`DashboardPage.jsx` viết lại hoàn toàn — bỏ 100% dữ liệu hardcode**,
  phát hiện lúc rà lại code cũ (không phải chỉ theo yêu cầu suông):
  - "Trạng Thái Sân Hôm Nay" trước đó là mảng tên sân **giả** cứng trong
    code (`'Sân 01 - BWF Arena'`...), không khớp tên sân thật, luôn hiện
    "Sẵn sàng" — thay bằng `courtService.getAllCourts()` (đã có sẵn field
    `state` tính từ phiên đang mở, dùng luôn, không cần API mới).
  - "Cảnh Báo Kho Thiết Bị" trước đó là 3 dòng text **giả** cứng
    ("Pocari/RedBull còn 12 chai"...) — sản phẩm còn không tồn tại trong dữ
    liệu thật — thay bằng dữ liệu tồn kho thấp thật (gộp cả phụ kiện sân +
    bán lẻ).
  - **Bug thật phát hiện lúc sửa:** `stats.map()` không bao giờ chạy vì
    code cũ kiểm tra `dashboardRes.success` (luôn `undefined` — cờ `success`
    nằm ở `dashboardRes.data.success`, không phải cấp ngoài của response
    axios) — nghĩa là khối thẻ số liệu đầu trang **chưa từng hiển thị**
    trong thực tế dùng, kể cả trước khi tôi đụng vào. Biểu đồ doanh thu
    cũng luôn rỗng — code đọc `dataKey="name"` nhưng API trả về field
    `date`, không có field nào tên `name`. Cả 2 đã sửa.
  - **Bug thật thứ 3, phát hiện lúc test bằng browser:** `InventoryService.getLowStockCount`
    đếm nhầm cả phụ kiện đã bị xoá mềm (soft-delete) là "sắp hết hàng" —
    include không giới hạn `paranoid` khiến các dòng `extra_stocks` trỏ tới
    phụ kiện đã xoá trả về `extra: null`, và `?? 5` biến `null` thành
    "dưới ngưỡng 5" một cách vô tình. Dashboard hiện "10 cảnh báo tồn kho
    thấp" trong khi thực tế là 0 — toàn bộ 10 dòng đều là rác test cũ
    ("Retest Khăn Lau" x8, đã xoá từ 2026-08-14). Đã sửa `getLowStockCount`
    lẫn `getLowStockCountForProducts` (lỗi tương tự), và gộp cả 2 vào
    `getDashboardSummary.lowStockCount` (trước đó chỉ tính phụ kiện sân,
    bỏ sót tồn kho bán lẻ thấp).
  - Test qua trình duyệt: đăng nhập admin thật, xác nhận cả 4 thẻ số liệu +
    biểu đồ + trạng thái sân (tên thật) + cảnh báo kho (đúng "không có sản
    phẩm nào sắp hết" sau khi sửa bug) đều hiển thị đúng, không lỗi console.
    `npm test` 38/38 pass.

Commit thành 2 phần: `e39650e` (2 báo cáo mới + frontend) + `8423f2b` (dữ
liệu mẫu + Dashboard dùng dữ liệu thật). Merge vào `main` bằng fast-forward
(không conflict) — `8423f2b` chính là commit đầu `main` sau khi merge.
`main` vẫn **chưa push lên `origin`**, giống mọi nhánh trước.

### 8. `fix/branch-timezone` (merge tại `3ce672d`, fast-forward)
Nguồn: `02-ke-hoach-branch-timezone.md` — `dateTime.js` luôn tính "hôm
nay"/"giờ hiện tại" theo giờ máy chạy server, bỏ qua cột `branch.timezone`
đã có sẵn trong schema nhưng chưa nơi nào đọc tới.

- `backend/src/utils/dateTime.js` — `localDateString`/`localTimeString`/
  `startOfLocalDay`/`endOfLocalDay` nay nhận thêm tham số `timezone` (mặc
  định `Asia/Ho_Chi_Minh` nếu không truyền, không phá chỗ gọi cũ), dùng
  `Intl.DateTimeFormat` để lấy đúng năm/tháng/ngày/giờ theo múi giờ chỉ định
  thay vì `date.getFullYear()`/`getHours()` (luôn đọc theo múi giờ hệ điều
  hành). `startOfLocalDay`/`endOfLocalDay` dùng thêm kỹ thuật "đoán rồi hiệu
  chỉnh" (`zonedTimeToUtc`) để tính đúng mốc UTC thật ứng với nửa đêm địa
  phương, kể cả múi giờ có DST.
- `CourtService.updateCourtStatus` — include thêm `branch` khi lấy `court`,
  truyền `court.branch.timezone` vào `localDateString`/`localTimeString` khi
  đếm lịch đặt sắp tới.
- `ReportService.getDashboardSummary` — query thêm `Branch.findByPk(branchId)`,
  truyền `branch.timezone` vào `startOfLocalDay`/`endOfLocalDay` khi lọc
  doanh thu "hôm nay".
- **Bằng chứng test thật:** `npm test` 38/38 pass (bao gồm `dateTime.test.js`
  cũ, không gãy do tham số mới có default). Test tay bằng script Node nối
  thẳng DB dev thật: đổi tạm `timezone` chi nhánh 1 sang `Pacific/Kiritimati`
  (UTC+14, chọn múi giờ lệch xa để thấy khác biệt ngay tại thời điểm test mà
  không cần đợi tới khung giờ 00:00-07:00 giờ VN), xác nhận `startOfLocalDay`/
  `localDateString` trả đúng ngày/mốc UTC theo múi giờ mới, rồi trả lại
  `Asia/Ho_Chi_Minh` như cũ. Gọi API thật qua server đang chạy: `GET
  /reports/dashboard` với chi nhánh mặc định (giờ VN) vẫn trả `todayRevenue`
  đúng như trước (hồi quy không đổi hành vi phổ biến nhất); `PUT
  /courts/4/status` (chuyển `maintenance`) chạy qua đúng nhánh code mới có
  `branch.timezone`, không lỗi, chặn đúng vì còn 3 lịch đặt sắp tới (logic
  nghiệp vụ giữ nguyên).

Merge vào `main` bằng fast-forward (không conflict) — `3ce672d` chính là
commit đầu `main` sau khi merge.

### 9. `perf/frontend-code-splitting` (merge tại `c617844`)
Nguồn: `03-ke-hoach-frontend-code-splitting.md` — `AppRoutes.jsx` import tĩnh
toàn bộ 14 trang vào 1 bundle JS ban đầu (~853KB theo audit
`../01-audit/StabilityAudit.md`), khách chỉ vào trang chủ đặt sân vẫn phải
tải cả code `SettingsPage`/`ReportsPage` mà không có quyền vào.

- `frontend/src/routes/AppRoutes.jsx` — 12/14 trang chuyển sang
  `React.lazy(() => import(...))`: `RegisterPage`, `ForgotPasswordPage`,
  `ResetPasswordPage`, `DashboardPage`, `CourtsPage`, `BookingsPage`,
  `AccessoriesPage`, `RetailPage`, `CustomersPage`, `EmployeesPage`,
  `ReportsPage`, `SettingsPage`, `HistoryPage`, `MyBookingsPage`. Giữ static
  import `HomePage` + `LoginPage` (2 điểm vào phổ biến nhất). Bọc `<Routes>`
  trong `<Suspense fallback={<RouteFallback />}>` — fallback tái dùng đúng
  khuôn mẫu "⏳ Đang tải..." đã có sẵn khắp các trang, không thêm thư viện
  mới. `ErrorBoundary` có sẵn từ `chore/frontend-resilience` đã bọc ngoài
  `<AppRoutes />`, bắt được cả lỗi tải chunk thất bại, không cần thêm boundary
  riêng.
- Không đụng `vite.config.js` — Vite tự tách chunk theo `import()` động, không
  cần `manualChunks`.
- **Bằng chứng test thật:** `npm run build` — bundle chính giảm từ **853.07 kB
  → 272.95 kB** (gzip 226.65 kB → 86.19 kB), hết cảnh báo ">500kB sau khi
  minify"; `dist/assets/` có 13 chunk riêng theo từng trang (3.87–32.75 kB) +
  1 chunk dùng chung `chartColors`/recharts (372.79 kB, chỉ tải khi vào
  Dashboard/Reports). `npm test` (Vitest) 8/8 pass. Test qua trình duyệt thật
  trên **production build** (`npm run preview`, không phải dev server — dev
  server không phản ánh đúng hành vi chunk): đăng nhập admin thật, dùng
  `performance.getEntriesByType('resource')` xác nhận trang chủ/login chỉ tải
  đúng 1 file `index-*.js`; vào lần lượt Dashboard → Cài Đặt → Báo Cáo → Bán
  Lẻ, mỗi lần chuyển trang chỉ thêm đúng chunk của trang đó (`DashboardPage`+
  `chartColors`, rồi `SettingsPage`, rồi `ReportsPage`+`UIComponents`, rồi
  `RetailPage`) — không chunk nào của các trang chưa ghé thăm
  (Courts/Bookings/Accessories/Customers/Employees/History) bị tải thừa;
  không lỗi console xuyên suốt.

Nhánh này và `fix/branch-timezone` (mục 8) đều tách từ cùng 1 điểm trên
`main` (2 vấn đề độc lập, không gộp chung nhánh theo yêu cầu chủ dự án) nên
merge nhánh này **không fast-forward được** — có 1 commit merge thật
(`c617844`), conflict duy nhất ở chính file `00-tien-do.md` này (cả 2 nhánh
cùng thêm mục mới), gộp tay giữ lại đầy đủ nội dung mục 8 lẫn mục 9. Sau khi
merge: `npm test` backend 38/38 pass, `npm test` frontend 8/8 pass (chạy lại
trên trạng thái đã gộp cả 2 nhánh, không chỉ test riêng từng nhánh).

### 10. `feat/void-invoice` (merge tại `9acb824`)
Nguồn: mục 5.2 `../01-audit/ProjectGapsAndDirection.md` — `Payment.status`
có sẵn `refunded`, `Invoice.status` có sẵn `void` trong enum từ lúc thiết kế
nhưng **0 dòng code dùng tới** — nhân viên checkout nhầm không có cách nào
sửa ngoài sửa DB tay. Phạm vi đã chốt với chủ dự án (backlog Nhóm B mục 3,
xem `05-backlog-nhom-b.md`): chỉ huỷ **toàn bộ** hoá đơn (không hoàn từng
dòng), chỉ `admin`/`branch_manager`, phải trừ lại `Customer.totalSpent`/
`loyaltyTier`.

- `PaymentService.voidInvoice()` mới: khoá `invoice`+`payment`, guard trạng
  thái (chỉ void hoá đơn `paid`; void 2 lần → 409; void hoá đơn chưa thanh
  toán → 400); trả kho tự động cho hoá đơn bán lẻ qua
  `InventoryService.postMovement(type: 'sale_return')` — hoá đơn phiên sân
  **không** trả kho vì phụ kiện đã tiêu thụ lúc chơi, không phải hàng bán lẻ
  nhập lại kệ được; trừ lại `totalSpent`/tính lại `loyaltyTier` cho **cả 2**
  luồng checkout (phiên sân lẫn đơn bán lẻ — lúc code phát hiện
  `SalesOrderService.checkout` cũng cộng `totalSpent`, không chỉ
  `PaymentService.checkout` như audit gốc chỉ nhắc tới); ghi
  `AuditService` action `invoice.voided` kèm lý do bắt buộc.
- Gộp công thức tính hạng hội viên (lặp lại 3 nơi: checkout, webhook, void)
  vào `utils/loyalty.js` dùng chung. Tiện thể áp khuôn rollback-an-toàn
  (`transaction.finished`, mẫu từ `26ad904`) cho `PaymentService.checkout`,
  vốn chưa có.
- Route `POST /invoices/:id/void`, chỉ `admin`/`branch_manager`.
- Frontend: nút "Huỷ hoá đơn" + modal bắt buộc nhập lý do ở `HistoryPage`
  (tab Phiên Chơi + Bán Lẻ), chỉ hiện với `admin`/`branch_manager`.
- **Bằng chứng test thật** (server thật, API thật, DB dev thật): void hoá
  đơn bán lẻ 105.000đ → `totalSpent` khách giảm đúng 105.000→0, tồn kho trả
  đúng 29→32; void hoá đơn phiên sân không đụng tồn kho (đúng thiết kế);
  double-void → 409; void hoá đơn `issued` → 400; role `employee` gọi API
  → 403. Test qua trình duyệt thật: đăng nhập admin, huỷ hoá đơn ở
  `/history`, badge đổi "Đã huỷ" ngay, không lỗi console. Đã dọn sạch dữ
  liệu test khỏi DB dev sau khi xong. `npm test`: backend 121/121, frontend
  46/46.

### 11. `feat/activity-log-screen` (merge tại `2ea7ae2`)
Nguồn: mục 1.2 `../01-audit/ProjectGapsAndDirection.md` — `AuditService.record`
ghi vào `activity_logs` ở **26 điểm/8 service** (hầu như mọi thao tác
tạo/sửa/hủy quan trọng) nhưng chỉ có đúng 1 API đọc lại
(`GET /employees/:id/activity-logs`, khoá cứng theo 1 `employeeId`) và
**không trang frontend nào** gọi tới — dữ liệu ghi rất đầy đủ nhưng không ai
xem được qua giao diện, chỉ truy vấn thẳng DB.

- `AuditService.list()` mới: endpoint riêng cho màn hình xem toàn chi
  nhánh (không đụng endpoint cũ, giữ nguyên không breaking) — phân trang
  thật, lọc `action`/`targetType`/khoảng ngày theo giờ chi nhánh (khuôn
  `startOfLocalDay`/`endOfLocalDay` đã chuẩn hoá ở `26ad904`), include đủ
  `employee`/`user`/`branch` để hiển thị tên thay vì chỉ id.
- Route `GET /activity-logs`, chỉ `admin`/`branch_manager`.
- Frontend: trang mới `/activity-log`, theo đúng khuôn `HistoryPage.jsx`
  (bảng + bộ lọc + phân trang), nút "Xem chi tiết" mở modal hiện
  `oldValues`/`newValues` dạng JSON — lần đầu dữ liệu này xem được qua giao
  diện. Thêm mục nav, chỉ `admin`/`branch_manager`.
- **Bằng chứng test thật:** API trả đúng 578 dòng log thật đang có trong DB
  dev kèm tên người thao tác/chi nhánh; lọc `action`/`targetType` đúng kết
  quả; role `employee` → 403 (API lẫn UI — không thấy mục nav, gõ thẳng URL
  bị `ProtectedRoute` đá về `/courts`). Test qua trình duyệt thật: xem đúng
  log `invoice.voided` vừa tạo ở nhánh mục 10, modal chi tiết hiện đúng
  JSON, không lỗi console. `npm test`: backend 121/121, frontend 46/46.

Mục 10 và 11 đều tách từ cùng điểm trên `main` (2 việc độc lập, mỗi việc 1
nhánh riêng) — merge lần lượt bằng `--no-ff` (có commit merge thật cho mỗi
nhánh, không conflict — 2 nhánh chỉ chung đúng 1 file `apiServices.js`,
mỗi nhánh thêm 1 khối hàm riêng biệt nên git tự gộp được). Sau khi merge cả
2: `npm test` backend 121/121, frontend 46/46 — chạy trên trạng thái đã gộp,
không chỉ test riêng từng nhánh. `main` đã được push lên `origin` sau đó.

### 12. `feat/realtime-event-bus` (merge tại `a7c21ad`)
Nguồn: `../01-audit/RealtimeCourtSync.md` — mở/đóng/chuyển sân ở thiết bị A
không tự cập nhật cho thiết bị B đang xem cùng trang Sân, phải tự F5. Theo
đúng phương án đã chọn trong audit (SSE, không phải polling/WebSocket) và
build thành **event bus dùng chung** ngay từ đầu (không riêng trang Sân) để
mở rộng sau này chỉ cần thêm `emit()` ở service khác, không phải làm lại
nền tảng.

- `utils/realtimeBus.js`: bọc `EventEmitter` built-in của Node, singleton
  dùng chung giữa nơi phát (services, ngay sau `transaction.commit()`) và
  nơi lắng nghe (route SSE). **Chỉ đúng khi có 1 tiến trình backend** — ghi
  rõ giới hạn này cho lúc scale ngang sau này (cần đổi sang Redis pub/sub).
- `middleware/sseAuthMiddleware.js`: biến thể `authMiddleware` nhận token
  qua query string (`EventSource` của trình duyệt không set được header tuỳ
  ý), không sửa `authMiddleware.js` gốc.
- `routes/realtimeRoutes.js` + `controllers/realtimeController.js`:
  `GET /realtime/stream` — ánh xạ `branchId` từ query sang header
  `X-Branch-Id` để dùng lại nguyên `branchContextMiddleware`, đóng chủ động
  sau ~20 phút (khớp vòng đời access token 15 phút), lọc sự kiện đúng
  `branchId` của kết nối.
- `CourtService.js`: emit `court:updated` ngay sau `transaction.commit()`
  ở `openCourt`/`transferCourt`/`updateCourtStatus`.
- **Phát hiện lúc test, không có trong plan gốc:** nút "Đóng Sân & Tính
  Tiền" trên UI thực ra gọi thẳng `PaymentService.checkout` (tự động đóng
  session như tác dụng phụ khi `status === 'playing'`), **không** gọi
  `CourtService.closeCourt` — route đó tồn tại (`courtService.closeCourt`
  ở `apiServices.js`) nhưng **không frontend nào dùng tới**. Test 2 tab đầu
  tiên cho thấy đóng sân không đồng bộ sang tab kia; nguyên nhân là thiếu
  đúng điểm emit — đã vá bằng cách thêm `realtimeBus.emit(...)` vào
  `PaymentService.checkout` (không phải `closeCourt`), verify lại xác nhận
  đúng. Đây là ví dụ cụ thể cho nguyên tắc (c) trong `RealtimeCourtSync.md`
  (chỉ emit sau khi biết chắc trạng thái đã đổi thật) — điểm đổi trạng thái
  sân thật sự nằm ở service nào không phải lúc nào cũng trùng với route có
  tên nghe hợp lý nhất.
- Frontend: `services/realtimeClient.js` (client SSE dùng chung, tự đóng +
  mở lại bằng token mới khi lỗi/mất kết nối) + wiring vào `CourtsPage.jsx`
  — nhận sự kiện luôn `fetchCourts()` lại toàn bộ (không tự ráp state từ
  payload, tránh sự kiện đến sai thứ tự làm UI kẹt sai trạng thái — nguyên
  tắc (a)), refetch thêm khi tab quay lại foreground (`visibilitychange`,
  nguyên tắc (b)).
- **Bằng chứng test thật** (server thật, DB dev thật, 2 tab trình duyệt
  thật hoàn toàn độc lập — 1 tab không hề được front/tương tác trong lúc
  tab kia thao tác, loại trừ khả năng cập nhật do `visibilitychange` thay
  vì do SSE thật): mở sân ở tab A → tab B tự hiện đúng tên khách trong
  ~2 giây, không cần F5; đóng sân & thanh toán ở tab B → tab A tự về
  "Trống". Cách ly theo chi nhánh xác nhận qua SSE thật bằng `curl`: kết
  nối tới chi nhánh 2, mở sân ở chi nhánh 1 (không liên quan) → không nhận
  được gì; mở sân ở chi nhánh 2 → nhận đúng
  `event: court:updated / data: {"branchId":2,"courtId":5}`. `npm test`:
  backend 121/121, frontend 46/46. Đã dọn sạch toàn bộ sân/khách hàng test
  khỏi DB dev sau khi xong.

**Chưa làm ở nhánh này** (để lại cho lần mở rộng sau, không phải thiếu sót
— phạm vi đã chốt chỉ làm trang Sân trước): `BookingService`/
`AccessoryService`/`SalesOrderService` chưa emit sự kiện gì — cùng khuôn
transaction nên thêm sau chỉ tốn 1 dòng mỗi điểm, không cần sửa nền tảng.

Merge vào `main` bằng `--no-ff` (`a7c21ad`) — không conflict (nhánh này không
đụng file nào mà mục 10/11 đã sửa). `npm test` sau merge: backend 121/121,
frontend 46/46.

### 13. `fix/account-takeover-secret-leaks` (merge vào `main` ngày 13/09/2026)
Nguồn: nhóm sửa 1/6 của đợt kiểm tra trước deploy 12/09/2026 (`SEC-01`, `SEC-02`, `AUTH-01`,
`CFG-01`, `CFG-02`). Plan và kết quả đầy đủ: `13-ke-hoach-chan-chiem-tai-khoan.md`.

- **Không lộ bí mật qua lỗi:**
  - `errorHandler` không trả `err.errors` thô nữa (trước đây lộ `passwordHash` + `refreshToken` qua
    `instance`). Lỗi trùng trả 409, dữ liệu sai trả 400, kèm `[{ field, message }]`.
  - Model `User` mặc định không nạp hai trường bí mật; chỉ `AuthService` dùng `User.scope('withSecrets')`.
- **Bảng quyền sửa/xoá nhân viên** (`EmployeeService.assertCanManage`):
  - Quản lý chi nhánh chỉ đụng được nhân viên thường.
  - Không ai xoá được admin hay chính mình.
  - Bỏ sửa email qua `PUT /employees/:id`.
  - Trang Nhân viên ẩn nút tương ứng.
- **Tài khoản mẫu:** trang đăng nhập chỉ hiện ở dev, hoặc ở bản build với `VITE_SHOW_DEMO_ACCOUNTS=true`
  (không bao giờ kèm admin).
- **Cài mới an toàn:**
  - Migration `20260912100001-ensure-core-roles` tạo sẵn role lõi.
  - Seeder demo tự dừng khi `NODE_ENV=production`, trừ khi đặt `ALLOW_DEMO_SEED=true`.
  - `npm run create-admin` tạo admin đầu tiên.
- **JWT:** server từ chối secret mẫu hoặc hai secret trùng nhau. Refresh token lưu dạng sha256, nên mọi
  phiên cũ phải đăng nhập lại một lần.
- **Bằng chứng test thật:**
  - Trên code cũ đã tái hiện đủ chuỗi chiếm quyền: lỗi 500 lộ token admin → refresh ra token admin →
    `/reports/dashboard` trả 200.
  - Sau khi sửa, 17/17 kịch bản đạt: server + DB dev, trình duyệt thật, và 2 DB tạm (migrate 39/39,
    `create-admin`, chặn seed demo, khách đăng ký khi chưa seed, từ chối khởi động với secret yếu).
  - Jest 164/164, Vitest 49/49.
  - Đã dọn sạch dữ liệu test; DB tạm đã DROP.
- **Kiểm tra lại trước khi merge (13/09):**
  - Bản checkout sạch của commit, không có `.env` (giống CI): Jest 164/164, Vitest 49/49, build thành
    công, bundle không chứa mật khẩu demo.
  - Smoke trên server dev bằng tài khoản seed, 5/5 đạt, không ghi dòng dữ liệu nào:
    - đổi email nhân viên → 400;
    - lỗi trùng SĐT thật từ MySQL → 409 sạch;
    - tự sửa/xoá tài khoản → 403;
    - đọc danh sách và refresh không lộ bí mật, token lưu dạng hash.

Merge vào `main` bằng `--no-ff`, không conflict (`main` không đổi kể từ khi tách nhánh).

### 15. `fix/customer-data-exposure` (xong trên nhánh ngày 13/09/2026 — chưa merge, chờ duyệt)
Nguồn: nhóm sửa 3/6 của đợt kiểm tra trước deploy 12/09/2026 (`SEC-03`, `SEC-04`, `SEC-05`, `SEC-10`, kèm
`SEC-11` và phần dành cho khách của `SEC-14`). Plan và kết quả đầy đủ: `15-ke-hoach-chan-lo-du-lieu-khach.md`.
Nhánh tách từ `main` @ `8b45c89`, nên chưa gồm nhóm 2 (`fix/payment-money-flows`, cũng chưa merge).

- **Tài khoản khách không đọc được dữ liệu vận hành:**
  - `GET /courts`, `/courts/:id`, `/accessories`, `/accessories/:id`, `/products`, `/products/:id`,
    `/product-categories` chỉ cho nhân viên.
  - `branchContextMiddleware`: khách gửi `X-Branch-Id` → 403; `branch_manager`/`employee` thiếu dòng Employee → 403.
  - Khách xem chi tiết lịch không còn nhận `creator`.
- **Sửa lịch đặt:** chỉ nhân viên; body chỉ nhận sân/ngày/giờ, trường khác → 400 nêu tên trường. Form sửa lịch
  khoá ô khách hàng.
- **Đăng ký không tự nhận hồ sơ tại quầy trùng số:**
  - Tài khoản luôn có hồ sơ riêng (để trống SĐT nếu số đã thuộc hồ sơ khác); response giống nhau trong mọi trường hợp.
  - Nhân viên gộp tại quầy qua route mới `POST /customers/:id/merge-into-account`: nhãn + nút trên màn Khách hàng,
    nhật ký `customer.merged`. Tổng 113 route.
- **Bằng chứng test thật:**
  - Code `main` trên bản sao DB dev: tái hiện đủ 6 lỗi (R1–R6), 10/10.
  - Code nhánh:
    - API 20/20 (lần đầu 19/20 do script so JSON sai thứ tự khoá; đánh giá lại đạt, đã sửa script);
    - trình duyệt 4/4 kịch bản;
    - newman 118 request / 331 assertion / 0 lỗi;
    - smoke chỉ đọc trên DB dev 4/4, không thêm dòng nào.
  - Jest 208/208, Vitest 49/49, build, `docs:build` 113 route.
- **Còn hở đã biết:** kẻ gian đăng ký trước bằng một số chưa từng ra quầy — cần xác minh bằng OTP SMS.
- Không có migration.

---

## Chưa làm — xem plan riêng từng phần

| Việc | File plan | Ưu tiên gốc |
|---|---|---|
| Dọn 3 hàm API mồ côi ở frontend (đã đính chính — không còn xoá bảng catalog, xem đầu file) | `01-ke-hoach-dead-code-cleanup.md` | Nhóm A — kế tiếp |
| 3 việc còn lại cần quyết định chính sách kinh doanh trước (discount guardrail, onboarding branch_manager, cấu hình tài khoản ngân hàng — mục 3 "hoàn tiền/void" đã xong, xem mục 10 ở trên) | `05-backlog-nhom-b.md` | Nhóm B — cuối cùng, chưa lên plan chi tiết |
| Nhóm sửa 2–6 của đợt kiểm tra trước deploy 12/09/2026. Nhóm 2 (luồng tiền, nhánh `fix/payment-money-flows`) và nhóm 3 (lộ dữ liệu, mục 15) đã code + test trên nhánh riêng, chờ merge. Còn lại theo thứ tự: Docker → lỗi vận hành tại quầy → backup/log | Nhóm 3: `15-ke-hoach-chan-lo-du-lieu-khach.md`; nhóm 4–6 chưa có plan | Bắt buộc trước khi deploy |

## Lỗi phát hiện qua kiểm thử hồi quy 21/08/2026 — đã ghi nhận, CHƯA sửa

Bộ kiểm thử hồi quy sau đợt chuẩn hoá múi giờ (~190 phép kiểm trên MySQL thật) soi ra
**8 lỗi có sẵn từ trước**. Nguyên nhân + cách khắc phục từng lỗi:
`09-loi-phat-hien-kiem-thu-hoi-quy.md`.

Hai lỗi đụng tiền và dữ liệu, nên xử lý trước:

- 🔴 **Giờ cao điểm đọc sai khoá cấu hình** — `SettingService.getPeakHours()` đọc khoá
  `pricing` trong khi seeder ghi vào `operating_hours`, nên luôn rơi về mặc định 17–22.
  Cấu hình `peak_end = 21:00` bị bỏ qua ⇒ khách bị tính giá cao điểm thừa 1 tiếng mỗi ngày.
- 🔴 **Đặt lịch so sánh giờ bằng chuỗi** — `BookingService` dùng `startTime >= endTime` trên
  chuỗi, nên `9:00 → 10:00` bị từ chối oan còn `10:00 → 9:00` lại được lưu vào DB và lọt
  cả kiểm tra trùng lịch.

Sáu lỗi còn lại (cắt ngày theo giờ máy chủ ở 5 chỗ, `/reports/revenue` bỏ qua `from`/`to`,
báo cáo sai ngày ở vùng có DST, `compareBranches` gộp một múi giờ, checkout đồng thời trả
500, mã giảm giá "đến hết hôm nay" chết từ 7h sáng) — xem chi tiết trong file trên.

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
