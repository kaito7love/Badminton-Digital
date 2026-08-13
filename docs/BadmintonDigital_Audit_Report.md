# Audit Report: Realtime Logic & Implementation Plan

Dưới đây là báo cáo đánh giá (Audit Report) chi tiết về mức độ đáp ứng của hệ thống hiện tại so với tài liệu `BadmintonDigital_Realtime_Audit_Implementation_Plan.md`. 

Nhìn chung, hệ thống hiện tại mang tính chất cơ bản và **chưa đáp ứng được hầu hết các yêu cầu về kiến trúc Realtime, Concurrency, và chuẩn hóa Data Model** được đề ra trong tài liệu. Tỷ lệ đáp ứng ước tính khoảng **15 - 20%** (chủ yếu là đã có sẵn các table/model cơ bản).

---

## 1. Mức độ đáp ứng hiện tại (Gap Analysis)

### A. Hạ tầng Realtime (0%)
- **Hiện trạng:** Cả `backend/package.json` và `frontend/package.json` đều **không có** bất kỳ thư viện realtime nào (không có `socket.io`, `socket.io-client`, hay WebSocket). 
- **Đánh giá:** Tính năng realtime hoàn toàn chưa được implement. 

### B. Court State Model (Khoảng 20%)
- **Hiện trạng `Court.js`:** Đang sử dụng trường `status` với các giá trị `ENUM("empty", "playing", "maintenance")`.
- **Yêu cầu (Gap):** Tài liệu yêu cầu `Court.status` chỉ chứa `ACTIVE`, `MAINTENANCE`, `INACTIVE`. Trạng thái `PLAYING` và `AVAILABLE` phải được **derive** (tính toán động) dựa trên việc sân có `CourtSession` đang active hay không, chứ không lưu cứng vào DB.

### C. CourtSession Lifecycle (Khoảng 30%)
- **Hiện trạng `CourtSession.js`:** Đang dùng `start_time`, `end_time`, `employee_id`, và status `ENUM("playing", "closed")`.
- **Yêu cầu (Gap):** Tài liệu đề xuất đổi thành `started_at`, `ended_at`, `opened_by_employee_id`, `closed_by_employee_id`, và status là `PLAYING`, `COMPLETED`, `CANCELLED`. Hiện tại chưa tách bạch rõ ai là người mở/đóng sân (chỉ lưu 1 `employee_id`).

### D. Concurrency & Transaction Safety (Cần kiểm tra sâu logic, dự kiến < 20%)
- Mặc dù hệ thống có DB (MySQL + Sequelize), nhưng theo kinh nghiệm từ cấu trúc hiện tại, các chức năng "Open Court" hoặc "Inventory" khả năng cao **chưa có cơ chế Row Lock (SELECT ... FOR UPDATE)** để chặn Race Condition (2 nhân viên cùng mở 1 sân tại cùng 1 mili-giây).

### E. Branch Isolation (Đã có nền tảng ~ 50%)
- Các models như `Court.js`, `CourtSession.js` đều đã có `branch_id`. Đây là điểm tốt. Tuy nhiên, ở tầng Socket.IO (chưa làm) sẽ cần phải phân quyền room theo `branch_id`.

---

## 2. Các điểm Missing / Sai lệch nghiêm trọng cần khắc phục (Priority P0 & P1)

1. **Sai lệch Source of Truth của Court:** 
   Việc lưu trạng thái `playing` trực tiếp vào bảng `Court` là vi phạm nguyên tắc số 3 của tài liệu. Trạng thái thực tế của sân phải phụ thuộc vào việc có `CourtSession` nào đang `PLAYING` hay không.

2. **Thiếu hạ tầng Realtime:** 
   Chưa có Socket.IO.

3. **Thiếu Transaction Logic chặt chẽ:** 
   Các thao tác mở sân, tính tiền, mua nước (Extra) cần bọc trong DB Transaction với tính năng Row Locking để tránh xung đột dữ liệu.

---

## 3. Hướng khắc phục (Action Plan)

Để tiến hành nâng cấp hệ thống đạt chuẩn như tài liệu, chúng ta cần chia làm **3 Giai đoạn (Phases)**. Không nên nhảy vào setup Socket.IO ngay lập tức mà phải chuẩn hóa Data trước.

### Phase 1: Chuẩn hóa Database Models & REST API (P0)
1. **Refactor `Court` Model:** Đổi `status` thành `ENUM('active', 'maintenance', 'inactive')`. Xóa trạng thái `empty` và `playing`.
2. **Refactor `CourtSession` Model:** Đổi `status` thành `ENUM('playing', 'completed', 'cancelled')`. Tách `employee_id` thành `opened_by_employee_id` và `closed_by_employee_id` (nếu cần thiết theo business logic).
3. **Refactor Controllers:** Sửa API get danh sách sân để tự động tính toán (derive) trạng thái hiện tại (AVAILABLE / PLAYING) dựa trên các Session đang chạy. Đảm bảo API trả về đúng format `Snapshot API` như trong tài liệu.
4. **Bổ sung DB Transactions & Row Locks:** Review lại các hàm `create` CourtSession, Booking, Inventory và thêm `transaction`, `lock: transaction.LOCK.UPDATE`.

### Phase 2: Setup Socket.IO & Branch Isolation (P1)
1. Cài đặt `socket.io` ở backend và `socket.io-client` ở frontend.
2. Viết Middleware cho Socket để verify JWT và chỉ cho phép User join vào room của chi nhánh: `socket.join("branch:" + branchId)`.
3. Viết cơ chế emit event. **Lưu ý cực kỳ quan trọng:** Chỉ gọi `io.to().emit()` ở bên trong block `try...catch` của API sau khi DB Transaction đã `commit` thành công.

### Phase 3: Frontend Integration & State Sync (P1)
1. Frontend gọi API REST để lấy snapshot ban đầu của chi nhánh.
2. Connect WebSocket, lắng nghe các event (`court.session.started`, `court.session.completed`, v.v.).
3. Viết cơ chế tính toán timer (thời gian đá) ở Frontend, không lạm dụng ping từ server.
4. Xử lý Reconnect (khi rớt mạng có lại -> gọi lại REST API để sync snapshot).

---

## Kết luận

Hệ thống hiện tại mới chỉ là một bộ CRUD REST API cơ bản. Việc bạn đưa ra tài liệu `Implementation_Plan.md` này là rất chính xác để bịt các lỗ hổng về logic trước khi đưa lên production.

Bạn có muốn tôi bắt đầu thực hiện **Phase 1 (Chuẩn hóa Database Models & REST API)** không? Nếu đồng ý, tôi sẽ tạo một bản Implementation Plan chi tiết về code changes cho Phase 1 để bạn duyệt.
