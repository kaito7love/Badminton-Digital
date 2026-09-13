# WF-Customer — Tổng hợp Workflow của Khách hàng

**Actor:** Khách hàng (Customer)  
**Quyền hạn:** Đặt lịch sân, xem lịch sử cá nhân, quản lý tài khoản

---

## 🔐 1. Xác thực tài khoản

```
[Truy cập Web / App]
       ↓
  Đăng nhập bằng SĐT hoặc email (1 ô "identifier") + mật khẩu
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

Khách hàng cũng có thể **tự đăng ký** tài khoản mới (không cần nhân viên lập
hộ) bằng SĐT hoặc email. Tài khoản luôn nhận hồ sơ riêng: nếu SĐT trùng với một
hồ sơ đã chơi tại quầy, lịch sử cũ chỉ được nối vào tài khoản sau khi nhân viên
xác minh khách tại quầy và bấm "Gộp vào tài khoản". Chi tiết đầy đủ (chuẩn
hoá SĐT, thông báo lỗi, refresh token, luồng tự đăng ký) xem `flows/WF-01-Login.md`.

Use Cases: UC-01 (Đăng nhập), UC-03 (Quên mật khẩu), UC-04 (Đổi mật khẩu)

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
  │  - Chi nhánh, Ngày, Sân, Thời gian,     │
  │    Tiền sân                             │
  │  - Phụ kiện đã gọi                      │
  │  - Số tiền thanh toán                   │
  │                                          │
  │ Thống kê tích lũy:                      │
  │  - Tổng số buổi chơi                    │
  │  - Tổng tiền đã chi tiêu                │
  │  - Hạng hội viên (Normal / Gold / VIP)  │
  └──────────────────────────────────────────┘
```

Vì hồ sơ Customer dùng chung toàn chuỗi (xem `flows/WF-05-CustomerManagement.md`),
lịch sử này gộp phiên chơi/booking ở **mọi chi nhánh** khách từng ghé, không
riêng 1 chi nhánh — hạng hội viên và tổng chi tiêu cũng cộng dồn toàn chuỗi.

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

| Hạng | Điều kiện (tổng chi tiêu toàn chuỗi) |
|------|-----------|
| Normal | Mặc định, &lt; 5.000.000đ |
| Gold | ≥ 5.000.000đ |
| VIP | ≥ 15.000.000đ |

Hạng được tính lại tự động ngay khi thanh toán tiền mặt hoàn tất, hoặc khi
webhook xác nhận thanh toán chuyển khoản (`PaymentService.js`), dựa trên
**tổng chi tiêu gộp toàn chuỗi** (Customer không còn phân theo chi nhánh).

> ⚠️ **Hiện tại hạng KHÔNG mang quyền lợi gì** — không có giảm giá tự động,
> không ưu tiên đặt sân, không thông báo/khuyến mãi riêng. Nơi duy nhất
> hạng được dùng là hiển thị 1 badge màu trên bảng khách hàng
> (`CustomersPage.jsx`). Chi tiết cơ chế hiện tại và các hướng phát triển
> có thể cân nhắc: xem `docs/05-extra/01-audit/LoyaltyTier.md`.
