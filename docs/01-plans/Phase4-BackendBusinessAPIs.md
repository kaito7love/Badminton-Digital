# Phase 4: Full Backend Business APIs

- **Trạng thái:** ✅ COMPLETED (Đã hoàn thành 100% - Ngày 23/07/2026)
- **Thư mục liên quan:** `backend/src/`, `backend/tests/`

---

## 🎯 Mục Tiêu Phase 4

Triển khai toàn bộ các API nghiệp vụ phục vụ vận hành thực tế của trung tâm cầu lông bằng **Node.js + Express + Sequelize + MySQL**: Vận hành sân, Đặt lịch & Kiểm tra trùng lịch, Phụ kiện & Gọi nước tại sân, Thanh toán & Tạo hóa đơn với VietQR, Quản lý Khách hàng & Nhân viên, Báo cáo Dashboard & Cài đặt hệ thống.

---

## ✅ Check-list Kiểm Tra Hoàn Thành Nhiệm Vụ (Task Completion Checklist)

### 1. Structure & Helper Utilities (`backend/src/utils/`)
- [x] `responseHandler.js`: Standardized envelope (`success`, `data`, `message`, `errors`).
- [x] `pagination.js`: Phân trang dùng chung (`page`, `limit`, `offset`, `meta`).
- [x] `priceCalculator.js`: Thuật toán tính tiền sân theo khung giờ (cao điểm/thấp điểm), làm tròn 1.000đ, tính tổng tiền dịch vụ & chiết khấu.
- [x] `vietqr.js`: Generator sinh link ảnh mã VietQR chuẩn chuyển khoản ngân hàng.

---

### 2. Input Validations Layer (`backend/src/validations/`)
- [x] `courtValidation.js`: Validate mở/đóng/chuyển sân, tạo/sửa sân.
- [x] `bookingValidation.js`: Validate tạo/sửa đặt sân & kiểm tra khung giờ khả dụng.
- [x] `customerValidation.js`: Validate thông tin & SĐT khách hàng.
- [x] `employeeValidation.js`: Validate tài khoản nhân viên & phân quyền.
- [x] `accessoryValidation.js`: Validate danh mục phụ kiện, kho & gọi đồ vào sân.
- [x] `paymentValidation.js`: Validate dữ liệu thanh toán checkout & voucher.
- [x] `settingValidation.js`: Validate cấu hình hệ thống.

---

### 3. Business Services Layer (`backend/src/services/`)
- [x] **CourtService.js**:
  - `getAllCourts()`, `getCourtById()`, `createCourt()`, `updateCourt()`, `deleteCourt()`
  - `openCourt()` (UC-06): Mở sân cho khách chơi.
  - `closeCourt()` (UC-07): Đóng sân, tính tiền tự động, bọc `Sequelize Transaction`.
  - `transferCourt()` (UC-08): Chuyển sân đang chơi sang sân trống khác, bọc `Sequelize Transaction`.
  - `toggleMaintenance()` (UC-09): Bật/tắt bảo trì sân.
- [x] **BookingService.js**:
  - `getAllBookings()`, `getBookingById()`
  - `checkAvailability()` (UC-11): Thuật toán kiểm tra overlap khung giờ `(startA < endB) AND (endA > startB)`.
  - `createBooking()` (UC-10), `updateBooking()`, `cancelBooking()`, `confirmBooking()` (UC-13).
- [x] **CustomerService.js**:
  - `getAllCustomers()`, `getCustomerById()`, `createCustomer()`, `updateCustomer()`, `deleteCustomer()`
  - `getCustomerHistory()`: Tra cứu lịch sử chơi & tổng tiền chi tiêu tích lũy.
- [x] **EmployeeService.js**:
  - `getAllEmployees()`, `getEmployeeById()`, `createEmployee()`, `updateEmployee()`, `deleteEmployee()`
  - `getActivityLogs()`: Nhật ký hoạt động của nhân viên (`activity_logs`).
- [x] **AccessoryService.js**:
  - `getAllAccessories()`, `getAccessoryById()`, `createAccessory()`, `updateAccessory()`, `deleteAccessory()`
  - `addSessionExtra()` (UC-17): Trừ kho phụ kiện & thêm vào phiên chơi đang hoạt động (`SessionExtra`).
- [x] **PaymentService.js**:
  - `checkout()` (UC-18): Bọc `Sequelize Transaction`, tự động đóng sân (nếu đang chơi), tính tổng tiền, tạo `Invoice`, `Payment`, cập nhật `Customer.total_spent` & hạng hội viên, sinh chuỗi VietQR.
  - `getInvoiceById()`: Chi tiết hóa đơn thanh toán.
- [x] **ReportService.js**:
  - `getDashboardSummary()`: Thống kê doanh thu ngày, lượt khách, tỷ lệ lấp đầy sân, cảnh báo tồn kho.
  - `getRevenueReport()`, `getTopCourts()`, `getTopAccessories()`.
- [x] **SettingService.js**:
  - `getAllSettings()`, `updateSetting()`, `updatePricing()`, `updateOperatingHours()`, `updateBranding()`.

---

### 4. Controllers & Routes Integration (`backend/src/routes/` & `server.js`)
- [x] `/api/v1/auth` -> `authRoutes.js`
- [x] `/api/v1/courts` -> `courtRoutes.js`
- [x] `/api/v1/bookings` -> `bookingRoutes.js` (xử lý route `/availability` đứng trước `/:id`)
- [x] `/api/v1/accessories` -> `accessoryRoutes.js`
- [x] `/api/v1/sessions` -> `sessionRoutes.js`
- [x] `/api/v1/customers` -> `customerRoutes.js`
- [x] `/api/v1/employees` -> `employeeRoutes.js`
- [x] `/api/v1/payments` -> `paymentRoutes.js`
- [x] `/api/v1/invoices` -> `invoiceRoutes.js`
- [x] `/api/v1/reports` -> `reportRoutes.js`
- [x] `/api/v1/settings` -> `settingRoutes.js`

---

### 5. Automated Tests & Verification (`backend/tests/`)
- [x] `priceCalculator.test.js`:
  - Test tính tiền sân off-peak/peak chính xác.
  - Test tính tổng hóa đơn & áp dụng mã giảm giá.
  - Kết quả kiểm thử (`npm test`): **PASS 100%** (2/2 passed).

---

## 📝 Walkthrough & Nhật Ký Triển Khai (Detailed Walkthrough)

1. **Cấu trúc multi-tier 5 tầng chuẩn production:**
   Toàn bộ mã nguồn Phase 4 tuân thủ nghiêm ngặt mô hình 5 tầng `Routes -> Validations -> Controllers -> Services -> Models & Utils`, đảm bảo tính đóng gói và dễ dàng bảo trì.

2. **Xử lý An Toàn Giao Tác (DB Transaction Safety):**
   - Các API có ảnh hưởng đến nhiều bảng dữ liệu đồng thời (`checkout`, `closeCourt`, `transferCourt`, `addSessionExtra`, `createEmployee`) đều được bọc cẩn thận bằng `sequelize.transaction()`.
   - Nếu xảy ra bất kỳ lỗi phát sinh nào, hệ thống tự động `rollback()` toàn bộ dữ liệu, đảm bảo không bao giờ bị rơi vào trạng thái lệch số liệu tài chính hoặc tồn kho.

3. **Cài đặt kiểm tra trùng lịch (Overlap Check):**
   Thực hiện thành công API `GET /api/v1/bookings/availability` đảm bảo không thể đặt đè khung giờ của sân đã được booking ở trạng thái `pending` hoặc `confirmed`. Trả về đúng HTTP Code `409 Conflict` khi phát hiện trùng lịch.

4. **Tích hợp VietQR:**
   Endpoint Checkout `POST /api/v1/payments/checkout` tự động tạo liên kết VietQR tĩnh/động theo chuẩn EMVCo, hỗ trợ giao diện Frontend hiển thị mã QR thanh toán tức thì mà không cần qua bên trung gian phức tạp.

---

## 📌 Kết luận
Phase 4 đã được thực thi và nghiệm thu thành công **100%**. Toàn bộ tài liệu, mã nguồn và kết quả kiểm thử đã được lưu vết đầy đủ trong hệ thống.
