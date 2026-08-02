# Phase 4 — Task List

> **Trạng thái:** ✅ COMPLETED (Đã hoàn thành 100% - Ngày 23/07/2026)

---

## Module 1: Court & Operations API (`/api/v1/courts`)
- [x] `services/CourtService.js`
  - [x] `getAllCourts()`
  - [x] `getCourtById(id)`
  - [x] `createCourt(data)`
  - [x] `updateCourt(id, data)`
  - [x] `deleteCourt(id)` — chặn nếu có session đang chơi
  - [x] `openCourt(courtId, { customerId, employeeId, bookingId })` — tạo CourtSession
  - [x] `closeCourt(courtId, { employeeId })` — tính courtFee theo khung giờ bọc Transaction
  - [x] `transferCourt(courtId, { newCourtId, employeeId })` — bọc Transaction
  - [x] `toggleMaintenance(courtId, { maintenance, note })`
- [x] `controllers/courtController.js`
- [x] `validations/courtValidation.js`
- [x] `routes/courtRoutes.js` (9 endpoints)

---

## Module 2: Booking Management API (`/api/v1/bookings`)
- [x] `services/BookingService.js`
  - [x] `checkAvailability({ courtId, bookingDate, startTime, endTime, excludeId })` — overlap check
  - [x] `getAllBookings(filters)` — filter by date/court/status & pagination
  - [x] `getBookingById(id)`
  - [x] `createBooking(data, userId)` — auto check conflict
  - [x] `updateBooking(id, data)`
  - [x] `cancelBooking(id)`
  - [x] `confirmBooking(id)` — pending → confirmed
- [x] `controllers/bookingController.js`
- [x] `validations/bookingValidation.js`
- [x] `routes/bookingRoutes.js` (7 endpoints, xử lý route `/availability` đứng trước `/:id`)

---

## Module 3: Accessories & Session Extras API (`/api/v1/accessories` & `/api/v1/sessions`)
- [x] `services/AccessoryService.js`
  - [x] `getAllAccessories()` — kèm cảnh báo low_stock
  - [x] `getAccessoryById(id)`
  - [x] `createAccessory(data)`
  - [x] `updateAccessory(id, data)`
  - [x] `deleteAccessory(id)`
  - [x] `addSessionExtra(sessionId, { extraId, quantity })` — trừ kho, tạo SessionExtra bọc Transaction
- [x] `controllers/accessoryController.js`
- [x] `validations/accessoryValidation.js`
- [x] `routes/accessoryRoutes.js` (5 endpoints) & `routes/sessionRoutes.js` (2 endpoints)

---

## Module 4: Customers API (`/api/v1/customers`)
- [x] `services/CustomerService.js`
  - [x] `getAllCustomers(search)` — tìm kiếm theo tên/SĐT & pagination
  - [x] `getCustomerById(id)`
  - [x] `createCustomer(data)`
  - [x] `updateCustomer(id, data)`
  - [x] `deleteCustomer(id)`
  - [x] `getCustomerHistory(id)` — lịch sử CourtSessions + tổng chi tiêu
- [x] `controllers/customerController.js`
- [x] `validations/customerValidation.js`
- [x] `routes/customerRoutes.js` (6 endpoints)

---

## Module 5: Employees API (`/api/v1/employees`)
- [x] `services/EmployeeService.js`
  - [x] `getAllEmployees()`
  - [x] `getEmployeeById(id)`
  - [x] `createEmployee(data)` — tạo User + Employee record trong Transaction
  - [x] `updateEmployee(id, data)`
  - [x] `deleteEmployee(id)`
  - [x] `getActivityLogs(employeeId)` — nhật ký hoạt động
- [x] `controllers/employeeController.js`
- [x] `validations/employeeValidation.js`
- [x] `routes/employeeRoutes.js` (6 endpoints)

---

## Module 6: Payments & Invoicing API (`/api/v1/payments` & `/api/v1/invoices`)
- [x] `services/PaymentService.js`
  - [x] `checkout({ sessionId, paymentMethod, discountAmount, employeeId })`:
    - [x] Tính courtFee + extrasFee - discountAmount = totalAmount
    - [x] Tạo/cập nhật Invoice
    - [x] Tạo/cập nhật Payment
    - [x] Cập nhật `customers.total_spent`
    - [x] Cập nhật `loyalty_tier` ('gold' ≥ 5 tr, 'vip' ≥ 15 tr)
    - [x] Sinh chuỗi mã VietQR thanh toán chuyển khoản
    - [x] Toàn bộ trong Sequelize Transaction
  - [x] `getInvoiceById(id)`
- [x] `controllers/paymentController.js`
- [x] `validations/paymentValidation.js`
- [x] `routes/paymentRoutes.js` & `routes/invoiceRoutes.js` (4 endpoints)

---

## Module 7: Reports & Settings API (`/api/v1/reports` & `/api/v1/settings`)
- [x] `services/ReportService.js`
  - [x] `getDashboardSummary()` — doanh thu hôm nay/tuần/tháng, số lượt khách, top sân/phụ kiện, cảnh báo tồn kho
  - [x] `getRevenueReport(period)` — doanh thu theo ngày/tháng/năm
  - [x] `getTopCourts()`, `getTopAccessories()`
- [x] `controllers/reportController.js`
- [x] `routes/reportRoutes.js` (4 endpoints)
- [x] `services/SettingService.js` — getAllSettings, getSettingByKey, updateSetting
- [x] `controllers/settingController.js`
- [x] `routes/settingRoutes.js` (5 endpoints)

---

## Integration & Verification
- [x] Cập nhật `server.js` — mount tất cả 10 nhóm Routes mới
- [x] Thư viện helper: `responseHandler.js`, `pagination.js`, `priceCalculator.js`, `vietqr.js`
- [x] Unit Test `tests/priceCalculator.test.js` (`npm test`) -> **PASS 100%** (2/2 tests passed)

---

## 📝 Walkthrough Nhật Ký Triển Khai (Walkthrough Details)

1. **Kiến trúc 5 tầng chuẩn Production:**
   Toàn bộ mã nguồn Phase 4 triển khai theo mô hình 5 tầng phân tách trách nhiệm rõ ràng:
   `Routes -> Validations -> Controllers -> Services -> Models & Utils`.

2. **Transaction Safety:**
   Tất cả nghiệp vụ ảnh hưởng đồng thời nhiều bảng (`checkout`, `closeCourt`, `transferCourt`, `addSessionExtra`, `createEmployee`) đều bọc trong `sequelize.transaction()` nhằm bảo vệ tính toàn vẹn dữ liệu.

3. **Thuật toán Kiểm Tra Trùng Lịch (Overlap Check):**
   Giao thoa khung giờ `(startTime < reqEndTime) AND (endTime > reqStartTime)` đảm bảo chặn các trùng lặp khi book sân. Trả về `409 Conflict` đúng đặc tả REST API.

4. **Tích hợp VietQR:**
   Endpoint Checkout `POST /api/v1/payments/checkout` sinh linh hoạt URL mã QR VietQR động theo chuẩn EMVCo giúp giao diện quét chuyển khoản ngay lập tức.
