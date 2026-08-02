# Phase 2 — Ghi Chú & Quyết Định Kỹ Thuật

## 📌 Quyết Định Thiết Kế Quan Trọng
- **Snapshot giá tại thời điểm giao dịch:** `session_extras.unit_price` lưu giá tại thời điểm gọi món, không tham chiếu trực tiếp `extras.price` để hóa đơn cũ không bị thay đổi khi cập nhật giá.
- **Tách `users` và `customers`:** Khách vãng lai (`customers.user_id = NULL`) không cần tài khoản vẫn có thể được tra cứu qua SĐT.
- **Tính tiền theo khung giờ tại Service Layer:** `court_fee` không dùng DB trigger mà tính tại `CourtService` để dễ test độc lập và linh hoạt phân chia khung giờ.
- **Thao tác cần Transaction:** Đóng sân → tạo Invoice → tạo Payment → cập nhật `total_spent`.

## 📌 Index Khuyến Nghị Đã Đặc Tả
- `bookings (court_id, booking_date, start_time, end_time)` → Conflict check nhanh
- `customers (phone)` → Tìm kiếm khách nhanh
- `court_sessions (court_id, status)` → Truy vấn sân đang chơi
- `activity_logs (employee_id, created_at)` → Log theo nhân viên
