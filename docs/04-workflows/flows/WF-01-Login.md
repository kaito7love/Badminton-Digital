# WF-01 — Luồng Đăng nhập (UC-01, UC-03, UC-04)

**Actors:** Admin, Nhân viên, Khách hàng  
**Use Cases:** UC-01, UC-03, UC-04

---

## Luồng chính: Đăng nhập thành công

```
Người dùng
    │
    ├─→ Truy cập trang Login
    │
    ├─→ Nhập SĐT hoặc email (một ô duy nhất)
    │   Nhập password
    │
    ├─→ [POST /api/v1/auth/login] { identifier, password }
    │         │
    │         ├─→ Chuỗi có '@' → tra theo email
    │         │   Chuỗi toàn số → chuẩn hoá rồi tra theo phone
    │         │   (0903 333 333 / +84903333333 / 0903-333-333 → 0903333333)
    │         ├─→ bcrypt verify password
    │         ├─→ Kiểm tra tài khoản isActive = true
    │         ├─→ Tạo Access Token (JWT, TTL: 15 phút)
    │         └─→ Tạo Refresh Token (HttpOnly Cookie, TTL: 7 ngày)
    │
    └─→ Điều hướng theo Role:
            ├─→ admin    → Dashboard Admin
            ├─→ employee → Giao diện Quầy lễ tân
            └─→ customer → Trang Đặt sân / Tài khoản
```

---

## Luồng ngoại lệ: Sai thông tin

```
Nhập sai mật khẩu / email không tồn tại
    └─→ API trả về 401
        Hiển thị: "Số điện thoại/email hoặc mật khẩu không chính xác"
        (thông báo giống hệt nhau cho mọi trường hợp sai — phân biệt
         "chưa đăng ký" với "sai mật khẩu" là chỉ đường cho người dò
         xem số nào đã có tài khoản)
        Cho phép thử lại (không giới hạn bởi hệ thống)
```

---

## Luồng ngoại lệ: Tài khoản bị khóa

```
isActive = false
    └─→ API trả về 401
        Hiển thị: "Tài khoản bị khóa, vui lòng liên hệ Admin"
```

---

## Luồng: Khách hàng tự đăng ký

```
Khách hàng (chưa có tài khoản)
    │
    ├─→ Trang chủ → Đặt sân → "Đăng ký" (hoặc /register)
    │
    ├─→ Nhập họ tên + SĐT + mật khẩu (email không bắt buộc)
    │
    ├─→ [POST /api/v1/auth/register]
    │         │
    │         ├─→ Chuẩn hoá SĐT, kiểm tra chưa có tài khoản nào dùng số này
    │         ├─→ Tạo User (role: customer, email có thể NULL)
    │         │
    │         ├─→ Tìm Customer cùng (branch, SĐT) mà chưa gắn tài khoản:
    │         │     ├─→ CÓ  → gắn userId vào hồ sơ đó  ⇒ mergedHistory: true
    │         │     │        (khách từng ra chơi tại quầy giữ nguyên lịch sử
    │         │     │         chơi và mức chi tiêu tích luỹ)
    │         │     └─→ KHÔNG → tạo hồ sơ Customer mới
    │         │
    │         └─→ Trả về token luôn — đăng ký xong là đã đăng nhập
    │
    └─→ Về /my-bookings
```

**Chỉ mở cho vai trò khách hàng.** Tài khoản nhân viên vẫn phải do admin tạo
qua `/employees` — không có đường nào tự nâng quyền ở endpoint này.

Hai đường tạo tài khoản khách, kết quả như nhau:

| Đường | Ai làm | Kết quả |
|---|---|---|
| `POST /auth/register` | Khách tự làm trên web | Gắn vào hồ sơ cũ nếu trùng SĐT |
| `POST /customers` kèm `password` | Nhân viên nhập tại quầy | Tạo hồ sơ + tài khoản cùng lúc |
| `POST /customers` không `password` | Nhân viên nhập tại quầy | Chỉ hồ sơ; khách tự đăng ký sau sẽ nhận lại đúng hồ sơ này |

---

## Luồng: Quên mật khẩu (UC-03)

```
[Trang Login] → Nhấn "Quên mật khẩu"
    ↓
Nhập email
    ↓
[POST /api/v1/auth/forgot-password]
    ↓
Hệ thống gửi email chứa link reset token (có TTL)
    ↓
Người dùng nhấn link → Trang đặt mật khẩu mới
    ↓
Nhập mật khẩu mới + xác nhận
    ↓
[POST /api/v1/auth/reset-password]
    ↓
Mật khẩu được cập nhật → Điều hướng về trang Login
```

---

## Luồng: Đổi mật khẩu khi đã đăng nhập (UC-04)

```
[Trang cài đặt tài khoản]
    ↓
Nhập mật khẩu hiện tại + mật khẩu mới
    ↓
[PUT /api/v1/auth/change-password]
    ↓
Xác thực mật khẩu cũ → Cập nhật hash mới
    ↓
Thông báo thành công
```

---

## Token Refresh Flow (tự động)

```
Access Token hết hạn (15 phút)
    ↓
Frontend tự động gọi [POST /api/v1/auth/refresh-token]
    ↓ Refresh Token còn hạn (Cookie)
Nhận Access Token mới → Tiếp tục session
    ↓ Refresh Token hết hạn
Redirect về trang Login
```
