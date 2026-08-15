# Những chỗ dự án "chưa quyết" hoặc "làm nửa chừng"

## Mục đích tài liệu

Đây **không phải** danh sách lỗi hay lỗ hổng bảo mật (hai việc đó nằm ở
`docs/05-extra/01-audit/SecurityAudit.md` và `docs/05-extra/01-audit/StabilityAudit.md`). Tài liệu này chỉ trả lời
một câu hỏi: **những chỗ nào trong hệ thống đã viết code nhưng chưa thực sự
"xong" về mặt sản phẩm** — nghĩa là dữ liệu được lưu nhưng không ai dùng, hai
chỗ trong code nói hai điều khác nhau về cùng một vai trò, hoặc một tính năng
tồn tại nửa vời (có API nhưng không có màn hình, có bảng nhưng không có model).

Không phải mọi thứ liệt kê dưới đây đều "sai" — nhiều chỗ là lựa chọn hợp lý
nhưng chưa ai viết ra thành quy tắc rõ ràng. Mục tiêu là để chủ dự án **biết
rõ mình đang đứng ở đâu** trước khi quyết định làm tiếp cái gì.

---

## Mục 1 — Tính năng "đo mà không dùng"

Đây là mẫu hình đã phát hiện với hạng hội viên (`docs/05-extra/01-audit/LoyaltyTier.md`):
trường dữ liệu được tính toán, lưu vào DB, cập nhật đều đặn — nhưng **không
có chỗ nào trong hệ thống đọc lại nó để ra quyết định gì**. Rà lại toàn bộ
codebase thấy thêm mấy trường hợp cùng dạng, có một trường hợp thậm chí lớn
hơn cả loyalty tier.

### 1.1. `Customer.loyaltyTier` (đã ghi trong `docs/05-extra/01-audit/LoyaltyTier.md`)
Tính theo `totalSpent` toàn chuỗi, cập nhật ở `PaymentService.checkout`
(`backend/src/services/PaymentService.js:131-141`) và
`PaymentService.processWebhook` (dòng 271), hiển thị trên trang khách hàng —
nhưng không giảm giá, không ưu tiên đặt sân, không lọc báo cáo theo hạng. Xem
tài liệu kia để biết chi tiết, không nhắc lại ở đây.

### 1.2. Nhật ký hoạt động (Activity Log / Audit Trail) — trường hợp lớn nhất
Đây là phát hiện đáng chú ý nhất trong mục này, vì lượng công sức bỏ vào ghi
dữ liệu rất lớn nhưng phần đọc lại gần như bằng không:

- **Ghi dữ liệu:** `AuditService.record(...)` được gọi ở **26 chỗ** trên
  **8 service khác nhau** (`AccessoryService`, `BookingService`,
  `CourtService`, `EmployeeService`, `GoodsReceiptService`,
  `InventoryService`, `PaymentService`, `SupplierService`) — gần như mọi thao
  tác tạo/sửa/hủy quan trọng (đặt sân, thanh toán, mở/đóng sân, nhập kho,
  thêm nhà cung cấp...) đều được ghi vào bảng `activity_logs` kèm giá trị cũ
  và mới (`oldValues`/`newValues`).
- **Đọc dữ liệu:** có đúng 1 API đọc lại —
  `GET /employees/:id/activity-logs`
  (`backend/src/routes/employeeRoutes.js:15`, cài đặt ở
  `EmployeeService.getActivityLogs`,
  `backend/src/services/EmployeeService.js:199-212`) — và frontend **có sẵn**
  hàm gọi nó (`employeeService.getActivityLogs`,
  `frontend/src/services/apiServices.js:105`).
- **Nhưng:** không một trang nào trong toàn bộ `frontend/src/pages` gọi hàm
  này. Không có màn hình "xem nhật ký hoạt động" ở bất kỳ đâu trong hệ thống.

Nói cách khác: hệ thống ghi lại rất kỹ "ai đã làm gì, lúc nào, giá trị trước
và sau ra sao" — nhưng hiện tại **không ai xem được thông tin này qua giao
diện**, chỉ có thể truy vấn thẳng vào database. Đây là tính năng gần như đã
xây xong ở tầng backend, chỉ thiếu 1 màn hình frontend để dùng được.

### 1.3. `Employee.shift` (ca làm việc)
Trường tự do (`backend/src/models/Employee.js:25-28`), nhập khi tạo/sửa nhân
viên (`EmployeesPage.jsx`), hiển thị trong danh sách nhân viên — nhưng không
có báo cáo theo ca, không lọc theo ca, không dùng để giới hạn ai được
mở/đóng sân theo giờ làm. Là một nhãn hiển thị thuần túy.

### 1.4. Các trạng thái `Payment.status` không bao giờ được gán
`Payment.status` khai báo enum gồm 6 giá trị:
`pending, processing, paid, failed, cancelled, refunded`
(`backend/src/models/Payment.js:26`). Rà toàn bộ `PaymentService.js` thì thấy
code chỉ từng gán **2 giá trị**: `pending` (khi tạo) và `paid` (khi thanh
toán tiền mặt hoặc webhook xác nhận, dòng 116-118 và 264). Bốn giá trị còn
lại (`processing`, `failed`, `cancelled`, `refunded`) tồn tại trong schema từ
lúc thiết kế nhưng chưa có nghiệp vụ nào từng gán chúng — xem thêm Mục 5.2 về
hoàn tiền.

### Ghi nhận trái chiều (để không thổi phồng)
`Extra.lowStockThreshold` ban đầu trông giống mẫu hình trên, nhưng kiểm tra kỹ
thì **có dùng thật**: `InventoryService.getLowStockCount`
(`backend/src/services/InventoryService.js:168`) dùng nó để đếm sản phẩm sắp
hết hàng, và số này hiển thị trên Dashboard ("Tồn kho thấp: X sản phẩm" —
xem `docs/04-workflows/flows/WF-08-ReportsSettings.md`). Nêu ra để xác nhận
đây **không phải** một trường hợp đo-mà-không-dùng.

---

## Mục 2 — Vai trò/quyền chưa nhất quán hoặc chưa có đường vào

### 2.1. `branch_manager` không có cách tạo qua UI/API
`EmployeeService.createEmployee` gán cứng role `'employee'`
(`backend/src/services/EmployeeService.js:83-92`, tra role theo tên
`"employee"` rồi dùng `roleId` đó cho mọi nhân viên mới, bất kể ai tạo hay
tạo với dữ liệu gì). Vai trò `branch_manager` — vai trò quản lý 1 chi nhánh,
quyền rộng hơn nhân viên — **chỉ tồn tại được nhờ 1 seeder chạy 1 lần**
(`backend/src/seeders/20260815300003-seed-branch-managers.js`, tạo 2 tài
khoản mẫu cho chi nhánh Q3/Q7 bằng SQL trực tiếp, không qua API). Trong môi
trường thật, **không có cách nào để admin tạo thêm một quản lý chi nhánh
mới** ngoài việc chạy script hoặc sửa DB tay.

Bằng chứng cho thấy đây từng là nguồn gây nhầm lẫn thật: seeder trên còn phải
sửa lại dữ liệu cũ, vì trước đó nhân viên chi nhánh Q3/Q7 được gán
`position: "Quản lý chi nhánh"` (chỉ là nhãn hiển thị) trong khi `role` thật
sự vẫn là `'employee'` — tức là giao diện từng hiển thị "Quản lý chi nhánh"
cho một tài khoản chỉ có quyền nhân viên thường (xem comment trong file
seeder, dòng 4-9).

### 2.2. `position` (chức danh hiển thị) không liên quan gì đến `role` (quyền thật)
Vì lý do ở trên: `position` là text tự do, ai nhập gì cũng được, không được
đồng bộ với `role`. Hệ quả là nhãn hiển thị trên UI ("Quản lý chi nhánh",
"Thu ngân"...) không đảm bảo phản ánh đúng quyền hạn thật của tài khoản —
người xem danh sách nhân viên dễ hiểu nhầm ai đang có quyền gì.

### 2.3. `branch_manager` không được quản lý phụ kiện/nhà cung cấp, dù được quản lý sân và nhân viên
So sánh các route:
- `courtRoutes.js:20-22` — tạo/sửa/xóa sân: `['admin', 'branch_manager']`
- `employeeRoutes.js:12` — toàn bộ quản lý nhân viên: `['admin', 'branch_manager']`
- `accessoryRoutes.js:19-21` — tạo/sửa/xóa sản phẩm: **chỉ `['admin']`**
- `supplierRoutes.js:14-16` — tạo/sửa/xóa nhà cung cấp: **chỉ `['admin']`**

`branch_manager` được giao quyền khá rộng ở sân và nhân sự (cấp chi nhánh),
nhưng lại không được thêm sản phẩm mới hay nhà cung cấp mới (2 danh mục dùng
chung toàn chuỗi). Điều này *có thể* là chủ ý (danh mục chung chỉ admin mới
được sửa, tránh loạn dữ liệu giữa các chi nhánh) — nhưng lại tạo ra một điểm
vướng thực tế: `goodsReceiptRoutes.js:9` cho phép cả `employee` lẫn
`branch_manager` tạo phiếu nhập kho (phải chọn `supplierId`/`extraId` có
sẵn), nghĩa là nếu chi nhánh làm việc với một nhà cung cấp mới, `branch_manager`
tại chỗ **không tự thêm được**, phải nhờ admin thêm trước. Nên xác nhận đây
có phải chủ ý hay chỉ là chưa nghĩ tới.

### 2.4. `employee` không xem được báo cáo/dashboard — có ghi trong docs nhưng chưa có lý do
`reportRoutes.js:8` gắn `roleMiddleware(['admin', 'branch_manager'])` ở cấp
router cho toàn bộ 6 endpoint báo cáo — `employee` không xem được kể cả
doanh thu ca mình vừa thu tiền. Đây **không phải là bug âm thầm** — chính
`docs/04-workflows/flows/WF-08-ReportsSettings.md` (dòng 6-9) đã ghi rõ điều
này và đối chiếu với `settingRoutes.js` (chỉ `admin` mới sửa cài đặt). Nhưng
tài liệu chỉ *mô tả hiện trạng*, không giải thích *tại sao* nhân viên thu
ngân không được xem báo cáo — nên vẫn là một quyết định sản phẩm còn treo,
chỉ là treo có ghi chú thay vì treo âm thầm.

---

## Mục 3 — Schema/code chết

### 3.1. Cụm bảng M2 (catalog + sales order kiểu mới) — không có model, không có service
`backend/src/migrations/20260805000002-m2-catalog-sales-orders.js` tạo 5
bảng: `product_categories` (dòng 10), `products` (dòng 49),
`product_variants` (dòng 106), `sales_orders` (dòng 156),
`sales_order_lines` (dòng 217). Comment đầu file ghi "Legacy tables remain
for dual-write period" — tức là kế hoạch ban đầu là dùng song song 2 hệ
catalog rồi chuyển dần. Nhưng rà toàn bộ `backend/src/models/` (`index.js`)
thì **không có Sequelize model nào** cho 5 bảng này, và grep toàn bộ
`backend/src` cũng không có service/controller nào đụng tới chúng. Đây là
schema đã tạo trên DB nhưng hướng thiết kế (catalog đa biến thể + đơn hàng
kiểu POS) đã bị bỏ giữa chừng — hệ thống hiện tại vẫn dùng `extras` +
`session_extras` kiểu cũ.

### 3.2. Bảng `invoice_lines` (từ M3) — cùng số phận
`backend/src/migrations/20260805000003-m3-invoice-lines-payments.js:26` tạo
bảng `invoice_lines` (có vẻ để tách từng dòng phí sân/phụ kiện/giảm giá ra
khỏi 3 cột gộp `courtFee`/`extrasFee`/`discountAmount` trên `invoices`).
Không có model, không có service nào đọc/ghi bảng này ngoài chính migration
lúc backfill dữ liệu 1 lần. `Invoice` hiện tại vẫn dùng 3 cột tổng gộp như
cũ. Đây là bảng thứ 6 (cộng với 5 bảng ở mục 3.1) nằm im trong DB từ một
hướng thiết kế đã đổi ý.

### 3.3. Ba hàm gọi API ở frontend trỏ tới route không tồn tại
Rà `frontend/src/services/apiServices.js` đối chiếu với toàn bộ route
backend, phát hiện 3 hàm được định nghĩa nhưng gọi vào endpoint **không hề
tồn tại** ở backend — nếu bấm vào sẽ chỉ nhận lỗi 404:

- `paymentService.applyDiscount` → `POST /payments/:id/apply-discount`
  (`apiServices.js:117`) — `backend/src/routes/paymentRoutes.js` chỉ có
  `/webhook` và `/checkout`, không có `/apply-discount`. Hàm này cũng không
  được gọi ở bất kỳ trang nào — rất có thể là tàn dư của một luồng "duyệt
  giảm giá riêng" đã bị bỏ để gộp thẳng `discountAmount` vào bước checkout
  (xem Mục 5.3).
- `settingService.updateAccessoryPricing` → `PUT /settings/accessory-pricing`
  (`apiServices.js:147`) — `settingRoutes.js` chỉ có `/pricing`,
  `/operating-hours`, `/branding`. Không trang nào gọi hàm này.
- `reportService.getOccupancyReport` → `GET /reports/occupancy`
  (`apiServices.js:132`) — `reportRoutes.js` không có route này (tỷ lệ lấp
  đầy sân thực ra đã có sẵn trong `GET /reports/dashboard`, xem
  `ReportsPage.jsx:148`). Không trang nào gọi hàm này.

### 3.4. Endpoint cài đặt chung `PUT /settings/` chỉ có ở backend
`settingRoutes.js:12` có route cập nhật setting theo `key`/`value` bất kỳ
(`updateSettingRules`), nhưng `SettingsPage.jsx` chỉ gọi 3 hàm chuyên biệt
(`updatePricing`, `updateOperatingHours`, `updateBranding`). Route chung này
không có giao diện nào gọi tới — không nghiêm trọng, nhưng là 1 route "chỉ
tồn tại cho Postman/API".

---

## Mục 4 — Quyết định kiến trúc còn treo

### 4.1. Hệ role gán cứng, chờ hệ permission-code (M5)
`backend/docs/architecture/MIGRATION_ROADMAP.md` tự mô tả lộ trình M1–M7, và
M5 (permission-code, `role_permissions`, audit-log-theo-permission) vẫn ở
trạng thái "planned". Hiện tại toàn bộ phân quyền nằm rải rác trong
`roleMiddleware(['admin', 'branch_manager', ...])` ở khoảng 15 file route
khác nhau (`accessoryRoutes.js`, `bookingRoutes.js`, `courtRoutes.js`,
`customerRoutes.js`, `employeeRoutes.js`, `goodsReceiptRoutes.js`,
`inventoryRoutes.js`, `invoiceRoutes.js`, `paymentRoutes.js`,
`reportRoutes.js`, `sessionRoutes.js`, `settingRoutes.js`,
`supplierRoutes.js`, `branchRoutes.js`...). Muốn thêm 1 quyền chi tiết mới
(ví dụ: "nhân viên được xem báo cáo doanh thu nhưng không được xuất Excel")
thì phải tìm và sửa tay từng route liên quan — không có 1 bảng quyền trung
tâm nào để nhìn tổng thể "ai được làm gì". Đây là điều chính dự án đã tự
nhận trong roadmap, không phải phát hiện ngoài dự kiến — nêu lại để làm rõ
mức độ ảnh hưởng thực tế (15 file, không phải chuyện nhỏ để tổng quát hóa
sau này).

### 4.2. Mô hình "toàn chuỗi vs. theo chi nhánh" — nhất quán trên thực tế, nhưng chưa từng viết thành 1 quy tắc
Kiểm tra lại toàn bộ thực thể:

| Toàn chuỗi (chain-wide) | Theo chi nhánh (branch-scoped) |
|---|---|
| `Customer` (không có `branchId`) | `Court`, `Booking`, `CourtSession` |
| `Extra` (sản phẩm/phụ kiện) | `Employee`, `Invoice`, `Payment` |
| `Supplier` (nhà cung cấp) | `ExtraStock` (tồn kho), `StockMovement` |
| `Role` | `GoodsReceipt`, `ActivityLog` |

Nhìn tổng thể, cách chia **thực ra khá nhất quán**: những gì giống "danh
mục gốc" (khách hàng, sản phẩm, nhà cung cấp, vai trò) thì dùng chung toàn
chuỗi; những gì là "số liệu vận hành/giao dịch" (đặt sân, ca chơi, hóa đơn,
tồn kho, nhân sự) thì tách theo chi nhánh. Đây không phải là quyết định tùy
tiện — mỗi lần đổi (ví dụ gộp `Customer` toàn chuỗi ở
`20260815300001-unify-customers-chain-wide.js`) đều có tài liệu riêng giải
thích lý do (`docs/04-workflows/flows/WF-05-CustomerManagement.md`,
`WF-07-Accessories.md`...).

**Nhưng:** không có một nơi nào viết quy tắc chung này ra thành 1 câu — nó
chỉ tồn tại dưới dạng "tiền lệ" rải rác trong nhiều tài liệu riêng lẻ, mỗi
tài liệu giải thích 1 thực thể. Người sau (kể cả AI agent) muốn thêm 1 thực
thể mới (ví dụ: chương trình khuyến mãi, gói hội viên...) sẽ phải tự suy ra
quy tắc từ các ví dụ cũ chứ không có chỗ nào để đọc thẳng "quy tắc chọn phạm
vi dữ liệu của dự án là gì". Nên viết quy tắc này ra 1 câu rõ ràng trong
`backend/docs/architecture/README.md` hoặc `TARGET_SCHEMA.md` để tránh mỗi
tính năng mới lại phải cãi nhau lại từ đầu.

Hệ quả thực tế của mô hình branch-scoped-cho-số-liệu: **không có báo cáo
tổng hợp toàn chuỗi**. `ReportService` bắt buộc phải có đúng 1 `branchId`
cho mọi hàm (`ReportService.requireBranch`, ném lỗi 400 nếu thiếu — xem
`backend/src/services/ReportService.js:17,66,95,111,130`). Một admin quản
3 chi nhánh muốn biết tổng doanh thu cả chuỗi hôm nay phải mở báo cáo từng
chi nhánh rồi tự cộng tay — không có endpoint hay màn hình nào cộng dồn sẵn.

### 4.3. Câu chuyện realtime: có kế hoạch, chưa có 1 dòng code nào
`docs/BadmintonDigital_Realtime_Audit_Implementation_Plan.md` mô tả khá chi
tiết kiến trúc WebSocket/Socket.IO cho trạng thái sân theo thời gian thực.
Kiểm tra thực tế:
- `socket.io` không xuất hiện trong `backend/package.json` lẫn
  `frontend/package.json`.
- Không có file nào trong `backend/src` hay `frontend/src` chứa
  `socket.io`/`websocket`.
- `CourtsPage.jsx` chỉ gọi lại API (`fetchCourts()`) sau khi **chính người
  dùng đó** thực hiện một hành động (mở sân, đóng sân, chuyển sân...) — dòng
  169/180/202/221/243/270/280/299. Không có polling định kỳ, không có
  cơ chế nào để 1 nhân viên thấy được thay đổi do nhân viên khác (trên máy
  khác) vừa thực hiện, trừ khi họ tự bấm làm mới trang.

Vậy là kế hoạch realtime hiện đang ở trạng thái "chỉ có trên giấy" — chưa rõ
là đang dừng lại có chủ đích (đợi quy mô lớn hơn) hay đơn giản là chưa ai
động vào. Nếu 2 chi nhánh/2 quầy có nhiều nhân viên thao tác cùng lúc trên
cùng 1 sân, rủi ro thấy dữ liệu cũ là có thật ngay ở quy mô hiện tại, không
cần chờ "lớn" mới cần.

---

## Mục 5 — Nghiệp vụ chưa rõ/chưa có

### 5.1. Hủy đặt sân (booking cancellation) — có, nhưng không có chính sách cắt giờ
`BookingService.cancelBooking` (`backend/src/services/BookingService.js:281-317`)
**đã tồn tại và hoạt động**: khách tự hủy được booking của mình
(`bookingRoutes.js:21` cho phép cả `customer`), nhân viên/quản lý cũng hủy
được. Điều kiện duy nhất: booking phải đang ở trạng thái `pending` hoặc
`confirmed` (dòng 291). **Không có** bất kỳ ràng buộc thời gian nào — khách
có thể hủy 1 phút trước giờ chơi giống hệt như hủy trước 1 tuần, không có
khái niệm "cửa sổ hủy" (ví dụ: chỉ được hủy trước X giờ). Câu hỏi cần chủ dự
án quyết định: **có cần chính sách hủy theo thời gian không, và nếu hủy sát
giờ thì có phạt/khóa gì không?**

### 5.2. Hoàn tiền (refund) — chưa có gì cả
`Payment.status` có sẵn giá trị `refunded` trong enum
(`backend/src/models/Payment.js:26`) nhưng **không có bất kỳ service, route,
hay nút bấm nào** từng gán trạng thái này (xem Mục 1.4). Không có khái niệm
"hoàn tiền" ở bất kỳ đâu trong code.

Hiện tại rủi ro này thấp vì kiến trúc thanh toán hiện dùng: `Payment` chỉ
được tạo **sau khi chơi xong**, lúc checkout (`PaymentService.checkout`) —
tức là đặt sân (`Booking`) không thu tiền trước, nên hủy 1 booking chưa chơi
thì không có tiền nào cần hoàn. Nhưng roadmap M6 (`MIGRATION_ROADMAP.md`) có
kế hoạch "booking deposits" (đặt cọc khi đặt sân) — **một khi có đặt cọc,
bài toán hoàn tiền khi khách hủy sẽ trở thành yêu cầu thật ngay lập tức**, và
hiện chưa có nền móng nào cho việc đó (không có flow, không có UI, trạng
thái enum có nhưng chưa từng dùng).

**Bổ sung 16/08 — xác nhận thêm:** `Invoice.status` cũng có sẵn giá trị
`void` (`backend/src/models/Invoice.js:23`) với cùng tình trạng — không
service nào từng gán. Đã grep toàn bộ `backend/src/services` cho
`refund|void|reverse`: **không có kết quả nào** — nghĩa là ngay cả khi có
tình huống cần hủy/hoàn 1 hóa đơn đã thu tiền do nhân viên bấm nhầm lúc
checkout (không liên quan gì tới đặt cọc hay hủy booking), hệ thống hiện
**không có bất kỳ cách nào** để thực hiện — không phải thiếu sót nhỏ, mà là
năng lực hoàn tiền chưa tồn tại dưới bất kỳ hình thức nào, kể cả thao tác
thủ công qua API nội bộ.

### 5.3. Giảm giá tự do lúc thanh toán — không có ràng buộc, không có lý do, không có duyệt
`discountAmount`/`isDiscountPercent` là 2 tham số nhân viên nhập tay ngay
lúc checkout (`PaymentService.checkout`,
`backend/src/services/PaymentService.js:9,77-82`). `priceCalculator.js:65-73`
chỉ giới hạn giảm giá không âm và không vượt quá tổng tiền — **không có trần
phần trăm, không có trường "lý do giảm giá", không có bước duyệt của quản
lý**. Bất kỳ nhân viên thu ngân nào cũng có thể giảm 100% hóa đơn mà không
cần giải trình.

Đáng chú ý: dù hệ thống có audit trail khá đầy đủ (Mục 1.2), sự kiện ghi lại
lúc checkout (`AuditService.record`, action `payment.completed`,
`PaymentService.js:146`) chỉ lưu `newValues: payment.toJSON()` — tức là dữ
liệu của bảng `payments` (phương thức, trạng thái, số tiền cuối) chứ
**không lưu riêng số tiền giảm giá hay lý do** (số này nằm ở bảng
`invoices`, không được ghi vào audit log ở bước này). Nghĩa là ngay cả khi
xây xong màn hình xem audit log (Mục 1.2), câu hỏi "ai đã giảm giá bao nhiêu
và vì sao" vẫn **không trả lời được** từ dữ liệu hiện có.

Đây có thể là chủ ý (tin tưởng nhân viên thu ngân toàn quyền) hoặc là một lỗ
hổng kiểm soát chưa ai để ý — sự tồn tại của hàm `applyDiscount` chết ở
frontend (Mục 3.3) gợi ý rằng **đã từng có ý định làm một luồng duyệt giảm
giá riêng** nhưng bị bỏ dở giữa chừng để gộp thẳng vào bước checkout. Cần
chủ dự án xác nhận: giữ nguyên toàn quyền nhân viên, hay cần thêm trần %,
lý do bắt buộc, hoặc duyệt của quản lý?

### 5.4. Giá sân theo giờ cao điểm — đã dùng Setting, không còn hardcode
Kiểm tra lại vì có sử liệu về 1 lần sửa lỗi "giá giờ cao điểm hardcode bỏ
qua cài đặt": hiện tại `SettingService.getPeakHours()`
(`backend/src/services/SettingService.js:25-32`) đọc `peakStartHour`/
`peakEndHour` từ bảng `settings` (key `pricing`), có fallback 17h-22h nếu
chưa cấu hình. `priceCalculator.calculateCourtFee` nhận 2 giờ này làm tham
số, không tự hardcode nữa. **Vấn đề cũ đã được khắc phục** — nêu ra để xác
nhận rõ, tránh nghi ngờ nhầm.

Tuy vậy, mô hình giá hiện tại vẫn khá đơn giản: mỗi sân chỉ có 2 mức giá
(`peakPricePerHour`/`offpeakPricePerHour`), khung giờ cao điểm là **1 khung
duy nhất áp dụng cho toàn hệ thống** (không phân biệt theo chi nhánh, theo
sân, theo ngày trong tuần/cuối tuần). Bảng `court_price_rules` linh hoạt hơn
nằm trong roadmap M6, hiện chưa triển khai — không phải bug, nhưng nếu có
nhu cầu giá cuối tuần khác ngày thường, hoặc chi nhánh A giờ cao điểm khác
chi nhánh B, thì cấu trúc hiện tại chưa hỗ trợ được.

### 5.5. Mã QR chuyển khoản (VietQR) — trỏ về 1 tài khoản demo cố định, không cấu hình được
`generateVietQRUrl` (`backend/src/utils/vietqr.js:5`) có tham số
`bankId`/`accountNo`/`accountName` nhưng đều có giá trị mặc định cứng
(`'MB'`, `'0987654321'`, `'BADMINTON DIGITAL'`). Cả 2 nơi gọi hàm này trong
`PaymentService.js` (dòng 153 và 194) **đều không truyền các tham số đó** —
nghĩa là mọi hóa đơn chuyển khoản, ở bất kỳ chi nhánh nào, đều tạo mã QR trỏ
về cùng 1 số tài khoản demo. Không có setting nào trong `settings` (bảng
key-value) lưu thông tin ngân hàng thật. Đây rõ ràng là dữ liệu placeholder
cho demo — **cần có chỗ cấu hình số tài khoản ngân hàng thật (có thể theo
từng chi nhánh) trước khi dùng thật**, hiện chưa có.

---

## Mục 6 — TODO/FIXME trong code

Đã rà toàn bộ `backend/src` và `frontend/src` với các từ khóa
`TODO`, `FIXME`, `HACK`, `XXX`. **Không tìm thấy comment nào thuộc dạng này**
(kết quả trùng khớp duy nhất là chuỗi placeholder `"090XXXXXXX"` trong 1 ô
nhập số điện thoại — không phải ghi chú của lập trình viên). Điều này khác
thường theo hướng tích cực: không có "nợ kỹ thuật tự thú" nằm rải rác trong
code — nhưng cũng đồng nghĩa các khoảng trống liệt kê ở Mục 1–5 **không được
đánh dấu ở đâu cả**, phải rà thủ công như tài liệu này mới thấy được.

---

## Kết — Những câu hỏi định hướng quan trọng nhất

1. **Hạng hội viên (loyalty tier):** có cần gắn quyền lợi thật (giảm giá,
   ưu tiên giờ đẹp...) hay chỉ cần là nhãn hiển thị "cho vui"? Nếu cần lợi
   ích thật thì nên làm sớm trước khi khách quen với việc lên hạng mà không
   thấy khác biệt gì.

2. **Nhật ký hoạt động:** dữ liệu đã có sẵn và đầy đủ (26 điểm ghi log trên
   8 service), chỉ thiếu 1 màn hình để xem. Có nên ưu tiên làm màn hình này
   sớm không — chi phí thấp (không cần thêm gì ở backend) nhưng lợi ích rõ
   (giải quyết một phần câu hỏi "ai đã sửa/hủy/giảm giá cái gì").

3. **Hệ phân quyền:** giữ nguyên cách gán cứng vai trò trong ~15 file route
   (đơn giản, phù hợp quy mô hiện tại) hay đầu tư xây hệ permission-code
   (M5 trong roadmap) khi có thêm vai trò hoặc quy tắc phân quyền chi tiết
   hơn? Và trước mắt: `branch_manager` có cần một đường tạo tài khoản chính
   thức qua UI, thay vì chỉ có qua seeder?

4. **Giảm giá lúc thanh toán:** giữ nguyên toàn quyền quyết định của nhân
   viên thu ngân, hay cần thêm trần phần trăm / lý do bắt buộc / duyệt của
   quản lý? Đây là điểm kiểm soát tiền mặt/doanh thu, nên đáng quyết định
   sớm chứ không chỉ để "khi nào có vấn đề mới tính".

5. **Realtime và đặt cọc/hoàn tiền (M6):** kế hoạch WebSocket có tiếp tục
   triển khai không, hay tạm gác? Và khi triển khai tính năng đặt cọc
   (booking deposit) theo roadmap, cần xây flow hoàn tiền song song ngay từ
   đầu — hiện tại hoàn toàn chưa có nền móng nào cho việc hoàn tiền.
