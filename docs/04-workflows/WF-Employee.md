# WF-Employee — Tổng hợp Workflow của Nhân viên

**Actor:** Nhân viên (Employee)  
**Quyền hạn:** Vận hành quầy lễ tân — mở/đóng sân, booking, checkout, bán lẻ, quản lý khách, vận hành thi đấu
**Cập nhật:** 18/10/2026 (khớp `UseCase.md` v1.3; mục 10–12 là mới)

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

Chi tiết đầy đủ (chuẩn hoá SĐT, thông báo lỗi, refresh token xoay vòng) xem
`flows/WF-01-Login.md`. Sau khi đăng nhập, màn hình mở một luồng thời gian thực theo chi nhánh (mục 10); đổi mật khẩu ở thiết bị khác làm phiên này hết hiệu lực ngay.

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

Số điện thoại khách vãng lai được kiểm tra định dạng (`123`, `abc` bị từ chối; để trống được). Một sân không bao giờ có hai phiên đang mở, kể cả khi hai nhân viên bấm cùng lúc (DB chặn). Chi tiết luồng gộp/tạo hồ sơ khách vãng lai xem `flows/WF-02-CourtOperations.md` §A.

**Mở sân từ lịch đặt:** API hỗ trợ (lịch phải là của hôm nay; mở sớm hơn 60 phút hoặc muộn hơn giờ kết thúc phải xác nhận lại tường minh; mở xong lịch chuyển "Completed") nhưng giao diện hiện chưa có nút này — nhân viên mở sân như luồng walk-in rồi gán khách. Xem `CourtStateModel.md` mục 5.

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
              Tiền đoạn đã chơi ở sân cũ được chốt (accrued_court_fee)
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
    - Tiền sân = phần thời gian trong khung cao điểm × giá cao điểm
                 + phần còn lại × giá thấp điểm (theo giờ CHI NHÁNH),
                 cộng tiền các đoạn đã chơi trước khi đổi sân,
                 làm tròn về bội số 1.000đ MỘT lần ở cuối
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
  Giảm giá tay? (optional — mã giảm giá KHÔNG dùng cho tiền sân)
    ├─→ Có: nhập số tiền hoặc % + LÝ DO (bắt buộc) → Hệ thống tính lại
    │       employee bị chặn trần (mặc định 10% số còn phải trả, chỉnh ở
    │       Cài đặt); vượt trần → 403, cần quản lý chi nhánh hoặc Admin
    └─→ Không: Bỏ qua
       ↓
  Chọn phương thức thanh toán:
    ├─→ Tiền mặt → Nhận tiền → Gọi checkout → Payment 'paid' NGAY
    │      → Cập nhật total_spent + hạng hội viên của khách ngay lúc này
    └─→ Chuyển khoản (chỉ khi quán đã cấu hình ngân hàng và khoá webhook,
           nếu chưa thì bị từ chối) → Gọi checkout → hiển thị mã VietQR → Payment tạm
           ở trạng thái 'pending' cho tới khi ngân hàng xác nhận qua webhook
           (không có nút "nhân viên xác nhận đã nhận tiền" thủ công —
            total_spent/hạng hội viên chỉ cộng khi webhook về)
       ↓
  Hệ thống tạo/cập nhật Invoice
       ↓
  In hóa đơn / Xuất PDF
```

Chi tiết đầy đủ (idempotency key, cấu trúc VietQR, webhook) xem
`flows/WF-04-Payment.md`. Nhân viên không huỷ (void) được hoá đơn đã thanh toán — việc đó dành cho quản lý chi nhánh và Admin (UC-30).

Use Cases: UC-18

---

## 📅 7. Quản lý Đặt lịch (Booking)

```
[Trang Booking]
       ↓
  ┌─────────────────────────────────────────┐
  │ A. Tạo booking mới                      │
  │    → Nhập SĐT khách: màn hình tra số   │
  │      trước khi lưu, gợi ý hồ sơ trùng  │
  │    → Chọn sân, ngày, khung giờ         │
  │    → Hệ thống kiểm tra (một nguồn      │
  │      checkAvailability): sân khai thác,│
  │      chưa qua giờ, trong giờ mở cửa,   │
  │      không trùng lịch                  │
  │    → Thành công → Booking "Pending"    │
  │      (cả khi nhân viên tạo)            │
  │                                         │
  │ B. Sửa / Hủy booking                   │
  │    → Chọn booking → Đổi sân/ngày/giờ   │
  │      hoặc Hủy (khách có tài khoản được │
  │      báo bằng thông báo)               │
  │                                         │
  │ C. Xác nhận booking                    │
  │    → Pending → Confirmed (khách của    │
  │      lịch tự đặt nhận thông báo)       │
  └─────────────────────────────────────────┘
```

- Nhân viên không bị các giới hạn dành cho khách (đặt xa hơn 14 ngày, dài hơn 3 giờ, tối đa 5 lịch giữ); lịch **do nhân viên tạo không bao giờ tự huỷ**, còn lịch `pending` do khách tự đặt mà chưa được duyệt sẽ tự huỷ theo chính sách giữ chỗ (mặc định 24 giờ, không muộn hơn 60 phút trước giờ bắt đầu) — nên duyệt kịp thời.
- Danh sách lịch tải lại **tức thì** khi máy khác đổi lịch (SSE) và không tải lại trong lúc form đang mở.
- Lỗi của luồng này hiện ngay trong trang (không dùng hộp thoại trình duyệt); các trang cũ khác còn dùng `alert()`.

Use Cases: UC-10, UC-11, UC-12, UC-13

---

## 🛍️ 8. Bán lẻ Dụng cụ tại quầy (POS) — mới

```
[Trang Bán Lẻ Dụng Cụ] → tab "Bán hàng"
       ↓
  Chọn sản phẩm (vợt, áo, quần...) → thêm vào giỏ
       ↓ (hệ thống trừ tồn kho CỦA CHI NHÁNH ĐANG LÀM VIỆC NGAY khi thêm
       ↓  vào giỏ, không đợi thanh toán)
  Áp mã giảm giá (xem trước mức giảm) hoặc giảm giá tay (kèm lý do, chịu trần)
       ↓
  Chọn phương thức thanh toán → Thanh toán
       ↓
  Tạo Invoice (nhiều dòng) + Payment độc lập với mọi CourtSession
```

"Huỷ giỏ" hoàn kho và huỷ đơn; đơn `open` bỏ dở quá 6 giờ được hệ thống tự huỷ và hoàn kho; màn Bán lẻ nhớ đơn đang mở theo chi nhánh nên F5 hay đổi tab không mất giỏ.

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
  ├─→ Xem lịch sử chơi & tổng tiền tích lũy — gộp mọi chi nhánh khách
  │     từng chơi, không chỉ chi nhánh đang làm việc
  └─→ Gộp hồ sơ tại quầy vào tài khoản online (xem bên dưới)
```

Nhân viên KHÔNG xóa được khách hàng (`DELETE` chỉ dành cho `admin`), và không xoá được hồ sơ đang gắn tài khoản đăng nhập. Chi tiết
đầy đủ xem `flows/WF-05-CustomerManagement.md`.

**Gộp hồ sơ (UC-29):** khi khách tự đăng ký trên web bằng đúng số từng chơi tại quầy, hệ thống **không** tự gắn tài khoản vào lịch sử cũ. Danh sách khách đánh dấu hồ sơ tại quầy có "tài khoản chờ gộp". Nhân viên xác minh khách tại quầy (đúng người, đúng số), bấm "Gộp vào tài khoản": phiên chơi, lịch đặt, đơn bán lẻ chuyển sang hồ sơ tài khoản, tổng chi tiêu và hạng được tính lại, hồ sơ cũ bị xoá mềm, có nhật ký `customer.merged`, và hồ sơ thi đấu theo về.

Use Cases: UC-14, UC-15, UC-29

---

## ⚡ 10. Màn hình cập nhật tức thì (mới)

```
Đăng nhập → mở luồng SSE của chi nhánh (/realtime/stream)
       ↓
  Máy khác mở/đóng/chuyển sân, đổi lịch → sự kiện court:updated / booking:changed
       ↓
  Trang Sân / Lịch đặt nạp lại bằng REST (không nạp lại khi đang nhập dở form)
```

Sự kiện chỉ là tín hiệu "có thay đổi" (không mang dữ liệu cá nhân). Mất kết nối thì client tự nối lại (2 → 30 giây) và nạp lại dữ liệu; không nhận được nhịp `ping` trong 60 giây coi là đứt kết nối.

---

## 🛒 11. Chốt đơn online của khách tại quầy (mới)

```
Khách đặt đơn online chọn "tiền mặt" → hàng đã được giữ, đơn "open"
       ↓
  Khách tới quầy nhận hàng và trả tiền
       ↓
  Nhân viên chốt bằng POST /sales-orders/:id/checkout (như đơn POS)
```

Đơn online chọn chuyển khoản không cần nhân viên: webhook xác nhận thì đơn tự "paid"; quá 30 phút chưa trả thì tự huỷ và hoàn kho. Nếu tiền về sau khi đơn đã huỷ, webhook bị từ chối và ghi nhật ký — quầy đọc nhật ký hoạt động rồi hoàn tiền thủ công. Xem `UseCase.md` UC-26.

Use Cases: UC-26, UC-24

---

## 🏆 12. Vận hành thi đấu (mới)

Nhân viên (`employee`) **vận hành** giải đấu và buổi giao lưu trong ngày: xem danh sách giải, điểm danh, bốc thăm tại sân, gọi trận kế tiếp ra sân, bấm điểm trực tiếp, mở màn hình TV, xác nhận điểm trình tạm của đồng đội chưa có tài khoản; **tạo và chốt giải** thuộc `branch_manager`/Admin. Nếu dịch vụ thi đấu chưa bật, menu "Thi đấu" tự ẩn. Chi tiết: `UseCase.md` UC-31 và `services/competition-service/docs/06-tran-dau-giai-dau-giao-luu.md`.

Use Cases: UC-31

