# System Architecture
## Dự án: Badminton Digital Management – Hệ thống quản lý sân cầu lông

**Phiên bản:** 1.2
**Ngày:** 18/10/2026 (từ v1.1 ngày 15/08/2026, v1.0 ngày 19/07/2026 — lịch sử ở mục 13)
**Tài liệu tham chiếu:** `SRS.md`, `UseCase.md`, `APIDesign.md`, `DatabaseDesign.md`, `DeploymentGuide.md`, `CourtStateModel.md`, `services/competition-service/docs/01-kien-truc.md`

---

## 1. Tổng quan kiến trúc

Hệ thống gồm **hai dịch vụ chạy độc lập**: ứng dụng chính (đặt sân, vận hành, bán lẻ, báo cáo) theo kiến trúc **Client-Server 3 lớp**, và **dịch vụ thi đấu** (giải đấu, giao lưu, điểm trình, xếp hạng) có cơ sở dữ liệu riêng. Frontend chỉ nói chuyện với backend; backend là **cửa duy nhất** dẫn tới dịch vụ thi đấu.

```
  Người dùng: khách · nhân viên · quản lý · người xem công khai
                          │ HTTPS
                          ▼
  ┌──────────────────────────────────────────────┐
  │ CLIENT — React SPA (Vite, Tailwind)          │
  │ khu quản trị · khu khách · /thi-dau          │
  │ Context + Axios (tự làm mới token) + SSE     │
  └──────────────────────────────────────────────┘
                          │ REST /api/v1 (JSON) · SSE
                          ▼
  ┌──────────────────────────────────────────────┐
  │ APPLICATION — Node.js + Express (backend)    │        ┌────────────────────────────────┐
  │ routes → controllers → services → models     │  ───▶  │ MySQL                          │
  │ cổng nối thi đấu · việc nền mỗi 5 phút       │        │ badminton_digital_management   │
  └──────────────────────────────────────────────┘        └────────────────────────────────┘
                          │ token dịch vụ ES256 (60 giây)  ▲ webhook + sự kiện ký HMAC
                          ▼
  ┌──────────────────────────────────────────────┐
  │ competition-service (độc lập)                │        ┌────────────────────────────────┐
  │ giải đấu · giao lưu · điểm trình · xếp hạng  │  ───▶  │ MySQL                          │
  │ bấm điểm trực tiếp · SSE màn hình TV         │        │ competition_service            │
  └──────────────────────────────────────────────┘        └────────────────────────────────┘
```

Hai nguyên tắc xuyên suốt:
- **App chính sống bình thường khi dịch vụ thi đấu chết hoặc chưa bật**: đặt sân, POS, thanh toán không bao giờ gọi đồng bộ sang dịch vụ kia; thiếu cấu hình thì phần thi đấu tắt hẳn chứ không chạy nửa vời.
- **Mặc định đóng, không mặc định mở**: chuyển khoản, webhook, trang tài liệu API, cổng thi đấu đều tắt cho tới khi được cấu hình đủ; cấu hình dở dang làm máy chủ từ chối khởi động.

---

## 2. Kiến trúc Frontend

### 2.1 Nguyên tắc tổ chức
- **Pages** (`frontend/src/pages/<Feature>/`): mỗi nhóm nghiệp vụ một thư mục (Courts, Bookings, Accessories, Retail, Customers, Employees, Reports, Settings, ActivityLog… cho nhân viên; Home, Booking, Shop, Cart, Orders, MyBookings, Notifications, Account… cho khách).
- **Features** (`frontend/src/features/competition/`): toàn bộ giao diện thi đấu — giải đấu, giao lưu, bấm điểm, màn hình TV, người chơi, xếp hạng, khu công khai `/thi-dau` — nằm trọn một thư mục, chỉ nói chuyện với cổng `/api/v1/competition/*` qua `api/competitionApi.js`. `AppRoutes` chỉ ghép thêm `competitionStaffRoutes`, `competitionCustomerRoutes`, `competitionPublicRoutes`.
- **Components**: thành phần dùng chung; riêng khu khách có **một thanh đầu trang, một chân trang, một bộ logo** (`components/site/`, `components/brand/`). Dữ liệu menu chỉ nằm ở một file thuần `siteNav.js` (đã kiểm thử); thêm hay đổi mục menu chỉ sửa ở đó, không sửa trong từng layout.
- **Contexts**: `AuthContext` (người dùng, token, vai trò), `ThemeContext` (giao diện; tối là mặc định, bật bằng class `dark` trên `<html>`), `BranchContext` (chi nhánh admin đang chọn, gửi kèm mọi request qua `X-Branch-Id`), `CompetitionProvider` (thi đấu bật hay tắt, có đang tạm ngưng không).
- **Services**: `apiClient.js` là **một** Axios instance duy nhất — gắn token, gặp 401 thì làm mới rồi gọi lại, chỉ kết thúc phiên khi máy chủ từ chối làm mới (lỗi mạng/5xx thì để nơi gọi thử lại). `realtimeClient.js` (SSE) làm mới token trước mỗi lần nối, lùi dần 2 → 30 giây, coi 60 giây không có `ping` là đứt, và báo `onReconnect` để trang nạp lại.
- **Routes**: `ProtectedRoute` kiểm đăng nhập và vai trò; các route vận hành chia nhóm theo vai trò (nhân viên, admin hoặc quản lý, chỉ admin). Trang nặng được tách bằng lazy-load.
- **Hooks và logic thuần**: quy tắc nghiệp vụ phía giao diện nằm trong các module thuần (`lib/`, `utils/`) có kiểm thử Vitest (lưới đặt sân, luồng đăng ký thi đấu, quyền theo vai trò…) để không phụ thuộc DOM.

### 2.2 Ba lớp giao diện
| Lớp | Layout | Dành cho |
|---|---|---|
| Quản trị và nhân viên | `SidebarLayout` (thanh bên trên máy tính, thanh điều hướng dưới trên điện thoại) | `admin`, `branch_manager`, `employee` |
| Khách hàng | `CustomerLayout` + `SiteHeader`/`SiteFooter` dùng chung | Khách, kể cả chưa đăng nhập |
| Khu công khai thi đấu | `PublicShell` dùng chính `SiteHeader`/`SiteFooter` | Mọi người |

Trang chủ dùng header kiểu "đè lên ảnh" (luôn tối); các trang còn lại có cả giao diện sáng và tối (bảng màu sáng bật bằng `.kinetic-light`).

### 2.3 Luồng dữ liệu Frontend
```
Component → Hook/Service (gọi API) → Context hoặc state cục bộ → Re-render
                                  ↘ SSE (court:updated, booking:changed) → nạp lại dữ liệu qua REST
```
Sự kiện SSE chỉ là tín hiệu "có thay đổi"; trang nạp lại bằng REST và **không nạp lại trong lúc nhân viên đang nhập dở** một form.

### 2.4 Chiến lược Responsive
- Tailwind breakpoints (`sm/md/lg/xl`); khu khách có thanh tab dưới cố định dưới `lg`.
- Trang Đặt sân vẽ lưới 18 cột từ 1024 px, dưới đó vẽ từng sân một (đo thực tế: ở 768 px lưới đầy đủ chỉ còn ô 24 px).
- Phần tử cố định (thanh tóm tắt, hộp xác nhận) được dựng ra `document.body` qua `Portal` vì `<main>` của layout khách tạo ngữ cảnh xếp chồng và chân trang sẽ đè lên mọi phần tử `fixed` bên trong.

---

## 3. Kiến trúc Backend

### 3.1 Mô hình phân lớp (Layered Architecture)
```
Request
  → Security headers               (securityHeaders.js, mọi phản hồi)
  → Rate limit                     (express-rate-limit, trên các route nhạy cảm)
  → Route          (định nghĩa endpoint, gắn middleware và luật validate)
  → Middleware     (auth, RBAC, chi nhánh, validation)
  → Controller     (nhận request, gọi service, trả response chuẩn)
  → Service        (logic nghiệp vụ: tính tiền, luật đặt sân, kho, thanh toán…)
  → Model (Sequelize) (truy vấn database, transaction)
Response  { success, data, message, errors }
```

Nguyên tắc: **Controller không chứa business logic**. Mọi tính toán nghiệp vụ nằm ở Service và ưu tiên đặt trong **hàm thuần** (không đọc DB, không đọc đồng hồ ẩn) ở `utils/` để kiểm thử độc lập — ví dụ `priceCalculator`, `daySlots`, `bookingPolicy`, `bookingOpenWindow`, `passwordPolicy`, `discountPolicy`, `notificationMessages`, `serverConfig`, `paymentConfig`.

### 3.2 Middleware và tiện ích chính
| Thành phần | Chức năng |
|---|---|
| `utils/securityHeaders` | Đăng ký đầu tiên: CSP, chặn nhúng khung, nosniff, chính sách tham chiếu, HSTS khi HTTPS; `no-store` cho `/api/v1` trừ `/public` |
| `authMiddleware` | Xác thực JWT, đối chiếu `tv` với `users.token_version`, nạp `role`/`employee`/`customer` vào `req.user` |
| `sseAuthMiddleware` | Như trên cho luồng SSE (token qua query). Cùng `authMiddleware` là **hai nơi duy nhất** xác minh access token; cổng thi đấu đi qua cả hai |
| `roleMiddleware(roles)` | Kiểm tra vai trò có quyền vào endpoint |
| `branchContextMiddleware` | Đọc `X-Branch-Id`, gán `req.branchId`/`req.branch`. `admin` chuyển được sang chi nhánh bất kỳ; `employee`/`branch_manager` bị khoá vào chi nhánh của mình; token của khách kèm header → 403 |
| `requestContextMiddleware` | Gán `req.requestId` (từ `X-Request-Id` hoặc UUID), trả lại qua response header, ghi vào `activity_logs.request_id` |
| `paymentWebhookAuth` | Cửa vào webhook thanh toán: chưa cấu hình 503, sai secret 401 (trước cả validation) |
| Validation (`validations/`) | Express Validator theo từng nhóm route; mã số luôn là số nguyên trong miền hợp lệ |
| `errorHandler` | Bắt lỗi tập trung, đăng ký cuối cùng; không bao giờ trả `err.errors` thô của Sequelize; lỗi khoá chết/hết thời gian chờ → 409, giá trị ngoài miền → 400 |

### 3.3 Modules/Services nghiệp vụ chính
- `AuthService`: đăng nhập (`identifier`), tự đăng ký, **xoay vòng refresh token và thu hồi phiên** (`token_version`), đặt lại mật khẩu. Là nơi duy nhất nạp `passwordHash`/`refreshToken` (`User.scope('withSecrets')`).
- `CourtService` / `CourtLayoutService`: mở/đóng/chuyển sân, tính tiền theo khung giờ, vòng đời sân (xem `CourtStateModel.md`); sơ đồ mặt bằng ghi ra file JSON theo chi nhánh.
- `BookingService`: **`checkAvailability` là nguồn duy nhất** trả lời "sân còn nhận khung giờ này không" cho trang công khai, màn nhân viên và `POST/PUT /bookings`; chính sách giữ chỗ, tự huỷ lịch quá hạn.
- `PublicCatalogService`: dữ liệu công khai (chi nhánh, sân, giá, cửa hàng, lưới sân × giờ cả ngày) — không bao giờ lộ dữ liệu khách.
- `PaymentService`: tổng hoá đơn, giảm giá tay có lý do và trần theo vai trò, checkout idempotent, xác nhận webhook, **void hoá đơn**; tiền sân luôn qua `calculateSessionCourtFee`.
- `SalesOrderService` (POS) / `OnlineOrderService` (khách tự đặt, hạn thanh toán 30 phút) / `VoucherService` (mã giảm giá, đếm lượt bằng `COUNT`) / `ProductService`.
- `InventoryService`: **entry point duy nhất** ghi `extra_stocks`/`product_stocks`/`stock_movements` (khoá dòng, giá vốn bình quân). `GoodsReceiptService`, `SupplierService`, `AccessoryService`.
- `CustomerService`: hồ sơ khách dùng chung toàn chuỗi, **gộp hồ sơ tại quầy vào tài khoản**, ghi `integration_outbox` trong cùng giao dịch.
- `NotificationService`: ghi thông báo trong cùng giao dịch với thay đổi lịch, email gửi sau khi giao dịch hoàn tất.
- `ReportService`: Dashboard, doanh thu (theo múi giờ chi nhánh), doanh thu chi tiết theo nguồn, đối chiếu kho, xuất Excel/PDF.
- `SettingService`, `AuditService` (nhật ký hoạt động), `EmployeeService` (`assertCanManage`), `SessionService`, `BranchService`.

### 3.4 Việc nền và cấu hình khởi động
- **Một vòng lặp 5 phút** trong tiến trình backend: tự huỷ lịch `pending` của khách quá hạn giữ chỗ, tự huỷ đơn online chuyển khoản quá hạn (hoàn kho), huỷ đơn POS bỏ dở quá 6 giờ, dọn thông báo cũ.
- **Luồng thời gian thực** `realtimeBus` (nội bộ) → `/realtime/stream` theo chi nhánh; sự kiện chỉ mang tín hiệu vô hiệu hoá, không mang trạng thái (nguyên tắc chốt ở `CourtStateModel.md`).
- **Từ chối khởi động khi cấu hình nguy hiểm** (hàm thuần có kiểm thử): hai JWT secret trùng hoặc còn giá trị mẫu, `COMPETITION_*` thiếu hoặc khoá ES256 sai, kết nối TLS tới MySQL luôn kiểm chứng chỉ máy chủ (`DB_SSL`, `DB_SSL_CA`).
- **Cấu hình HTTP và triển khai** nằm trong các hàm thuần: `serverConfig` (`TRUST_PROXY_HOPS`, `CORS_ORIGIN`), `frontendStatic` (backend phục vụ luôn bản build frontend khi đặt `FRONTEND_DIST_DIR`), `demoMode`/`demoSeedGuard` (khoá tài khoản demo, chặn seed mật khẩu công khai ở production).
- **Log:** backend ghi ra stdout/stderr để Docker hoặc Render thu; không có thư mục log riêng. Dịch vụ thi đấu dùng `pino`.

---

## 4. Dịch vụ thi đấu (`services/competition-service`)

Dịch vụ độc lập, kiến trúc **hexagonal (ports & adapters)**: mỗi module (`player`, `rating`, `ranking`, `matchmaking`, `match`, `tournament`, `session`) có `domain/` (luật thuần, không DB), `application/` (use case) và `infrastructure/` (HTTP, DB); module chỉ gọi nhau qua `modules/<tên>/index.js`. Chạy và kiểm thử được **một mình**, không cần app chính (có script sinh token dev và Swagger UI).

**Luật ranh giới** (`npm run check-boundaries`, chạy trong CI): dịch vụ không `require` gì ngoài thư mục của nó và backend không `require` gì từ dịch vụ; **CSDL riêng**, không JOIN chéo; chỉ chia sẻ **hợp đồng** (OpenAPI `openapi/competition-service.v1.yaml` và JSON Schema sự kiện `contracts/events/`), không chia sẻ code; tham chiếu sang hệ thống khác bằng **chuỗi mờ** (`bd:customer:<id>`, `bd:branch:<id>`), không bằng khoá ngoại; deploy, migrate, seed, version độc lập.

Các đặc điểm kỹ thuật chính: khoá chính UUIDv7; mỗi bảng nghiệp vụ có `tenant_id` (mỗi chi nhánh là một tenant); thao tác ghi có `Idempotency-Key` và khoá lạc quan `If-Match`/`ETag`; hợp đồng REST do OpenAPI quy định và dùng `express-openapi-validator` để kiểm; bấm điểm trực tiếp lưu chuỗi pha cầu rồi tính lại tỉ số, đẩy lên màn hình TV bằng SSE (khoảng 0,3–0,5 giây); hồ sơ người chơi có chế độ riêng tư (`public`/`members`/`hidden`) và schema công khai đóng kín. Thiết kế đầy đủ: `services/competition-service/docs/` (7 tài liệu).

---

## 5. Tích hợp app chính ↔ dịch vụ thi đấu

`backend/src/integrations/competition/` là **nơi duy nhất** app chính biết tới dịch vụ thi đấu.

| Thành phần | Vai trò |
|---|---|
| `config.js` | Bật chỉ khi đủ năm biến `COMPETITION_*`; không biến nào → tắt (cổng trả 503 `COMPETITION_DISABLED`); thiếu một phần hoặc khoá/secret sai → máy chủ không khởi động |
| `gateway.js` | Gắn tại `/api/v1/competition`: xác thực JWT thường (SSE nhận `?token=`), chạy `branchContextMiddleware`, rồi chuyển tiếp |
| `serviceToken.js` | **Ký lại một token ES256 riêng cho từng yêu cầu** (sống 60 giây, 300 giây với SSE) |
| `roleScopes.js` | Cắt quyền trong token theo vai trò và `org` theo chi nhánh đang chọn (admin không chọn → `*`; khách mang `player = bd:customer:<id>`); **không bao giờ cấp `ops:admin`** |
| `routeMap.js` | Danh sách cho phép theo tiền tố tài nguyên + method; `events`, `ops`, mọi đường có `ai` và đường lách mã hoá bị chặn tại cổng; `/public/*` chỉ GET |
| `client.js` | Gọi dịch vụ, có bộ ngắt mạch; frontend thấy qua `GET /competition/status` và hiện "tạm ngưng" |
| `streamGuard.js` | Giới hạn luồng SSE công khai: 40 mỗi IP, 300 tổng |
| `outbox.js` + `dispatcher.js` | Gửi sự kiện `bd.customer.updated|merged|deleted` từ bảng `integration_outbox` (ghi trong cùng giao dịch với thay đổi khách, kể cả khi tích hợp đang tắt): ký HMAC, giữ thứ tự theo từng đối tượng, lùi dần khi lỗi, trạng thái `dead` |
| `webhookHandlers.js` + `routes/competitionWebhookRoutes.js` | Nhận `competition.*` tại `/api/v1/integrations/competition/events` (gắn **trước** `express.json()` để kiểm chữ ký trên byte thô; chặn mặc định 503/401; chống trùng bằng `integration_inbox`) và ghi thành dòng nhật ký hoạt động |

Lỗi 401 từ dịch vụ được đổi thành **502 `COMPETITION_AUTH_FAILED`** có chủ đích: chuyển 401 nguyên vẹn sẽ khiến `apiClient` tưởng phiên đăng nhập hết hạn và đá người dùng ra.

**Cách chạy:** trên Render dịch vụ chạy **trong cùng container** với backend (nghe `127.0.0.1:5100`, backend là tiến trình chính, khoá ES256 sinh mới trong RAM mỗi lần khởi động); với compose dịch vụ nằm sau profile `competition` và chỉ backend gọi vào qua mạng nội bộ. Hai CSDL phải sao lưu và khôi phục **cùng thời điểm**.

---

## 6. Kiến trúc dữ liệu (tổng quan)

Bảng chi tiết và quan hệ được đặc tả đầy đủ trong `DatabaseDesign.md`. Ở mức kiến trúc, các nhóm bảng của CSDL chính (34 bảng):

- **Định danh & phân quyền**: Users, Roles, Employees, Customers (Customers dùng chung toàn chuỗi, không gắn `branch_id`; Employees gắn `branch_id`)
- **Đa chi nhánh**: Branches, BranchDocumentSequences (số chứng từ tuần tự theo chi nhánh, dùng chung cho `invoice_no` và mã phiếu nhập kho), Organizations (có bảng, chưa có model)
- **Vận hành sân**: Courts, CourtSessions, Bookings
- **Phụ kiện & kho**: Extras, ExtraStocks, StockMovements, Suppliers, GoodsReceipts, GoodsReceiptItems, SessionExtras
- **Bán lẻ**: ProductCategories, Products, ProductVariants, ProductStocks, SalesOrders, SalesOrderLines, Vouchers
- **Thanh toán**: Invoices, InvoiceLines, Payments
- **Khách hàng**: CustomerNotifications, CustomerMergeAudit
- **Tích hợp**: IntegrationOutbox, IntegrationInbox
- **Hệ thống**: Settings, BranchSettings (chưa dùng), ActivityLogs

CSDL thi đấu tách riêng (21 bảng, `DatabaseDesign.md` mục 6). Mọi cột thời gian lưu **UTC**; "hôm nay", giờ cao điểm, giờ mở cửa và gộp báo cáo tính theo múi giờ **của chi nhánh**.

---

## 7. Luồng xử lý nghiệp vụ trọng yếu (End-to-End)

### 7.1 Luồng "Khách vãng lai chơi sân"
```
Nhân viên mở sân (UC-06)
  → CourtSession tạo, status = playing (chặn hai phiên cùng mở một sân ở tầng DB)
  → Khách chơi, có thể gọi thêm phụ kiện (SessionExtras; kho trừ qua InventoryService)
  → Có thể chuyển sân (đoạn đã chơi được chốt tiền vào accrued_court_fee)
  → Nhân viên đóng sân (UC-07), tính courtFee theo giao với khung cao điểm (giờ chi nhánh)
  → PaymentService: courtFee + extrasFee − giảm giá (có lý do, trần theo vai trò) → checkout (UC-18)
  → Invoice + InvoiceLines + Payment (idempotent); chuyển khoản thì chờ webhook xác nhận
  → ReportService đọc từ hoá đơn và dòng hoá đơn
  → Máy nhân viên khác thấy thay đổi qua SSE (court:updated)
```

### 7.2 Luồng "Đặt sân trên web"
```
Khách mở /dat-san  →  GET /public/availability/day (lưới 60 phút, 6 câu SQL cố định, không lộ dữ liệu khách)
  → chọn ô, xác nhận (đăng nhập giữa chừng, quay lại đúng lựa chọn)
  → POST /bookings → BookingService.checkAvailability
        (sân khai thác → chưa qua giờ → trong giờ mở cửa → không trùng) + luật khách (14 ngày, 3 giờ, tối đa 5 lịch giữ)
  → Booking pending (giao dịch SERIALIZABLE) → booking:changed qua SSE
  → Nhân viên xác nhận (UC-13) → NotificationService ghi thông báo trong CÙNG giao dịch → khách thấy ở chuông
  → (nếu không được duyệt kịp) việc nền 5 phút tự huỷ lịch của khách + thông báo
  → Đến giờ hẹn: nhân viên mở sân dựa trên Booking (API kiểm hôm nay / lệch giờ phải xác nhận)
```

### 7.3 Luồng "Bán lẻ tại quầy (POS)"
```
Tạo đơn open → thêm dòng (trừ kho NGAY, khoá dòng tồn) → áp voucher / giảm giá tay → checkout
  → Invoice + InvoiceLines + Payment; cộng totalSpent nếu đơn có khách
  → Huỷ giỏ hoặc bỏ dở quá 6 giờ: hoàn kho, đơn cancelled
```

### 7.4 Luồng "Khách đặt hàng online"
```
Khách chọn chi nhánh, giỏ hàng, thanh toán  →  POST /my-orders (giá từ máy chủ, trừ kho ngay)
  ├─ tiền mặt   → đơn open, nhận tại quầy, nhân viên chốt (như POS)
  └─ chuyển khoản → Invoice issued + Payment pending + QR VietQR, hạn 30 phút
        ├─ POST /payments/webhook (đúng secret, đúng số tiền) → Payment/Invoice paid, đơn paid, cộng totalSpent
        └─ quá hạn → việc nền: đơn cancelled, hoá đơn void, nhả voucher, hoàn kho
```

### 7.5 Luồng "Thi đấu" (tóm tắt)
```
Khách/nhân viên → /api/v1/competition/* → cổng (JWT → token ES256 theo yêu cầu) → dịch vụ thi đấu → CSDL thi đấu
Nhân viên bấm điểm từng pha cầu → dịch vụ tính lại tỉ số → SSE đẩy lên màn hình TV
Chốt giải → bảng xếp hạng, điểm trình đổi → sự kiện competition.* → webhook về app chính → nhật ký hoạt động
Khách sửa/gộp/xoá ở app chính → integration_outbox → sự kiện bd.customer.* ký HMAC → hồ sơ thi đấu cập nhật
```

---

## 8. Kiến trúc bảo mật

- **Authentication**: JWT access token 15 phút (mang `tv`) + refresh token 7 ngày trả trong body (không cookie), chỉ lưu sha256, **xoay vòng** mỗi lần làm mới với khoảng ân hạn 30 giây. Đăng xuất, đổi và đặt lại mật khẩu tăng `token_version` nên access token cũ chết ngay. Đăng nhập nhận một `identifier` (email hoặc số điện thoại); `chk_users_login_identity` ở DB bảo đảm tài khoản luôn có ít nhất một. Đăng nhập chống dò tài khoản (cùng thông điệp, cùng chi phí so sánh) và có giới hạn tần suất theo IP.
- **Authorization**: Role-based (`admin`/`branch_manager`/`employee`/`customer`) kiểm ở middleware backend, không tin việc ẩn UI; kèm **branch-scoping** (`branchContextMiddleware`). Dữ liệu vận hành chỉ cho nhân viên đọc; trang khách dùng `/public/*`. `EmployeeService.assertCanManage`: `branch_manager` chỉ chạm tài khoản `employee`, không ai xoá được `admin` hay chính mình.
- **Password**: bcrypt; chính sách 8–72 byte, danh sách mật khẩu phổ biến, không chứa thông tin cá nhân; `User` mặc định loại `passwordHash`/`refreshToken` khỏi mọi truy vấn.
- **Tiền**: chuyển khoản tắt mặc định; webhook chặn mặc định (503/401), bắt buộc `amount` khớp, không dùng lại mã tham chiếu, mọi lần từ chối ghi nhật ký; giảm giá tay phải có lý do và có trần.
- **Dữ liệu khách**: khách tự đăng ký không bao giờ tự gắn hồ sơ khách tại quầy cùng số điện thoại; gộp do nhân viên xác minh và có nhật ký. Token của khách không gửi được `X-Branch-Id`.
- **Header và cache**: CSP chặt (`script-src 'self'`), chặn nhúng khung, nosniff, HSTS khi HTTPS, `no-store` cho API trừ `/public`.
- **Input validation**: Express Validator ở mọi endpoint nhận input; Sequelize parameterized query chống SQL injection; lỗi trả về chỉ gồm `[{ field, message }]`.
- **Liên dịch vụ**: dịch vụ thi đấu không nhận JWT người dùng; token dịch vụ ES256 sống ngắn, quyền cắt theo vai trò; sự kiện ký HMAC; mọi cửa vào (webhook, sự kiện) chặn mặc định.
- **Chuỗi cung ứng và hạ tầng**: GitHub Actions ghim theo mã commit; CI kiểm không lọt `.env`, `.keys`, `tests` vào image; container chạy bằng user `node`.
- **Đã kiểm chứng**: đợt kiểm thử bảo mật toàn hệ thống (kế hoạch 32–38 trong `docs/05-extra/02-remediation/`), bộ test riêng `npm run test:security` cho tầng cần DB.

---

## 9. Kiến trúc triển khai (Deployment Architecture)

Hai đường (chi tiết `DeploymentGuide.md`):

**A. Bản demo công khai — Render + Aiven (một container)**
```
Internet → Cloudflare → ingress Render → bộ cân bằng tải nội bộ
          → 1 web service (docker/app.Dockerfile)
              ├─ backend Express (PID 1) — phục vụ luôn bản build frontend (cùng origin, không CORS)
              └─ competition-service (127.0.0.1:5100, chạy nền, tự dựng lại sau 5 giây)
          → MySQL Aiven qua TLS (hai database: chính và thi đấu)
GitHub Actions "Demo reset" 03:00 giờ VN mỗi đêm: xoá bảng → migrate → seed cả hai DB
```

**B. Docker Compose (tự host)**
```
┌───────────────────────────────────────────────────────────┐
│                       Docker Compose                       │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐  profile      │
│  │ frontend │   │ backend  │   │  mysql   │  "competition"│
│  │ (nginx + │──▶│ (Node +  │──▶│ (MySQL 8)│   ┌─────────┐ │
│  │  build)  │   │ Express) │   │ 2 database│◀──│ service │ │
│  └──────────┘   └──────────┘   └──────────┘   └─────────┘ │
└───────────────────────────────────────────────────────────┘
```
nginx proxy `/api`, `/static`, `/api-docs` sang backend, không đệm SSE, có chỗ riêng cho luồng thi đấu; mọi cổng chỉ bind `127.0.0.1`.

- **CI/CD (GitHub Actions, `ci.yml`)**: bốn job — test backend, test dịch vụ thi đấu (MySQL 8.4 riêng, kèm `check-boundaries`), build image Docker (kiểm trong image có đủ và không lọt bí mật), test và build frontend. Render tự deploy khi `main` có commit mới; chưa có lint, Newman, deploy tự động ở CI.
- **Environment Config**: `.env` riêng từng dịch vụ; biến quan trọng và cách sinh khoá ở `DeploymentGuide.md` mục 3. `TRUST_PROXY_HOPS` phải đúng số proxy thật (Render = 3, đã đo) để giới hạn tần suất đếm đúng IP.
- **Quan sát**: `GET /health` (kèm mã commit đang chạy để xác minh bản nào đã lên) và `/api/v1/health` (kèm IP); nhật ký hoạt động trong CSDL có `request_id`.

---

## 10. Khả năng mở rộng (Scalability Considerations)

| Hướng mở rộng | Cách tiếp cận kiến trúc hỗ trợ |
|---|---|
| Đa chi nhánh (multi-branch) | **Đã triển khai**: `branch_id` trên hầu hết bảng nghiệp vụ; `branchContextMiddleware` cách ly dữ liệu theo `X-Branch-Id`; múi giờ theo chi nhánh. Nhiều tổ chức độc lập (multi-tenant thật) vẫn là hướng mở: bảng `organizations` có nhưng chưa có model/API, xem `DatabaseDesign.md` mục 3.11 |
| Tách dịch vụ | **Đã làm một lần** với thi đấu: ranh giới kiểm tra được bằng `check-boundaries`, hợp đồng OpenAPI + JSON Schema, sự kiện qua outbox/inbox |
| Realtime | **Đã triển khai bằng SSE** (`court:updated`, `booking:changed`, tỉ số trực tiếp); sự kiện chỉ mang tín hiệu vô hiệu hoá. WebSocket chưa cần |
| Tích hợp cổng thanh toán thực tế | Đã có đường xác nhận chuyển khoản qua webhook; thêm VNPay/Momo là thêm adapter cho `PaymentService` |
| Tăng tải người dùng | Backend không giữ phiên người dùng ở bộ nhớ (phiên nằm ở JWT và CSDL) nên scale ngang được sau load balancer. Ba thứ hiện nằm trong bộ nhớ từng tiến trình và cần xử lý trước khi chạy nhiều bản sao: bộ đếm giới hạn tần suất, bus thời gian thực của SSE (sự kiện chỉ tới được người đang nối vào đúng bản sao đã phát), và vòng lặp việc nền 5 phút (chạy ở mọi bản sao). Đã đo bằng k6 (xem `TestPlan.md`) |
| Nhiều thiết bị đăng nhập cùng lúc | Chưa: mỗi tài khoản giữ một refresh token (chủ dự án đã cân nhắc và hoãn); sửa đúng cần bảng refresh token riêng |

---

## 11. Sơ đồ ánh xạ kiến trúc ↔ cấu trúc thư mục

| Lớp kiến trúc | Thư mục tương ứng |
|---|---|
| Client Layer | `frontend/src/pages`, `features/competition`, `components`, `contexts`, `services`, `layouts`, `routes` |
| Application Layer – Route | `backend/src/routes` |
| Application Layer – Middleware | `backend/src/middleware`, `backend/src/utils/securityHeaders.js` |
| Application Layer – Controller | `backend/src/controllers` |
| Application Layer – Service | `backend/src/services`, hàm thuần ở `backend/src/utils` |
| Cổng và sự kiện tới thi đấu | `backend/src/integrations/competition`, `backend/src/routes/competitionWebhookRoutes.js` |
| Data Layer | `backend/src/models`, `backend/src/migrations`, `backend/src/seeders` |
| Dịch vụ thi đấu | `services/competition-service` (`src/modules`, `openapi`, `contracts`, `docs`) |
| Tài liệu | `docs/`, `services/competition-service/docs/` |
| Kiểm thử | `backend/tests`, `backend/tests-security`, `frontend/src/**/*.test.*`, `services/competition-service/tests`, `postman/`, `k6/` |
| Triển khai | `docker/`, `render.yaml`, `.github/workflows/` |

---

## 12. Quyết định kiến trúc đáng nhớ

| Quyết định | Lý do | Nơi thể hiện |
|---|---|---|
| Thi đấu là dịch vụ riêng, CSDL riêng | Chạy, test, deploy độc lập; app chính không phụ thuộc | `services/competition-service`, mục 4–5 |
| Cổng ký lại token cho từng yêu cầu | Dịch vụ không bao giờ thấy JWT người dùng; quyền cắt theo vai trò, sống 60 giây | `serviceToken.js`, `roleScopes.js` |
| Hộp thư sự kiện (outbox) cùng giao dịch | Không mất sự kiện khi dịch vụ kia tắt; giữ thứ tự theo đối tượng | `integration_outbox`, `dispatcher.js` |
| Một nguồn duy nhất cho luật đặt sân | Trang công khai, màn nhân viên và `POST /bookings` không thể nói khác nhau | `BookingService.checkAvailability` |
| `InventoryService.postMovement` là điểm duy nhất ghi tồn kho | Khoá dòng, sổ nhật ký bất biến, không bán lố | `InventoryService` |
| Trạng thái sân tách hai khái niệm | Hết lỗi "UI báo trống nhưng DB còn phiên" | `CourtStateModel.md`, `uq_court_sessions_open_court` |
| Mọi thời gian lưu UTC, hiển thị theo chi nhánh | Dời máy chủ sang múi giờ khác không làm sai dữ liệu | `DatabaseDesign.md` 3.12 |
| Sự kiện realtime chỉ mang tín hiệu vô hiệu hoá | Không rò dữ liệu qua kênh đẩy; client nạp lại bằng REST có kiểm quyền | `realtimeBus`, mục 3.4 |
| Chặn mặc định, từ chối khởi động khi cấu hình dở | Lỗi cấu hình lộ ngay lúc khởi động, không im lặng chạy sai | `paymentConfig`, `config.js`, `serverConfig` |
| Hàm thuần cho mọi quy tắc nghiệp vụ quan trọng | Kiểm thử không cần DB hay DOM | `backend/src/utils`, `frontend/src/**/lib` |
| Tài liệu API sinh từ Postman và có chốt lệch pha | Không để tài liệu lệch với `routes/` | `npm run docs:build` |

---

## 13. Ghi chú và lịch sử thay đổi
- Kiến trúc giữ đúng stack đã thống nhất (React, Node/Express, MySQL/Sequelize, Docker, GitHub Actions) và mở rộng thêm dịch vụ thi đấu.
- Chi tiết bảng/quan hệ dữ liệu ở `DatabaseDesign.md`; chi tiết endpoint ở `APIDesign.md`; thi đấu ở `services/competition-service/docs/`.

| Phiên bản | Ngày | Thay đổi chính |
|---|---|---|
| v1.0 | 19/07/2026 | Bản đầu tiên (3 lớp, một ứng dụng) |
| v1.1 | 15/08/2026 | Đa chi nhánh, kho hàng, đăng nhập bằng SĐT hoặc email |
| v1.2 | 18/10/2026 | Thêm dịch vụ thi đấu và tích hợp (mục 4–5); luồng bán lẻ, đơn online, đặt sân trên web, thông báo (mục 7); kiến trúc bảo mật mới (xoay vòng token, header, chặn mặc định); triển khai Render + Aiven một container và compose có profile; realtime bằng SSE; bảng quyết định kiến trúc (mục 12); cập nhật cấu trúc frontend và danh sách middleware, service |
