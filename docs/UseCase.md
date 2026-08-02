# Use Case Specification
## Dự án: Badminton Digital Management – Hệ thống quản lý sân cầu lông

**Phiên bản:** 1.0
**Ngày:** 19/07/2026
**Tài liệu tham chiếu:** `SRS.md`

---

## 1. Danh sách Actor

| Actor | Mô tả |
|---|---|
| **Admin** | Chủ sân / quản trị viên hệ thống — toàn quyền |
| **Nhân viên (Employee)** | Vận hành quầy: mở/đóng sân, booking, checkout |
| **Khách hàng (Customer)** | Người thuê sân — đặt lịch, xem lịch sử |
| **Hệ thống (System)** | Actor phụ — thực hiện tác vụ tự động (tính giờ, gửi nhắc lịch, gửi email) |

---

## 2. Tổng quan các Use Case theo nhóm chức năng

| Nhóm | Mã UC | Tên Use Case | Actor chính |
|---|---|---|---|
| Auth | UC-01 | Đăng nhập | Admin, Nhân viên, Khách hàng |
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
| Accessories | UC-17 | Quản lý phụ kiện & tồn kho | Admin, Nhân viên |
| Payment | UC-18 | Thanh toán & xuất hóa đơn | Nhân viên |
| Report | UC-19 | Xem Dashboard thống kê | Admin |
| Report | UC-20 | Xuất báo cáo (Excel/PDF) | Admin |
| Settings | UC-21 | Cấu hình hệ thống (giá, giờ hoạt động, theme) | Admin |

---

## 3. Đặc tả chi tiết các Use Case chính

### UC-01: Đăng nhập
- **Actor chính:** Admin, Nhân viên, Khách hàng
- **Mô tả:** Người dùng đăng nhập vào hệ thống bằng email/username và mật khẩu.
- **Tiền điều kiện:** Người dùng đã có tài khoản.
- **Luồng chính:**
  1. Người dùng nhập email/username + password.
  2. Hệ thống xác thực thông tin.
  3. Hệ thống cấp Access Token (JWT) và Refresh Token.
  4. Hệ thống điều hướng theo Role tương ứng.
- **Luồng ngoại lệ:**
  - 2a. Sai thông tin đăng nhập → hiển thị lỗi, không cấp token.
  - 2b. Tài khoản bị khóa → thông báo liên hệ Admin.
- **Hậu điều kiện:** Người dùng có phiên đăng nhập hợp lệ.

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

## 4. Ma trận quyền truy cập Use Case theo Role

| Use Case | Admin | Nhân viên | Khách hàng |
|---|---|---|---|
| UC-05 Thêm/Sửa/Xóa sân | ✅ | ❌ | ❌ |
| UC-06/07 Mở/Đóng sân | ✅ | ✅ | ❌ |
| UC-10 Tạo booking | ✅ | ✅ | ✅ (chỉ cho chính mình) |
| UC-14 Quản lý khách hàng | ✅ | ✅ | ❌ |
| UC-16 Quản lý nhân viên | ✅ | ❌ | ❌ |
| UC-18 Thanh toán | ✅ | ✅ | ❌ |
| UC-19 Dashboard | ✅ | ❌ | ❌ |
| UC-20 Xuất báo cáo | ✅ | ❌ | ❌ |
| UC-21 Cài đặt hệ thống | ✅ | ❌ | ❌ |

---

## 5. Ghi chú
- Các use case còn lại (UC-02, 03, 04, 08, 09, 12, 13, 14, 15, 16, 17, 20, 21) áp dụng cấu trúc đặc tả tương tự các use case mẫu ở mục 3; có thể mở rộng chi tiết khi bước vào giai đoạn thiết kế API/Database.
- Use case sẽ được đối chiếu lại với `DatabaseDesign.md` và `APIDesign.md` để đảm bảo tính nhất quán.
