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
    ├─→ Nhập email / username
    │   Nhập password
    │
    ├─→ [POST /api/v1/auth/login]
    │         │
    │         ├─→ Xác thực email + bcrypt verify password
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
        Hiển thị: "Email hoặc mật khẩu không đúng"
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
