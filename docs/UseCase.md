# Use Case Specification
## Dự án: Badminton Digital Management – Hệ thống quản lý sân cầu lông

**Phiên bản:** 1.3
**Ngày:** 18/10/2026 (từ v1.2 ngày 16/08/2026, v1.1 ngày 15/08/2026, v1.0 ngày 19/07/2026 — lịch sử ở mục 6)
**Tài liệu tham chiếu:** `SRS.md`, `APIDesign.md`, `docs/04-workflows/`

---

## 1. Danh sách Actor

| Actor | Mô tả |
|---|---|
| **Admin** | Chủ sân / quản trị viên hệ thống — toàn quyền, quản lý được mọi chi nhánh (chuyển đổi chi nhánh đang xem qua UC-23) |
| **Quản lý chi nhánh (Branch Manager)** | Vai trò `branch_manager` — quyền vận hành rộng hơn Nhân viên (VD: thêm/sửa/xóa sân) nhưng chỉ trong phạm vi 1 chi nhánh, không chuyển được sang chi nhánh khác. Đã có role trong DB, route và tài khoản seed demo (`backend/src/migrations/20260815300002-add-branch-manager-role.js`) |
| **Nhân viên (Employee)** | Vận hành quầy: mở/đóng sân, booking, checkout — luôn giới hạn trong chi nhánh mình làm việc |
| **Khách hàng (Customer)** | Người thuê sân — đặt lịch, xem lịch sử, có thể tự đăng ký tài khoản (UC-22) |
| **Khách vãng lai (chưa đăng nhập)** | Người xem web công khai: xem bảng giá, lưới sân trống, cửa hàng, giải đấu, buổi giao lưu, tỉ số trực tiếp, bảng xếp hạng; muốn đặt hoặc đăng ký thì phải đăng nhập (UC-01) hoặc tự đăng ký tài khoản (UC-22) |
| **Hệ thống (System)** | Actor phụ — thực hiện tác vụ tự động: tính giờ và tiền, kiểm tra trùng lịch, tự huỷ lịch chưa được duyệt, tự huỷ đơn chuyển khoản quá hạn, dọn đơn POS bỏ dở, ghi thông báo, gửi email, đồng bộ sự kiện sang dịch vụ thi đấu |
| **Dịch vụ báo có (ngoài hệ thống)** | Actor ngoài — gọi webhook khi tiền chuyển khoản đã về để xác nhận thanh toán (UC-18, UC-26) |
| **Dịch vụ thi đấu** | Hệ thống con độc lập phục vụ UC-28, UC-31; chỉ nói chuyện với app chính qua cổng nội bộ và sự kiện |

---

## 2. Tổng quan các Use Case theo nhóm chức năng

| Nhóm | Mã UC | Tên Use Case | Actor chính |
|---|---|---|---|
| Auth | UC-01 | Đăng nhập (bằng số điện thoại hoặc email) | Admin, Nhân viên, Khách hàng |
| Auth | UC-02 | Đăng xuất | Admin, Nhân viên, Khách hàng |
| Auth | UC-03 | Quên mật khẩu | Admin, Nhân viên, Khách hàng |
| Auth | UC-04 | Đổi mật khẩu | Admin, Nhân viên, Khách hàng |
| Court | UC-05 | Thêm/Sửa/Xóa sân | Admin |
| Court | UC-06 | Mở sân cho khách chơi | Nhân viên |
| Court | UC-07 | Đóng sân & tính tiền | Nhân viên |
| Court | UC-08 | Chuyển khách sang sân khác | Nhân viên |
| Court | UC-09 | Đặt sân vào trạng thái bảo trì | Admin, Nhân viên |
| Booking | UC-10 | Tạo lịch đặt sân | Nhân viên, Khách hàng |
| Booking | UC-11 | Kiểm tra trùng lịch | Hệ thống |
| Booking | UC-12 | Hủy/Sửa lịch đặt | Nhân viên, Khách hàng |
| Booking | UC-13 | Xác nhận lịch đặt | Nhân viên |
| Customer | UC-14 | Quản lý khách hàng (CRUD) | Nhân viên, Admin |
| Customer | UC-15 | Xem lịch sử & chi tiêu | Khách hàng, Nhân viên |
| Employee | UC-16 | Quản lý nhân viên (CRUD + phân quyền) | Admin |
| Accessories | UC-17 | Quản lý phụ kiện & tồn kho (danh mục, nhập kho, nhà cung cấp, lịch sử/điều chỉnh kho) | Admin, Nhân viên |
| Payment | UC-18 | Thanh toán & xuất hóa đơn | Nhân viên |
| Report | UC-19 | Xem Dashboard thống kê | Admin |
| Report | UC-20 | Xuất báo cáo (Excel/PDF) | Admin |
| Settings | UC-21 | Cấu hình hệ thống (giá, giờ hoạt động, theme) | Admin |
| Auth | UC-22 | Khách hàng tự đăng ký tài khoản | Khách hàng |
| Multi-branch | UC-23 | Chuyển đổi chi nhánh đang xem/thao tác | Admin |
| Retail | UC-24 | Bán lẻ dụng cụ tại quầy (POS độc lập với thuê sân) | Nhân viên, `branch_manager`, Admin |
| Report | UC-25 | Doanh thu chi tiết theo nguồn & đối chiếu nhập-bán-tồn kho | Admin, `branch_manager` |
| Retail | UC-26 | Khách đặt hàng online (nhận tại quầy, tiền mặt hoặc chuyển khoản VietQR) | Khách hàng |
| Notification | UC-27 | Nhận và xem thông báo về lịch đặt sân | Khách hàng, Hệ thống |
| Competition | UC-28 | Xem giải đấu / buổi giao lưu và tự đăng ký (khu `/thi-dau`) | Khách vãng lai, Khách hàng |
| Customer | UC-29 | Gộp hồ sơ khách tại quầy vào tài khoản online | Nhân viên, `branch_manager`, Admin |
| Payment | UC-30 | Huỷ hoá đơn đã thanh toán (void) | `branch_manager`, Admin |
| Competition | UC-31 | Vận hành giải đấu và buổi giao lưu, bấm điểm trực tiếp | Nhân viên, `branch_manager`, Admin, người chơi |
| Booking | UC-32 | Xem lưới sân × giờ và đặt sân trên web (`/dat-san`) | Khách vãng lai, Khách hàng |

---

## 3. Đặc tả chi tiết các Use Case chính

### UC-01: Đăng nhập
- **Actor chính:** Admin, Nhân viên, Khách hàng
- **Mô tả:** Người dùng đăng nhập bằng **một trường `identifier` duy nhất** —
  chấp nhận cả số điện thoại lẫn email — kèm mật khẩu. Hệ thống tự nhận diện:
  chuỗi có `@` tra theo email, chuỗi toàn số được chuẩn hoá (bỏ khoảng trắng,
  dấu gạch, tiền tố `+84`) rồi tra theo phone.
- **Tiền điều kiện:** Người dùng đã có tài khoản (`users.email` hoặc
  `users.phone` không NULL — ràng buộc `chk_users_login_identity`).
- **Luồng chính:**
  1. Người dùng nhập số điện thoại hoặc email + password vào 1 ô `identifier`.
  2. Hệ thống xác thực thông tin (bcrypt).
  3. Hệ thống cấp Access Token (JWT, 15 phút) và Refresh Token (7 ngày) — cả hai nằm trong phản hồi, client tự lưu; refresh token chỉ được lưu ở server dưới dạng băm sha256 và được xoay vòng mỗi lần làm mới (token cũ còn hiệu lực 30 giây để hai tab làm mới cùng lúc không đá nhau).
  4. Hệ thống điều hướng theo Role tương ứng (admin/branch_manager/employee/customer).
- **Luồng ngoại lệ:**
  - 2a. Sai thông tin đăng nhập → hiển thị lỗi, không cấp token (thông báo giống hệt nhau dù sai identifier hay sai mật khẩu, tránh lộ số nào đã có tài khoản).
  - 2b. Tài khoản bị khóa (`is_active = false`) → thông báo liên hệ Admin (chỉ nói ra khi mật khẩu đã đúng).
  - 2c. Quá 10 lần thử trong 15 phút từ một IP → 429. Tài khoản không tồn tại vẫn tốn thời gian so sánh mật khẩu như tài khoản có thật.
- **Hậu điều kiện:** Người dùng có phiên đăng nhập hợp lệ. Đăng xuất, đổi và đặt lại mật khẩu làm mọi access token đang lưu hành hết hiệu lực ngay.

---

### UC-22: Khách hàng tự đăng ký tài khoản
- **Actor chính:** Khách hàng (chưa có tài khoản)
- **Mô tả:** Khách tự tạo tài khoản trên web bằng họ tên + số điện thoại +
  mật khẩu (email không bắt buộc), không cần nhân viên can thiệp.
- **Tiền điều kiện:** Số điện thoại chưa gắn với tài khoản đăng nhập nào.
- **Luồng chính:**
  1. Khách vào trang đăng ký, nhập họ tên, số điện thoại, mật khẩu.
  2. Hệ thống chuẩn hoá số điện thoại, tạo `User` (role `customer`).
  3. Hệ thống **luôn tạo hồ sơ `Customer` mới** cho tài khoản. Nếu số điện thoại đã
     thuộc một hồ sơ khách tại quầy thì hồ sơ mới để trống số (hệ thống chưa xác
     minh được người đăng ký là chủ số, nên không tự gắn vào lịch sử người khác);
     nhân viên xác minh tại quầy rồi gộp bằng UC-29.
  4. Hệ thống cấp token luôn — đăng ký xong coi như đã đăng nhập. Phản hồi giống hệt
     nhau dù số điện thoại đã có hồ sơ tại quầy hay chưa.
- **Luồng ngoại lệ:**
  - 1a. Số điện thoại đã có tài khoản → 409, gợi ý đăng nhập hoặc quên mật khẩu.
  - 1b. Email đã dùng cho tài khoản khác → 409.
  - 1c. Mật khẩu không đạt chính sách (8–72 byte, không thuộc mật khẩu phổ biến, không chứa SĐT/email/tên của chính mình) → 400.
  - 1d. Quá 5 lần đăng ký trong 60 phút từ một IP → 429.
- **Hậu điều kiện:** Có `User` (role customer) và `Customer` tương ứng; không có đường nào tự nâng quyền lên admin/employee qua endpoint này.

---

### UC-23: Chuyển đổi chi nhánh đang xem/thao tác
- **Actor chính:** Admin
- **Mô tả:** Admin quản lý nhiều chi nhánh chọn 1 chi nhánh cụ thể để xem/thao
  tác dữ liệu (sân, đặt sân, kho, báo cáo...) — khác với Nhân viên/Quản lý chi
  nhánh vốn bị khoá cứng vào 1 chi nhánh.
- **Tiền điều kiện:** Đăng nhập với role `admin`.
- **Luồng chính:**
  1. Lần đầu vào hệ thống, mặc định chọn đúng chi nhánh gốc của Admin.
  2. Admin mở bộ chuyển chi nhánh, chọn 1 chi nhánh khác trong danh sách (`GET /api/v1/branches`).
  3. Lựa chọn được lưu lại (`localStorage`), mọi request tiếp theo gửi kèm header `X-Branch-Id`.
  4. `branchContextMiddleware` xác thực chi nhánh còn hoạt động (`is_active`), gán `req.branchId` cho toàn bộ request.
- **Luồng ngoại lệ:**
  - 2a. Gửi `X-Branch-Id` của chi nhánh không tồn tại/đã ngưng hoạt động → `403`.
- **Hậu điều kiện:** Mọi API branch-scoped (sân, đặt sân, phụ kiện/tồn kho, báo cáo...) trả về đúng dữ liệu của chi nhánh đã chọn. Nhân viên/Quản lý chi nhánh không có use case này — gửi `X-Branch-Id` khác chi nhánh của mình bị chặn `403`.

---

### UC-06: Mở sân cho khách chơi
- **Actor chính:** Nhân viên
- **Mô tả:** Nhân viên mở một sân trống cho khách vào chơi trực tiếp (walk-in), không qua đặt lịch trước.
- **Tiền điều kiện:** Sân đang ở trạng thái "Trống"; Nhân viên đã đăng nhập.
- **Luồng chính:**
  1. Nhân viên chọn sân đang trống.
  2. Nhân viên chọn "Mở sân", có thể gán khách hàng (nếu có) hoặc để khách vãng lai.
  3. Hệ thống ghi nhận thời điểm bắt đầu (start_time) và chuyển trạng thái sân sang "Đang chơi".
  4. Hệ thống bắt đầu tính giờ chơi.
- **Luồng thay thế (mở từ một lịch đặt):** API `POST /courts/:id/open` nhận thêm `bookingId`. Lịch phải là của **hôm nay** theo múi giờ chi nhánh (sai ngày → 400 `BOOKING_WRONG_DAY`); nếu bây giờ sớm hơn giờ bắt đầu hơn 60 phút hoặc đã quá giờ kết thúc thì trả 409 `BOOKING_TIME_MISMATCH` cho tới khi nhân viên gửi lại kèm `acknowledgeTimeMismatch: true`. Giao diện nhân viên hiện chưa có nút mở sân từ lịch đặt.
- **Luồng ngoại lệ:**
  - 1a. Sân đang bảo trì hoặc ngưng khai thác → không cho phép mở, hiển thị cảnh báo.
  - 1b. Sân đã có phiên đang mở (kể cả hai nhân viên bấm cùng lúc) → chặn ngay ở CSDL (một sân không bao giờ có hai phiên mở).
  - 2a. Số điện thoại khách vãng lai nhập sai định dạng (VD `123`, `abc`) → 400; để trống được phép.
- **Hậu điều kiện:** Một `CourtSession` mới được tạo, sân chuyển trạng thái "Đang chơi"; máy nhân viên khác thấy thay đổi tức thì qua luồng SSE.

---

### UC-07: Đóng sân & tính tiền
- **Actor chính:** Nhân viên
- **Mô tả:** Kết thúc phiên chơi, hệ thống tự tính tiền sân và chuyển sang bước thanh toán.
- **Tiền điều kiện:** Sân đang ở trạng thái "Đang chơi", có `CourtSession` đang mở.
- **Luồng chính:**
  1. Nhân viên chọn "Đóng sân".
  2. Hệ thống ghi nhận end_time, tính tổng thời gian chơi (theo giây).
  3. Hệ thống tính tiền sân bằng phần giao của thời gian chơi với khung cao điểm của từng ngày (giờ chi nhánh), cộng tiền các đoạn đã chơi ở sân trước nếu có đổi sân, làm tròn về bội số 1.000đ một lần.
  4. Hệ thống tổng hợp thêm các `SessionExtras` (phụ kiện) đã dùng trong phiên.
  5. Hệ thống chuyển sang màn hình thanh toán (UC-18).
- **Luồng ngoại lệ:**
  - 2a. Phiên chơi cắt ngang khung giờ cao điểm/thấp điểm → hệ thống tính tiền theo tỷ lệ thời gian ở mỗi khung.
- **Hậu điều kiện:** `CourtSession` được đóng, sân chuyển trạng thái "Trống", dữ liệu sẵn sàng cho hóa đơn.

---

### UC-10: Tạo lịch đặt sân
- **Actor chính:** Nhân viên, Khách hàng
- **Mô tả:** Đặt trước một khung giờ sân cụ thể cho một ngày trong tương lai. Khách đặt trên web (UC-32); nhân viên đặt ở màn Lịch đặt cho khách gọi điện hoặc đến quầy.
- **Tiền điều kiện:** Khung giờ được chọn còn trống.
- **Luồng chính:**
  1. Người dùng chọn sân, ngày, khung giờ.
  2. Hệ thống thực hiện UC-11 (kiểm tra luật thời gian và trùng lịch).
  3. Nếu hợp lệ, hệ thống tạo `Booking` với trạng thái "Pending" (cả khi do nhân viên tạo).
  4. Nhân viên xác nhận booking (UC-13); khách có tài khoản nhận thông báo (UC-27).
- **Luồng ngoại lệ:**
  - 2a. Trùng lịch → hệ thống từ chối (409), khách chọn khung khác trên lưới.
  - 2b. Khung giờ đã kết thúc, hoặc nằm ngoài giờ mở cửa (mặc định 05:00–23:00) → 400.
  - 2c. Chỉ với **khách**: đặt xa hơn 14 ngày tính từ hôm nay, dài hơn 3 giờ một lần, đang giữ đủ 5 lịch chưa kết thúc, hoặc quá 20 lần đặt trong 10 phút → từ chối. Nhân viên không bị các giới hạn này.
  - 2d. Số điện thoại khách vãng lai nhân viên nhập sai định dạng → 400; nếu số đã có hồ sơ, phản hồi kèm gợi ý hồ sơ trùng (`customerMatch`) và màn hình nhân viên tra số trước khi lưu.
- **Hậu điều kiện:** Booking mới được lưu; máy nhân viên khác thấy ngay qua SSE. Lịch `pending` **do khách tự đặt** mà chưa được duyệt sẽ tự huỷ theo chính sách giữ chỗ (UC-27 báo cho khách); lịch do nhân viên tạo không tự huỷ.

---

### UC-11: Kiểm tra trùng lịch
- **Actor chính:** Hệ thống (được gọi bởi UC-10, UC-12)
- **Mô tả:** Đảm bảo một sân không bị đặt trùng trong cùng khung giờ.
- **Luồng chính:**
  1. Hệ thống nhận court_id, ngày, giờ bắt đầu, giờ kết thúc.
  2. Kiểm theo thứ tự: sân tồn tại và đang khai thác (không bảo trì, không ngưng) → khung giờ chưa kết thúc theo múi giờ chi nhánh → nằm trọn trong giờ mở cửa → không overlap với Booking `pending`/`confirmed` của cùng sân.
  3. Nếu qua hết → hợp lệ. Nếu không → trả về lý do cụ thể (`COURT_MAINTENANCE`, `SLOT_PASSED`, `OUTSIDE_OPERATING_HOURS`, `ALREADY_BOOKED`…).
- **Ghi chú:** Đây là **một nguồn duy nhất** cho `GET /public/availability`, `GET /bookings/availability`, `POST /bookings` và `PUT /bookings/:id`, nên các nơi không thể nói khác nhau. Khung đã bắt đầu nhưng chưa kết thúc vẫn nhận (khách vào quầy giữa giờ); lưới trên web chặt hơn một bậc và coi ô đã bắt đầu là "đã qua".

---

### UC-18: Thanh toán & xuất hóa đơn
- **Actor chính:** Nhân viên
- **Mô tả:** Tổng hợp chi phí phiên chơi, áp dụng giảm giá (nếu có), tạo và xuất hóa đơn.
- **Tiền điều kiện:** Phiên chơi đã được đóng (UC-07).
- **Luồng chính:**
  1. Hệ thống hiển thị bảng chi tiết: tiền sân + tiền phụ kiện.
  2. Nhân viên nhập giảm giá tay (số tiền hoặc %) nếu có — **bắt buộc kèm lý do**. (Mã giảm giá `Voucher` chỉ dùng cho bán lẻ và đơn online, không dùng cho tiền sân.)
  3. Hệ thống tính tổng tiền cuối cùng.
  4. Nhân viên chọn phương thức thanh toán (tiền mặt/chuyển khoản).
  5. Nếu chuyển khoản (chỉ khi quán đã cấu hình tài khoản ngân hàng), hệ thống hiển thị QR Code VietQR; hoá đơn giữ `pending` cho tới khi dịch vụ báo có gọi webhook xác nhận đúng số tiền.
  6. Hệ thống tạo `Invoice` (kèm các dòng hoá đơn) và lưu `Payment`; tiền mặt xác nhận `paid` ngay.
  7. Nhân viên in hóa đơn hoặc xuất PDF.
- **Luồng ngoại lệ:**
  - 2a. Nhân viên (`employee`) giảm quá trần cho phép (mặc định 10% số còn phải trả) → 403; `branch_manager` và Admin không giới hạn. Thiếu lý do → 400.
  - 4a. Chọn chuyển khoản khi chưa cấu hình ngân hàng và khoá webhook → 400.
  - 6a. Bấm thanh toán lại với cùng `Idempotency-Key` (mạng chập chờn) → trả đúng kết quả cũ, không tạo hoá đơn thứ hai; phiên đã có thanh toán → 409.
  - 6b. Webhook sai secret → 401, thiếu cấu hình → 503, số tiền lệch → 409 (giao dịch giữ `pending`), mã tham chiếu đã dùng cho giao dịch khác → 409; mọi lần từ chối ghi nhật ký.
- **Hậu điều kiện:** Invoice và Payment được lưu, dữ liệu góp vào báo cáo doanh thu. Muốn huỷ một hoá đơn đã thanh toán, xem UC-30.

---

### UC-19: Xem Dashboard thống kê
- **Actor chính:** Admin
- **Mô tả:** Xem tổng quan hoạt động kinh doanh theo thời gian thực.
- **Luồng chính:**
  1. Admin truy cập Dashboard.
  2. Hệ thống truy vấn và hiển thị: doanh thu hôm nay/tuần/tháng, tổng lượt khách, trạng thái sân, top sân/phụ kiện, biểu đồ doanh thu.
- **Hậu điều kiện:** Không thay đổi dữ liệu, chỉ hiển thị.

---

### UC-24: Bán lẻ dụng cụ tại quầy (POS)
- **Actor chính:** Nhân viên, `branch_manager`, Admin
- **Mô tả:** Bán vợt/áo/quần/giày và phụ kiện thể thao tại quầy, hoàn toàn
  độc lập với luồng thuê sân — khách không cần chơi sân mới mua được. Danh
  mục sản phẩm (`Product`/`ProductVariant`, có biến thể size/màu) dùng chung
  toàn chuỗi; tồn kho (`ProductStock`) tách theo từng chi nhánh, chung 1 sổ
  nhật ký (`stock_movements`) với phụ kiện trong sân (UC-17).
- **Tiền điều kiện:** Sản phẩm đã có trong danh mục, có sẵn ≥ 1 biến thể.
- **Luồng chính:**
  1. Nhân viên tạo đơn bán lẻ (`SalesOrder`, `channel: 'pos'`, `status:
     'open'`), mặc định không gắn khách hàng.
  2. Bấm chọn sản phẩm → thêm dòng vào đơn; hệ thống trừ tồn kho chi nhánh
     NGAY tại bước này (không đợi thanh toán). Xoá dòng thì hoàn kho.
  3. Nhân viên áp mã giảm giá (xem trước mức giảm) hoặc giảm giá tay nếu có (kèm lý do, chịu trần theo vai trò như UC-18), chọn phương thức
     thanh toán (tiền mặt/chuyển khoản), thanh toán.
  4. Hệ thống tạo `Invoice`/`Payment` (tái dùng đúng hạ tầng của UC-18),
     tiền mặt xác nhận ngay, chuyển khoản chờ webhook ngân hàng.
- **Luồng ngoại lệ:**
  - 2a. Không đủ tồn kho tại chi nhánh → từ chối thêm dòng, báo số lượng
    hiện có.
  - 3a. Đơn chưa có sản phẩm nào mà bấm thanh toán → từ chối.
  - 3b. Mã giảm giá hết hạn, hết lượt, chưa đạt giá trị tối thiểu hoặc đã bị ngừng → từ chối; mức giảm không bao giờ vượt tổng đơn.
  - 3c. Nhân viên bấm "Huỷ giỏ" → đơn `cancelled`, hoàn kho mọi dòng; đơn đã thanh toán không huỷ được. Đơn `open` không đổi gì quá 6 giờ được hệ thống tự huỷ và hoàn kho. Màn Bán lẻ nhớ đơn đang mở theo chi nhánh nên F5 không làm mất giỏ.
- **Hậu điều kiện:** `SalesOrder` → `'paid'`, `Invoice`/`Payment` được lưu,
  góp vào doanh thu (UC-19) và báo cáo doanh thu chi tiết (UC-25). Vì đơn
  thường không gắn `customerId`, phần lớn doanh số bán lẻ KHÔNG cộng vào
  `totalSpent`/hạng hội viên của khách. Chi tiết đầy đủ xem
  `docs/04-workflows/flows/WF-09-Retail.md`.

---

### UC-25: Doanh thu chi tiết theo nguồn & đối chiếu nhập-bán-tồn kho
- **Actor chính:** Admin, `branch_manager`
- **Mô tả:** Hai báo cáo bổ sung (từ 2026-08-16) nhìn xuyên cả 2 trụ doanh
  thu — thuê sân và bán lẻ dụng cụ — để tách bạch nguồn tiền và phát hiện
  thất thoát kho. (1) Doanh thu chi tiết: tách mỗi kỳ thành 4 nhóm (tiền
  sân / phụ kiện trong sân / bán lẻ / giảm giá), Admin xem được kèm so sánh
  giữa các chi nhánh. (2) Đối chiếu kho: so khớp số lượng đã trừ kho
  (`stock_movements`) với số lượng thực sự xuất hiện trên hóa đơn
  (`invoice_lines`) cho từng sản phẩm/chi nhánh, lộ ra chênh lệch (kho đã
  trừ nhưng chưa từng thanh toán).
- **Tiền điều kiện:** Đã xác định được `branchId` (trừ khi so sánh toàn
  chuỗi bằng `compareBranches=true`, chỉ dành cho Admin).
- **Luồng chính:**
  1. Admin/`branch_manager` chọn kỳ báo cáo, khoảng ngày (tuỳ chọn).
  2. Đọc `GET /api/v1/reports/revenue-breakdown` hoặc
     `GET /api/v1/reports/inventory-reconciliation`.
  3. Hệ thống trả về số liệu đã tách nhóm/đối chiếu, hiển thị dạng bảng.
- **Luồng ngoại lệ:**
  - 1a. Không xác định được chi nhánh → 400.
  - Dữ liệu doanh thu chi tiết chỉ có từ 2026-08-16 (`invoice_lines`); hóa
    đơn tạo trước mốc này không xuất hiện trong báo cáo này (vẫn tính đủ ở
    báo cáo doanh thu tổng UC-20).
- **Hậu điều kiện:** Không thay đổi dữ liệu, chỉ hiển thị. Chi tiết đầy đủ
  xem `docs/04-workflows/flows/WF-08-ReportsSettings.md` §D.1/D.2.

### UC-26: Khách đặt hàng online
- **Actor chính:** Khách hàng
- **Mô tả:** Khách xem cửa hàng theo chi nhánh, bỏ hàng vào giỏ, đặt đơn nhận tại quầy chi nhánh đã chọn. Đơn dùng chung bảng `sales_orders` với POS (`channel = 'online'`).
- **Tiền điều kiện:** Đã đăng nhập bằng tài khoản khách; chi nhánh nhận hàng còn hoạt động.
- **Luồng chính:**
  1. Khách chọn chi nhánh, duyệt `/shop` (giá và còn/hết hàng theo chi nhánh đó, không lộ giá vốn hay số tồn chính xác), thêm vào giỏ.
  2. Ở trang thanh toán, khách nhập họ tên, số điện thoại liên hệ, ghi chú, chọn tiền mặt hoặc chuyển khoản, có thể áp mã giảm giá.
  3. Hệ thống lấy giá từ máy chủ (bỏ qua giá client gửi), **trừ tồn kho ngay để giữ hàng** và tạo đơn.
  4. Tiền mặt: đơn `open`, khách trả khi tới nhận hàng và nhân viên chốt ở quầy (UC-24). Chuyển khoản: hệ thống tạo luôn hoá đơn, mã VietQR và hạn 30 phút; khi dịch vụ báo có gọi webhook đúng số tiền, đơn tự chuyển `paid`.
- **Luồng ngoại lệ:**
  - 3a. Không đủ tồn kho → cả đơn bị từ chối (400), không giữ hàng một phần.
  - 4a. Chọn chuyển khoản khi quán chưa cấu hình ngân hàng → 400, và trang ẩn lựa chọn này.
  - 4b. Quá 30 phút chưa trả → hệ thống tự huỷ đơn, huỷ hoá đơn, nhả lượt mã giảm giá và hoàn kho. Tiền về sau khi đơn đã huỷ bị webhook từ chối (409) và ghi nhật ký để quầy hoàn tiền thủ công.
  - 5a. Khách chỉ xem và huỷ được đơn của chính mình (đơn của người khác → 404); đơn đã `paid` hoặc `cancelled` không huỷ được.
- **Hậu điều kiện:** Đơn `paid` góp doanh thu và cộng vào tổng chi tiêu của khách (khác với đơn POS ẩn danh).

---

### UC-27: Nhận và xem thông báo về lịch đặt sân
- **Actor chính:** Khách hàng (có tài khoản); **Hệ thống** là bên tạo thông báo.
- **Mô tả:** Khi lịch đặt của khách đổi trạng thái do người khác, hệ thống ghi một thông báo trong ứng dụng (và gửi email nếu đủ điều kiện).
- **Luồng chính:**
  1. Một trong các sự kiện xảy ra: nhân viên xác nhận lịch; lịch bị hệ thống tự huỷ vì chưa được duyệt kịp; nhân viên huỷ lịch; nhân viên đổi sân, ngày hoặc giờ.
  2. Trong **cùng giao dịch** với thay đổi lịch, hệ thống ghi `customer_notifications` (nội dung chỉ có tên sân, ngày, giờ — không có tên nhân viên hay số điện thoại). Khách tự huỷ lịch của mình thì không có thông báo.
  3. Sau khi giao dịch hoàn tất, nếu đã cấu hình SMTP, khách có email và `notification_policy.email` chưa tắt thì hệ thống gửi thêm một email (lỗi gửi mail không làm hỏng nghiệp vụ).
  4. Khách thấy số chưa đọc trên chuông ở thanh đầu trang (cập nhật mỗi 60 giây khi tab đang mở, khi quay lại tab và khi đổi trang), mở danh sách hoặc trang `/notifications`, đánh dấu từng cái hoặc tất cả là đã đọc.
- **Luồng ngoại lệ:**
  - 2a. Khách không có tài khoản (hồ sơ tại quầy) → không có thông báo.
  - 4a. Khách gọi thông báo của người khác → 404.
- **Hậu điều kiện:** Thông báo đã đọc quá 30 ngày và mọi thông báo quá 90 ngày được dọn tự động. Chưa có nhắc lịch sắp đến.

---

### UC-28: Xem giải đấu / buổi giao lưu và tự đăng ký
- **Actor chính:** Khách vãng lai (xem), Khách hàng (đăng ký)
- **Mô tả:** Khu `/thi-dau` cho mọi người theo dõi giải đang mở, buổi giao lưu, bảng đấu, tỉ số trực tiếp và bảng xếp hạng không cần đăng nhập; khách có tài khoản đăng ký ngay trên web, không cần nhân viên duyệt.
- **Luồng chính (xem):** Chọn chi nhánh → xem giải đang mở và buổi giao lưu sắp tới → mở trang giải để xem bảng, sơ đồ, tỉ số cập nhật tức thì (SSE). Hồ sơ người chơi chỉ lộ theo chế độ riêng tư của họ: người chưa đăng nhập chỉ thấy hồ sơ công khai bằng tên ngắn, còn lại hiện là "Thành viên XXXX".
- **Luồng chính (đăng ký):**
  1. Khách đã đăng nhập bấm "Xem & đăng ký" ở một giải hoặc buổi giao lưu.
  2. Giải đơn: đăng ký một mình. Giải đôi cặp cố định: chọn đồng đội có tài khoản hoặc nhập thông tin đồng đội chưa có tài khoản — hệ thống tạo hồ sơ tạm (ẩn, số điện thoại chỉ nhân viên thấy) với điểm tạm để nhân viên xác nhận tại quầy.
  3. Còn chỗ → đăng ký thành công; hết chỗ → vào danh sách chờ, tự thăng hạng khi có người rút.
- **Luồng ngoại lệ:**
  - 1a. Người chơi chưa có điểm trình → không đăng ký được (`NEEDS_ASSESSMENT`), hộp thoại dẫn tới trang tự chấm trình.
  - 2a. Quá 5 hồ sơ đồng đội mới trong 24 giờ, hoặc một số điện thoại đã có hồ sơ → từ chối.
  - 3a. Rút đăng ký sau khi giải đã bốc thăm → chặn (`WITHDRAW_LOCKED`).
  - Lệ phí 200.000đ mỗi người chỉ hiển thị, thu tại quầy.
- **Hậu điều kiện:** Có bản ghi đăng ký (`registered`/`waitlisted`), đánh dấu `registered_via = 'self'` để nhân viên thấy đăng ký online. Chi tiết: `services/competition-service/docs/06-tran-dau-giai-dau-giao-luu.md`.

---

### UC-29: Gộp hồ sơ khách tại quầy vào tài khoản online
- **Actor chính:** Nhân viên, `branch_manager`, Admin
- **Mô tả:** Khách vừa tự đăng ký tài khoản có số trùng với một hồ sơ từng chơi tại quầy. Sau khi nhân viên xác minh đúng người, lịch sử được gộp để khách thấy trọn vẹn quá trình chơi.
- **Tiền điều kiện:** Hồ sơ tại quầy có số điện thoại; số đó đã có tài khoản khách đăng ký; hồ sơ của tài khoản chưa mang số (danh sách khách hiển thị dấu hiệu "có tài khoản chờ gộp").
- **Luồng chính:**
  1. Nhân viên xác minh khách tại quầy, chọn hồ sơ tại quầy và hồ sơ tài khoản.
  2. Hệ thống trong một giao dịch: chuyển phiên chơi, lịch đặt và đơn bán lẻ (cả bản ghi đã xoá mềm) sang hồ sơ tài khoản, cộng tổng chi tiêu và tính lại hạng, gỡ số khỏi hồ sơ cũ rồi gắn sang hồ sơ tài khoản, xoá mềm hồ sơ cũ, ghi nhật ký `customer.merged`.
  3. Một sự kiện gộp được gửi sang dịch vụ thi đấu để hồ sơ thi đấu theo về (UC-28, UC-31).
- **Luồng ngoại lệ:** Hồ sơ không có số, hồ sơ đích không thuộc tài khoản khách, hồ sơ tài khoản đã mang số, hoặc số đăng nhập khác số hồ sơ → 400; hồ sơ đã gộp hoặc đã gắn tài khoản → 409; khách gọi → 403.

---

### UC-30: Huỷ hoá đơn đã thanh toán (void)
- **Actor chính:** `branch_manager`, Admin
- **Mô tả:** Huỷ trọn một hoá đơn đã thanh toán (nhập nhầm, khách trả hàng). Không hoàn từng dòng.
- **Luồng chính:** Người dùng mở hoá đơn, nhập **lý do** (bắt buộc), xác nhận. Hệ thống đặt hoá đơn `void` và thanh toán `refunded`, trừ lại tổng chi tiêu của khách, hoàn kho hàng bán lẻ của đơn, ghi nhật ký. Lịch đặt liên quan vẫn `completed` (buổi chơi đã diễn ra).
- **Luồng ngoại lệ:** Hoá đơn chưa thanh toán (`draft`/`issued`) → 400; hoá đơn đã `void` → 409; thiếu lý do → 400.
- **Hậu điều kiện:** Hoá đơn không còn tính vào doanh thu. Tiền hoàn lại cho khách do quầy làm thủ công.

---

### UC-31: Vận hành giải đấu và buổi giao lưu
- **Actor chính:** Nhân viên (vận hành), `branch_manager`/Admin (tạo và chốt giải, điều chỉnh điểm), người chơi (bấm điểm trận của mình)
- **Mô tả:** Tổ chức giải 3 thể thức (vòng tròn, vòng bảng rồi loại trực tiếp, loại trực tiếp) và buổi giao lưu ngay trong ngày thi đấu. Toàn bộ nằm ở dịch vụ thi đấu; app chính chỉ là cổng và màn hình.
- **Luồng chính:** Tạo giải → nhận đăng ký (nhân viên hoặc khách tự đăng ký, UC-28) → điểm danh, bốc thăm (có thể bốc tại sân, đội vắng xử thua) → gọi trận kế tiếp ra sân theo giờ dự kiến → bấm điểm trực tiếp từng pha cầu trên điện thoại, tỉ số lên màn hình TV tức thì → chốt giải, sinh bảng xếp hạng thành tích và cập nhật điểm trình. Buổi giao lưu: điểm danh, tự xếp sân trống và ghép cặp cân bằng, đóng buổi.
- **Luồng ngoại lệ:** Một người không thể ở hai sân hoặc hai trận cùng lúc; hai máy cùng bấm không cộng trùng điểm (có hoàn tác); người chơi chỉ tự xác nhận trận không tính điểm; dịch vụ tắt thì cổng trả 503 và menu "Thi đấu" tự ẩn.
- **Hậu điều kiện:** Giải đã chốt có bảng xếp hạng; sự kiện hoàn tất được ghi vào nhật ký hoạt động của app chính. Chi tiết: `services/competition-service/docs/`.

---

### UC-32: Xem lưới sân × giờ và đặt sân trên web
- **Actor chính:** Khách vãng lai (xem), Khách hàng (đặt)
- **Mô tả:** Trang `/dat-san` là nơi duy nhất khách đặt sân; mọi nút "Đặt sân" khác trên web chỉ là liên kết tới đây.
- **Luồng chính:**
  1. Khách chọn chi nhánh và một trong 14 ngày gần nhất; thấy lưới từng sân theo ô 60 phút (trống, đã đặt, đã qua, bảo trì, giờ cao điểm), kèm sơ đồ mặt bằng và địa chỉ chi nhánh. Lưới tự làm mới mỗi 30 giây.
  2. Khách chạm một ô hoặc kéo thành khoảng (tối đa 3 giờ), xem tóm tắt giá và bấm xác nhận.
  3. Chưa đăng nhập thì đăng nhập hoặc đăng ký giữa chừng; sau đó trang quay lại đúng chi nhánh, ngày, sân, khung giờ vừa chọn (nếu còn trống).
  4. Hệ thống tạo lịch `pending` (UC-10) và chuyển khách tới "Lịch của tôi".
- **Luồng ngoại lệ:** Hai khách giành cùng một khung → người sau nhận 409 và lưới cập nhật; mất mạng giữa chừng → báo lỗi ngay trong trang kèm cách thử lại; lựa chọn đã hết hạn thì bị bỏ.
- **Hậu điều kiện:** Lịch mới xuất hiện ở "Sắp tới"; nhân viên thấy ngay trên màn Lịch đặt qua SSE.

---

## 4. Ma trận quyền truy cập Use Case theo Role

✅ được · ❌ không · (…) điều kiện. `BM` = Quản lý chi nhánh (`branch_manager`), luôn giới hạn trong chi nhánh của mình.

| Use Case | Admin | BM | Nhân viên | Khách hàng | Vãng lai |
|---|---|---|---|---|---|
| UC-01/02/04 Đăng nhập, đăng xuất, đổi mật khẩu | ✅ | ✅ | ✅ | ✅ | ❌ (UC-01 là bước vào hệ thống) |
| UC-05 Thêm/Sửa/Xóa sân (và lưu sơ đồ mặt bằng) | ✅ | ✅ | ❌ | ❌ | ❌ |
| UC-06/07/08/09 Mở, đóng, chuyển sân, đổi trạng thái | ✅ | ✅ | ✅ | ❌ | ❌ |
| UC-10 Tạo booking | ✅ | ✅ | ✅ | ✅ (chỉ cho chính mình, có giới hạn đặt) | ❌ |
| UC-12 Sửa booking | ✅ | ✅ | ✅ | ❌ (huỷ rồi đặt lại) | ❌ |
| UC-12 Huỷ booking | ✅ | ✅ | ✅ | ✅ (chỉ của mình) | ❌ |
| UC-13 Xác nhận booking | ✅ | ✅ | ✅ | ❌ | ❌ |
| UC-14 Quản lý khách hàng | ✅ | ✅ | ✅ (không xoá) | ❌ | ❌ |
| UC-15 Xem lịch sử & chi tiêu | ✅ | ✅ | ✅ | ✅ (chỉ của mình) | ❌ |
| UC-16 Quản lý nhân viên | ✅ | ✅ (chỉ tài khoản `employee`) | ❌ | ❌ | ❌ |
| UC-17 Xem phụ kiện, nhà cung cấp; nhập kho; điều chỉnh kho | ✅ | ✅ | ✅ | ❌ | ❌ |
| UC-17 Thêm/Sửa/Xoá phụ kiện và nhà cung cấp | ✅ | ❌ | ❌ | ❌ | ❌ |
| UC-18 Thanh toán sân | ✅ | ✅ | ✅ (giảm giá tay có trần) | ❌ | ❌ |
| UC-19 Dashboard | ✅ | ✅ | ❌ | ❌ | ❌ |
| UC-20 Xuất báo cáo | ✅ | ✅ | ❌ | ❌ | ❌ |
| UC-21 Cài đặt hệ thống | ✅ | ❌ | ❌ | ❌ | ❌ |
| UC-22 Tự đăng ký tài khoản | — | — | — | — | ✅ |
| UC-23 Chuyển đổi chi nhánh | ✅ | ❌ | ❌ | ❌ | ❌ |
| UC-24 Bán lẻ POS | ✅ | ✅ | ✅ | ❌ | ❌ |
| UC-24 Quản lý sản phẩm bán lẻ và mã giảm giá | ✅ | ✅ | ❌ (chỉ xem sản phẩm) | ❌ | ❌ |
| UC-25 Doanh thu chi tiết / đối chiếu kho | ✅ | ✅ (không so sánh chi nhánh) | ❌ | ❌ | ❌ |
| UC-26 Đặt hàng online | ❌ | ❌ | ❌ | ✅ | ❌ (xem cửa hàng được) |
| UC-27 Thông báo | ❌ | ❌ | ❌ | ✅ | ❌ |
| UC-28 Xem giải, buổi giao lưu, bảng xếp hạng | ✅ | ✅ | ✅ | ✅ | ✅ |
| UC-28 Tự đăng ký giải / buổi giao lưu | ❌ | ❌ | ❌ | ✅ (cần có điểm trình) | ❌ |
| UC-29 Gộp hồ sơ khách | ✅ | ✅ | ✅ | ❌ | ❌ |
| UC-30 Huỷ hoá đơn (void) | ✅ | ✅ | ❌ | ❌ | ❌ |
| UC-31 Vận hành giải / giao lưu | ✅ | ✅ | ✅ (vận hành; không tạo và chốt giải) | ✅ (chỉ bấm điểm trận của mình) | ❌ |
| UC-32 Xem lưới sân × giờ | ✅ | ✅ | ✅ | ✅ | ✅ |
| UC-32 Đặt sân trên web | ✅ | ✅ | ✅ | ✅ | ❌ (phải đăng nhập) |

> Ma trận dựa trên `roleMiddleware` ở các file `routes/` và bảng cấp quyền theo vai trò của cổng thi đấu (`roleScopes.js`). Nhân viên không thể gọi `GET /branches` và không đổi được chi nhánh (UC-23 chỉ có ở Admin); token của khách kèm `X-Branch-Id` bị từ chối.

## 5. Ghi chú
- Các use case còn lại (UC-02, 03, 04, 08, 09, 12, 13, 14, 15, 16, 17, 20, 21) áp dụng cấu trúc đặc tả tương tự các use case mẫu ở mục 3; luồng thao tác chi tiết của từng use case nằm ở `docs/04-workflows/`.
- Use case sẽ được đối chiếu lại với `DatabaseDesign.md` và `APIDesign.md` để đảm bảo tính nhất quán.
- UC-22, UC-23 (bổ sung ở v1.1) đã được đặc tả chi tiết ở mục 3 do gắn với thay đổi mô hình dữ liệu quan trọng (đăng nhập bằng SĐT, đa chi nhánh) — không theo quy ước "chỉ đặc tả sơ lược" như các UC còn lại.
- UC-24, UC-25 (bổ sung ở v1.2, 16/08/2026) gắn với module bán lẻ dụng cụ (`Product`/`ProductVariant`/`SalesOrder`) và 2 báo cáo mới đọc xuyên cả 2 trụ doanh thu — cũng được đặc tả chi tiết ở mục 3 vì cùng lý do trên.
- UC-26 đến UC-32 (bổ sung ở v1.3, 18/10/2026) gắn với cổng khách hàng (đơn online, thông báo, đặt sân trên web), khu công khai thi đấu và dịch vụ thi đấu, gộp hồ sơ khách và huỷ hoá đơn. UC-22, UC-10, UC-11, UC-18, UC-06, UC-07, UC-24 được sửa lại cho khớp hệ thống hiện tại (đặc biệt UC-22: đăng ký không còn tự gắn hồ sơ khách tại quầy; UC-10: lịch luôn bắt đầu `pending`).
- Các tác vụ định kỳ của "Hệ thống" (mỗi 5 phút): tự huỷ lịch chưa duyệt của khách, tự huỷ đơn chuyển khoản quá hạn, huỷ đơn POS bỏ dở, dọn thông báo cũ.

---

## 6. Lịch sử thay đổi

| Phiên bản | Ngày | Thay đổi chính |
|---|---|---|
| v1.0 | 19/07/2026 | Bản đầu tiên (UC-01…UC-21) |
| v1.1 | 15/08/2026 | UC-22 (tự đăng ký), UC-23 (chuyển chi nhánh), đăng nhập bằng SĐT hoặc email |
| v1.2 | 16/08/2026 | UC-24 (bán lẻ POS), UC-25 (doanh thu chi tiết, đối chiếu kho) |
| v1.3 | 18/10/2026 | Thêm UC-26…UC-32; thêm actor Khách vãng lai, Dịch vụ báo có, Dịch vụ thi đấu; sửa UC-01 (token và giới hạn thử), UC-06, UC-07, UC-10, UC-11, UC-18, UC-22, UC-24; làm lại ma trận quyền theo năm cột vai trò, đối chiếu từng route |
