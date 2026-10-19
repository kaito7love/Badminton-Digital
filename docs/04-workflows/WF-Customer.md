# WF-Customer — Tổng hợp Workflow của Khách hàng

**Actor:** Khách hàng (Customer), và khách vãng lai (chưa đăng nhập) ở các phần xem công khai
**Quyền hạn:** Xem lưới sân và đặt sân, mua hàng online, nhận thông báo, đăng ký giải đấu, xem lịch sử cá nhân, đổi mật khẩu
**Cập nhật:** 18/10/2026 (khớp `UseCase.md` v1.3; các mục 6–9 là mới)

> Khách chỉ truy cập được dữ liệu của chính mình. Khách **không** gửi được `X-Branch-Id`; mọi màn hình khách dùng nhóm `/public/*` hoặc các route riêng của khách (`/my-orders`, `/notifications`, `/my-bookings`).

---

## 🔐 1. Xác thực tài khoản

```
[Truy cập Web]
       ↓
  Đăng nhập bằng SĐT hoặc email (1 ô "identifier") + mật khẩu
       ↓
  ┌──────────────────────────────────────┐
  │ Hệ thống xác thực JWT               │
  └──────────────────────────────────────┘
       ↓ Thành công         ↓ Thất bại
  Về trang đang xem /     Hiển thị lỗi (cùng một thông điệp dù sai
  trang trước khi đăng nhập   tài khoản hay sai mật khẩu); quá 10 lần
                              trong 15 phút → tạm khoá theo IP
                              ↓
                         [Quên mật khẩu?]
                              ↓
                         Nhập email → luôn nhận cùng một phản hồi
                              ↓
                         Đặt mật khẩu mới
```

Khách hàng cũng có thể **tự đăng ký** tài khoản mới (không cần nhân viên lập
hộ) bằng họ tên, SĐT và mật khẩu (email không bắt buộc). Mật khẩu phải đạt chính
sách: 8–72 byte, không thuộc danh sách mật khẩu phổ biến, không chứa SĐT, email
hay họ tên của chính mình. Tài khoản luôn nhận hồ sơ riêng: nếu SĐT trùng với một
hồ sơ đã chơi tại quầy, lịch sử cũ chỉ được nối vào tài khoản sau khi nhân viên
xác minh khách tại quầy và bấm "Gộp vào tài khoản" (UC-29). Chi tiết đầy đủ
(chuẩn hoá SĐT, thông báo lỗi, refresh token xoay vòng, luồng tự đăng ký) xem
`flows/WF-01-Login.md`.

Đổi mật khẩu ở một thiết bị làm các phiên khác hết hiệu lực ngay; thiết bị đang đổi giữ nguyên phiên.

Use Cases: UC-01 (Đăng nhập), UC-03 (Quên mật khẩu), UC-04 (Đổi mật khẩu), UC-22 (Tự đăng ký)

---

## 📅 2. Đặt sân trên web (`/dat-san`)

Đây là **nơi duy nhất** khách đặt sân; mọi nút "Đặt sân" khác (trang chủ, cửa hàng, tài khoản, lịch của tôi) chỉ là liên kết tới đây.

```
[Trang Đặt sân]
       ↓
  Chọn chi nhánh (nhớ giữa trang chủ, cửa hàng, đặt sân)
       ↓
  Chọn ngày trong dải 14 ngày (hôm nay … hôm nay + 13)
       ↓
  Lưới sân × giờ, ô 60 phút:  trống · đã đặt · đã qua · bảo trì  (+ giờ cao điểm)
  kèm sơ đồ mặt bằng và địa chỉ chi nhánh; tự làm mới mỗi 30 giây
       ↓
  Chạm một ô, hoặc chạm hai ô / kéo để chọn khoảng (tối đa 3 giờ)
       ↓
  Thanh tóm tắt: sân · giờ · giá   →  Bấm xác nhận
       ↓
  ┌─ chưa đăng nhập ─→ Đăng nhập hoặc đăng ký giữa chừng
  │                     → quay lại ĐÚNG chi nhánh, ngày, sân, khung vừa chọn
  │                       (nếu còn trống; nếu hết hạn thì lựa chọn bị bỏ)
  ↓
  Hộp xác nhận → gửi yêu cầu → Booking "Pending" → chuyển tới "Lịch của tôi"
       ↓
  Chờ Nhân viên xác nhận (UC-13) → "Confirmed" ✅ (khách nhận thông báo)
```

Luật áp dụng cho khách (nhân viên không bị các giới hạn này):
- Đặt trước tối đa **14 ngày**, tối đa **3 giờ** mỗi lần.
- Đang giữ tối đa **5** lịch `pending`/`confirmed` chưa kết thúc; đặt quá 20 lần trong 10 phút bị chặn tạm.
- Khung đã kết thúc hoặc nằm ngoài giờ mở cửa (mặc định 05:00–23:00) không đặt được; lưới hiện ô đã bắt đầu là "đã qua".
- Hai khách giành cùng một khung: người sau nhận lỗi trùng lịch và lưới cập nhật. Mất mạng giữa chừng: trang báo lỗi tại chỗ kèm cách thử lại, không dùng hộp thoại của trình duyệt.
- Lịch `pending` **do khách tự đặt** mà chưa được duyệt sẽ tự huỷ theo chính sách giữ chỗ (mặc định sau 24 giờ, nhưng không muộn hơn 60 phút trước giờ bắt đầu); khách nhận thông báo "Lịch đặt sân đã bị huỷ".

Use Cases: UC-10, UC-11, UC-32

---

## 🔄 3. Xem và huỷ lịch đặt

```
[Trang Lịch của tôi]
       ↓
  Tab "Sắp tới" (pending / confirmed, chưa kết thúc) và "Lịch sử" (hiện 6 dòng + "Xem thêm")
       ↓
  Huỷ booking → xác nhận → "Cancelled"
```

Khách **không sửa** được lịch đã đặt (chỉ nhân viên đổi sân/ngày/giờ): muốn đổi thì huỷ rồi đặt lại ở `/dat-san`. Khi nhân viên đổi hoặc huỷ lịch của khách, khách nhận thông báo (mục 7).

Use Cases: UC-12

---

## 🛍️ 4. Mua sắm và đơn hàng online

```
[Cửa hàng /shop] — chọn chi nhánh nhận hàng, lọc danh mục, xem chi tiết sản phẩm và biến thể
       ↓
  Giỏ hàng → Thanh toán (họ tên, SĐT liên hệ, ghi chú; mã giảm giá nếu có)
       ↓
  Chọn tiền mặt hoặc chuyển khoản (chỉ hiện khi quán đã cấu hình chuyển khoản)
       ↓
  Hệ thống giữ hàng ngay (trừ kho); giá lấy từ máy chủ
       ↓
  ├─ Tiền mặt     → "Chờ nhận hàng": tới quầy nhận và trả tiền, nhân viên chốt
  └─ Chuyển khoản → hiện mã VietQR, hạn 30 phút
        ├─ Tiền về (webhook) → đơn tự chuyển "Hoàn thành"
        └─ Quá 30 phút       → đơn tự huỷ, hoàn kho
       ↓
  [Đơn hàng của tôi] — xem trạng thái, huỷ đơn chưa thanh toán
```

Không có bước vận chuyển: luồng là nhận hàng tại quầy. Đơn online đã thanh toán cộng vào tổng chi tiêu và hạng thành viên. Nếu tiền chuyển về sau khi đơn đã huỷ, hệ thống không tự hồi đơn; quầy đọc nhật ký hoạt động để hoàn tiền thủ công.

Use Cases: UC-26

---

## 📖 5. Xem lịch sử chơi & chi tiêu, tài khoản cá nhân

```
[Trang Tài khoản]
       ↓
  ┌──────────────────────────────────────────┐
  │ Thông tin liên hệ (chỉ xem): họ tên,    │
  │   SĐT, email, thành viên từ, mã khách   │
  │                                          │
  │ Thống kê tích lũy:                      │
  │  - Tổng tiền đã chi tiêu, hạng hội viên │
  │    (còn bao nhiêu nữa lên hạng kế)      │
  │  - Số buổi đã chơi, số lịch đã đặt      │
  │  - Lần chơi gần nhất                    │
  │                                          │
  │ Thẻ "Trình độ của tôi":                 │
  │  - chưa chấm → dẫn tới trang tự chấm    │
  │  - đã chấm → điểm Đơn / Đôi             │
  │                                          │
  │ Lịch sử phiên chơi (CourtSessions):     │
  │  chi nhánh, ngày, sân, thời gian,       │
  │  tiền sân, phụ kiện đã gọi, thanh toán  │
  │                                          │
  │ Đổi mật khẩu (mật khẩu cũ + mới)        │
  └──────────────────────────────────────────┘
```

Vì hồ sơ Customer dùng chung toàn chuỗi (xem `flows/WF-05-CustomerManagement.md`),
lịch sử này gộp phiên chơi/booking ở **mọi chi nhánh** khách từng ghé, không
riêng 1 chi nhánh — hạng hội viên và tổng chi tiêu cũng cộng dồn toàn chuỗi.
Khách không tự sửa họ tên, SĐT, email; việc đó do nhân viên làm tại quầy.

Use Cases: UC-15, UC-04

---

## 🔔 6. Thông báo về lịch đặt (mới)

```
Nhân viên xác nhận / đổi sân-ngày-giờ / huỷ lịch,  hoặc lịch bị tự huỷ vì chưa được duyệt
       ↓
  Hệ thống ghi thông báo trong CÙNG giao dịch với thay đổi lịch
       ↓
  Chuông ở thanh đầu trang (số chưa đọc) — thăm dò mỗi 60 giây khi tab đang mở,
  khi quay lại tab và khi đổi trang; trên điện thoại là mục dẫn tới /notifications
       ↓
  Mở danh sách → đánh dấu từng cái hoặc tất cả là đã đọc
       ↓
  (nếu quán cấu hình SMTP và khách có email) cũng nhận một email
```

Thông báo chỉ chứa tên sân, ngày, giờ. Khách tự huỷ lịch của mình thì không có thông báo. Thông báo đã đọc quá 30 ngày và mọi thông báo quá 90 ngày được dọn tự động. Chưa có nhắc lịch sắp đến.

Use Cases: UC-27

---

## 🏆 7. Thi đấu: xem và tự đăng ký (mới)

```
[Menu "Thi đấu"] — không cần đăng nhập để xem
       ↓
  /thi-dau: giải đang mở, buổi giao lưu, bảng xếp hạng; lọc theo chi nhánh
       ↓
  Trang giải: bảng đấu, sơ đồ, tỉ số trực tiếp (cập nhật tức thì)
       ↓
  Đăng nhập → "Xem & đăng ký"
       ├─ chưa có điểm trình → trang tự chấm trình trước
       ├─ giải đơn: đăng ký một mình
       ├─ giải đôi cặp cố định: chọn đồng đội có tài khoản, hoặc nhập đồng đội chưa có tài khoản
       └─ buổi giao lưu: đăng ký giữ chỗ (có giới hạn người chơi)
       ↓
  Còn chỗ → đăng ký ngay (không cần nhân viên duyệt);  hết chỗ → danh sách chờ, tự thăng hạng khi có người rút
       ↓
  Rút đăng ký: chỉ được trước khi bốc thăm
```

Lệ phí 200.000đ mỗi người chỉ hiển thị, thu tại quầy. Khách có thể bấm điểm trận của chính mình khi đang đánh. Các trang "Tôi" (lịch sử thi đấu, trình độ, đăng ký của tôi) nằm trong menu thi đấu của khách. Chi tiết: `UseCase.md` UC-28, UC-31 và `services/competition-service/docs/`.

Use Cases: UC-28, UC-31

---

## 🏷️ Hệ thống Hạng Hội viên (Loyalty Tier)

| Hạng | Điều kiện (tổng chi tiêu toàn chuỗi) |
|------|-----------|
| Normal | Mặc định, &lt; 5.000.000đ |
| Gold | ≥ 5.000.000đ |
| VIP | ≥ 15.000.000đ |

Hạng được tính lại tự động ngay khi thanh toán tiền mặt hoàn tất, hoặc khi
webhook xác nhận thanh toán chuyển khoản (`PaymentService.js`), dựa trên
**tổng chi tiêu gộp toàn chuỗi** (Customer không còn phân theo chi nhánh). Đơn
POS không gắn khách **không** cộng vào tổng chi tiêu; đơn online đã thanh toán thì có. Huỷ hoá đơn (void) trừ lại tổng chi tiêu.

> ⚠️ **Hiện tại hạng KHÔNG mang quyền lợi gì** — không có giảm giá tự động,
> không ưu tiên đặt sân, không thông báo/khuyến mãi riêng. Nơi duy nhất
> hạng được dùng là hiển thị 1 badge màu trên bảng khách hàng
> (`CustomersPage.jsx`) và thanh tiến độ ở trang Tài khoản của khách. Chi tiết cơ chế hiện tại và các hướng phát triển
> có thể cân nhắc: xem `docs/05-extra/01-audit/LoyaltyTier.md`.
