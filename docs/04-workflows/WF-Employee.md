# WF-Employee — Tổng hợp Workflow của Nhân viên

**Actor:** Nhân viên (Employee)  
**Quyền hạn:** Vận hành quầy lễ tân — mở/đóng sân, booking, checkout, quản lý khách

> File này mô tả đúng vai trò `employee`. Vai trò `branch_manager` (thêm gần
> đây) làm được TẤT CẢ những gì `employee` làm được ở đây, CỘNG THÊM một số
> quyền quản lý chi nhánh mà `employee` không có: CRUD định nghĩa sân
> (`flows/WF-02-CourtOperations.md` §Ghi chú vai trò), quản lý nhân viên
> (`flows/WF-06-EmployeeManagement.md`), và xem Dashboard/Báo cáo
> (`flows/WF-08-ReportsSettings.md`). Cả hai vai trò đều bị khoá cứng vào
> đúng 1 chi nhánh — không có bộ chuyển chi nhánh như Admin (`WF-Admin.md` §7).

---

## 🔐 1. Xác thực tài khoản

```
[Truy cập hệ thống]
       ↓
  Nhập SĐT hoặc email (1 ô "identifier") + mật khẩu
       ↓
  Hệ thống xác thực → Vào giao diện Nhân viên (Court Monitor)
```

Chi tiết đầy đủ (chuẩn hoá SĐT, thông báo lỗi, refresh token) xem
`flows/WF-01-Login.md`.

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
  │  │       (danh sách khách toàn chuỗi, │
  │  │        không riêng chi nhánh này) │
  │  └─→ Không: Khách vãng lai — có SĐT  │
  │       thì tự gộp vào hồ sơ cũ nếu    │
  │       khách đã từng chơi ở chi nhánh │
  │       KHÁC                           │
  └──────────────────────────────────────┘
       ↓
  Xác nhận → Hệ thống tạo CourtSession
              Bắt đầu tính giờ ⏱️
              Sân → trạng thái "Đang chơi"
```

Chi tiết luồng gộp/tạo hồ sơ khách vãng lai xem `flows/WF-02-CourtOperations.md` §A.

Use Cases: UC-06

---

## 🏸 3. Gọi thêm phụ kiện & quản lý kho hàng

```
[Màn hình sân đang chơi]
       ↓
  Chọn "Gọi thêm" (nước uống / phụ kiện) → chọn sản phẩm + số lượng
       ↓
  Hệ thống trừ tồn kho CỦA CHI NHÁNH ĐANG LÀM VIỆC, ghi SessionExtra
       ↓ Đủ hàng                    ↓ Không đủ
  Ghi nhận thành công          400 "Không đủ tồn kho tại chi nhánh
                                    này. Hiện có: {N}"
```

Nhân viên cũng tạo được **phiếu nhập kho** và **điều chỉnh kho thủ công**
(không chỉ Admin) — toàn bộ mô hình tồn kho theo chi nhánh, giá vốn bình quân
gia quyền, các loại giao dịch kho, và trả lại phụ kiện chưa dùng xem đầy đủ ở
`flows/WF-07-Accessories.md`.

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
    ├─→ Tiền mặt → Nhận tiền → Gọi checkout → Payment 'paid' NGAY
    │      → Cập nhật total_spent + hạng hội viên của khách ngay lúc này
    └─→ Chuyển khoản → Gọi checkout → hiển thị mã VietQR → Payment tạm
           ở trạng thái 'pending' cho tới khi ngân hàng xác nhận qua webhook
           (không có nút "nhân viên xác nhận đã nhận tiền" thủ công —
            total_spent/hạng hội viên chỉ cộng khi webhook về)
       ↓
  Hệ thống tạo/cập nhật Invoice
       ↓
  In hóa đơn / Xuất PDF
```

Chi tiết đầy đủ (idempotency key, cấu trúc VietQR, webhook) xem
`flows/WF-04-Payment.md`.

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

## 🛍️ 8. Bán lẻ Dụng cụ tại quầy (POS) — mới

```
[Trang Bán Lẻ Dụng Cụ] → tab "Bán hàng"
       ↓
  Chọn sản phẩm (vợt, áo, quần...) → thêm vào giỏ
       ↓ (hệ thống trừ tồn kho CỦA CHI NHÁNH ĐANG LÀM VIỆC NGAY khi thêm
       ↓  vào giỏ, không đợi thanh toán)
  Nhập giảm giá (nếu có) → Chọn phương thức thanh toán
       ↓
  Thanh toán → Tạo Invoice/Payment độc lập với mọi CourtSession
```

Hoàn toàn độc lập với luồng thuê sân (mục 2–6) — không cần mở sân, không
cần khách đang chơi. Nhân viên làm được đầy đủ trừ tab "Danh mục sản phẩm"
(CRUD catalog — chỉ Admin/`branch_manager`). Giỏ hàng hiện tại KHÔNG gán
được khách hàng cụ thể qua giao diện (luôn ẩn danh, không cộng dồn hạng hội
viên). Chi tiết đầy đủ (idempotency, VietQR, đối chiếu kho) xem
`flows/WF-09-Retail.md`.

Use Cases: UC-24

---

## 👤 9. Quản lý Khách hàng

```
[Trang Khách hàng]
       ↓
  ├─→ Tìm kiếm theo tên / SĐT — TOÀN CHUỖI, không riêng chi nhánh này
  │       (Customer là hồ sơ dùng chung mọi chi nhánh)
  ├─→ Thêm khách hàng mới (tên, SĐT, email)
  ├─→ Sửa thông tin khách hàng
  └─→ Xem lịch sử chơi & tổng tiền tích lũy — gộp mọi chi nhánh khách
        từng chơi, không chỉ chi nhánh đang làm việc
```

Nhân viên KHÔNG xóa được khách hàng (`DELETE` chỉ dành cho `admin`). Chi tiết
đầy đủ xem `flows/WF-05-CustomerManagement.md`.

Use Cases: UC-14, UC-15
