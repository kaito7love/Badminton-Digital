# WF-Employee — Tổng hợp Workflow của Nhân viên

**Actor:** Nhân viên (Employee)  
**Quyền hạn:** Vận hành quầy lễ tân — mở/đóng sân, booking, checkout, quản lý khách

---

## 🔐 1. Xác thực tài khoản

```
[Truy cập hệ thống]
       ↓
  Nhập email + mật khẩu
       ↓
  Hệ thống xác thực → Vào giao diện Nhân viên (Court Monitor)
```

Use Cases: UC-01, UC-04

---

## 🏸 2. Vận hành Sân — Luồng Walk-in (Khách đến thẳng)

```
[Màn hình tổng quan sân]
       ↓
  Thấy sân đang TRỐNG
       ↓
  Chọn sân → Nhấn "Mở Sân"
       ↓
  ┌──────────────────────────────────────┐
  │ Gán khách hàng? (optional)           │
  │  ├─→ Có: Tìm kiếm theo SĐT / tên   │
  │  └─→ Không: Khách vãng lai          │
  └──────────────────────────────────────┘
       ↓
  Xác nhận → Hệ thống tạo CourtSession
              Bắt đầu tính giờ ⏱️
              Sân → trạng thái "Đang chơi"
```

Use Cases: UC-06

---

## 🏸 3. Gọi thêm phụ kiện vào sân đang chơi

```
[Màn hình sân đang chơi]
       ↓
  Chọn "Gọi thêm" (nước uống / phụ kiện)
       ↓
  Chọn loại phụ kiện + số lượng
       ↓
  Hệ thống kiểm tra tồn kho
       ↓ Đủ hàng           ↓ Không đủ
  Ghi vào SessionExtra   Cảnh báo thiếu hàng
  Trừ kho tự động
```

Use Cases: UC-17

---

## 🔄 4. Chuyển sân cho khách đang chơi

```
[Màn hình sân đang chơi]
       ↓
  Nhấn "Chuyển sân"
       ↓
  Chọn sân đích (phải đang TRỐNG)
       ↓
  Xác nhận → CourtSession chuyển sang sân mới
              Sân cũ → "Trống"
              Sân mới → "Đang chơi"
```

Use Cases: UC-08

---

## 🔒 5. Đóng sân & Tính tiền

```
[Màn hình sân đang chơi]
       ↓
  Nhấn "Đóng sân"
       ↓
  Hệ thống ghi nhận end_time
       ↓
  Tính tiền tự động:
    - Tiền sân = (Số phút / 60) × Đơn giá khung giờ
      (Xét cắt khung cao điểm / thấp điểm)
    - Tiền phụ kiện = Σ SessionExtras
       ↓
  Hiển thị bảng tổng kết → Chuyển sang UC-18 (Thanh toán)
```

Use Cases: UC-07

---

## 💳 6. Thanh toán & Xuất hóa đơn

```
[Màn hình Thanh toán]
       ↓
  Hiển thị chi tiết:
    - Tiền sân
    - Tiền phụ kiện
    - Tổng trước giảm giá
       ↓
  Áp dụng mã giảm giá? (optional)
    ├─→ Có: Nhập mã / % giảm → Hệ thống tính lại
    └─→ Không: Bỏ qua
       ↓
  Chọn phương thức thanh toán:
    ├─→ Tiền mặt → Nhận tiền → Xác nhận
    └─→ Chuyển khoản → Hiển thị mã VietQR → Xác nhận đã nhận tiền
       ↓
  Hệ thống tạo Invoice + Payment
  Cập nhật total_spent của khách (nếu có tài khoản)
       ↓
  In hóa đơn / Xuất PDF
```

Use Cases: UC-18

---

## 📅 7. Quản lý Đặt lịch (Booking)

```
[Trang Booking]
       ↓
  ┌─────────────────────────────────────────┐
  │ A. Tạo booking mới                      │
  │    → Chọn sân, ngày, khung giờ         │
  │    → Hệ thống kiểm tra trùng lịch      │
  │    → Thành công → Booking "Pending"    │
  │    → Xác nhận → Booking "Confirmed"    │
  │                                         │
  │ B. Sửa / Hủy booking                   │
  │    → Chọn booking → Sửa giờ / Hủy     │
  │                                         │
  │ C. Xác nhận booking của khách tự đặt   │
  │    → Chuyển trạng thái Pending → Confirmed │
  └─────────────────────────────────────────┘
```

Use Cases: UC-10, UC-11, UC-12, UC-13

---

## 👤 8. Quản lý Khách hàng

```
[Trang Khách hàng]
       ↓
  ├─→ Tìm kiếm theo tên / SĐT
  ├─→ Thêm khách hàng mới (tên, SĐT, email)
  ├─→ Sửa thông tin khách hàng
  └─→ Xem lịch sử chơi & tổng tiền tích lũy
```

Use Cases: UC-14, UC-15
