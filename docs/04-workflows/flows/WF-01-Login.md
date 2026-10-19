# WF-01 — Luồng Đăng nhập (UC-01, UC-02, UC-03, UC-04)

**Actors:** Admin, Nhân viên, Khách hàng  
**Use Cases:** UC-01, UC-02 (Đăng xuất), UC-03, UC-04
**Cập nhật:** 18/10/2026 — refresh token trả trong body (không cookie) và xoay vòng, thu hồi phiên tức thì (`token_version`), chính sách mật khẩu.

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
    │         ├─→ Tạo Access Token (JWT, TTL: 15 phút, mang claim `tv` =
    │         │     users.token_version)
    │         └─→ Tạo Refresh Token (TTL: 7 ngày) — trả trong BODY cùng access
    │               token (không dùng cookie); client tự lưu (localStorage);
    │               server chỉ lưu sha256 của nó
    │
    └─→ Điều hướng theo Role:
            ├─→ admin / branch_manager → Dashboard
            ├─→ employee               → Giao diện Quầy lễ tân
            └─→ customer               → Về trang đang xem (VD /dat-san) hoặc Trang chủ
```

Đăng nhập chống dò tài khoản: tài khoản không tồn tại vẫn tốn thời gian so sánh mật khẩu như tài khoản có thật; "tài khoản bị khóa" chỉ được nói ra khi mật khẩu đã đúng.

---

## Luồng ngoại lệ: Sai thông tin

```
Nhập sai mật khẩu / email không tồn tại
    └─→ API trả về 401
        Hiển thị: "Số điện thoại/email hoặc mật khẩu không chính xác"
        (thông báo giống hệt nhau cho mọi trường hợp sai — phân biệt
         "chưa đăng ký" với "sai mật khẩu" là chỉ đường cho người dò
         xem số nào đã có tài khoản)
        Cho phép thử lại (tối đa 10 lần / 15 phút / IP — xem bảng rate limiting phía trên)
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
    ├─→ Trang chủ → Đặt sân → "Đăng ký" (hoặc /register); đăng ký giữa lúc đặt sân
    │     thì sau đó quay lại đúng lựa chọn (chi nhánh, ngày, sân, khung giờ)
    │
    ├─→ Nhập họ tên + SĐT + mật khẩu (email không bắt buộc);
    │     mật khẩu phải đạt chính sách (8–72 byte, không thuộc danh sách phổ biến,
    │     không chứa SĐT/email/tên của chính mình) — vi phạm → 400
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
    └─→ Về trang trước khi đăng ký (nếu đang đặt sân) hoặc /my-bookings
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
[POST /api/v1/auth/forgot-password]  — luôn trả CÙNG một phản hồi 200 cho email có
    ↓                                  thật lẫn email bịa (kể cả khi chưa cấu hình SMTP)
Hệ thống gửi email chứa link reset token (có TTL) nếu email có thật và SMTP đã cấu hình
    ↓
Người dùng nhấn link → Trang đặt mật khẩu mới
    ↓
Nhập mật khẩu mới + xác nhận
    ↓
[POST /api/v1/auth/reset-password]
    ↓
Mật khẩu được cập nhật → mọi phiên đang đăng nhập hết hiệu lực (token_version tăng)
    ↓
Điều hướng về trang Login
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
Xác thực mật khẩu cũ → kiểm chính sách mật khẩu mới → Cập nhật hash mới
    ↓
token_version tăng: access token và refresh token cũ ở các thiết bị khác chết ngay;
thiết bị đang đổi nhận CẶP TOKEN MỚI trong phản hồi và tiếp tục dùng bình thường
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
AuthService.logout(userId): user.refreshToken = NULL và token_version tăng 1
    ↓ (refresh token cũ không còn khớp giá trị trong DB nên /refresh-token sau đó
    ↓  luôn thất bại; access token còn hạn cũng bị từ chối ngay vì lệch `tv`)
    ↓
Frontend (bất kể API thành công hay lỗi — VD access token đã hết hạn sẵn):
    xoá access_token, refresh_token, user_info, admin_selected_branch_id
    khỏi localStorage → Redirect về trang Login
```

Không có khái niệm "đăng nhập nhiều thiết bị độc lập" — chỉ có 1 `refreshToken`
(cộng 1 token ân hạn) lưu trên `User`, và `token_version` dùng chung cho cả tài khoản.
Đăng xuất ở 1 nơi vô hiệu hoá **ngay** mọi phiên của tài khoản đó, kể cả access
token còn hạn ở tab/thiết bị khác (từ khi có `token_version`; trước đây access
token cũ còn dùng được tới 15 phút). Hệ quả đã biết và đã được chủ dự án cân nhắc hoãn:
hai người dùng chung một tài khoản (ví dụ tài khoản demo) sẽ đá nhau ra; sửa đúng cần một bảng refresh token riêng.

---

## Token Refresh Flow (tự động)

```
Access Token hết hạn (15 phút) hoặc nhận 401
    ↓
Frontend (apiClient) tự động gọi [POST /api/v1/auth/refresh-token] { refreshToken }
    ↓ Refresh Token còn hạn
Nhận CẶP MỚI (accessToken + refreshToken) → lưu lại → gọi lại request vừa lỗi
    ↓ Máy chủ TỪ CHỐI làm mới (400 / 401 / 403)
Xoá phiên → Redirect về trang Login
    ↓ Lỗi mạng hoặc 5xx
KHÔNG đăng xuất — ném lỗi để nơi gọi thử lại
```

**Xoay vòng.** Mỗi lần làm mới thành công, server đổi refresh token và giữ hash cũ thêm **30 giây** (`previous_refresh_token`). Trong khoảng này token cũ chỉ đổi được lấy access token mới, **không** nhận refresh token mới — để hai tab, hoặc luồng SSE và trang cùng làm mới một lúc, không đá nhau ra. Cùng lúc chỉ một bên thắng (so sánh-và-đổi nguyên tử trong `AuthService.refreshAccessToken`). Quá 30 giây, dùng lại token cũ → 401.

Luồng thời gian thực (`realtimeClient`) cũng làm mới token trước mỗi lần nối lại.
