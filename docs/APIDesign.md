# API Design Specification
## Dự án: Badminton Digital Management – Hệ thống quản lý sân cầu lông

**Phiên bản:** 1.0
**Ngày:** 19/07/2026
**Tài liệu tham chiếu:** `SRS.md`, `UseCase.md`

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
- Access Token (JWT): hạn ngắn (~15 phút)
- Refresh Token: lưu ở HttpOnly cookie, hạn dài (~7 ngày)

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
| 409 | Xung đột (VD: trùng lịch) |
| 500 | Lỗi hệ thống |

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
Mỗi endpoint có cột **Role** quy định vai trò được phép gọi: `Admin`, `Employee`, `Customer`, hoặc `Public` (không cần token).

---

## 2. Authentication API

| Method | Endpoint | Role | Mô tả |
|---|---|---|---|
| POST | `/auth/login` | Public | Đăng nhập, trả về access + refresh token |
| POST | `/auth/logout` | Authenticated | Thu hồi refresh token hiện tại |
| POST | `/auth/refresh-token` | Public (cần refresh token hợp lệ) | Cấp lại access token mới |
| POST | `/auth/forgot-password` | Public | Gửi email đặt lại mật khẩu |
| POST | `/auth/reset-password` | Public (cần reset token) | Đặt lại mật khẩu mới |
| PUT | `/auth/change-password` | Authenticated | Đổi mật khẩu khi đã đăng nhập |

**POST /auth/login**
```json
// Request
{ "email": "admin@badmintondigitalmanagement.vn", "password": "••••••" }

// Response 200
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOi...",
    "user": { "id": 1, "name": "Admin", "role": "admin" }
  }
}
```

---

## 3. Court API

| Method | Endpoint | Role | Mô tả |
|---|---|---|---|
| GET | `/courts` | Authenticated | Danh sách sân (kèm trạng thái) |
| GET | `/courts/:id` | Authenticated | Chi tiết một sân |
| POST | `/courts` | Admin | Tạo sân mới |
| PUT | `/courts/:id` | Admin | Cập nhật thông tin sân |
| DELETE | `/courts/:id` | Admin | Xóa sân |
| POST | `/courts/:id/open` | Employee, Admin | Mở sân cho khách chơi (UC-06) |
| POST | `/courts/:id/close` | Employee, Admin | Đóng sân & tính tiền (UC-07) |
| PUT | `/courts/:id/maintenance` | Employee, Admin | Bật/tắt trạng thái bảo trì |
| POST | `/courts/:id/transfer` | Employee, Admin | Chuyển khách sang sân khác |

**POST /courts/:id/open**
```json
// Request
{ "customerId": 12 }   // optional, null nếu khách vãng lai

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

## 4. Booking API

| Method | Endpoint | Role | Mô tả |
|---|---|---|---|
| GET | `/bookings` | Authenticated | Danh sách booking (filter theo ngày/sân/trạng thái) |
| GET | `/bookings/:id` | Authenticated | Chi tiết booking |
| POST | `/bookings` | Employee, Customer | Tạo booking mới (UC-10) |
| PUT | `/bookings/:id` | Employee, Customer (chỉ booking của mình) | Sửa booking |
| DELETE | `/bookings/:id` | Employee, Customer (chỉ booking của mình) | Hủy booking |
| PUT | `/bookings/:id/confirm` | Employee | Xác nhận booking (UC-13) |
| GET | `/bookings/availability` | Authenticated | Kiểm tra khung giờ trống (UC-11) |

**GET /bookings/availability**
```
?courtId=3&date=2026-07-20&startTime=18:00&endTime=19:00
```
```json
// Response 200
{ "success": true, "data": { "available": false, "conflictBookingId": 88 } }
```

---

## 5. Customer API

| Method | Endpoint | Role | Mô tả |
|---|---|---|---|
| GET | `/customers` | Employee, Admin | Danh sách khách hàng (search theo tên/SĐT) |
| GET | `/customers/:id` | Employee, Admin, Customer (chính mình) | Chi tiết khách hàng |
| POST | `/customers` | Employee, Admin | Thêm khách hàng |
| PUT | `/customers/:id` | Employee, Admin | Cập nhật thông tin |
| DELETE | `/customers/:id` | Admin | Xóa khách hàng |
| GET | `/customers/:id/history` | Employee, Admin, Customer (chính mình) | Lịch sử chơi & chi tiêu |

---

## 6. Employee API

| Method | Endpoint | Role | Mô tả |
|---|---|---|---|
| GET | `/employees` | Admin | Danh sách nhân viên |
| GET | `/employees/:id` | Admin | Chi tiết nhân viên |
| POST | `/employees` | Admin | Thêm nhân viên |
| PUT | `/employees/:id` | Admin | Cập nhật thông tin/phân quyền |
| DELETE | `/employees/:id` | Admin | Xóa nhân viên |
| GET | `/employees/:id/activity-logs` | Admin | Nhật ký hoạt động của nhân viên |

---

## 7. Accessories API

| Method | Endpoint | Role | Mô tả |
|---|---|---|---|
| GET | `/accessories` | Authenticated | Danh sách phụ kiện & tồn kho |
| POST | `/accessories` | Admin | Thêm phụ kiện |
| PUT | `/accessories/:id` | Admin | Cập nhật giá/tồn kho |
| DELETE | `/accessories/:id` | Admin | Xóa phụ kiện |
| POST | `/sessions/:sessionId/extras` | Employee | Thêm phụ kiện vào phiên chơi đang diễn ra |

---

## 8. Payment API

| Method | Endpoint | Role | Mô tả |
|---|---|---|---|
| POST | `/payments/checkout` | Employee | Tính tổng và tạo Payment (UC-18) |
| POST | `/payments/:id/apply-discount` | Employee | Áp dụng mã/giảm % |
| GET | `/invoices/:id` | Employee, Admin, Customer (chính mình) | Xem chi tiết hóa đơn |
| GET | `/invoices/:id/export-pdf` | Employee, Admin | Xuất hóa đơn PDF |

**POST /payments/checkout**
```json
// Request
{ "sessionId": 501, "discountCode": "SUMMER10", "paymentMethod": "transfer" }

// Response 201
{
  "success": true,
  "data": {
    "invoiceId": 9001,
    "totalBeforeDiscount": 120000,
    "discountAmount": 12000,
    "totalAmount": 108000,
    "qrCodeUrl": "https://.../qr/9001.png"
  }
}
```

---

## 9. Report API

| Method | Endpoint | Role | Mô tả |
|---|---|---|---|
| GET | `/reports/dashboard` | Admin | Số liệu tổng quan cho Dashboard |
| GET | `/reports/revenue` | Admin | Doanh thu theo ngày/tuần/tháng/năm (query `?period=`) |
| GET | `/reports/top-courts` | Admin | Top sân được thuê nhiều nhất |
| GET | `/reports/top-accessories` | Admin | Top phụ kiện bán chạy |
| GET | `/reports/export-excel` | Admin | Xuất báo cáo Excel |
| GET | `/reports/export-pdf` | Admin | Xuất báo cáo PDF |

---

## 10. Settings API

| Method | Endpoint | Role | Mô tả |
|---|---|---|---|
| GET | `/settings` | Admin | Lấy toàn bộ cấu hình hệ thống |
| PUT | `/settings/pricing` | Admin | Cài đặt giá sân theo khung giờ |
| PUT | `/settings/accessory-pricing` | Admin | Cài đặt giá phụ kiện |
| PUT | `/settings/operating-hours` | Admin | Giờ hoạt động |
| PUT | `/settings/branding` | Admin | Tên sân, logo, theme, dark mode |

---

## 11. Xử lý lỗi đặc thù theo nghiệp vụ

| Trường hợp | HTTP Code | Message mẫu |
|---|---|---|
| Trùng lịch khi tạo booking | 409 | "Khung giờ đã được đặt" |
| Mở sân đang bảo trì | 400 | "Sân đang bảo trì, không thể mở" |
| Đóng sân chưa mở | 400 | "Sân chưa có phiên chơi nào đang diễn ra" |
| Mã giảm giá hết hạn/không hợp lệ | 400 | "Mã giảm giá không hợp lệ" |
| Không đủ quyền (VD: Employee gọi API Admin) | 403 | "Bạn không có quyền thực hiện thao tác này" |
| Token hết hạn | 401 | "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại" |

---

## 12. Ghi chú triển khai
- Toàn bộ endpoint (trừ nhóm Auth/Public) đều yêu cầu middleware xác thực JWT + middleware kiểm tra Role.
- Tài liệu này sẽ được đồng bộ thành file `swagger.yaml`/`openapi.json` ở giai đoạn Backend (Phase 3) để sinh Swagger UI tự động.
- Endpoint `checkout` và `open/close` court cần được thiết kế transaction-safe (Sequelize transaction) để tránh lệch dữ liệu khi có nhiều request đồng thời.
