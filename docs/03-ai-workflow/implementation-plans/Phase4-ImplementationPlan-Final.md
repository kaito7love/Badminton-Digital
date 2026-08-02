# Phase 4 — Full Backend Business APIs: Kế Hoạch Triển Khai

- **Trạng thái:** 🚀 IN PROGRESS
- **Thời gian:** 23/07/2026 →
- **Thư mục code:** `backend/src/`

---

## 🎯 Mục Tiêu
Triển khai toàn bộ 6 nhóm API nghiệp vụ cốt lõi phục vụ vận hành thực tế sân cầu lông: từ quản lý sân, đặt lịch, phụ kiện, cho đến thanh toán, báo cáo doanh thu và cài đặt hệ thống. Mỗi API tuân thủ Response Envelope chuẩn, phân quyền RBAC theo role ở Middleware.

## 📦 Danh Sách Module & Files Sẽ Tạo

### Module 1: Court & Operations
| File | Mô Tả |
|---|---|
| `services/CourtService.js` | CRUD courts + mở/đóng sân, tính tiền theo khung giờ, đổi sân, bảo trì |
| `controllers/courtController.js` | Điều hướng HTTP ↔ Service |
| `validations/courtValidation.js` | Express Validator rules |
| `routes/courtRoutes.js` | 9 endpoints `/api/v1/courts` |

### Module 2: Booking Management
| File | Mô Tả |
|---|---|
| `services/BookingService.js` | CRUD bookings + conflict check thuật toán overlap |
| `controllers/bookingController.js` | |
| `validations/bookingValidation.js` | |
| `routes/bookingRoutes.js` | 7 endpoints `/api/v1/bookings` |

### Module 3: Accessories & Session Extras
| File | Mô Tả |
|---|---|
| `services/ExtraService.js` | CRUD extras + gọi phụ kiện vào phiên chơi |
| `controllers/extraController.js` | |
| `routes/extraRoutes.js` | 5 endpoints `/api/v1/accessories` + `/sessions/:id/extras` |

### Module 4: Customers & Employees
| File | Mô Tả |
|---|---|
| `services/CustomerService.js` | CRUD customers + lịch sử chơi |
| `controllers/customerController.js` | |
| `routes/customerRoutes.js` | 6 endpoints `/api/v1/customers` |
| `services/EmployeeService.js` | CRUD employees + activity log |
| `controllers/employeeController.js` | |
| `routes/employeeRoutes.js` | 6 endpoints `/api/v1/employees` |

### Module 5: Payments & Invoicing
| File | Mô Tả |
|---|---|
| `services/PaymentService.js` | checkout (DB Transaction), tạo Invoice + Payment, cập nhật total_spent |
| `controllers/paymentController.js` | |
| `routes/paymentRoutes.js` | 2 endpoints `/api/v1/payments` + `/invoices` |

### Module 6: Reports & Settings
| File | Mô Tả |
|---|---|
| `services/ReportService.js` | Dashboard summary, revenue report |
| `controllers/reportController.js` | |
| `routes/reportRoutes.js` | 2+ endpoints `/api/v1/reports` |
| `services/SettingService.js` | Đọc/ghi settings hệ thống |
| `controllers/settingController.js` | |
| `routes/settingRoutes.js` | 5 endpoints `/api/v1/settings` |

### Integration
| File | Thay Đổi |
|---|---|
| `server.js` | Mount 6 nhóm Routes mới |
