# Kế hoạch: đóng các chỗ lộ dữ liệu khách và ghi đè dữ liệu (nhóm sửa 3/6)

- **Nhánh:** `fix/customer-data-exposure`, tách từ `main` @ `8b45c89`. Nhánh nhóm 2
  (`fix/payment-money-flows`, commit `085996f`) chưa merge nên không có trong nhánh này; hai nhánh
  chỉ cùng sửa tài liệu tiến độ và vài dòng `CLAUDE.md`/`APIDesign.md`.
- **Ngày:** 13/09/2026
- **Bối cảnh:** nhóm thứ ba trong thứ tự sửa của đợt kiểm tra trước deploy 12/09/2026, gồm 4 phát
  hiện `SEC-03`, `SEC-04`, `SEC-05`, `SEC-10`. Mục tiêu của nhánh:
  - tài khoản khách chỉ đọc được dữ liệu của chính mình, không đọc được dữ liệu vận hành của quán;
  - không ai ghi được vào trường ngoài phạm vi khi sửa lịch đặt;
  - biết số điện thoại của một khách quen không đủ để nhận hồ sơ và lịch sử của họ.

---

## 0. Lỗi và đường khai thác (đã đọc lại code trên `main` ngày 13/09)

| Mã | Lỗi | Đường khai thác | Vị trí |
|---|---|---|---|
| SEC-03 | `GET /courts` và `/courts/:id` chỉ cần đăng nhập. Tài khoản khách không có dòng Employee nên `branchContextMiddleware` bỏ qua kiểm tra header: gửi `X-Branch-Id` nào cũng được nhận, không gửi thì `branchId` rỗng và `getAllCourts(null)` trả mọi chi nhánh. Phiên đang chơi kèm `customer.fullName` + `customer.phone` | Tự đăng ký tài khoản → `GET /api/v1/courts` → ai đang chơi sân nào, kèm số điện thoại, ở mọi chi nhánh, theo thời gian thực | `routes/courtRoutes.js:18,21`, `middleware/branchContextMiddleware.js:12-23`, `services/CourtService.js:83-123` |
| SEC-04 | Validator của `PUT /bookings/:id` chỉ chặn `status`; `updateBooking` gọi `booking.update(data)` với nguyên body. Route mở cho cả `customer` | Gửi `{"branchId":2}` → lịch biến khỏi chi nhánh 1, khung giờ đó đặt trùng được. `{"createdBy":1}` giả mạo người tạo. Khách dời lịch đã `confirmed` sang giờ khác mà vẫn giữ `confirmed` | `routes/bookingRoutes.js:20`, `validations/bookingValidation.js:24-35`, `services/BookingService.js:262` |
| SEC-05 | `register` tìm hồ sơ khách cùng số chưa gắn tài khoản rồi gắn luôn vào tài khoản mới, ghi đè họ tên, không xác minh gì; response trả `mergedHistory: true` | Biết số của một khách quen → đăng ký → trang Tài khoản hiện tổng chi tiêu, hạng, từng buổi chơi kèm hoá đơn; trang Lịch đặt hiện lịch nhân viên tạo. Các lần quầy nhập số đó sau này (`resolveWalkIn`) cũng rơi vào tài khoản kẻ gian. Chủ số thật đăng ký thì nhận 409 | `services/AuthService.js:312-338`, `controllers/authController.js:12-14`, `services/CustomerService.js:138-156`, `pages/Account/AccountPage.jsx:165-187` |
| SEC-10 | `GET /accessories`, `/accessories/:id` không giới hạn vai trò, trả `averageCost` (giá vốn) và `stockQuantity` theo chi nhánh trong header. `GET /products`, `/products/:id`, `/product-categories` cũng mở cho mọi tài khoản | Khách gọi `GET /api/v1/accessories` với `X-Branch-Id` lần lượt 1..N → giá vốn và tồn kho toàn chuỗi | `routes/accessoryRoutes.js:16-17`, `services/AccessoryService.js:8-30`, `routes/productRoutes.js:18-19`, `routes/productCategoryRoutes.js:11` |

**Tình trạng DB dev hôm nay** (truy vấn chỉ đọc):
- **Hồ sơ khách:** 80 hồ sơ vãng lai, 32 có số điện thoại, **28 trong số đó có lịch sử** (buổi chơi, lịch
  đặt hoặc đơn bán lẻ) — nhận được hết bằng cách đăng ký đúng số. 18 tài khoản khách; 5 hồ sơ đã gắn tài
  khoản có lịch sử tại quầy, không phân biệt được gắn thật hay giả.
- **Phiên chơi:** 32 buổi gắn khách có số điện thoại; lúc truy vấn không có phiên nào đang chơi.
- **Lịch đặt:** 40 lịch (3 `pending`, 2 `confirmed`, 35 `cancelled`), 17 do khách tự tạo; nhật ký có
  12 lần `booking.updated`.
- **Kho:** 8 dòng tồn kho phụ kiện có giá vốn.
- **Nhân viên:** không có tài khoản nhân viên nào thiếu dòng Employee.

**Giao diện đang dùng các route này thế nào** (đã grep `frontend/src`):
- `/courts`, `/accessories`, `/products`, `/product-categories` chỉ được gọi từ màn hình nhân viên
  (Sân, Lịch đặt, Dashboard, Sơ đồ sân, Phụ kiện & kho, Bán lẻ). Trang khách dùng `/public/*`.
- `apiClient` chỉ gửi `X-Branch-Id` khi admin chọn chi nhánh ở bộ chuyển chi nhánh.
- Không trang khách nào gọi `PUT /bookings/:id`: trang "Lịch của tôi" chỉ xem và huỷ.
- Form "Cập nhật lịch" của nhân viên gửi `customerName`/`customerPhone`, nhưng backend bỏ qua hai trường
  này — hai ô đó hiện không có tác dụng khi sửa lịch.

---

## 1. Câu hỏi cần chủ dự án chốt trước khi code

Mỗi câu có đề xuất sẵn — bác nếu không đồng ý.

**Q1. Khách tự đăng ký bằng số đã có hồ sơ tại quầy thì xử lý thế nào?** (SEC-05)
Chưa có dịch vụ gửi SMS nên hệ thống không tự xác minh được ai là chủ số.
- **Đề xuất — A. Không tự gộp; nhân viên gộp tại quầy sau khi xác minh:**
  - Đăng ký vẫn thành công ngay, đặt sân và đặt hàng online được như thường, nhưng tài khoản nhận một hồ
    sơ **mới, riêng**. Hồ sơ cũ giữ nguyên tên và lịch sử, quầy vẫn nhận ra khách bằng hồ sơ cũ.
  - Response đăng ký giống hệt nhau dù số đó có hồ sơ cũ hay không (bỏ `mergedHistory`), nên đăng ký không
    còn cho biết số đó từng ra sân.
  - Màn Khách hàng hiện nút **"Gộp vào tài khoản"** trên hồ sơ cũ khi có tài khoản online trùng số. Nhân
    viên xác minh khách (ví dụ khách mở app đã đăng nhập, gọi thử vào số) rồi bấm: lịch sử, tổng chi tiêu,
    hạng và số điện thoại chuyển sang hồ sơ tài khoản, có nhật ký.
  - **Còn hở:** kẻ gian đăng ký trước bằng số **chưa từng ra quầy**. Hồ sơ tài khoản mang luôn số đó,
    nên lần đầu chủ số ra quầy sẽ rơi vào tài khoản kẻ gian. Chặn nốt ca này thì chọn B hoặc C.
- **B. Chặt hơn:** mọi tài khoản tự đăng ký đều chưa mang số điện thoại cho tới khi nhân viên xác minh.
  Kín cả ca trên, nhưng khách đăng ký online rồi ra quầy lần đầu luôn phải nhờ gộp.
- **C. Xác minh bằng OTP SMS:** chặn tận gốc, nhưng phải chọn nhà cung cấp và trả phí mỗi tin; để sau.
- **D. Tối giản:** chỉ bỏ gộp tự động, không làm nút gộp — lịch sử cũ ở lại hồ sơ vãng lai vĩnh viễn.
- **5 hồ sơ đã gắn trước đây:** giữ nguyên, không tách lại (không có dữ liệu để biết gắn đúng hay sai).

**Q2. Ai được bấm gộp hồ sơ?** (nếu Q1 chọn A hoặc B)
- **Đề xuất:** mọi nhân viên (`employee`, `branch_manager`, `admin`), vì việc xác minh diễn ra tại quầy.
  Mỗi lần gộp ghi nhật ký `customer.merged` (người làm, hai hồ sơ, số dòng đã chuyển) để quản lý xem lại.
- Nếu muốn chặt hơn: chỉ `branch_manager`/`admin`.

**Q3. Khách có được tự sửa lịch đặt qua API không?** (SEC-04)
- **Đề xuất:** **không** — bỏ `customer` khỏi `PUT /bookings/:id`, khách muốn đổi thì huỷ và đặt lại (đúng
  như giao diện đang làm). Giữ đường này thì phải thêm luật cho một chức năng không màn hình nào dùng:
  chỉ sửa lịch `pending`, lịch `confirmed` bị sửa phải về `pending`.
- **Nhân viên sửa lịch:** chỉ đổi được sân, ngày, giờ bắt đầu, giờ kết thúc. Gửi trường khác → 400 nêu tên
  trường. Hai ô khách hàng trên form sửa bị khoá (hiện bấm lưu cũng không đổi gì); muốn đổi khách thì huỷ
  lịch và tạo lịch mới.

**Q4. Có làm kèm hai việc nhỏ cùng chỗ sửa không?**
- **(a) `SEC-11`:** tài khoản `branch_manager`/`employee` không có dòng Employee đang được coi là "mọi chi
  nhánh". Sửa nằm đúng trong `branchContextMiddleware` mà nhánh này đã sửa: trả 403. DB dev hiện 0 trường
  hợp.
- **(b) Phần dành cho khách của `SEC-14`:**
  - chi tiết lịch đặt đang trả email nhân viên tạo lịch cho khách;
  - khách mở được luồng realtime `/realtime/stream` của chi nhánh bất kỳ (tự hết khi middleware chặn
    `X-Branch-Id` của khách).
- **Đề xuất:** làm cả hai. Phần còn lại của `SEC-14` (phụ kiện trong phiên không lọc chi nhánh, idempotency
  checkout, `compareBranches`) để sau.

---

## 2. Thiết kế (theo các đề xuất ở mục 1)

### 2.1 Tài khoản khách không đọc được dữ liệu vận hành — SEC-03, SEC-10, kèm SEC-11 và SEC-14 (Q4)

- **Giới hạn vai trò nhân viên** (`admin`, `branch_manager`, `employee`) cho các route đọc:
  - `GET /courts`, `GET /courts/:id`;
  - `GET /accessories`, `GET /accessories/:id`;
  - `GET /products`, `GET /products/:id`, `GET /product-categories`.
  Khách đã có `/public/courts`, `/public/products` cho trang chủ và cửa hàng.
- **`branchContextMiddleware`:**
  - vai trò không phải nhân viên gửi `X-Branch-Id` → 403 "Chỉ tài khoản nhân viên được chọn chi nhánh".
    Trước đây header của khách được nhận âm thầm;
  - khách không gửi header thì đi tiếp như cũ (không có `branchId`), nên các route khách đang dùng —
    lịch của mình, hồ sơ, hoá đơn, xem trước mã giảm giá — không đổi;
  - `branch_manager`/`employee` không có `employee.branchId` → 403 (SEC-11);
  - luật cũ giữ nguyên: nhân viên gửi chi nhánh khác của mình → 403, admin chọn chi nhánh bất kỳ.
- **Realtime:** `/realtime/stream` ánh xạ `?branchId=` sang header trước middleware, nên token khách kèm
  `branchId` bị chặn 403. Không thêm gì ở route này.
- **`BookingService.getBookingById`:** bỏ include `creator` (email, họ tên nhân viên) khi người gọi là khách.

### 2.2 Sửa lịch đặt chỉ nhận trường cho phép — SEC-04 (Q3)

- **Route:** `PUT /bookings/:id` chỉ còn `admin`, `branch_manager`, `employee`.
- **Validation (`updateBookingRules`):**
  - bỏ `customerId`, `customerName`, `customerPhone` khỏi luật sửa (chỉ dùng khi tạo);
  - kiểm thêm "body chỉ chứa `courtId`, `bookingDate`, `startTime`, `endTime`": trường khác → 400
    `"Không sửa được các trường: branchId, createdBy"`.
- **`BookingService.updateBooking`:** chỉ đưa vào `booking.update()` 4 trường trên
  (`BookingService.pickEditableFields`, cùng khuôn `CourtService.pickEditableFields`), để service vẫn an
  toàn nếu có nơi gọi bỏ qua validation.
- **Frontend `BookingsPage`:** khi sửa lịch, hai ô khách hàng chỉ hiển thị (khoá) và payload không gửi
  hai trường này; khi tạo lịch giữ nguyên.

### 2.3 Đăng ký không tự gộp hồ sơ; nhân viên gộp tại quầy — SEC-05 (Q1-A, Q2)

- **`AuthService.register`:**
  - đã có hồ sơ khách mang số này → tạo hồ sơ mới cho tài khoản với `phone = null` (`customers.phone` là
    unique), không đụng hồ sơ cũ, không đổi tên;
  - chưa có → tạo hồ sơ mang số như hiện nay;
  - response bỏ `mergedHistory`; `authController` luôn trả `"Tạo tài khoản thành công."`.
- **Không lộ qua API:** khi khách tự xem hồ sơ của mình (`GET /auth/me`, `GET /customers/:id`,
  `/customers/:id/history`), `phone` lấy từ tài khoản nếu hồ sơ chưa mang số — tài khoản không tự đoán ra
  được "số này có hồ sơ tại quầy".
- **Danh sách khách cho nhân viên (`GET /customers`):** hồ sơ vãng lai có tài khoản online trùng số (user
  vai trò `customer`, hồ sơ tài khoản chưa mang số) kèm `pendingAccount: { customerId, fullName, registeredAt }`.
- **Route mới `POST /customers/:id/merge-into-account`** (Q2: mọi nhân viên), body `{ accountCustomerId }`,
  gộp trong một transaction:
  1. khoá hồ sơ vãng lai (chưa gắn tài khoản, có số) và hồ sơ tài khoản (có `userId`, chưa mang số, số của
     tài khoản trùng số hồ sơ vãng lai); điều kiện sai → 400, đã gộp rồi → 409;
  2. chuyển `court_sessions`, `bookings`, `sales_orders` sang hồ sơ tài khoản, kể cả dòng đã xoá mềm;
  3. cộng `totalSpent`, tính lại `loyaltyTier` bằng `utils/loyalty.js`;
  4. xoá số và email khỏi hồ sơ cũ rồi mới gắn số vào hồ sơ tài khoản (tránh vỡ unique index), lấy email
     cũ nếu tài khoản chưa có; xoá mềm hồ sơ cũ;
  5. nhật ký `customer.merged` (người làm, id hai hồ sơ, số dòng mỗi bảng, tổng chi tiêu trước/sau).
- **Frontend:**
  - màn Khách hàng: huy hiệu "Có tài khoản online chưa gộp" + nút "Gộp vào tài khoản", hộp xác nhận nhắc
    bước xác minh;
  - `RegisterPage`/`AuthContext` bỏ `mergedHistory`;
  - trang Tài khoản của khách, khi chưa có buổi chơi nào: một dòng cố định "Từng chơi tại quầy trước khi
    có tài khoản? Nhờ nhân viên gộp lịch sử vào tài khoản." (hiện cho mọi tài khoản, không lộ gì).
- **Postman:** thêm request cho route mới để `docs:build` còn khớp 1-1 (113 route); cập nhật mô tả
  `register`.

---

## 3. File dự kiến thay đổi

| File | Thay đổi |
|---|---|
| `backend/src/middleware/branchContextMiddleware.js` | Chặn `X-Branch-Id` của vai trò không phải nhân viên; staff thiếu chi nhánh → 403 |
| `backend/src/routes/courtRoutes.js`, `accessoryRoutes.js`, `productRoutes.js`, `productCategoryRoutes.js` | Route đọc chỉ cho nhân viên |
| `backend/src/routes/bookingRoutes.js`, `validations/bookingValidation.js` | `PUT /bookings/:id` bỏ `customer`; chỉ nhận 4 trường |
| `backend/src/services/BookingService.js` | `pickEditableFields`; bỏ `creator` khi khách xem chi tiết |
| `backend/src/services/AuthService.js`, `controllers/authController.js` | Không tự gộp; bỏ `mergedHistory`; `phone` của hồ sơ lấy từ tài khoản khi chưa gộp |
| `backend/src/services/CustomerService.js`, `controllers/customerController.js`, `routes/customerRoutes.js`, `validations/customerValidation.js` | `pendingAccount` trong danh sách; `mergeIntoAccount`; route gộp |
| `backend/tests/` | **Mới:** `branchContext.test.js`, `bookingUpdateFields.test.js`, `customerMerge.test.js` (điều kiện gộp, hàm thuần) |
| `frontend/src/pages/Bookings/BookingsPage.jsx` | Khoá ô khách hàng khi sửa, không gửi hai trường đó |
| `frontend/src/pages/Customers/CustomersPage.jsx`, `services/apiServices.js` | Huy hiệu + nút gộp; `customerService.mergeIntoAccount` |
| `frontend/src/pages/Login/RegisterPage.jsx`, `contexts/AuthContext.jsx`, `pages/Account/AccountPage.jsx` | Bỏ `mergedHistory`; dòng gợi ý gộp lịch sử |
| `postman/badminton_api_collection.json`, `postman/README.md` | Request gộp hồ sơ; mô tả register/booking; 113 endpoint |
| `backend/src/docs/openapi.yaml` | Sinh lại bằng `npm run docs:build` |
| `docs/APIDesign.md` | Vai trò các route đọc; `X-Branch-Id` chỉ cho nhân viên; register; sửa booking; route gộp |
| `docs/04-workflows/flows/WF-01-Login.md`, `WF-03-BookingManagement.md`, `WF-05-CustomerManagement.md` | Đăng ký không gộp, gộp tại quầy, sửa lịch |
| `CLAUDE.md` | Một đoạn ngắn về phạm vi `X-Branch-Id` và luật gộp hồ sơ |
| `docs/05-extra/02-remediation/00-tien-do.md` | Thêm mục khi xong |

Không cần migration.

---

## 4. Kiểm thử thật

Như nhóm 2: phần ghi/phá dữ liệu chạy trên **bản sao DB dev** (dump → DB tạm), backend thứ hai trỏ vào
bản sao, DROP sau khi xong. DB dev chỉ dùng cho smoke chỉ đọc cuối cùng.

### 4.1 Tái hiện lỗi trước khi sửa (code `main`, bản sao DB)

| # | Việc | Kỳ vọng trên code cũ |
|---|---|---|
| R1 | Nhân viên mở một phiên có số điện thoại ở chi nhánh 2; khách gọi `GET /courts` không header và kèm `X-Branch-Id: 3` | Thấy phiên chi nhánh 2 kèm số điện thoại; header được nhận |
| R2 | Khách gọi `GET /accessories` với `X-Branch-Id: 2`; `GET /products` | Trả `averageCost`, `stockQuantity`; catalog đầy đủ |
| R3 | Admin `PUT /bookings/:id {"branchId":2,"createdBy":<id khác>}`; đặt lịch mới đúng khung giờ đó ở chi nhánh 1 | Lịch đổi chi nhánh và người tạo; lịch mới trùng giờ vẫn được tạo |
| R4 | Khách đổi giờ lịch `confirmed` của mình | 200, vẫn `confirmed` |
| R5 | Đăng ký bằng số của một hồ sơ vãng lai có lịch sử; xem `/customers/:id/history`; quầy mở sân với số đó | `mergedHistory: true`, tên hồ sơ bị ghi đè, thấy buổi chơi + hoá đơn cũ; phiên mới gắn vào tài khoản vừa tạo |

### 4.2 Sau khi sửa

**API (bản sao DB):**

| # | Kịch bản | Kỳ vọng |
|---|---|---|
| 1 | Khách gọi `/courts`, `/courts/:id`, `/accessories`, `/accessories/:id`, `/products`, `/products/:id`, `/product-categories` | 403 |
| 2 | Khách gửi `X-Branch-Id` tới `/bookings`, `/customers/:id`; SSE bằng token khách kèm `branchId` | 403 |
| 3 | Khách **không** gửi header: xem/đặt/huỷ lịch của mình, xem hồ sơ, lịch sử, hoá đơn, xem trước mã, đặt đơn online | Như trước khi sửa |
| 4 | Employee, branch_manager, admin gọi các route ở #1; admin đổi chi nhánh bằng header; employee gửi chi nhánh khác | 200; 200; 403 như cũ |
| 5 | Xoá mềm dòng Employee của một nhân viên tạm (trên bản sao) rồi gọi `/bookings` | 403 |
| 6 | `PUT /bookings/:id` bằng admin với `branchId` / `createdBy` / `status` / `customerId`; đổi giờ hợp lệ; khách gọi | 400 nêu tên trường; 200; 403 |
| 7 | Khách xem chi tiết lịch của mình | Không còn `creator` |
| 8 | Đăng ký bằng số trùng hồ sơ vãng lai; đăng ký bằng số mới | Cả hai 201, response cùng dạng, không có `mergedHistory`; hồ sơ cũ giữ tên + lịch sử; tài khoản mới không thấy lịch sử cũ; `/auth/me` của tài khoản vẫn hiện số điện thoại; quầy mở sân với số đó → gắn hồ sơ cũ |
| 9 | Nhân viên `GET /customers`; gộp; gộp lần hai; gộp vào tài khoản khác số; khách gọi route gộp | Hồ sơ cũ có `pendingAccount`; gộp đúng số dòng từng bảng, tổng chi tiêu cộng, hạng tính lại, số gắn vào hồ sơ tài khoản, hồ sơ cũ xoá mềm, có nhật ký `customer.merged`; 409; 400; 403 |
| 10 | Hồi quy: mở/đóng/chuyển sân, thanh toán, POS, đơn online, voucher, void hoá đơn, dashboard | Như trước khi sửa |

**Frontend — trình duyệt thật:**

| # | Kịch bản | Kỳ vọng |
|---|---|---|
| 11 | Employee mở Sân, Lịch đặt, Phụ kiện & kho, Bán lẻ (danh mục + POS), Sơ đồ sân; admin mở Dashboard và đổi chi nhánh | Chạy như cũ, không lỗi 403 |
| 12 | Sửa lịch ở Lịch đặt | Ô khách hàng bị khoá, đổi giờ lưu được |
| 13 | Đăng ký bằng số trùng hồ sơ vãng lai → trang Tài khoản, Lịch của tôi | Không thấy lịch sử cũ, có dòng gợi ý gộp |
| 14 | Màn Khách hàng: gộp hồ sơ ở #13 → khách tải lại trang Tài khoản | Thấy lịch sử, tổng chi tiêu, hạng |

**Tự động:**

| # | Kịch bản | Kỳ vọng |
|---|---|---|
| 15 | Jest, Vitest, build frontend, `docs:build` | Pass; khớp 1-1 113 route |
| 16 | newman toàn bộ collection (`runWrites` + `runDestructive`) trên bản sao | 0 lỗi |
| 17 | Smoke chỉ đọc trên server dev + DB dev | Khách 403 ở #1, nhân viên 200, không ghi dòng nào |

**Dọn dẹp:** DROP bản sao DB; trả file sơ đồ sân nếu newman ghi đè; không sửa `backend/.env`.

---

## 5. Ngoài phạm vi nhánh này

Các phát hiện `SEC-*` còn lại chưa thuộc nhóm sửa nào trong báo cáo 12/09 (nhóm 4 là Docker, nhóm 5 là
thao tác tại quầy `FE-01/02/03`, `DATA-01`, `RUN-01`, nhóm 6 là vận hành `CFG-06/07`, `DEP-10`, `RUN-02`,
`DATA-02`). Đề xuất gom thành một đợt "phân quyền và lạm dụng" sau nhóm 6.

| Việc | Để ở đâu |
|---|---|
| Branch_manager ghi voucher và danh mục dùng chung toàn chuỗi; sửa biến thể nhận nguyên body (`SEC-06`) | Đợt phân quyền |
| Một tài khoản chiếm hết khung giờ sân (`SEC-07`); giữ hàng vô thời hạn bằng đơn tiền mặt (`SEC-08`); dò mã voucher (`SEC-12`); endpoint công khai không phân trang/rate limit (`SEC-16`) | Đợt chống lạm dụng |
| Nhân viên tải PII khách toàn chuỗi, đổi SĐT đăng nhập của khách không có nhật ký (`SEC-09`); form tạo khách điền sẵn mật khẩu `123456` (`SEC-13`) | Đợt phân quyền |
| Phần còn lại của `SEC-14` (phụ kiện trong phiên không lọc chi nhánh, idempotency checkout trả hoá đơn chi nhánh khác, `compareBranches` chỉ chặn ở controller); nhân viên thường làm việc cấp quản lý (`SEC-15`) | Đợt phân quyền |
| Nhân viên thường thấy giá vốn phụ kiện | Cùng câu hỏi phân quyền nội bộ của `SEC-15` |
| Xác minh số điện thoại bằng OTP SMS; khoá/xoá tài khoản khách giả chiếm số | Sau khi chọn nhà cung cấp SMS (Q1-C) |

---

## 6. Kết quả (13/09/2026)

Chủ dự án nói "code đi" mà không trả lời riêng Q1–Q4, nên áp dụng đúng các đề xuất ở mục 1: Q1-A, Q2 mọi
nhân viên gộp được, Q3 khách không sửa lịch, Q4 làm kèm `SEC-11` và phần dành cho khách của `SEC-14`.
Không có migration. Code chưa commit.

### 6.1 Khác với kế hoạch

- **Email:** `customers.email` **không** có unique index — DB chỉ có `uk_customers_phone`, migration cũng
  chưa từng tạo index cho email; mục 2.3 viết nhầm. Vì vậy đăng ký vẫn ghi email vào hồ sơ mới như cũ, còn
  khi gộp chỉ gỡ số điện thoại khỏi hồ sơ cũ (email của hồ sơ cũ vẫn được lấy sang nếu tài khoản chưa có).
- **`AuthContext.register`** xoá `admin_selected_branch_id` như `login` đã làm. Trình duyệt từng dùng phiên
  admin mà hết hạn không đăng xuất sẽ còn khoá này, và từ nay tài khoản khách gửi header đó bị 403.
- **`BookingService.updateBooking`** bỏ nhánh "khách không thể chuyển booking sang hồ sơ khác": khách không
  còn gọi được route, `customerId` cũng không còn được ghi.
- **Tái hiện thêm R6** (`SEC-11`) trên code cũ.

### 6.2 Tái hiện lỗi trên code cũ — 10/10

Code `main` @ `8b45c89` (giải nén bằng `git archive`) chạy trên bản sao DB dev `bd_g3_clone`.

| # | Kết quả trên code cũ |
|---|---|
| R1 | Khách `GET /courts` không header → 200, 10 sân của cả 3 chi nhánh, thấy SĐT khách đang chơi ở chi nhánh 2. Gửi `X-Branch-Id: 3` → 200. `GET /courts/5` thấy SĐT. Mở SSE chi nhánh 2 → 200 |
| R2 | Khách `GET /accessories` + `X-Branch-Id: 2` → 200 kèm `averageCost` 17.000, `stockQuantity` 48; `/products`, `/product-categories` → 200 |
| R3 | Admin `PUT {branchId:2, createdBy:2}` → 200 và được lưu; đặt lại đúng sân + khung giờ ở chi nhánh 1 → 201, thành 2 lịch sống trùng giờ |
| R4 | Khách đổi lịch `confirmed` 08:00 → 10:00 → 200, vẫn `confirmed`; chi tiết lịch trả kèm `creator` có email |
| R5 | Đăng ký bằng SĐT hồ sơ #34 → 201 `mergedHistory: true`, hồ sơ bị gắn vào tài khoản mới và đổi tên; tài khoản mới đọc được 2 buổi chơi; quầy mở sân với số đó → phiên rơi vào hồ sơ đã bị chiếm |
| R6 | `branch_manager` bị xoá mềm dòng Employee → `GET /courts` 200 với sân của cả 3 chi nhánh |

### 6.3 Sau khi sửa — API 20/20

Code nhánh này trên bản sao được nạp lại sạch.

| # | Kết quả |
|---|---|
| 1 | Khách → 403 ở cả 7 route đọc |
| 2 | Khách + `X-Branch-Id` → 403 (`/bookings`, `/customers/1` của chính mình); SSE `?branchId=2` → 403; SSE không chi nhánh → 400 như cũ |
| 3 | Khách không gửi header: xem lịch của mình (16 lịch, đều của mình), tra khung giờ, đặt, xem, huỷ, hồ sơ, lịch sử, hoá đơn của mình, xem trước mã giảm giá, đặt đơn online, `/auth/me` — như cũ |
| 4 | `employee` / `branch_manager` / `admin` → 200 ở 7 route; admin `X-Branch-Id: 2` → chỉ sân chi nhánh 2; employee gửi chi nhánh 2 → 403; quản lý chỉ thấy chi nhánh 2 |
| 5 | `branch_manager` bị xoá mềm dòng Employee → 403 "Tài khoản nhân viên chưa được gán chi nhánh."; khôi phục → 200 |
| 6 | Admin `PUT` kèm `branchId` / `createdBy` / `status` / `customerId` / `customerName` → 400 nêu đúng tên trường, dòng không đổi. Đổi giờ hợp lệ → 200, chi nhánh / người tạo / trạng thái / khách giữ nguyên, đúng 1 nhật ký; đặt trùng khung giờ mới → 409. Khách `PUT` lịch của mình → 403 |
| 7 | Khách xem chi tiết lịch: không còn `creator`; nhân viên vẫn thấy |
| 8 | Đăng ký bằng SĐT hồ sơ #34 và bằng số mới → cả hai 201, cùng bộ khoá và message, không có `mergedHistory`. Hồ sơ #34 giữ nguyên (không tài khoản, tên cũ); tài khoản nhận hồ sơ #137 không mang số; lịch sử tài khoản rỗng, đọc hồ sơ #34 → 403; `/auth/me` hiện SĐT của tài khoản. Quầy mở sân với số đó → phiên vào hồ sơ #34 |
| 9 | `GET /customers`: hồ sơ #34 có `pendingAccount` trỏ #137. 6 ca gộp sai bị chặn: khách gọi → 403; tài khoản khác số, hồ sơ tài khoản đã có số, tài khoản seed, thiếu id, gộp vào chính nó → 400. Gộp → 200: chuyển 3 phiên + 2 lịch (1 đã xoá mềm) + 1 đơn bán lẻ, không còn dòng nào trỏ #34; SĐT sang #137; tổng chi 4.995.000đ + 25.000đ = 5.020.000đ, hạng `gold` (bản sao được cộng sẵn 4.900.000đ vào #34 để thử ngưỡng hạng); #34 xoá mềm, bỏ số; nhật ký `customer.merged` ghi nhân viên #2, chi nhánh 1. Gộp lần hai → 409. Sau gộp tài khoản thấy 3 buổi; quầy mở sân với số đó → vào #137, thanh toán được |
| 10 | Hồi quy: mở sân, thêm dịch vụ, chuyển sân, thanh toán, huỷ hoá đơn, mở + đóng sân, bán POS, dashboard admin + quản lý, lịch sử phiên, tồn kho, nhà cung cấp, danh sách khách — như cũ |

Lần chạy đầu báo 19/20: kiểm tra 9d so `moved` trong nhật ký bằng chuỗi JSON, trong khi cột JSON của MySQL
tự sắp lại thứ tự khoá. Đánh giá lại từng điều kiện của 9d trên chính bản sao đó thì đều đúng; script đã sửa
thành so từng khoá.

### 6.4 Trình duyệt thật — 4/4

Vite + server code nhánh + bản sao; phiên đăng nhập nạp qua API, không gõ mật khẩu vào form.

| # | Kết quả |
|---|---|
| 11 | Employee mở Sân, Lịch đặt, Phụ kiện & kho, Bán lẻ (Bán hàng + Kho bán lẻ), Sơ đồ sân, Khách hàng: mọi request API 200, SSE 200, không lỗi console. Admin mở Dashboard rồi đổi sang "Chi nhánh Quận 3" bằng bộ chuyển chi nhánh: trang tải lại, mọi request 200 |
| 12 | Lịch đặt → "Đổi lịch" lịch #224: hai ô khách hàng bị khoá, có dòng nhắc; đổi 07:00–08:00 thành 09:00–10:00 → `PUT` 200, danh sách cập nhật; DB chỉ đổi giờ |
| 13 | Tài khoản đăng ký trùng SĐT hồ sơ #41: trang Tài khoản 0 buổi, 0đ, hiện SĐT của tài khoản, có dòng nhắc nhờ nhân viên gộp; Lịch của tôi trống |
| 14 | Khách hàng → tìm số đó: hồ sơ #41 có nhãn "Có tài khoản online chưa gộp" và nút gộp; hộp xác nhận nhắc bước xác minh; gộp → 200, báo thành công, kết quả tìm còn đúng hồ sơ tài khoản. Khách tải lại trang Tài khoản → thấy 2 buổi chơi. DB: 2 phiên chuyển sang #139, #41 xoá mềm, có nhật ký |

### 6.5 Tự động và DB dev

| # | Kết quả |
|---|---|
| 15 | Jest 208/208 (thêm 44 test: `branchContext`, `bookingUpdateFields`, `customerMerge`), Vitest 49/49, build frontend thành công, `docs:build` khớp 1-1 113 route |
| 16 | newman trọn bộ (`runWrites` + `runDestructive`) trên bản sao nạp lại sạch: 118 request, 331 assertion, 0 lỗi |
| 17 | Smoke chỉ đọc trên server dev + DB dev, 4/4: khách 403 ở các route đọc của nhân viên, nhân viên 200; khách gửi header → 403; mọi dòng `GET /customers` có `pendingAccount`; `PUT` kèm `branchId` vào lịch thật → 400, lịch không đổi; không thêm dòng nào ở 7 bảng |

**Dọn dẹp:** DROP `bd_g3_clone`; `git checkout` lại `backend/public/layouts/branch-1.json` (newman ghi đè) và
`.claude/launch.json` (cấu hình server tạm). Không sửa `backend/.env`. DB dev chỉ bị cập nhật hash refresh
token khi smoke đăng nhập.
