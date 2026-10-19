# API Design Specification
## Dự án: Badminton Digital Management – Hệ thống quản lý sân cầu lông

**Phiên bản:** 1.1
**Ngày:** 18/10/2026 (từ v1.0 ngày 19/07/2026 — lịch sử ở mục 22)
**Tài liệu tham chiếu:** `SRS.md`, `UseCase.md`, `DatabaseDesign.md`, `Architecture.md`
**Nguồn đối chiếu:** `backend/src/routes/` (118 operation của app chính) và `/api-docs` khi chạy backend; spec OpenAPI `backend/src/docs/openapi.yaml` được **sinh từ Postman collection** (`npm --prefix backend run docs:build`, không sửa tay) và lệnh này báo lỗi nếu collection lệch với `routes/`. Dịch vụ thi đấu có spec riêng (121 operation) ở `services/competition-service/openapi/`; tài liệu này chỉ mô tả cổng nối tới nó (mục 19).

---

## 0. Những điểm cần biết trước khi đọc

Bản v1.0 mô tả nhóm API gốc. Các điểm sau là thay đổi lớn đã có trong code, mỗi điểm có mục chi tiết bên dưới:

- **Đa chi nhánh.** API có phạm vi chi nhánh nhận header `X-Branch-Id`. `employee`/`branch_manager` bị khoá vào chi nhánh của mình (giá trị khác → 403); `admin` không có chi nhánh gốc và gửi `X-Branch-Id` của bất kỳ chi nhánh đang hoạt động nào để xem/thao tác (`GET /branches`); bỏ trống thì dùng chi nhánh của nhân viên đăng nhập. **Chỉ tài khoản nhân viên được gửi header này**: token của `customer` kèm `X-Branch-Id` → 403; tài khoản `branch_manager`/`employee` chưa có dòng nhân viên (chưa gán chi nhánh) → 403 ở mọi route có phạm vi chi nhánh. Vai trò thứ tư `branch_manager` nằm trong `roleMiddleware([...])` của hầu hết route (mục 1.7).
- **Khách hàng dùng chung toàn chuỗi** (không còn `branchId` trên `Customer`); `Booking`/`CourtSession`/`Invoice`/`Payment` vẫn mang `branchId`. Đăng nhập bằng số điện thoại hoặc email trong một trường `identifier`; khách tự đăng ký (mục 2).
- **Kho hàng** tách thành sổ theo chi nhánh (`suppliers`, `goods-receipts`, `inventory/*` — mục 8); **bán lẻ POS** (`/products`, `/product-categories`, `/sales-orders` — mục 14, 15), **mã giảm giá** (mục 13), **đơn online** (`/my-orders` — mục 12).
- **Tiền.** `POST /payments/checkout` hỗ trợ `Idempotency-Key`. Chuyển khoản (`paymentMethod: "transfer"`) chỉ nhận khi đủ `PAYMENT_BANK_ID`, `PAYMENT_BANK_ACCOUNT_NO`, `PAYMENT_BANK_ACCOUNT_NAME` và `PAYMENT_WEBHOOK_SECRET` (≥ 32 ký tự); thiếu thì checkout sân, POS và đơn online trả 400 và `GET /public/branches` báo `transferEnabled: false`. `POST /payments/webhook` chặn mặc định: không cấu hình secret → 503, thiếu/sai `X-Webhook-Secret` → 401, bắt buộc `amount` là số nguyên đồng khớp giao dịch (mục 9.1).
- **Đặt sân.** Lưới công khai `GET /public/availability/day` (mục 12.1), một nguồn quy tắc thời gian duy nhất `BookingService.checkAvailability` cho mọi nơi (mục 5), khách chỉ đặt trước tối đa 14 ngày và tối đa 3 giờ, chính sách giữ chỗ, thông báo cho khách (mục 18).
- **Phiên đăng nhập.** Refresh token xoay vòng và access token mang `tv` để thu hồi tức thì (mục 1.3).
- **Header bảo mật, `no-store`, giới hạn tần suất** (mục 1.8).
- **Thời gian thực** qua SSE (mục 17), **nhật ký hoạt động** (mục 16), **thi đấu** qua cổng nội bộ (mục 19), **health** (mục 20).

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
- Access Token (JWT): hạn ngắn (15 phút), mang claim `tv` (phiên bản phiên của người dùng).
- Refresh Token: hạn dài (7 ngày). Trả về trong body của `POST /auth/login` (không phải cookie) — client tự lưu (frontend hiện dùng `localStorage`) và gửi lại trong body `{ "refreshToken": "..." }` khi gọi `POST /auth/refresh-token`. Server chỉ lưu sha256 của nó.
- **Xoay vòng:** mỗi lần `POST /auth/refresh-token` thành công trả về **cặp mới** (`accessToken` + `refreshToken`); token cũ còn hiệu lực thêm 30 giây nhưng trong khoảng đó chỉ đổi được lấy access token mới, không nhận refresh token mới — để hai tab hoặc luồng SSE làm mới cùng lúc không đá nhau ra. Cùng lúc chỉ một bên thắng.
- **Thu hồi tức thì:** `authMiddleware` và `sseAuthMiddleware` (hai nơi duy nhất xác minh access token) từ chối token có `tv` lệch `users.token_version`. Đăng xuất, đổi mật khẩu và đặt lại mật khẩu tăng số này nên access token cũ chết ngay. `PUT /auth/change-password` trả cặp token mới cho thiết bị vừa đổi.
- Đăng nhập nhận **số điện thoại hoặc email** trong cùng một field `identifier` (xem §2).
- Frontend (`apiClient`): gặp 401 thì làm mới rồi gọi lại; **chỉ** kết thúc phiên khi máy chủ từ chối làm mới (400/401/403), lỗi mạng hoặc 5xx thì ném lỗi để nơi gọi thử lại.

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
| 409 | Xung đột (VD: trùng lịch; khoá chết hoặc hết thời gian chờ của MySQL cũng trả 409) |
| 429 | Vượt giới hạn tần suất (mục 1.8) |
| 500 | Lỗi hệ thống |
| 502 | Cổng thi đấu: dịch vụ từ chối chữ ký token (`COMPETITION_AUTH_FAILED`) — cố ý không trả 401 để client không tưởng phiên hết hạn |
| 503 | Tính năng tắt hoặc chưa sẵn sàng: webhook chưa cấu hình, `COMPETITION_DISABLED`/`COMPETITION_UNAVAILABLE` |

Lỗi trả về luôn theo khuôn `{ success: false, data: null, message, errors }`; `errors` chỉ gồm `[{ field, message }]` — bộ xử lý lỗi **không bao giờ** trả thẳng `err.errors` của Sequelize (mỗi phần tử mang cả bản ghi trong `instance`). Một số lỗi có thêm trường `code` ở cấp trên cùng (ví dụ `BOOKING_LIMIT`, `BOOKING_WRONG_DAY`).

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

### 1.8 Header, giới hạn tần suất và bộ nhớ đệm

| Hạng mục | Quy ước |
|---|---|
| `X-Request-Id` | Gửi vào hoặc để server sinh UUID; server trả lại trong header phản hồi và ghi vào `activity_logs.request_id` để truy vết |
| `Idempotency-Key` | Tuỳ chọn ở `POST /payments/checkout`; dùng lại đúng khoá khi retry. Khoá không dùng chéo giữa hai đối tượng khác nhau. Bộ gọi thi đấu cũng gắn khoá này cho mọi thao tác ghi |
| `X-Webhook-Secret` | Bắt buộc ở `POST /payments/webhook` |
| `Cache-Control` | Mọi phản hồi `/api/v1` **trừ nhóm `/public/*`** là `no-store`; `GET /public/availability/day` cũng `no-store` |
| Header bảo mật | Mọi phản hồi: `Content-Security-Policy` (`script-src 'self'`; chỉ Google Fonts và `img.vietqr.io` được phép ngoài origin), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, và HSTS 180 ngày khi yêu cầu qua HTTPS. `/api-docs` miễn CSP |
| Giới hạn tần suất (theo IP) | `POST /auth/login`, `/auth/forgot-password` và `/auth/reset-password` cùng ngưỡng 10 lần/15 phút; `POST /auth/register` 5 lần/60 phút; `POST /auth/refresh-token` 30 lần/15 phút; `POST /bookings` của khách 20 lần/10 phút **theo người dùng**; `/api/v1/competition/public/*` 900 yêu cầu/phút/IP (cả quán dùng chung một IP Wi-Fi). Vượt → 429 |
| Số proxy tin cậy | Cấu hình bằng `TRUST_PROXY_HOPS` (mặc định 0; compose 1; Render 3) để giới hạn tần suất đếm đúng IP người dùng |
| CORS | Cùng origin ở cả hai đường triển khai nên production mặc định không cho origin nào khác; chỉ mở bằng `CORS_ORIGIN` |
| Phân trang | Danh sách phân trang dùng `?page=&limit=`; `/notifications` dùng `?limit=&unread=` (không phân trang) |

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

// Response 201 — giống hệt nhau dù số điện thoại đã có hồ sơ tại quầy hay chưa
{
  "success": true,
  "data": {
    "user": { "id": 42, "email": "a@example.com", "fullName": "Nguyễn Văn A", "phone": "0901234567", "avatarUrl": null, "role": "customer" },
    "customerId": 17,
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "eyJhbGciOi..."
  },
  "message": "Tạo tài khoản thành công.",
  "errors": null
}
```
SĐT đã có tài khoản → 409 `"Số điện thoại này đã có tài khoản. Bạn hãy đăng
nhập hoặc dùng chức năng quên mật khẩu."`; email đã dùng cho tài khoản khác →
409 `"Email này đã được dùng cho tài khoản khác."`

Đăng ký **không** tự gắn hồ sơ khách tại quầy trùng số điện thoại — hệ thống chưa
xác minh được người đăng ký là chủ số. Tài khoản luôn nhận một hồ sơ mới
(`customerId`); nếu số đã thuộc một hồ sơ khác thì hồ sơ mới để trống `phone`
(`customers.phone` là unique), và khi khách tự xem hồ sơ của mình (`/auth/me`,
`/customers/:id`, `/customers/:id/history`) API trả số của tài khoản vào chỗ trống.
Nhân viên xác minh khách tại quầy rồi gộp lịch sử bằng
`POST /customers/:id/merge-into-account` (§6).

**POST /auth/refresh-token**
```json
// Request
{ "refreshToken": "eyJhbGciOi..." }
// Response 200
{ "success": true, "data": { "accessToken": "eyJ...", "refreshToken": "eyJ..." }, "message": "...", "errors": null }
```
Trong khoảng ân hạn 30 giây của token cũ, phản hồi chỉ có `accessToken` (không có `refreshToken` mới). Token sai, hết hạn hoặc đã bị xoay quá 30 giây → 401.

**Quy tắc mật khẩu** (đăng ký, đổi, đặt lại, tạo nhân viên, tạo tài khoản khách): 8–72 **byte**, không nằm trong danh sách mật khẩu phổ biến, không bằng hoặc chứa SĐT, phần tên của email hay họ tên của chính người dùng — vi phạm → 400 kèm `errors[].field = "password"`.

**Chống dò tài khoản:** đăng nhập sai (sai tài khoản hay sai mật khẩu) luôn cùng một thông điệp 401 và cùng chi phí tính toán; "tài khoản bị khoá" chỉ nói ra khi mật khẩu đã đúng; `POST /auth/forgot-password` luôn trả cùng một phản hồi 200 cho email có thật lẫn email bịa (kể cả khi chưa cấu hình SMTP).

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
| GET | `/courts` | Admin, BranchManager, Employee | Danh sách sân (kèm trạng thái và phiên đang chơi — họ tên, SĐT khách) — chi nhánh xác định bởi `X-Branch-Id`. Trang khách dùng `/public/courts` |
| GET | `/courts/:id` | Admin, BranchManager, Employee | Chi tiết một sân |
| POST | `/courts` | Admin, BranchManager | Tạo sân mới |
| PUT | `/courts/:id` | Admin, BranchManager | Cập nhật thông tin sân |
| DELETE | `/courts/:id` | Admin, BranchManager | Xóa sân |
| POST | `/courts/:id/open` | Admin, BranchManager, Employee | Mở sân cho khách chơi (UC-06) |
| POST | `/courts/:id/close` | Admin, BranchManager, Employee | Đóng sân & tính tiền (UC-07) |
| PUT | `/courts/:id/status` | Admin, BranchManager, Employee | Đổi vòng đời khai thác: `active` / `maintenance` / `inactive` |
| POST | `/courts/:id/transfer` | Admin, BranchManager, Employee | Chuyển khách sang sân khác (đoạn đã chơi được chốt tiền vào `accrued_court_fee`) |
| PUT | `/courts/layout` | Admin, BranchManager | Lưu sơ đồ mặt bằng sân của chi nhánh. Ghi ra **file** `backend/public/layouts/branch-<id>.json` (không ghi CSDL); trên Render/compose file này nằm trong container nên mất khi deploy lại (compose có volume `layouts_data`). Sơ đồ được trang khách đọc qua `/static/layouts/` |

**POST /courts/:id/open**
```json
// Request
{ "customerId": 12 }   // optional, null nếu khách vãng lai
// Tuỳ chọn mở từ một lịch đặt: { "bookingId": 88, "acknowledgeTimeMismatch": true }
//   - lịch phải là của HÔM NAY theo múi giờ chi nhánh, sai ngày → 400 BOOKING_WRONG_DAY
//   - sớm hơn giờ bắt đầu hơn 60 phút hoặc muộn hơn giờ kết thúc → 409 BOOKING_TIME_MISMATCH
//     cho tới khi gửi lại kèm acknowledgeTimeMismatch: true
//   - số điện thoại khách vãng lai sai định dạng → 400 (rỗng được phép)

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
| GET | `/bookings` | Authenticated (Customer chỉ thấy booking của mình) | Danh sách booking. Tham số: `page`, `limit`, `date` (đúng `YYYY-MM-DD`), `courtId`, `status` (`pending`/`confirmed`/`cancelled`/`completed`), `sort` (`asc` mặc định — danh sách nhân viên không đổi; `/my-bookings` hỏi `desc`). Giá trị sai → 400 |
| GET | `/bookings/:id` | Authenticated (Customer chỉ xem booking của mình, không kèm `creator`) | Chi tiết booking |
| POST | `/bookings` | Admin, BranchManager, Employee, Customer | Tạo booking mới (UC-10). Trạng thái ban đầu `pending`. Chịu các **luật thời gian** bên dưới; vai Customer chỉ đặt trước tối đa 14 ngày |
| PUT | `/bookings/:id` | Admin, BranchManager, Employee | Đổi sân/ngày/giờ — body chỉ nhận `courtId`, `bookingDate`, `startTime`, `endTime`; trường khác → 400 `"Không sửa được các trường: ..."`. Khách muốn đổi thì hủy rồi đặt lại |
| DELETE | `/bookings/:id` | Admin, BranchManager, Employee, Customer (chỉ booking của mình) | Hủy booking |
| PUT | `/bookings/:id/confirm` | Admin, BranchManager, Employee | Xác nhận booking (UC-13) |
| GET | `/bookings/availability` | Authenticated | Kiểm tra khung giờ trống (UC-11) |

**GET /bookings/availability**
```
?courtId=3&bookingDate=2026-07-20&startTime=18:00&endTime=19:00
```
```json
// Response 200
{
  "success": true,
  "data": {
    "available": false,
    "reason": "ALREADY_BOOKED",
    "message": "Khung giờ này đã có người đặt, vui lòng chọn khung giờ khác",
    "conflictBookingId": 88
  }
}
```

`reason` ∈ `COURT_NOT_FOUND | COURT_INACTIVE | COURT_MAINTENANCE | SLOT_PASSED | OUTSIDE_OPERATING_HOURS | ALREADY_BOOKED` (`null` khi `available: true`). Tên tham số ngày là `bookingDate` (không phải `date`). Endpoint công khai `/public/availability` chỉ trả `available` và `message` — **không** có `reason` hay `conflictBookingId`.

**Luật thời gian khi tạo booking** (cùng một nguồn `BookingService.checkAvailability`, nên `/public/availability`, `/bookings/availability` và `POST /bookings` không thể nói khác nhau). Kiểm theo thứ tự:

| # | Điều kiện | Kết quả | Thông điệp |
|---|---|---|---|
| 1 | Sân không thuộc chi nhánh / không có | 404 (`POST`) · `available: false` (kiểm tra) | "Court not found" (`POST`) · "Không tìm thấy sân" (kiểm tra) |
| 2 | Sân ngưng khai thác / đang bảo trì | 400 | "Sân đã ngưng khai thác, không nhận đặt lịch" / "Sân đang bảo trì, không nhận đặt lịch mới cho tới khi hoàn tất" |
| 3 | Khung giờ **đã đóng hẳn** (`endTime` ≤ bây giờ, tính theo múi giờ chi nhánh) | 400 | "Khung giờ này đã qua, vui lòng chọn khung giờ khác" |
| 4 | Khung giờ không nằm trọn trong giờ mở cửa (`operating_hours`, mặc định 05:00–23:00) | 400 | "Quán chỉ nhận đặt sân trong khung 05:00–23:00" |
| 5 | Trùng lịch `pending`/`confirmed` của cùng sân | 409 | "Khung giờ này đã có người đặt, vui lòng chọn khung giờ khác" |
| 6 | **Chỉ vai `customer`** (`POST /bookings`): `bookingDate` sau hôm nay + 13 ngày | 400 | "Chỉ nhận đặt trước tối đa 14 ngày (đến dd/mm/yyyy), vui lòng chọn ngày sớm hơn" |

Ghi chú:
- Khung giờ đã **bắt đầu nhưng chưa kết thúc** vẫn nhận (khách bước vào quầy giữa khung giờ; tiền sân tính theo giờ chơi thực tế). Lưới `/public/availability/day` cố ý chặt hơn một bậc: coi ô đã bắt đầu là `passed`.
- Luật 3 và 4 áp cho **mọi vai** và cả `PUT /bookings/:id`. Luật 6 chỉ áp cho `customer` ở `POST /bookings` (được kiểm **trước** các luật còn lại, ngay sau khi tìm thấy sân) — nhân viên đặt xa hơn cho giải đấu, sự kiện vẫn được.
- Cột "Kết quả" của các dòng 2–5 là mã HTTP của `POST /bookings`; ở `/availability` và `/bookings/availability` cùng lý do được trả dưới dạng `available: false` kèm `message`.
- "Hôm nay" luôn theo lịch của **chi nhánh** (`branches.timezone`), không theo đồng hồ máy chủ.
- Khách (`customer`) đặt tối đa **3 giờ** mỗi lần (`CUSTOMER_MAX_BOOKING_HOURS`); nhân viên không giới hạn.

**Chính sách giữ chỗ** (cài đặt `booking_policy`, hàm thuần `utils/bookingPolicy.js`; mặc định 5 / 24 giờ / 60 phút; `0` là tắt quy tắc):
- Một **khách** chỉ giữ tối đa `maxActivePerCustomer` (5) lịch `pending`/`confirmed` chưa qua giờ kết thúc; vượt → 400 kèm `code: "BOOKING_LIMIT"` (đếm trong giao dịch SERIALIZABLE nên hai request cùng lúc không cùng lọt). Nhân viên được miễn.
- `POST /bookings` của khách bị giới hạn 20 lần/10 phút theo người dùng (429); nhân viên bỏ qua.
- Việc nền mỗi 5 phút (`expireStalePendingBookings`) tự huỷ lịch `pending` **do khách tự đặt** vào lúc `max(tạo + 15 phút, min(tạo + pendingExpiryHours, giờ bắt đầu − pendingExpireBeforeStartMinutes))`, ghi nhật ký `booking.expired` (không có user) và tạo thông báo cho khách. Lịch do nhân viên tạo không bao giờ tự huỷ.

**POST /bookings** (nhân viên) trả thêm `customerMatch { id, fullName, nameDiffers }` (không lưu) khi số điện thoại nhập khớp một khách có sẵn; màn hình nhân viên tra số trước khi lưu bằng `GET /customers?search=`. Số điện thoại khách vãng lai được kiểm tra định dạng (`utils/phone#isValidPhone`): rỗng được phép, `123`/`abc` → 400.

**Thời gian thực:** mọi thay đổi lịch (tạo, sửa, huỷ, xác nhận, mở sân từ lịch, tự huỷ hết hạn) phát `booking:changed { branchId, bookingId, status }` lên luồng SSE (§17).

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
| POST | `/customers/:id/merge-into-account` | Admin, BranchManager, Employee | Gộp hồ sơ tại quầy vào hồ sơ của tài khoản online cùng SĐT, sau khi xác minh khách tại quầy |

`GET /customers` gắn `pendingAccount: { customerId, fullName, registeredAt }` vào hồ sơ
tại quầy (chưa gắn tài khoản, có SĐT) khi số đó đã có tài khoản khách tự đăng ký mà hồ
sơ của tài khoản chưa mang số; các hồ sơ khác có `pendingAccount: null`.

**POST /customers/:id/merge-into-account** — `:id` là hồ sơ tại quầy
```json
// Request
{ "accountCustomerId": 120 }

// Response 200
{
  "success": true,
  "data": {
    "customer": { "id": 120, "userId": 58, "phone": "0925408224", "totalSpent": "5025000.00", "loyaltyTier": "gold", "...": "..." },
    "mergedCustomerId": 34,
    "moved": { "courtSessions": 3, "bookings": 2, "salesOrders": 1 }
  },
  "message": "Đã gộp hồ sơ vào tài khoản",
  "errors": null
}
```
Một transaction: chuyển `court_sessions`/`bookings`/`sales_orders` (kể cả dòng đã xoá
mềm) sang hồ sơ tài khoản, cộng `totalSpent`, tính lại `loyaltyTier`, gỡ số khỏi hồ sơ
cũ rồi gắn sang hồ sơ tài khoản, xoá mềm hồ sơ cũ, ghi nhật ký `customer.merged`.
Điều kiện không khớp (hồ sơ tại quầy không có số, hồ sơ đích không thuộc tài khoản
`customer`, hồ sơ tài khoản đã mang số, số đăng nhập khác số hồ sơ tại quầy) → 400;
hồ sơ tại quầy đã gộp hoặc đã gắn tài khoản → 409; khách gọi → 403.

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
| GET | `/accessories` | Admin, BranchManager, Employee | Danh sách phụ kiện, kèm tồn kho + giá vốn bình quân **của chi nhánh hiện tại** (`X-Branch-Id`) |
| GET | `/accessories/:id` | Admin, BranchManager, Employee | Chi tiết một phụ kiện |
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
| GET | `/inventory/stock-levels` | Admin, BranchManager, Employee | Tồn kho phụ kiện hiện tại theo sản phẩm, của chi nhánh hiện tại |
| GET | `/inventory/product-stock-levels` | Admin, BranchManager, Employee | Tồn kho hàng bán lẻ (theo biến thể) của chi nhánh hiện tại |
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
| GET | `/sessions/:sessionId` | Admin, BranchManager, Employee | Chi tiết phiên chơi; phiên đang chơi kèm `checkoutPreview` |
| POST | `/sessions/:sessionId/extras` | Admin, BranchManager, Employee | Thêm phụ kiện vào phiên chơi đang diễn ra |
| GET | `/sessions/:sessionId/extras` | Admin, BranchManager, Employee | Danh sách phụ kiện đã gọi trong phiên |
| POST | `/sessions/:sessionId/extras/return` | Admin, BranchManager, Employee | Trả lại phụ kiện chưa dùng (mới, từ merge quản lý kho) |

```json
// GET /sessions/:sessionId (phiên đang chơi) — thêm trường:
"checkoutPreview": { "endTime": "2026-09-13T09:30:00.000Z", "durationSeconds": 9000, "courtFee": 150000, "extrasFee": 20000, "totalAmount": 170000 }
// POST /sessions/:sessionId/extras — { extraId, quantity }
// POST /sessions/:sessionId/extras/return — { extraId, returnQuantity }
```
`checkoutPreview` là số tiền nếu thanh toán ngay lúc gọi, tính bằng đúng hàm của
checkout (khung cao điểm theo giờ chi nhánh, cộng các đoạn trước khi đổi sân),
chưa trừ giảm giá. Modal thanh toán ở trang Sân hiện số này rồi gửi lại `endTime`
trong `POST /payments/checkout` để hoá đơn chốt đúng số đó.
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
| POST | `/payments/webhook` | Public — bắt buộc `X-Webhook-Secret` khớp `PAYMENT_WEBHOOK_SECRET` (chưa cấu hình → 503) | Dịch vụ báo có xác nhận tiền chuyển khoản đã về (§9.1) |
| GET | `/invoices/:id` | Authenticated (Customer chỉ xem hóa đơn của mình) | Xem chi tiết hóa đơn |
| GET | `/invoices/:id/export-pdf` | Admin, BranchManager, Employee | Xuất hóa đơn PDF |
| POST | `/invoices/:id/void` | Admin, BranchManager | Huỷ trọn hoá đơn đã thanh toán — body `{ "reason": "..." }` **bắt buộc**. Hoá đơn → `void`, thanh toán → `refunded`, trừ lại `totalSpent` của khách, hoàn kho hàng bán lẻ, ghi nhật ký; lịch đặt vẫn `completed`. Hoá đơn chưa `paid` → 400, đã `void` → 409 |

**POST /payments/checkout** — không còn `discountCode`; giảm giá là số tiền/%
nhân viên nhập trực tiếp tại quầy, không có hệ thống mã giảm giá:
```json
// Request
{
  "sessionId": 501,
  "paymentMethod": "transfer",
  "discountAmount": 10,
  "isDiscountPercent": true,
  "discountReason": "Khách quen, sân có sự cố đèn",
  "endTime": "2026-09-13T09:30:00.000Z"
}
// paymentMethod ∈ ["cash", "transfer"]; transfer chỉ nhận khi đã cấu hình chuyển khoản (không thì 400)
// discountAmount/isDiscountPercent optional (mặc định 0/false); isDiscountPercent chỉ nhận true/false —
//   chuỗi "false" là giảm theo số tiền; giảm theo % tối đa 100
// discountReason: bắt buộc khi có giảm giá tay (tối đa 200 ký tự), thiếu → 400
// endTime optional: mốc checkoutPreview.endTime của GET /sessions/:sessionId — không trước giờ mở sân,
//   không ở tương lai, không cũ quá 10 phút (400)
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

**Giảm giá tay** (checkout sân và `POST /sales-orders/:id/checkout`): số giảm quy
ra đồng nguyên, luôn phải có `discountReason`. Vai trò `employee` bị chặn 403 khi
vượt `discount_policy.employeeMaxPercent` (mặc định 10%, tính trên số còn phải trả —
ở POS là sau khi trừ mã giảm giá); `branch_manager`/`admin` không giới hạn. Dòng
hoá đơn ghi `Giảm giá: <lý do>` và có nhật ký `payment.discount_applied`.

**Tiền sân** tính theo phần giao với khung cao điểm của từng ngày theo giờ chi
nhánh (không chia lát 5 phút), cộng `court_sessions.accrued_court_fee` của các
đoạn trước khi đổi sân, làm tròn 1.000đ một lần.

### 9.1 Webhook xác nhận chuyển khoản

```json
// POST /payments/webhook
// Header: X-Webhook-Secret: <PAYMENT_WEBHOOK_SECRET>
{ "provider": "sepay", "providerReference": "FT26091300123", "invoiceNo": "BD-1-00000009", "amount": 108000, "status": "paid" }
```

| Tình huống | Kết quả |
|---|---|
| Server chưa cấu hình secret (hoặc < 32 ký tự) | 503 |
| Thiếu/sai `X-Webhook-Secret` | 401 (trước cả validation) |
| Thiếu `amount` hoặc không phải số nguyên ≥ 1 | 400 |
| `providerReference` đã xác nhận cho giao dịch khác | 409 + nhật ký `payment.webhook_rejected` (`reference_reused`) |
| Giao dịch đã `paid` | 200, không cộng tiền lần hai (mã giao dịch khác thì thêm nhật ký `already_paid`) |
| Giao dịch `cancelled`/`refunded` | 409 + nhật ký (`payment_not_pending`) |
| `amount` khác số tiền giao dịch | 409 + nhật ký (`amount_mismatch`), giao dịch giữ `pending` |
| Hợp lệ | 200, giao dịch + hoá đơn `paid`, đơn online `open` → `paid`, cộng `totalSpent` |

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
| GET | `/reports/revenue-breakdown` | Admin, BranchManager | Doanh thu tách theo nguồn (tiền sân / phụ kiện trong sân / bán lẻ / giảm giá) từ `invoice_lines`; `?from=&to=`; Admin thêm `compareBranches=true` để so sánh chi nhánh (với `branch_manager` bị ép về `false`). Chỉ có dữ liệu từ 16/08/2026 |
| GET | `/reports/inventory-reconciliation` | Admin, BranchManager | Đối chiếu nhập-bán-tồn: so `stock_movements` với số lượng thật sự xuất hiện trên hoá đơn, lộ `soldDiscrepancy`; `?from=&to=` |

Tham số kỳ `period` ∈ `daily|weekly|monthly|yearly`, `from`/`to` đúng `YYYY-MM-DD` (kiểm ở `validations/reportValidation.js`; sai → 400). Mọi báo cáo gộp theo ngày/giờ của **chi nhánh**, không theo múi giờ máy chủ.

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

Các cài đặt chính sách lưu qua route generic `PUT /settings { "key": ..., "value": ... }` (kiểu dữ liệu được kiểm, chỉ nhận khoá đã biết):

| Khoá | Giá trị | Mặc định |
|---|---|---|
| `discount_policy` | `{ "employeeMaxPercent": 0–100 }` — trần giảm giá tay của `employee` (tính trên số còn phải trả; ở POS là sau khi trừ mã giảm giá) | 10 |
| `booking_policy` | `{ "maxActivePerCustomer", "pendingExpiryHours", "pendingExpireBeforeStartMinutes" }` — xem §5; `0` tắt quy tắc | 5, 24, 60 |
| `notification_policy` | `{ "email": true\|false }` — gửi thêm email cho thông báo | bật |
| `operating_hours` | `{ "open": "05:00", "close": "23:00", ... }` — giờ nhận đặt sân; giá trị hỏng thì rơi về mặc định thay vì chặn toàn bộ | 05:00–23:00 |

Chỉ `discount_policy` có màn hình riêng ở Cài đặt; `booking_policy` và `notification_policy` hiện chỉnh bằng gọi API.

---

## 12. Storefront khách hàng (public catalog & đơn đặt online)

Mặt tiền hướng ra khách gồm hai nhóm: nhóm `/public/*` không cần đăng nhập
(chỉ-đọc, chỉ chứa thông tin quán sẵn sàng dán ngoài cửa) và nhóm `/my-orders`
dành riêng cho vai trò `customer`.

### 12.1 Public catalog

Không đi qua `authMiddleware`. Giá và tồn kho tính theo chi nhánh trong query
`branchId`; bỏ trống thì lấy chi nhánh đang hoạt động đầu tiên.

| Method | Endpoint | Role | Mô tả |
|---|---|---|---|
| GET | `/public/branches` | Public | Danh sách chi nhánh đang hoạt động (id, tên, địa chỉ, `transferEnabled` — có nhận chuyển khoản trước không; số tài khoản không bao giờ lộ ở đây) |
| GET | `/public/courts` | Public | Danh mục sân + bảng giá + khung giờ cao điểm + giờ mở cửa (`operatingHours`) |
| GET | `/public/availability` | Public | Kiểm tra một khung giờ còn trống không → `{ available, message }` (luật ở §5; không trả mã lịch của khách khác) |
| GET | `/public/availability/day` | Public | Lưới sân × giờ của **cả một ngày** cho trang Đặt sân (xem bên dưới) |
| GET | `/public/products` | Public | Catalog bán lẻ đang mở bán (`isActive`, `productType = 'retail'`) |
| GET | `/public/products/:id` | Public | Chi tiết một sản phẩm + tối đa 4 sản phẩm cùng danh mục |

**GET /public/availability/day**

```
?date=2026-10-15&branchId=1
```
```json
// Response 200
{
  "branch": { "id": 1, "name": "Chi nhánh chính" },
  "date": "2026-10-15",
  "today": "2026-10-14",
  "lastBookableDate": "2026-10-27",
  "operatingHours": { "open": "05:00", "close": "23:00" },
  "peakHours": { "peakStartHour": 17, "peakEndHour": 21 },
  "courts": [
    {
      "id": 1, "name": "Sân số 1 (Thường)", "bookable": true, "note": null,
      "peakPricePerHour": 90000, "offpeakPricePerHour": 60000,
      "slots": [
        { "start": "05:00", "end": "06:00", "state": "free",   "peak": false },
        { "start": "18:00", "end": "19:00", "state": "booked", "peak": true }
      ]
    }
  ]
}
```

- `state`: `free` (đặt được), `booked` (đã có lịch `pending`/`confirmed` chạm vào ô), `passed` (ô đã **bắt đầu** — chặt hơn luật nhận đặt của server), `maintenance` (sân đang bảo trì; `bookable: false`). Thứ tự ưu tiên: bảo trì → đã qua → đã kín → trống, giống `BookingService.checkAvailability`.
- Ô dài 60 phút, phủ trọn giờ mở cửa; `peak` là cờ giờ cao điểm, giá một giờ lấy `peakPricePerHour` nếu `peak`, ngược lại `offpeakPricePerHour`.
- Ngày hợp lệ: từ `today` tới `lastBookableDate` (hôm nay + 13, tức 14 ngày, theo lịch chi nhánh). Ngày đã qua hoặc quá dải → 400 tiếng Việt; sai dạng / ngày không có thật → 400 `Validation failed`; chi nhánh không có hoặc ngưng → 404.
- **Không lộ** mã lịch, tên hay số điện thoại khách: truy vấn lịch chỉ lấy ba cột (sân, giờ bắt đầu, giờ kết thúc). Số câu SQL cố định (6) bất kể số sân hay số ô. Phản hồi `Cache-Control: no-store`.

Biến thể trả ra chỉ gồm `id, sku, size, color, price, inStock` — **không** lộ
giá vốn (`averageCost`) hay số tồn chính xác. `inStock` là `true` khi biến thể
không theo dõi tồn kho, hoặc còn tồn tại chi nhánh đang xem.

```json
// GET /public/products/3?branchId=1
{
  "branch": { "id": 1, "name": "Chi nhánh Quận 1" },
  "product": {
    "id": 3, "name": "Áo Yonex Thi Đấu Nam",
    "category": { "id": 2, "name": "Áo thi đấu" },
    "priceFrom": 250000, "priceTo": 280000, "inStock": true,
    "variants": [
      { "id": 3, "sku": "YNX-SHIRT-M-RED", "size": "M", "color": "Đỏ", "price": 250000, "inStock": true }
    ]
  },
  "related": []
}
```

### 12.2 Đơn đặt online của khách (`/my-orders`)

Đơn khách tự đặt trên web dùng chung bảng `sales_orders` với đơn POS tại quầy,
phân biệt bằng `channel = 'online'` (POS là `'pos'`). Route chỉ mở cho vai trò
`customer` và **không** qua `branchContextMiddleware`: chi nhánh nhận hàng do
khách chọn trong payload, không phải chi nhánh công tác của nhân viên.

| Method | Endpoint | Role | Mô tả |
|---|---|---|---|
| GET | `/my-orders` | Customer | Đơn của chính mình (lọc `?status=open\|paid\|cancelled`) |
| POST | `/my-orders` | Customer | Đặt đơn mới — trừ kho ngay để giữ hàng |
| GET | `/my-orders/:id` | Customer | Chi tiết một đơn của chính mình |
| POST | `/my-orders/:id/cancel` | Customer | Huỷ đơn khi còn `status = 'open'` — hoàn kho |

```json
// POST /my-orders
{
  "branchId": 1,
  "items": [{ "variantId": 3, "quantity": 2 }],
  "contactName": "Nguyễn Minh Khôi",
  "contactPhone": "0912345678",
  "customerNote": "Chiều 18h mình qua lấy.",
  "paymentMethod": "transfer"
}
```

Quy ước nghiệp vụ:

- **Giá chốt tại thời điểm đặt**, lấy từ `product_variants.listPrice` phía
  server — giá client gửi lên bị bỏ qua.
- **Trừ kho ngay khi đặt** (`stock_movements` type `sale`), hoàn kho khi huỷ
  (`sale_return`). Không đủ tồn thì cả đơn rollback với HTTP 400.
- `paymentMethod` là `'cash'` (mặc định) hoặc `'transfer'` — xem §12.3 để biết
  hai đường khác nhau thế nào.
- `contact_name` / `contact_phone` / `customer_note` thêm ở migration
  `20260817100001-online-order-contact-fields.js`, chỉ dùng cho đơn online.
- Mọi truy vấn đều lọc kèm `customerId` — đoán đúng mã đơn của người khác vẫn
  trả 404.

Trạng thái đơn nhìn từ phía khách: `open` = "Chờ nhận hàng"/"Chờ thanh toán",
`paid` = "Hoàn thành", `cancelled` = "Đã huỷ". Không có bước vận chuyển nào vì
đây là luồng nhận hàng tại quầy.

### 12.3 Thanh toán cho đơn online — tiền mặt vs chuyển khoản

Hai đường khác hẳn nhau kể từ migration `20260818100001-online-order-payment.js`:

**`paymentMethod: 'cash'`** (mặc định) — giữ nguyên hành vi cũ: đơn `open`
không có invoice, khách trả tiền mặt khi tới quầy, nhân viên chốt bằng
`POST /sales-orders/:id/checkout` như trước giờ.

**`paymentMethod: 'transfer'`** — thanh toán online thật, không cần nhân viên.
Chỉ nhận khi đã cấu hình chuyển khoản (§9); chưa có thì `POST /my-orders` trả 400
và trang đặt hàng ẩn lựa chọn này.
1. `placeOrder` tạo luôn `Invoice(status='issued')` + `Payment(status='pending',
   method='transfer', employeeId=null)` trong cùng transaction với đơn, và đặt
   `sales_orders.payment_deadline_at` = lúc đặt + 30 phút.
2. Response kèm `qrCodeUrl` (ảnh VietQR, `addInfo` = `HOA DON <invoiceNo>` — cùng
   quy ước với POS để webhook khớp được hoá đơn) — cũng có sẵn ở `GET /my-orders`
   và `GET /my-orders/:id`. `qrCodeUrl` là null khi không còn gì để trả hoặc không
   nên trả nữa: cash, đã `paid`, đã `cancelled`, đã quá hạn 30 phút (dù tác vụ quét
   chưa kịp huỷ), hoặc chuyển khoản đã bị tắt.
   Đơn chuyển khoản đang chờ (`open` + `payment_deadline_at`) **giữ một lượt dùng
   mã giảm giá** (`VoucherService.countUsage`): huỷ hoặc hết hạn thì nhả lượt.
3. `POST /payments/webhook` (đã sửa để nhận diện `invoice.salesOrderId`, trước
   đây chỉ xử lý invoice của phiên sân) xác nhận thanh toán → `Payment` và
   `Invoice` chuyển `paid`, `SalesOrder.status` tự chuyển `paid`,
   `Customer.totalSpent` được cộng — **không cần nhân viên thao tác gì**.
4. Không thanh toán trong 30 phút → tác vụ nền `OnlineOrderService
   .expireStalePendingOrders()` (server.js gọi mỗi 5 phút qua `setInterval`)
   tự chuyển đơn `cancelled`, void `Invoice`/`Payment`, hoàn kho — giống hệt
   hành vi khi khách tự bấm huỷ (`POST /my-orders/:id/cancel`), chỉ khác
   người/thứ gọi.
5. Khách vẫn huỷ tay được trong lúc đang chờ chuyển khoản; ngược lại, đơn đã
   `paid` hoặc `cancelled` thì không huỷ được nữa (đã có sẵn từ trước).

**Tiền về sau khi đơn đã huỷ** (hết hạn hoặc khách tự huỷ): huỷ đơn đã chuyển
`Payment` sang `cancelled`, nên webhook tới sau trả 409 và ghi nhật ký
`payment.webhook_rejected` (lý do `payment_not_pending`, kèm số tiền và mã giao
dịch). Hàng đã trả về kệ nên hệ thống không hồi đơn — quầy đọc nhật ký hoạt động
để hoàn tiền thủ công. Chưa có màn hình/cảnh báo riêng cho ca này.

### 12.4 Đơn tại quầy (POS) — huỷ và dọn đơn bỏ dở (đặc tả đầy đủ ở §15)

- `POST /sales-orders/:id/cancel` (nhân viên, đúng chi nhánh): chỉ đơn `channel='pos'`
  đang `open` — hoàn kho mọi dòng và chuyển `cancelled` trong một transaction, nhật
  ký `sales_order.cancelled`. Đơn đã thanh toán/đã huỷ → 400; đơn online hoặc chi
  nhánh khác → 404. Nút "Huỷ giỏ" ở màn Bán lẻ gọi route này.
- Đơn POS `open` không đổi gì quá 6 giờ (cả đơn lẫn dòng hàng mới nhất) được job
  5 phút trong `server.js` tự huỷ + hoàn kho, nhật ký `sales_order.abandoned_released`.
- Màn Bán lẻ nhớ id đơn đang mở theo chi nhánh trong `sessionStorage`: đổi tab
  hay F5 không làm mất giỏ (và không bỏ lại hàng đã trừ kho).

---

## 13. Voucher API (mã giảm giá)

Mã giảm giá dùng chung cho **POS** và **đơn online** (không dùng cho tiền sân). Chỉ `admin`, `branch_manager` quản lý; không có bảng "lượt đã dùng" — số lượt đếm bằng `COUNT` trên `sales_orders.voucher_id` (đơn `paid` cộng đơn chuyển khoản đang chờ trả), nên huỷ hoặc hết hạn một đơn tự nhả lại một lượt.

| Method | Endpoint | Role | Mô tả |
|---|---|---|---|
| GET | `/vouchers` | Admin, BranchManager | Danh sách voucher |
| GET | `/vouchers/:id` | Admin, BranchManager | Chi tiết |
| POST | `/vouchers` | Admin, BranchManager | Tạo voucher |
| PUT | `/vouchers/:id` | Admin, BranchManager | Cập nhật |
| POST | `/vouchers/preview` | Admin, BranchManager | Tính thử mức giảm cho một giá trị đơn, **không tiêu lượt dùng** |
| POST | `/vouchers/:id/deactivate` | Admin, BranchManager | Ngừng áp dụng |

```json
// POST /vouchers
{ "code": "KHAITRUONG10", "description": "Giảm 10% tối đa 50k", "discountType": "percent", "discountValue": 10,
  "maxDiscountAmount": 50000, "minOrderAmount": 100000, "startsAt": null, "endsAt": null,
  "usageLimit": 100, "perCustomerLimit": 1, "isActive": true }
// POST /vouchers/preview
{ "code": "KHAITRUONG10", "orderAmount": 500000 }
```
`discountType` ∈ `percent`, `flat`. Mã được chuẩn hoá về chữ hoa. Mức giảm không bao giờ vượt tổng đơn (đơn 50k với voucher cố định 100k chỉ giảm 50k) và được làm tròn về đồng nguyên. Mã hết hạn, hết lượt, chưa chạm `minOrderAmount` hoặc đã ngừng → 400 kèm lý do (ví dụ "Mã giảm giá này đã ngừng áp dụng").

---

## 14. Product & Product Category API (hàng bán lẻ)

Danh mục dùng chung toàn chuỗi; tồn kho theo chi nhánh (`/inventory/product-stock-levels`, §8.4).

| Method | Endpoint | Role | Mô tả |
|---|---|---|---|
| GET | `/product-categories` | Admin, BranchManager, Employee | Danh sách nhóm hàng |
| POST | `/product-categories` | Admin, BranchManager | Tạo nhóm hàng (`name`, `sortOrder`) |
| PUT | `/product-categories/:id` | Admin, BranchManager | Cập nhật |
| DELETE | `/product-categories/:id` | Admin, BranchManager | Xoá |
| GET | `/products` | Admin, BranchManager, Employee | Danh sách sản phẩm kèm biến thể và tồn kho của chi nhánh hiện tại |
| GET | `/products/:id` | Admin, BranchManager, Employee | Chi tiết |
| POST | `/products` | Admin, BranchManager | Tạo sản phẩm kèm các biến thể |
| PUT | `/products/:id` | Admin, BranchManager | Cập nhật (`isActive` để ngừng bán) |
| POST | `/products/:id/variants` | Admin, BranchManager | Thêm biến thể |
| PUT | `/products/variants/:variantId` | Admin, BranchManager | Cập nhật biến thể |

```json
// POST /products
{ "name": "Áo Yonex Thi Đấu Nam", "categoryId": 2, "productType": "retail",
  "variants": [ { "sku": "YNX-SHIRT-M-RED", "listPrice": 250000, "size": "M", "color": "Đỏ" } ] }
```
`productType` ∈ `retail`, `consumable`, `rental`, `service`. `sku` unique toàn hệ thống. Biến thể có `trackInventory` (mặc định true) và `lowStockThreshold` (mặc định 5). Trang khách chỉ thấy sản phẩm `retail` đang mở bán qua `/public/products` (§12.1). **Các route vận hành `GET /products`, `/accessories`, `/courts`, `/product-categories` chỉ dành cho nhân viên**; trang khách dùng `/public/*`.

---

## 15. Sales Order API (bán lẻ POS)

Toàn nhóm yêu cầu `admin`, `branch_manager`, `employee` và đúng chi nhánh (`branchContextMiddleware`). Đơn do POS có `channel = 'pos'`.

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/sales-orders` | Danh sách đơn của chi nhánh |
| POST | `/sales-orders` | Tạo đơn rỗng `open` — body `{ "customerId": null }` (mặc định không gắn khách) |
| GET | `/sales-orders/:id` | Chi tiết đơn kèm các dòng |
| POST | `/sales-orders/:id/lines` | Thêm dòng `{ variantId, quantity }` — **trừ kho ngay**. Phản hồi là **cả đơn**, id của dòng nằm ở `data.lines[...]` (`data.id` là id đơn) |
| DELETE | `/sales-orders/:id/lines/:lineId` | Xoá dòng — hoàn kho |
| POST | `/sales-orders/:id/voucher` | Áp mã giảm giá `{ voucherCode }` |
| POST | `/sales-orders/:id/checkout` | Thanh toán |
| POST | `/sales-orders/:id/cancel` | Huỷ đơn `open` của POS — hoàn kho mọi dòng, nhật ký `sales_order.cancelled` |

```json
// POST /sales-orders/:id/checkout
{ "paymentMethod": "cash", "discountAmount": 0, "discountReason": "..." }
```
`paymentMethod` ∈ `cash`, `transfer` (`transfer` chỉ khi đã cấu hình chuyển khoản, nếu không → 400). Checkout trừ kho (đã trừ từ lúc thêm dòng), sinh hoá đơn nhiều dòng và thanh toán, cộng `totalSpent` cho khách **nếu đơn có gắn khách**. Giảm giá tay `discountAmount` > 0 phải kèm `discountReason` (tối đa 200 ký tự); `employee` vượt `discount_policy.employeeMaxPercent` → 403. Không đủ tồn khi thêm dòng → 400 "Không đủ tồn kho tại chi nhánh này. Hiện có: {N}"; thêm dòng vào đơn đã `paid` → 400. Huỷ đơn đã thanh toán → 400; đơn online hoặc của chi nhánh khác → 404. Đơn POS `open` không đổi gì quá 6 giờ bị tự huỷ và hoàn kho (§12.4).

---

## 16. Activity Log API

| Method | Endpoint | Role | Mô tả |
|---|---|---|---|
| GET | `/activity-logs` | Admin, BranchManager | Nhật ký của chi nhánh hiện tại, mới nhất trước. Tham số: `page`, `limit`, `action`, `targetType`, `from`, `to` (`YYYY-MM-DD`, cắt theo giờ chi nhánh). Thiếu chi nhánh → 400 |
| GET | `/employees/:id/activity-logs` | Admin, BranchManager | Nhật ký của một nhân viên (§7) |

Mỗi dòng gồm `action` (ví dụ `OPEN_COURT`, `booking.cancelled`, `booking.expired`, `payment.discount_applied`, `payment.webhook_rejected`, `customer.merged`, `sales_order.cancelled`, `sales_order.abandoned_released`), `targetType`/`targetId`, `oldValues`/`newValues`, `requestId`, người thực hiện. Nhật ký không bao giờ chứa mật khẩu hay token.

---

## 17. Realtime (SSE)

| Method | Endpoint | Role | Mô tả |
|---|---|---|---|
| GET | `/realtime/stream?branchId=&token=` | Tài khoản nhân viên (cần có chi nhánh; token của khách không có ngữ cảnh chi nhánh nên không dùng được) | Mở luồng Server-Sent Events của một chi nhánh |

`EventSource` của trình duyệt không đặt được header tuỳ ý nên **access token và `branchId` đi qua query string** (`branchId` được ánh xạ sang `X-Branch-Id` ở tầng route; `sseAuthMiddleware` xác minh `tv` như `authMiddleware`). Sự kiện:

| Sự kiện | Dữ liệu | Khi nào |
|---|---|---|
| `court:updated` | `{ branchId, courtId }` | Mở, đóng, chuyển sân, đổi trạng thái |
| `booking:changed` | `{ branchId, bookingId, status }` | Mọi thay đổi lịch đặt (§5) |
| `ping` | `{}` | Mỗi 25 giây, để client biết kết nối còn sống |

Sự kiện chỉ mang **tín hiệu vô hiệu hoá** (kèm mã chi nhánh/đối tượng), không mang trạng thái hay dữ liệu cá nhân; client nạp lại dữ liệu qua REST (nguyên tắc chốt ở `CourtStateModel.md`). Client (`realtimeClient.js`) làm mới token trước mỗi lần (nối lại), lùi dần 2 → 30 giây, coi 60 giây không có `ping` là đứt kết nối, và gọi `onReconnect` để trang nạp lại. Khách không có luồng này (không có chi nhánh); trang khách thăm dò thông báo mỗi 60 giây (§18).

---

## 18. Notification API (thông báo cho khách)

Chỉ vai `customer`, chỉ đọc/sửa thông báo của chính mình (id của người khác → 404), không qua `branchContextMiddleware`.

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/notifications?limit=&unread=` | Mới nhất trước, kèm `unreadCount` (chưa đọc, tính cả khi lọc) |
| PUT | `/notifications/:id/read` | Đánh dấu một thông báo đã đọc |
| PUT | `/notifications/read-all` | Đánh dấu tất cả đã đọc |

```json
// GET /notifications
{ "success": true, "data": { "items": [
  { "id": 12, "type": "booking.confirmed", "title": "Lịch đặt sân đã được xác nhận",
    "body": "Sân số 1 · 16/10/2026 · 19:00–20:00 đã được cửa hàng xác nhận. Hẹn gặp bạn tại sân!",
    "bookingId": 88, "readAt": null, "createdAt": "2026-10-15T09:00:00.000Z" } ],
  "unreadCount": 1 }, "message": "OK", "errors": null }
```
`type` ∈ `booking.confirmed`, `booking.expired`, `booking.cancelled_by_staff`, `booking.rescheduled`. Thông báo được ghi **trong cùng giao dịch** với thay đổi lịch, chỉ cho khách có tài khoản, và khách tự huỷ lịch của mình thì không có thông báo. Nội dung chỉ có tên sân, ngày, giờ. Email là phần bổ sung gửi sau khi giao dịch hoàn tất (chỉ khi đã cấu hình SMTP, khách có email và `notification_policy.email` chưa tắt; lỗi gửi bị nuốt). Việc nền xoá thông báo đã đọc quá 30 ngày và mọi thông báo quá 90 ngày.

---

## 19. Cổng thi đấu (`/api/v1/competition/*`)

Backend không phơi API thi đấu trực tiếp mà **chuyển tiếp** tới `services/competition-service` qua cổng (`backend/src/integrations/competition/gateway.js`). Danh sách endpoint đầy đủ của dịch vụ (121 operation) ở `services/competition-service/openapi/competition-service.v1.yaml` và `docs/02-hop-dong-api-va-su-kien.md`; phần này chỉ nêu hợp đồng của cổng.

**Bật/tắt.** Tắt trừ khi đặt đủ năm biến `COMPETITION_*`. Không đặt biến nào → mọi route trả 503 `COMPETITION_DISABLED`; đặt thiếu hoặc khoá/secret sai → server **không khởi động**. `GET /competition/status` (công khai) trả `{ enabled, available }` để frontend ẩn menu khi tắt và hiện "tạm ngưng" khi bộ ngắt mạch mở.

**Luồng một yêu cầu.** (1) Xác thực JWT thường của người dùng (route SSE nhận `?token=`; route công khai chấp nhận người chưa đăng nhập) → (2) `branchContextMiddleware` → (3) ký lại một **token dịch vụ ES256 riêng cho từng yêu cầu** (sống 60 giây, 300 giây với SSE) mang quyền bị cắt theo vai trò và `org` theo chi nhánh đang chọn (admin không chọn chi nhánh → `*`; khách mang `player = bd:customer:<id>`) → (4) chuyển tiếp. Dịch vụ tự kiểm quyền từng route lần nữa.

**Danh sách cho phép** (`routeMap.js`): chỉ các tài nguyên `me`, `players`, `rubrics`, `assessments`, `leaderboards`, `matchmaking`, `matches`, `tournaments`, `sessions`, `public` với các method `GET/POST/PUT/PATCH/DELETE`; `events`, `ops`, mọi đường có đoạn `ai`, đường chứa `..` hay ký tự mã hoá để lách, đều bị chặn tại cổng (404). `/public/*` chỉ `GET`.

| Vai trò | Trần quyền cấp vào token (không bao giờ có `ops:admin`) |
|---|---|
| Chưa đăng nhập | `ranking:read`, `public:read` |
| `customer` | `rating:self`, `ranking:read`, `match:score`, `public:read`, `entry:self` (tự đăng ký/rút giải, đăng ký buổi giao lưu, tìm đồng đội) |
| `employee` | đọc/chấm trình, ghi người chơi, vận hành giải và buổi giao lưu, `public:read` |
| `branch_manager`, `admin` | như `employee` cộng chấm trình mọi người, chỉnh điểm, quản lý giải |

**Mã lỗi riêng của cổng:** 503 `COMPETITION_DISABLED` (tắt), 503 `COMPETITION_UNAVAILABLE` (dịch vụ chưa dậy hoặc bộ ngắt mạch mở), 502 `COMPETITION_AUTH_FAILED` (dịch vụ từ chối chữ ký — cố ý không chuyển 401 vì `apiClient` sẽ tưởng phiên hết hạn). **Giới hạn riêng cho `/public`:** 900 yêu cầu/phút/IP; tối đa 40 luồng SSE công khai mỗi IP và 300 luồng tổng (`streamGuard.js`).

**Quy ước từ dịch vụ** (frontend `competitionApi.js` xử lý): thao tác ghi kèm `Idempotency-Key`, ghi có điều kiện bằng `If-Match`/`ETag`, thông điệp lỗi tiếng Anh được dịch sang tiếng Việt ở frontend.

**Sự kiện hai chiều (không phải HTTP của người dùng):** app chính → dịch vụ: `bd.customer.updated|merged|deleted` qua bảng `integration_outbox`, ký HMAC. Dịch vụ → app chính: `POST /api/v1/integrations/competition/events` (router này được gắn **trước** `express.json()` toàn cục để kiểm chữ ký trên đúng byte thô; chặn mặc định: chưa cấu hình 503, sai chữ ký 401; chống trùng bằng `integration_inbox`) nhận `competition.*` (giải chốt/huỷ chốt/huỷ, buổi đóng) rồi ghi thành dòng nhật ký hoạt động.

**Chính sách riêng tư của dịch vụ.** Người chưa đăng nhập chỉ thấy hồ sơ để chế độ `public` (tên ngắn); khách đăng nhập thấy tên đầy đủ trừ hồ sơ `hidden`; chủ hồ sơ, người tham gia và nhân viên thấy tất cả; người bị che hiện dạng `{ "id": null, "name": "Thành viên A3F2", "masked": true }`. Schema công khai đóng kín (`additionalProperties: false`) nên rò thêm một trường là test đỏ.

---

## 20. Health

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/health` | Liveness cho Render/compose: `{ status, time, version }`; `version` là 7 ký tự đầu của commit đang chạy (hoặc `dev`) |
| GET | `/api/v1/health` | Như trên kèm `ip` (IP backend thấy) để kiểm `TRUST_PROXY_HOPS` |

---

## 21. Xử lý lỗi đặc thù theo nghiệp vụ

| Trường hợp | HTTP Code | Message mẫu |
|---|---|---|
| Trùng lịch khi tạo booking | 409 | "Khung giờ này đã có người đặt, vui lòng chọn khung giờ khác" |
| Đặt khung giờ đã đóng hẳn (đã qua) | 400 | "Khung giờ này đã qua, vui lòng chọn khung giờ khác" |
| Đặt ngoài giờ mở cửa | 400 | "Quán chỉ nhận đặt sân trong khung 05:00–23:00" |
| Khách (`customer`) đặt xa hơn 14 ngày | 400 | "Chỉ nhận đặt trước tối đa 14 ngày (đến 27/10/2026), vui lòng chọn ngày sớm hơn" |
| `GET /public/availability/day` với ngày đã qua | 400 | "Ngày này đã qua, vui lòng chọn từ hôm nay trở đi" |
| `GET /public/availability/day` với ngày quá dải 14 ngày | 400 | "Chỉ nhận xem và đặt trước tối đa 14 ngày, vui lòng chọn ngày sớm hơn" |
| Mở sân đang bảo trì | 400 | "Sân đang bảo trì, không thể mở" |
| Đóng sân chưa mở | 400 | "Sân chưa có phiên chơi nào đang diễn ra" |
| Không đủ tồn kho (gọi phụ kiện / nhập kho / điều chỉnh) | 400 | "Không đủ tồn kho tại chi nhánh này. Hiện có: {N}" |
| Nhân viên gửi `X-Branch-Id` khác chi nhánh của mình | 403 | "Nhân viên không được phép thao tác tại chi nhánh này." |
| Tài khoản khách gửi `X-Branch-Id` | 403 | "Chỉ tài khoản nhân viên được chọn chi nhánh." |
| `branch_manager`/`employee` không có dòng Employee (chưa gán chi nhánh) | 403 | "Tài khoản nhân viên chưa được gán chi nhánh." |
| `PUT /bookings/:id` gửi trường ngoài sân/ngày/giờ | 400 | "Không sửa được các trường: branchId, createdBy" |
| `DELETE /customers/:id` với hồ sơ đang gắn tài khoản đăng nhập | 409 | "Hồ sơ này đang gắn với tài khoản đăng nhập của khách nên không xoá được." |
| Huỷ đơn POS đã thanh toán | 400 | "Đơn hàng ở trạng thái 'paid', không huỷ được" |
| Không đủ quyền (VD: Employee gọi API Admin) | 403 | "Bạn không có quyền thực hiện thao tác này" |
| Token hết hạn, hoặc đã bị thu hồi (đăng xuất, đổi mật khẩu) | 401 | "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại" |
| Khách đang giữ đủ 5 lịch chưa kết thúc | 400 (`code: BOOKING_LIMIT`) | Thông điệp tiếng Việt nêu giới hạn |
| Khách đặt quá 3 giờ một lần | 400 | Thông điệp nêu tối đa 3 giờ |
| Quá giới hạn tần suất (đăng nhập, đăng ký, đặt lịch…) | 429 | Thông điệp tiếng Việt, kèm `RateLimit-*` |
| Mở sân từ lịch của ngày khác | 400 (`code: BOOKING_WRONG_DAY`) | |
| Mở sân từ lịch quá lệch giờ khi chưa xác nhận | 409 (`code: BOOKING_TIME_MISMATCH`) | Gửi lại kèm `acknowledgeTimeMismatch: true` |
| Mật khẩu vi phạm chính sách | 400 | `errors[].field = "password"` |
| Chuyển khoản khi chưa cấu hình ngân hàng/webhook | 400 | |
| Webhook thanh toán chưa cấu hình / sai secret / số tiền lệch | 503 / 401 / 409 | Xem §9.1 |
| Giảm giá tay vượt trần của nhân viên | 403 | |
| Huỷ hoá đơn chưa thanh toán / đã huỷ | 400 / 409 | |
| Thi đấu tắt / chưa sẵn sàng / dịch vụ từ chối chữ ký | 503 `COMPETITION_DISABLED` / 503 `COMPETITION_UNAVAILABLE` / 502 `COMPETITION_AUTH_FAILED` | |

---

## 22. Ghi chú triển khai và lịch sử thay đổi
- Toàn bộ endpoint (trừ nhóm Auth/Public/`payments/webhook`/`health`) đều yêu cầu middleware xác thực JWT + middleware kiểm tra Role.
- Spec OpenAPI đã có và được **sinh tự động** từ Postman collection (`postman/badminton_api_collection.json`, 131 request / 25 nhóm, trong đó nhóm "24 · Competition" không vào spec) bằng `npm --prefix backend run docs:build`; Swagger UI ở `/api-docs` (tắt mặc định ở production, bật bằng `ENABLE_API_DOCS=true`). Muốn thêm route mới phải thêm vào collection trước, nếu không lệnh sinh spec báo lỗi.
- Mọi ghi chú rải rác ở đầu bản v1.0 ("Phase 1 production-safety", "Multi-branch & inventory", "Booking page additions") đã được gộp vào mục 0 và các mục tương ứng.

| Phiên bản | Ngày | Thay đổi chính |
|---|---|---|
| v1.0 | 19/07/2026 | Bản đầu tiên |
| v1.1 | 18/10/2026 | Gộp các ghi chú bổ sung vào cấu trúc chính; thêm mục 0 (tóm tắt thay đổi), 1.8 (header, giới hạn tần suất, cache), mục 13 (Voucher), 14 (Product), 15 (Sales Order/POS), 16 (Activity Log), 17 (Realtime SSE), 18 (Notification), 19 (cổng thi đấu), 20 (Health); cập nhật xác thực (xoay vòng, thu hồi), chính sách giữ chỗ và quy tắc đặt sân, void hoá đơn, báo cáo doanh thu chi tiết và đối chiếu kho, `PUT /courts/layout`, `/inventory/product-stock-levels`, các khoá cài đặt chính sách; sửa số thứ tự mục lỗi (13→21) |
- Endpoint `checkout`, `open/close` court, nhập kho (`goods-receipts`) và điều chỉnh tồn kho (`inventory/adjustments`) đều dùng Sequelize transaction + row lock để tránh lệch dữ liệu khi có nhiều request đồng thời.
