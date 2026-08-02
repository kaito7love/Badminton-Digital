# WF-Customer — Tổng hợp Workflow của Khách hàng

**Actor:** Khách hàng (Customer)  
**Quyền hạn:** Đặt lịch sân, xem lịch sử cá nhân, quản lý tài khoản

---

## 🔐 1. Xác thực tài khoản

```
[Truy cập Web / App]
       ↓
  Đăng nhập bằng email + mật khẩu
       ↓
  ┌──────────────────────────────────────┐
  │ Hệ thống xác thực JWT               │
  └──────────────────────────────────────┘
       ↓ Thành công         ↓ Thất bại
  Vào trang Khách hàng   Hiển thị lỗi
                              ↓
                         [Quên mật khẩu?]
                              ↓
                         Nhập email → Nhận link reset
                              ↓
                         Đặt mật khẩu mới
```

Use Cases: UC-01, UC-03, UC-04

---

## 📅 2. Đặt lịch sân trước (Pre-Booking)

```
[Trang Đặt sân]
       ↓
  Chọn sân muốn đặt
       ↓
  Chọn ngày đặt
       ↓
  Chọn khung giờ (startTime – endTime)
       ↓
  Hệ thống kiểm tra trùng lịch (UC-11)
       ↓ Còn trống              ↓ Đã có booking
  Xác nhận thông tin        Thông báo trùng lịch
       ↓                    Gợi ý khung giờ trống khác
  Gửi yêu cầu đặt sân
       ↓
  Booking tạo → trạng thái "Pending"
       ↓
  Chờ Nhân viên xác nhận (UC-13)
       ↓
  Booking → trạng thái "Confirmed" ✅
```

Use Cases: UC-10, UC-11

---

## 🔄 3. Sửa / Hủy lịch đặt

```
[Trang Lịch đặt của tôi]
       ↓
  Xem danh sách booking (Pending / Confirmed)
       ↓
  ┌───────────────────────────────────┐
  │ A. Sửa booking                   │
  │    → Chọn booking → Đổi giờ/ngày│
  │    → Hệ thống kiểm tra lại       │
  │    → Cập nhật nếu hợp lệ         │
  │                                   │
  │ B. Hủy booking                   │
  │    → Chọn booking → Xác nhận hủy │
  │    → Booking → "Cancelled"        │
  └───────────────────────────────────┘
```

Use Cases: UC-12

---

## 📖 4. Xem lịch sử chơi & chi tiêu

```
[Trang Tài khoản → Lịch sử]
       ↓
  ┌──────────────────────────────────────────┐
  │ Lịch sử phiên chơi (CourtSessions)      │
  │  - Ngày, Sân, Thời gian, Tiền sân       │
  │  - Phụ kiện đã gọi                      │
  │  - Số tiền thanh toán                   │
  │                                          │
  │ Thống kê tích lũy:                      │
  │  - Tổng số buổi chơi                    │
  │  - Tổng tiền đã chi tiêu                │
  │  - Hạng hội viên (Normal / Gold / VIP)  │
  └──────────────────────────────────────────┘
```

Use Cases: UC-15

---

## 👤 5. Quản lý tài khoản cá nhân

```
[Trang Cài đặt tài khoản]
       ↓
  ├─→ Xem / Cập nhật thông tin cá nhân
  │       (Họ tên, Email, SĐT)
  └─→ Đổi mật khẩu
          → Nhập mật khẩu cũ + mật khẩu mới
          → Xác nhận → Cập nhật
```

Use Cases: UC-04

---

## 🏷️ Hệ thống Hạng Hội viên (Loyalty Tier)

| Hạng | Điều kiện | Quyền lợi |
|------|-----------|-----------|
| Normal | Mặc định | Tiêu chuẩn |
| Gold | Tổng chi tiêu ≥ 5.000.000đ | Ưu đãi đặc biệt |
| VIP | Tổng chi tiêu ≥ 15.000.000đ | Ưu tiên đặt sân, giảm giá |

> Hạng được cập nhật tự động sau mỗi lần thanh toán thành công.
