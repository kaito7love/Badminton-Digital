# Use Case Specification
## Dự án: Badminton Digital Management – Hệ thống quản lý sân cầu lông

**Phiên bản:** 1.2
**Ngày:** 16/08/2026 (từ v1.1 ngày 15/08/2026, v1.0 ngày 19/07/2026)
**Tài liệu tham chiếu:** `SRS.md`

---

## 1. Danh sách Actor

| Actor | Mô tả |
|---|---|
| **Admin** | Chủ sân / quản trị viên hệ thống — toàn quyền, quản lý được mọi chi nhánh (chuyển đổi chi nhánh đang xem qua UC-23) |
| **Quản lý chi nhánh (Branch Manager)** | Vai trò `branch_manager` — quyền vận hành rộng hơn Nhân viên (VD: thêm/sửa/xóa sân) nhưng chỉ trong phạm vi 1 chi nhánh, không chuyển được sang chi nhánh khác. Đã có role trong DB, route và tài khoản seed demo (`backend/src/migrations/20260815300002-add-branch-manager-role.js`) |
| **Nhân viên (Employee)** | Vận hành quầy: mở/đóng sân, booking, checkout — luôn giới hạn trong chi nhánh mình làm việc |
| **Khách hàng (Customer)** | Người thuê sân — đặt lịch, xem lịch sử, có thể tự đăng ký tài khoản (UC-22) |
| **Hệ thống (System)** | Actor phụ — thực hiện tác vụ tự động (tính giờ, gửi nhắc lịch, gửi email) |

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
  3. Hệ thống cấp Access Token (JWT, 15 phút) và Refresh Token (HttpOnly cookie, 7 ngày).
  4. Hệ thống điều hướng theo Role tương ứng (admin/branch_manager/employee/customer).
- **Luồng ngoại lệ:**
  - 2a. Sai thông tin đăng nhập → hiển thị lỗi, không cấp token (thông báo giống hệt nhau dù sai identifier hay sai mật khẩu, tránh lộ số nào đã có tài khoản).
  - 2b. Tài khoản bị khóa (`is_active = false`) → thông báo liên hệ Admin.
- **Hậu điều kiện:** Người dùng có phiên đăng nhập hợp lệ.

---

### UC-22: Khách hàng tự đăng ký tài khoản
- **Actor chính:** Khách hàng (chưa có tài khoản)
- **Mô tả:** Khách tự tạo tài khoản trên web bằng họ tên + số điện thoại +
  mật khẩu (email không bắt buộc), không cần nhân viên can thiệp.
- **Tiền điều kiện:** Số điện thoại chưa gắn với tài khoản đăng nhập nào.
- **Luồng chính:**
  1. Khách vào trang đăng ký, nhập họ tên, số điện thoại, mật khẩu.
  2. Hệ thống chuẩn hoá số điện thoại, tạo `User` (role `customer`).
  3. Nếu đã có hồ sơ `Customer` cùng số điện thoại này (khách từng chơi trực
     tiếp tại quầy nhưng chưa có tài khoản) → gắn tài khoản mới vào hồ sơ đó,
     giữ nguyên lịch sử chơi và tổng chi tiêu tích lũy. Ngược lại → tạo hồ sơ
     `Customer` mới.
  4. Hệ thống cấp token luôn — đăng ký xong coi như đã đăng nhập.
- **Luồng ngoại lệ:**
  - 1a. Số điện thoại đã có tài khoản → từ chối, gợi ý đăng nhập.
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
- **Luồng ngoại lệ:**
  - 1a. Sân đang bảo trì → không cho phép mở, hiển thị cảnh báo.
- **Hậu điều kiện:** Một `CourtSession` mới được tạo, sân chuyển trạng thái "Đang chơi".

---

### UC-07: Đóng sân & tính tiền
- **Actor chính:** Nhân viên
- **Mô tả:** Kết thúc phiên chơi, hệ thống tự tính tiền sân và chuyển sang bước thanh toán.
- **Tiền điều kiện:** Sân đang ở trạng thái "Đang chơi", có `CourtSession` đang mở.
- **Luồng chính:**
  1. Nhân viên chọn "Đóng sân".
  2. Hệ thống ghi nhận end_time, tính tổng thời gian chơi (theo giây).
  3. Hệ thống tính tiền sân dựa trên đơn giá theo khung giờ (cao điểm/thấp điểm) đã cấu hình.
  4. Hệ thống tổng hợp thêm các `SessionExtras` (phụ kiện) đã dùng trong phiên.
  5. Hệ thống chuyển sang màn hình thanh toán (UC-18).
- **Luồng ngoại lệ:**
  - 2a. Phiên chơi cắt ngang khung giờ cao điểm/thấp điểm → hệ thống tính tiền theo tỷ lệ thời gian ở mỗi khung.
- **Hậu điều kiện:** `CourtSession` được đóng, sân chuyển trạng thái "Trống", dữ liệu sẵn sàng cho hóa đơn.

---

### UC-10: Tạo lịch đặt sân
- **Actor chính:** Nhân viên, Khách hàng
- **Mô tả:** Đặt trước một khung giờ sân cụ thể cho một ngày trong tương lai.
- **Tiền điều kiện:** Khung giờ được chọn còn trống.
- **Luồng chính:**
  1. Người dùng chọn sân, ngày, khung giờ.
  2. Hệ thống thực hiện UC-11 (kiểm tra trùng lịch).
  3. Nếu hợp lệ, hệ thống tạo `Booking` với trạng thái "Pending".
  4. Nhân viên xác nhận booking (UC-13) hoặc hệ thống tự xác nhận nếu do Nhân viên tạo trực tiếp.
- **Luồng ngoại lệ:**
  - 2a. Trùng lịch → hệ thống từ chối, gợi ý khung giờ trống gần nhất.
- **Hậu điều kiện:** Booking mới được lưu vào hệ thống.

---

### UC-11: Kiểm tra trùng lịch
- **Actor chính:** Hệ thống (được gọi bởi UC-10, UC-12)
- **Mô tả:** Đảm bảo một sân không bị đặt trùng trong cùng khung giờ.
- **Luồng chính:**
  1. Hệ thống nhận court_id, ngày, giờ bắt đầu, giờ kết thúc.
  2. Hệ thống truy vấn các Booking đã tồn tại có overlap thời gian trên cùng sân.
  3. Nếu không có overlap → hợp lệ. Nếu có → trả về lỗi trùng lịch.

---

### UC-18: Thanh toán & xuất hóa đơn
- **Actor chính:** Nhân viên
- **Mô tả:** Tổng hợp chi phí phiên chơi, áp dụng giảm giá (nếu có), tạo và xuất hóa đơn.
- **Tiền điều kiện:** Phiên chơi đã được đóng (UC-07).
- **Luồng chính:**
  1. Hệ thống hiển thị bảng chi tiết: tiền sân + tiền phụ kiện.
  2. Nhân viên áp dụng mã giảm giá/giảm % (nếu có).
  3. Hệ thống tính tổng tiền cuối cùng.
  4. Nhân viên chọn phương thức thanh toán (tiền mặt/chuyển khoản).
  5. Nếu chuyển khoản, hệ thống hiển thị QR Code.
  6. Hệ thống tạo `Invoice`, lưu `Payment`.
  7. Nhân viên in hóa đơn hoặc xuất PDF.
- **Luồng ngoại lệ:**
  - 2a. Mã giảm giá không hợp lệ/hết hạn → hệ thống từ chối áp dụng.
- **Hậu điều kiện:** Invoice và Payment được lưu, dữ liệu góp vào báo cáo doanh thu.

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
     NGAY tại bước này (không đợi thanh toán).
  3. Nhân viên áp dụng giảm giá (số tiền cố định) nếu có, chọn phương thức
     thanh toán (tiền mặt/chuyển khoản), thanh toán.
  4. Hệ thống tạo `Invoice`/`Payment` (tái dùng đúng hạ tầng của UC-18),
     tiền mặt xác nhận ngay, chuyển khoản chờ webhook ngân hàng.
- **Luồng ngoại lệ:**
  - 2a. Không đủ tồn kho tại chi nhánh → từ chối thêm dòng, báo số lượng
    hiện có.
  - 3a. Đơn chưa có sản phẩm nào mà bấm thanh toán → từ chối.
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

---

## 4. Ma trận quyền truy cập Use Case theo Role

| Use Case | Admin | Nhân viên | Khách hàng |
|---|---|---|---|
| UC-05 Thêm/Sửa/Xóa sân | ✅ | ❌ | ❌ |
| UC-06/07 Mở/Đóng sân | ✅ | ✅ | ❌ |
| UC-10 Tạo booking | ✅ | ✅ | ✅ (chỉ cho chính mình) |
| UC-14 Quản lý khách hàng | ✅ | ✅ | ❌ |
| UC-16 Quản lý nhân viên | ✅ | ❌ | ❌ |
| UC-17 Nhập kho / quản lý nhà cung cấp | ✅ | ✅ (chỉ nhập kho, không CRUD danh mục/nhà cung cấp) | ❌ |
| UC-18 Thanh toán | ✅ | ✅ | ❌ |
| UC-19 Dashboard | ✅ | ❌ | ❌ |
| UC-20 Xuất báo cáo | ✅ | ❌ | ❌ |
| UC-21 Cài đặt hệ thống | ✅ | ❌ | ❌ |
| UC-22 Tự đăng ký tài khoản | ❌ | ❌ | ✅ |
| UC-23 Chuyển đổi chi nhánh | ✅ | ❌ | ❌ |
| UC-24 Bán lẻ dụng cụ (POS) | ✅ | ✅ | ❌ |
| UC-25 Doanh thu chi tiết / đối chiếu kho | ✅ | ❌ | ❌ |

> **`branch_manager`** không có cột riêng trong ma trận trên (ma trận theo 3
> vai trò tổng quan của `SRS.md`) — trong route thực tế, `branch_manager`
> được cấp quyền tương đương/không thấp hơn `employee` trên hầu hết use case
> vận hành (sân, booking, kho...), thêm một số quyền của `admin` bị thu hẹp
> về đúng 1 chi nhánh (VD: thêm/sửa/xóa sân — xem `courtRoutes.js`). Không có
> UC-23 (chuyển chi nhánh).

---

## 5. Ghi chú
- Các use case còn lại (UC-02, 03, 04, 08, 09, 12, 13, 14, 15, 16, 17, 20, 21) áp dụng cấu trúc đặc tả tương tự các use case mẫu ở mục 3; có thể mở rộng chi tiết khi bước vào giai đoạn thiết kế API/Database.
- Use case sẽ được đối chiếu lại với `DatabaseDesign.md` và `APIDesign.md` để đảm bảo tính nhất quán.
- UC-22, UC-23 (bổ sung ở v1.1) đã được đặc tả chi tiết ở mục 3 do gắn với thay đổi mô hình dữ liệu quan trọng (đăng nhập bằng SĐT, đa chi nhánh) — không theo quy ước "chỉ đặc tả sơ lược" như các UC còn lại.
- UC-24, UC-25 (bổ sung ở v1.2, 16/08/2026) gắn với module bán lẻ dụng cụ (`Product`/`ProductVariant`/`SalesOrder`) và 2 báo cáo mới đọc xuyên cả 2 trụ doanh thu — cũng được đặc tả chi tiết ở mục 3 vì cùng lý do trên.
