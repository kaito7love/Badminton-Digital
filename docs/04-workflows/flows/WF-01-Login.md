# WF-01 — Luồng Đăng nhập (UC-01, UC-02, UC-03, UC-04)

**Actors:** Admin, Nhân viên, Khách hàng  
**Use Cases:** UC-01, UC-02 (Đăng xuất), UC-03, UC-04

## Chống dò/spam — Rate limiting (`authRoutes.js`)

Đã triển khai (khác với ghi chú "khuyến nghị bổ sung" trong `TestPlan.md`
bản cũ — mục này đã CÓ trong code, tính theo IP, không theo tài khoản để
tránh bị lợi dụng khoá tài khoản người khác):

| Endpoint | Giới hạn | Khi vượt |
|---|---|---|
| `/login`, `/forgot-password`, `/reset-password` | 10 request / 15 phút / IP | 429 "Quá nhiều yêu cầu, vui lòng thử lại sau ít phút." |
| `/register` | 5 request / 60 phút / IP | 429 (message như trên) |
| `/refresh-token` | 30 request / 15 phút / IP | 429 (message như trên) — ngưỡng cao hơn hẳn vì mỗi tab/thiết bị tự làm mới token ngầm mỗi ~15 phút, tần suất gọi thật vốn đã cao

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
    │         ├─→ LUÔN tạo hồ sơ Customer mới gắn userId — KHÔNG tự gắn hồ sơ
    │         │     tại quầy trùng SĐT (chưa xác minh được người đăng ký là chủ số):
    │         │     ├─→ SĐT đã thuộc một hồ sơ khác → hồ sơ mới để trống phone
    │         │     │        (unique); khách tự xem hồ sơ thì thấy SĐT của tài khoản
    │         │     └─→ SĐT chưa ai giữ → hồ sơ mới mang luôn SĐT đó
    │         │
    │         └─→ Trả về token luôn — đăng ký xong là đã đăng nhập; response
    │               giống hệt nhau ở cả hai nhánh (không lộ "số này từng ra quầy")
    │
    └─→ Về /my-bookings
```

**Chỉ mở cho vai trò khách hàng.** Tài khoản nhân viên vẫn phải do admin tạo
qua `/employees` — không có đường nào tự nâng quyền ở endpoint này.

Các đường tạo tài khoản/hồ sơ khách:

| Đường | Ai làm | Kết quả |
|---|---|---|
| `POST /auth/register` | Khách tự làm trên web | Luôn tạo hồ sơ mới; lịch sử tại quầy trùng SĐT chờ nhân viên gộp |
| `POST /customers` kèm `password` | Nhân viên nhập tại quầy | Tạo hồ sơ + tài khoản cùng lúc |
| `POST /customers` không `password` | Nhân viên nhập tại quầy | Chỉ hồ sơ; khách tự đăng ký sau bằng SĐT này thì nhân viên gộp tại quầy |

**Gộp lịch sử tại quầy.** Khách đã chơi tại quầy trước khi đăng ký online thì hồ sơ cũ
vẫn giữ nguyên lịch sử. Màn Khách hàng gắn nhãn "Có tài khoản online chưa gộp" lên hồ sơ
đó; nhân viên xác minh người trước mặt vừa là chủ số vừa là chủ tài khoản rồi bấm "Gộp
vào tài khoản" (`POST /api/v1/customers/:id/merge-into-account`, chi tiết ở
`WF-05-CustomerManagement.md` mục F). Trang Tài khoản của khách chưa có buổi chơi nào
nhắc: "Từng chơi tại quầy trước khi có tài khoản? Nhờ nhân viên gộp lịch sử vào tài
khoản của bạn."

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

## Luồng: Đăng xuất (UC-02)

```
[Menu tài khoản] → "Đăng xuất"
    ↓
[POST /api/v1/auth/logout]  (yêu cầu authMiddleware — phải đang có Access
    │                         Token hợp lệ để gọi, không đăng xuất được
    │                         một session đã hết hạn token)
    ↓
AuthService.logout(userId): user.refreshToken = NULL trong DB
    ↓ (server KHÔNG gọi clearCookie — refresh token cũ trong cookie trình
    ↓  duyệt vẫn còn đó về mặt kỹ thuật, nhưng vô dụng vì không còn khớp
    ↓  giá trị đã lưu trong DB, nên /refresh-token sau đó sẽ luôn thất bại)
    ↓
Frontend (bất kể API thành công hay lỗi — VD access token đã hết hạn sẵn):
    xoá access_token, refresh_token, user_info, admin_selected_branch_id
    khỏi localStorage → Redirect về trang Login
```

Không có khái niệm "đăng xuất khỏi mọi thiết bị" — chỉ có 1 `refreshToken`
lưu trên `User`, nên đăng xuất ở 1 nơi sẽ vô hiệu hoá refresh token của MỌI
phiên đang đăng nhập bằng tài khoản đó (kể cả các tab/thiết bị khác chưa
chủ động đăng xuất) — access token 15 phút hiện có ở các phiên khác vẫn
dùng được cho tới khi hết hạn, chỉ refresh tiếp theo mới bị chặn.

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
