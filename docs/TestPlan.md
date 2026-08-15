# Test Plan
## Dự án: Badminton Digital Management – Hệ thống quản lý sân cầu lông

**Phiên bản:** 1.0
**Ngày:** 19/07/2026
**Tài liệu tham chiếu:** `SRS.md`, `UseCase.md`, `APIDesign.md`, `DatabaseDesign.md`, `Architecture.md`

---

## 1. Mục tiêu kiểm thử
Đảm bảo Badminton Digital Management hoạt động đúng theo các yêu cầu chức năng (FR) và phi chức năng (NFR) đã đặc tả trong SRS, phát hiện lỗi sớm trước khi triển khai, và cung cấp bằng chứng chất lượng (test report, coverage) để đưa vào portfolio.

## 2. Phạm vi kiểm thử

### 2.1 Trong phạm vi
- Toàn bộ API Backend (Auth, Court, Booking, Customer, Employee, Accessories, Payment, Report, Settings)
- Logic nghiệp vụ cốt lõi: tính tiền sân theo khung giờ, kiểm tra trùng lịch, checkout, phân quyền
- Giao diện Frontend: luồng chính của từng module (smoke test + UI test trọng điểm)
- Hiệu năng chịu tải cơ bản (K6)

### 2.2 Ngoài phạm vi
- Kiểm thử cổng thanh toán thực tế (không tích hợp ở phiên bản này)
- Kiểm thử bảo mật chuyên sâu (penetration testing) — chỉ áp dụng security checklist cơ bản

---

## 3. Chiến lược kiểm thử (Test Levels)

**Hiện trạng (đã triển khai, chạy trong CI):**

| Cấp độ | Công cụ | Phạm vi |
|---|---|---|
| Unit Test | Jest (Backend) | Service/logic thuần, không phụ thuộc DB: tính tiền theo khung giờ, kiểm tra trùng lịch, validate SĐT/thanh toán, logic tồn kho (`InventoryService`) — xem mục 9 cho danh sách file |
| Unit Test | Vitest (Frontend) | Hàm/logic thuần phía frontend — hiện chỉ có `src/utils/roles.test.js` |
| Build check | `vite build` | Đảm bảo frontend build production không lỗi (không phải test theo nghĩa assert hành vi) |

**Kế hoạch (chưa triển khai — đề xuất, không có trong CI hiện tại):**

| Cấp độ | Công cụ | Phạm vi |
|---|---|---|
| Integration Test | Jest + Supertest | API endpoint kết hợp DB (dùng DB test riêng/SQLite in-memory hoặc MySQL test container) — CI hiện chưa có service DB nên chưa chạy được loại test này |
| API/Manual Test | Postman (Collection + Newman CLI) | Toàn bộ endpoint theo `APIDesign.md`, gồm case thành công và lỗi — thư mục `postman/` hiện chỉ có `.gitkeep`, chưa có collection thật |
| Load/Performance Test | K6 | Endpoint tần suất cao: `/courts/:id/open`, `/courts/:id/close`, `/bookings`, `/payments/checkout` — thư mục `k6/` hiện chỉ có `.gitkeep`, chưa có script thật |
| UI/E2E Test | (đề xuất) Cypress hoặc Playwright | Luồng chính: login → mở sân → checkout; tạo booking; xem báo cáo |
| Lint | ESLint | CI hiện không chạy bước lint riêng cho backend lẫn frontend |
| Security Checklist | Thủ công | Kiểm tra JWT, RBAC, input validation, SQL injection cơ bản — chưa tự động hóa trong CI |

## 4. Môi trường kiểm thử
| Môi trường | Mục đích |
|---|---|
| Local (Docker Compose) | Dev & unit/integration test |
| Staging | Test thủ công (Postman), UAT trước khi trình bày demo |

---

## 5. Ma trận Test Case theo Use Case (mức tổng hợp)

| UC | Use Case | Test case chính | Test case ngoại lệ |
|---|---|---|---|
| UC-01 | Đăng nhập | Đăng nhập đúng thông tin → nhận token | Sai mật khẩu, tài khoản khóa, tài khoản không tồn tại |
| UC-06 | Mở sân | Mở sân trống thành công | Mở sân đang bảo trì/đang chơi → lỗi 400 |
| UC-07 | Đóng sân | Đóng sân, tính đúng tiền theo thời lượng | Đóng sân chưa có session đang mở → lỗi 400 |
| UC-10 | Tạo booking | Đặt lịch khung giờ trống thành công | Đặt trùng khung giờ → lỗi 409 |
| UC-11 | Kiểm tra trùng lịch | Overlap một phần, overlap toàn phần, liền kề (không overlap) | Dữ liệu biên: booking kết thúc đúng lúc booking khác bắt đầu |
| UC-13 | Xác nhận booking | Pending → Confirmed thành công | Xác nhận booking đã hủy → lỗi |
| UC-18 | Checkout | Tính đúng tổng tiền (sân + phụ kiện − giảm giá) | Mã giảm giá hết hạn, sai mã |
| UC-19 | Dashboard | Số liệu hiển thị khớp với dữ liệu DB | Không có dữ liệu trong kỳ → hiển thị 0, không lỗi |
| RBAC | Phân quyền | Employee gọi API Employee-only → 200 | Customer/Employee gọi API Admin-only → 403 |

---

## 6. Chi tiết Test Case mẫu (mức cao — dùng làm khuôn mẫu)

### TC-BOOK-01: Tạo booking hợp lệ
- **Tiền điều kiện:** Sân 1, ngày 20/07/2026, khung 18:00–19:00 còn trống.
- **Bước thực hiện:** Gửi `POST /bookings` với dữ liệu hợp lệ.
- **Kết quả mong đợi:** HTTP 201, booking status = "pending", dữ liệu lưu đúng vào DB.

### TC-BOOK-02: Tạo booking trùng lịch
- **Tiền điều kiện:** Khung 18:00–19:00 sân 1 đã có booking "confirmed".
- **Bước thực hiện:** Gửi `POST /bookings` với cùng sân, khung giờ overlap (VD 18:30–19:30).
- **Kết quả mong đợi:** HTTP 409, message "Khung giờ đã được đặt", không tạo booking mới.

### TC-PAY-01: Checkout tính đúng tiền cắt khung giờ
- **Tiền điều kiện:** Phiên chơi từ 17:30 (thấp điểm) đến 18:30 (cao điểm từ 18:00), đơn giá thấp điểm 60.000đ/h, cao điểm 90.000đ/h.
- **Bước thực hiện:** Đóng sân lúc 18:30.
- **Kết quả mong đợi:** courtFee = 30 phút × (60.000/h) + 30 phút × (90.000/h) = 30.000 + 45.000 = 75.000đ.

### TC-RBAC-01: Nhân viên không thể truy cập Settings
- **Tiền điều kiện:** Đăng nhập với tài khoản role = employee.
- **Bước thực hiện:** Gửi `PUT /settings/pricing`.
- **Kết quả mong đợi:** HTTP 403, không cập nhật dữ liệu.

---

## 7. Kiểm thử hiệu năng (K6)

| Kịch bản | Endpoint | Mục tiêu |
|---|---|---|
| Load test thông thường | `GET /courts`, `GET /bookings` | 100 VU đồng thời, response < 2s, error rate < 1% |
| Stress test checkout | `POST /payments/checkout` | Tăng dần VU đến khi phát hiện điểm giới hạn (breaking point) |
| Spike test | `POST /bookings` | Mô phỏng giờ cao điểm đặt sân đồng loạt |

Tiêu chí đạt: p95 response time < 2 giây, tỉ lệ lỗi (5xx) < 1% ở tải mục tiêu (100 người dùng đồng thời — theo NFR trong SRS).

---

## 8. Security Checklist (kiểm tra thủ công)
- [ ] Mật khẩu không bao giờ trả về trong response API.
- [ ] Access token hết hạn đúng thời gian cấu hình.
- [ ] Endpoint được bảo vệ trả 401 khi không có token, 403 khi sai Role.
- [ ] Input được validate, thử inject ký tự đặc biệt (`' OR 1=1--`) vào các trường tìm kiếm.
- [ ] Upload file: từ chối file không đúng định dạng ảnh, giới hạn dung lượng.
- [ ] Rate limiting cơ bản trên `/auth/login` để chống brute-force (khuyến nghị bổ sung).

---

## 9. Công cụ & Quy trình

### 9.1 Test file hiện có (backend — `backend/tests/*.test.js`, chạy bằng `npm test` → `jest`)
- `priceCalculator.test.js`
- `paymentValidation.test.js`
- `courtService.test.js`
- `dateTime.test.js`
- `phone.test.js`
- `inventoryService.test.js` — thêm cùng đợt merge hệ thống quản lý kho hàng (nhà cung cấp, phiếu nhập kho, tồn kho)

Tất cả các file trên là unit test thuần logic, không kết nối DB thật (không có `NODE_ENV=test` + MySQL trong CI), phù hợp việc CI hiện tại không có service DB.

### 9.2 Test file hiện có (frontend — `frontend/src/**/*.test.*`, chạy bằng `npm test` → `vitest`)
- `src/utils/roles.test.js` — hiện là file test duy nhất ở frontend.

### 9.3 Postman & K6 (chưa populated)
- `postman/`: hiện chỉ có `.gitkeep`, **chưa có** collection Postman thật. Đường dẫn `postman/Badminton Digital Management.postman_collection.json` ở trên là dự kiến đặt tên khi tạo, không phải file đã tồn tại.
- `k6/`: hiện chỉ có `.gitkeep`, **chưa có** script K6 thật (`k6/checkout-load-test.js` là ví dụ dự kiến, chưa tạo).

### 9.4 CI/CD hiện tại (`.github/workflows/ci.yml`)
Chạy trên `push`/`pull_request` vào `main` và `develop`, gồm 2 job độc lập, không phụ thuộc nhau:
- `backend-test`: `npm ci` + `npm test` (Jest) trong thư mục `backend/` — không có service MySQL, không chạy migration, không lint.
- `frontend-build`: `npm ci` + `npm run build` (Vite) trong thư mục `frontend/` — chỉ kiểm tra build production thành công, không chạy `vitest`.

CI hiện **không** chạy: lint (ESLint), Postman/Newman, K6, hay bất kỳ bước nào cần kết nối DB (xem `.github/workflows/ci.yml`).

---

## 10. Tiêu chí chấp nhận (Acceptance Criteria) tổng thể
- 100% API trong `APIDesign.md` có ít nhất 1 test case thành công + 1 test case lỗi.
- Không còn lỗi mức Critical/High mở (open) trước khi coi là "release-ready".
- Coverage unit test tầng Service ≥ 70% (khuyến nghị, không bắt buộc tuyệt đối cho dự án cá nhân).
- Test hiệu năng đạt tiêu chí ở mục 7 với tải 100 người dùng đồng thời.

---

## 11. Rủi ro & Giả định
- Vì là dự án cá nhân/portfolio, không có đội QA riêng — người phát triển tự đóng vai trò viết và chạy test.
- Dữ liệu test cần được seed lại (reset) trước mỗi lần chạy bộ test để đảm bảo tính lặp lại (idempotent).
