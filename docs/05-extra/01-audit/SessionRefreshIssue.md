# Vì sao cứ ~15 phút lại bị bắt đăng nhập lại

**Triệu chứng bạn gặp:** đang dùng bình thường, không rảnh tay, nhưng cứ
khoảng 15 phút là bị đẩy về màn hình đăng nhập.

**Kết luận:** cơ chế refresh token bạn hiểu là đúng — access token 15 phút
hết hạn thì hệ thống lẽ ra phải tự làm mới ngầm, chỉ logout thật khi refresh
token (7 ngày) cũng hết hạn hoặc không hoạt động trong thời gian dài. Có 1
lỗi thiết kế khiến việc tự làm mới ngầm **bị hỏng trong 1 tình huống cụ
thể, rất dễ gặp**: đăng nhập cùng 1 tài khoản ở nơi thứ 2 trong lúc nơi thứ
1 vẫn đang mở.

---

## 1. Cơ chế đang hoạt động đúng như thế nào (khi chỉ có 1 phiên)

- `frontend/src/services/apiClient.js:29-58` — mọi request bị 401 (access
  token hết hạn) sẽ tự động gọi `POST /auth/refresh-token` bằng refresh
  token đang lưu, lấy access token mới, âm thầm gửi lại request gốc — người
  dùng không thấy gì cả, không bị văng ra ngoài.
- Với đúng 1 phiên đăng nhập, cơ chế này chạy đúng như kỳ vọng: dùng bao
  lâu cũng không bị đăng xuất, vì mỗi lần access token hết hạn đều được âm
  thầm gia hạn.

## 2. Lỗi thiết kế — chỉ lưu được 1 refresh token cho mỗi tài khoản

`backend/src/models/User.js` chỉ có **1 cột `refreshToken`** cho mỗi
user — không phải danh sách nhiều phiên đang mở. Mỗi lần đăng nhập:

```js
// backend/src/services/AuthService.js:62-64
user.refreshToken = refreshToken;   // GHI ĐÈ refresh token cũ
await user.save();
```

Nghĩa là: đăng nhập lần 2 (dù ở tab khác, thiết bị khác, hay trình duyệt
khác) **ghi đè luôn refresh token của lần đăng nhập trước** — kể cả khi
phiên trước vẫn đang mở và đang dùng bình thường.

## 3. Kịch bản gây ra triệu chứng bạn gặp

```
[Thiết bị/tab A] Đăng nhập lúc 10:00 → nhận access token (hết hạn 10:15)
                  + refresh token R1 → server lưu user.refreshToken = R1

[Thiết bị/tab B] Đăng nhập cùng tài khoản lúc 10:05 → nhận refresh token R2
                  → server GHI ĐÈ: user.refreshToken = R2 (R1 bị vô hiệu)

[Thiết bị/tab A] 10:15 — access token hết hạn, tự động gọi refresh bằng R1
                  → server so R1 với user.refreshToken (đang là R2)
                  → KHÔNG khớp → 401 "Refresh Token không hợp lệ"
                  (AuthService.js:102)
                  → apiClient.js:51-55 xoá sạch token cục bộ
                  → A bị đăng xuất, dù đang dùng bình thường
```

Đây chính xác là lý do triệu chứng có cảm giác "cứ đúng 15 phút" — đó là
vòng đời access token, **không liên quan gì đến việc rảnh tay hay không
thao tác**. Nó xảy ra ở phiên đăng nhập **cũ hơn**, ngay khi access token
của phiên đó hết hạn sau khi có 1 lần đăng nhập khác (cùng tài khoản) chen
vào.

**Vì sao dễ gặp:** không cần chủ ý — chỉ cần mở app ở điện thoại lẫn máy
tính cùng lúc, hoặc test trên 2 tab/2 trình duyệt (như khi kiểm tra tính
năng đồng bộ trạng thái sân giữa 2 thiết bị), hoặc đơn giản là quên đã đăng
nhập ở nơi khác trước đó — tất cả đều kích hoạt đúng kịch bản trên.

## 3b. Đã kiểm chứng bằng test thật (không chỉ đọc code)

Gọi trực tiếp API bằng curl để loại trừ các khả năng khác trước khi kết
luận:

| Test | Kết quả |
|---|---|
| Refresh ngay sau login (1 phiên) | Thành công (200) |
| **5 request refresh đồng thời, cùng 1 refresh token** (giả lập nhiều request bị 401 cùng lúc — kịch bản `Promise.all([...])` xuất hiện ở hầu hết các trang) | **Cả 5 đều thành công (200)** — loại trừ hoàn toàn khả năng do đua request đồng thời |
| Đăng nhập lần 2 (cùng tài khoản), rồi phiên 1 thử refresh lại token cũ | **Thất bại (401)** — `"Refresh Token không hợp lệ hoặc tài khoản đã bị khóa."` |

→ Cơ chế "bị ghi đè bởi 1 lượt đăng nhập khác cùng tài khoản" là nguyên
nhân **duy nhất** tái hiện được lỗi bằng test thật — không có bằng chứng
nào cho thấy còn cơ chế nào khác gây logout ngắt quãng khi chỉ dùng đúng 1
phiên.

## 4. Hướng khắc phục

Vấn đề gốc: hệ thống thiết kế theo mô hình **"1 tài khoản = 1 phiên đăng
nhập tại 1 thời điểm"**, nhưng cách dùng thực tế (nhiều thiết bị, nhiều
tab) lại cần nhiều phiên cùng tồn tại. Có 2 hướng:

### A. Cho phép nhiều phiên cùng tồn tại (khuyến nghị nếu muốn dùng đa thiết bị)

Thay vì 1 cột `refreshToken` duy nhất, lưu **danh sách nhiều refresh token
đang hoạt động** cho mỗi user (bảng riêng, ví dụ `refresh_tokens` với
`userId`, `token`, `createdAt`, `expiresAt`, có thể thêm `deviceInfo` để
sau này người dùng tự xem/thu hồi từng phiên) — đăng nhập ở nơi mới **thêm
vào** danh sách thay vì ghi đè. Khi refresh, chỉ cần refresh token đó có
trong danh sách và chưa hết hạn là hợp lệ, không quan tâm có phiên nào
khác đang mở.

- **Ưu điểm:** đúng với cách người dùng thực tế dùng nhiều thiết bị; là
  cách làm chuẩn cho hệ thống multi-device.
- **Cần làm:** thêm bảng `refresh_tokens`, sửa `login`/`register` để INSERT
  thay vì UPDATE ghi đè, sửa `refreshAccessToken` để tra theo bảng mới,
  sửa `logout` để chỉ xoá đúng refresh token của phiên đang đăng xuất (hiện
  tại `logout` xoá `user.refreshToken = null`, tức là logout ở 1 nơi hiện
  đang **đăng xuất luôn mọi nơi khác** — cùng gốc vấn đề, cũng cần sửa theo
  hướng này).

### B. Giữ single-session nhưng làm rõ hành vi (nếu chủ ý chỉ muốn 1 phiên)

Nếu việc "đăng nhập nơi mới thì nơi cũ bị đăng xuất" là chủ ý (một số hệ
thống làm vậy để tăng bảo mật), thì vấn đề không phải lỗi kỹ thuật, mà là
**thiếu thông báo cho người dùng**: nơi cũ nên biết NGAY là mình vừa bị
đăng xuất vì có đăng nhập mới ở nơi khác, thay vì lặng lẽ gặp lỗi "token
không hợp lệ" as if it's a bug. Cần làm: khi refresh thất bại theo đúng lý
do "bị nơi khác ghi đè", hiển thị thông báo rõ ràng ví dụ "Tài khoản đã
đăng nhập ở thiết bị khác" thay vì để người dùng tưởng hệ thống lỗi vặt.

## 5. Câu hỏi cần bạn xác nhận trước khi chọn hướng sửa

- Bạn có đang/đã test app trên nhiều thiết bị hoặc nhiều tab cùng tài
  khoản trong lúc gặp triệu chứng này không? (xác nhận đúng nguyên nhân)
- Sản phẩm có cần hỗ trợ nhiều thiết bị đăng nhập cùng lúc không (ví dụ
  nhân viên vừa dùng máy tính quầy vừa dùng điện thoại), hay cố ý chỉ cho
  1 phiên tại 1 thời điểm vì lý do bảo mật/kiểm soát? Câu trả lời quyết
  định chọn Hướng A hay Hướng B ở trên.
