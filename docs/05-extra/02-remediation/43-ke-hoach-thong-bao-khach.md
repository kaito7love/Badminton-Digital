# Kế hoạch 43 — Thông báo cho khách khi lịch đặt sân đổi trạng thái

**Nhánh:** `feat/thong-bao-khach` (cắt từ `test/flow-dat-san` = `b430d9f`)
**Trạng thái:** ✅ **đã duyệt (Q1–Q8 theo mặc định) và làm xong** — xem [kết quả](43-ket-qua-thong-bao-khach.md).
**Nguồn:** [báo cáo kết quả 42](42-ket-qua-sua-flow-dat-san-f3-f6.md) §3 — lịch `pending` của khách bị tự huỷ (F3b) mà khách **không được báo**; nhân viên duyệt lịch mà khách cũng chỉ biết khi mở lại "Lịch của tôi".

---

## 1. Hiện trạng (đã đọc mã)

| Kênh | Có sẵn? | Ghi chú |
|---|---|---|
| **Email** | Có `utils/mailer.js` (nodemailer, chỉ có mẫu "đặt lại mật khẩu"); SMTP **tuỳ chọn** (`MAIL_HOST/USER/PASSWORD`, `isMailConfigured()`), bản demo Render **không cấu hình** | Email của khách là **không bắt buộc** khi đăng ký (chỉ SĐT) và khách **không tự sửa** được email (chỉ nhân viên) → phần lớn khách không có email |
| **SMS / Zalo** | Không | Cần nhà cung cấp + phí + đăng ký thương hiệu |
| **Trong ứng dụng** | Không có bảng, API hay giao diện thông báo | SSE `/realtime/stream` chỉ cho nhân viên (khách bị `400` vì không có chi nhánh) |

→ Chỉ dựa vào email thì **đa số khách không nhận được gì**. Kênh **trong ứng dụng (chuông)** mới phủ được mọi khách có tài khoản; email là phần cộng thêm khi có.

---

## 2. Việc sẽ làm

### 2.1 Sự kiện nào gửi thông báo (`Q2`)

| Sự kiện | Gửi? | Nội dung (ví dụ) |
|---|---|---|
| Nhân viên **duyệt** lịch (`booking.confirmed`) | ✅ (bạn yêu cầu) | "Lịch Sân số 1 · T6 16/10 · 19:00–20:00 đã được xác nhận." |
| Lịch `pending` **tự huỷ do quá hạn** (`booking.expired`) | ✅ (bạn yêu cầu) | "Lịch … đã bị huỷ vì chưa được xác nhận kịp. Bạn có thể đặt lại khung khác." + nút tới `/dat-san` |
| Nhân viên **huỷ** lịch của khách (`booking.cancelled_by_staff`) | ✅ đề xuất thêm | "Lịch … đã được cửa hàng huỷ. Liên hệ quầy nếu cần hỗ trợ." |
| Nhân viên **đổi lịch** — sân/ngày/giờ (`booking.rescheduled`) | ✅ đề xuất thêm | "Lịch của bạn được đổi từ … sang …" (đổi giờ của khách mà im lặng là lỗi trải nghiệm nặng nhất) |
| Khách **tự huỷ** lịch của mình | ❌ | Họ vừa làm xong, không cần báo |
| Khách tự đặt (pending) | ❌ | Đã có hộp xác nhận trên trang |

Chỉ gửi cho khách **có tài khoản** (`customers.user_id` khác NULL). Khách vãng lai không có tài khoản không có nơi nào để đọc → không tạo thông báo (nhân viên đặt hộ bằng SĐT của khách đã có tài khoản **có** gửi — đúng người được gắn lịch).

### 2.2 Dữ liệu — một migration

Bảng `customer_notifications`:

| Cột | Ý nghĩa |
|---|---|
| `id`, `customer_id` (FK), `branch_id` | khách nhận / chi nhánh của lịch |
| `type` | một trong 4 loại trên |
| `title`, `body` | chữ đã dựng sẵn (tiếng Việt); **chỉ** có tên sân, ngày, giờ — không tên nhân viên, không PII khác |
| `booking_id` (nullable, không FK cứng) | để mở đúng lịch |
| `read_at`, `created_at` | chưa đọc = `read_at IS NULL` |

Chỉ mục `(customer_id, read_at, created_at)`. **Cần `npm run migrate`** (bản Render demo tự chạy migrate khi reset hằng đêm).
Dọn: vòng quét 5 phút sẵn có xoá thông báo **đã đọc > 30 ngày** và **mọi thông báo > 90 ngày** (`Q4`).

### 2.3 Tạo thông báo — cùng transaction với thay đổi trạng thái
- `services/NotificationService.js`: `notifyBooking(type, booking, { transaction, details })` — tìm `customer.userId`; không có thì bỏ qua; ghi một dòng. Gọi **trong** transaction của `confirmBooking`, `cancelBooking` (chỉ khi người huỷ là nhân viên), `updateBooking` (khi sân/ngày/giờ thật sự đổi) và `expireStalePendingBookings` → trạng thái và thông báo **cùng thành công hoặc cùng thất bại**, không bao giờ lệch.
- Dựng nội dung bằng hàm thuần `utils/notificationMessages.js` (test không cần DB; ngày theo định dạng `dd/mm/yyyy`).
- **Email (cộng thêm, `Q1`):** sau commit, nếu khách có email **và** `isMailConfigured()` thì gửi mẫu mới `sendBookingNotificationEmail` (cùng khung HTML với mẫu đặt lại mật khẩu). **Nuốt lỗi + log** như `forgotPassword` — không bao giờ làm hỏng thao tác của nhân viên; không gửi lại khi lỗi.

### 2.4 API (3 route mới, chỉ vai `customer`, chỉ của chính mình)

| Route | Việc |
|---|---|
| `GET /api/v1/notifications?limit=&unread=true` | danh sách mới nhất trước + `unreadCount`; `no-store` |
| `PUT /api/v1/notifications/:id/read` | đánh dấu một dòng đã đọc (của người khác → 404) |
| `PUT /api/v1/notifications/read-all` | đánh dấu tất cả đã đọc |

Validator như các route khác (`id` `isInt` có max, `limit` 1–50); thêm vào Postman rồi `npm run docs:build` (quy ước `CLAUDE.md`: route mới phải có trong collection trước).

### 2.5 Giao diện (`Q3`, `Q5`)
- **Chuông** trong header chung (`SiteHeaderView`, cạnh giỏ hàng) chỉ khi đăng nhập vai `customer`; chấm đỏ số chưa đọc; hover/bấm mở bảng 8 thông báo mới nhất + "Đánh dấu đã đọc hết" + "Xem tất cả". Có cả ở thanh 80 px trên điện thoại. Đủ hai nửa class sáng/tối; tông `dark` của Trang chủ.
- **Trang `/notifications`** (customer-only) liệt kê đầy đủ (cho điện thoại và bấm từ chuông); mỗi dòng bấm → `/my-bookings`.
- **Cập nhật số chưa đọc:** hỏi `GET /notifications?limit=1` mỗi **60 giây** khi tab đang hiện + khi tab quay lại foreground + sau mỗi lần điều hướng; **không** dùng SSE cho khách (không có ngữ cảnh chi nhánh, thêm nhiều rủi ro hơn lợi). Tải rất nhẹ (một `COUNT` có chỉ mục).
- Menu tài khoản thêm "Thông báo" (`siteNav.js#buildAccountMenu`); `/my-bookings` hiện dòng ghi chú khi có thông báo chưa đọc về lịch.
- Logic thuần trong `components/site/notificationView.js` (định dạng thời gian "5 phút trước", gom, cắt chữ) có Vitest; SSR render cho chuông.

### 2.6 Cái **không** làm trong kế hoạch này
SMS/Zalo/push trình duyệt; tuỳ chọn tắt/bật từng loại; thông báo cho **nhân viên** (đã có SSE `booking:changed`); sửa lại email của khách.

---

## 3. Kiểm chứng

1. **Backend:** hàm thuần dựng nội dung; `tests-security`: duyệt → khách có 1 thông báo `booking.confirmed`; sweeper huỷ → `booking.expired`; nhân viên huỷ/đổi lịch → đúng loại; **khách tự huỷ không tạo**; khách vãng lai không tài khoản → không dòng nào; **IDOR**: khách B không đọc/đánh dấu thông báo của khách A (404), nhân viên/quản lý/admin → 403, không token → 401; `read-all` chỉ đụng của mình; giao dịch cùng thất bại (lỗi khi ghi thông báo → trạng thái lịch không đổi); email lỗi không làm 5xx; thông báo không chứa tên nhân viên/SĐT.
2. **Frontend:** Vitest `notificationView`, SSR chuông (số chưa đọc, ẩn với vai khác/khách vãng lai), `siteNav` mục "Thông báo".
3. **Chrome headless** (laptop 1366×768 + điện thoại 390×844, DB tạm): nhân viên duyệt/huỷ/đổi giờ → chuông của khách hiện chấm đỏ trong ≤ 60 s (hoặc ngay khi quay lại tab) → mở → đã đọc; lịch tự huỷ (đẩy `created_at` lùi) → thông báo "bị huỷ vì chưa được xác nhận"; kiểm cả Trang chủ (header overlay `tone="dark"`), `/dat-san`, `/thi-dau` (cùng header), không cuộn ngang trên 390 px.
4. Cập nhật: `CLAUDE.md`, báo cáo kết quả `44-…` (hoặc phụ lục 42), Postman + `docs:build`, bộ `npm test` / `test:security` / Vitest / build.
5. **Không** push, **không** merge `main`; merge vào `test/flow-dat-san` khi bạn duyệt kết quả.

---

## 4. Rủi ro

| Rủi ro | Mức | Cách giảm |
|---|---|---|
| Thêm migration + bảng mới | 🟡 | Bảng độc lập, không đụng bảng cũ; có `down`; nhắc `npm run migrate` |
| Sửa header chung ảnh hưởng mọi trang khách | 🟠 | Chuông chỉ vẽ khi vai `customer`; test SSR từng tone; đi thật Chrome ở Trang chủ, `/dat-san`, `/thi-dau` và điện thoại |
| Rò thông tin qua thông báo/email | 🟡 | Nội dung chỉ tên sân + ngày + giờ; có test chống PII; chỉ gửi tới email của **đúng** khách được gắn |
| Email lỗi/chậm làm chậm thao tác | 🟢 | Gửi **sau commit**, không `await` chặn phản hồi, nuốt lỗi + log |
| Polling làm tăng tải | 🟢 | 1 truy vấn đếm/khách/60 s, chỉ khi tab hiện; có chỉ mục |
| Khách không có tài khoản vẫn không được báo | ℹ️ | Giới hạn của kênh; nếu muốn, bước sau là SMS (cần nhà cung cấp) |

---

## 5. Câu hỏi cần bạn trả lời

| # | Câu hỏi | Gợi ý mặc định |
|---|---|---|
| **Q1** | Kênh: chuông trong ứng dụng **là chính**, email cộng thêm khi khách có email và đã cấu hình SMTP; **không** SMS | Đúng như vậy |
| **Q2** | Sự kiện: duyệt, tự huỷ quá hạn, **nhân viên huỷ**, **nhân viên đổi lịch** (hai cái sau do tôi đề xuất thêm); khách tự huỷ thì không | Cả bốn |
| **Q3** | Cập nhật số chưa đọc bằng polling 60 s + khi quay lại tab (không SSE cho khách) | Polling |
| **Q4** | Lưu: đã đọc > 30 ngày và mọi thông báo > 90 ngày thì xoá | 30 / 90 ngày |
| **Q5** | Giao diện: chuông + bảng thả xuống (desktop) và trang `/notifications` (cả điện thoại), mục "Thông báo" trong menu tài khoản | Đúng như vậy |
| **Q6** | Khách vãng lai không có tài khoản: không thông báo; đặt hộ bằng SĐT của khách đã có tài khoản **có** thông báo | Đúng như vậy |
| **Q7** | Có thêm công tắc tắt hẳn thông báo email (`notification_policy.email`, mặc định bật) cho người vận hành không? | Có — một khoá setting, không làm màn hình |
| **Q8** | Sau khi xong: merge vào `test/flow-dat-san` (chưa `main`); giữ môi trường tạm `:5060/:5062` tới khi bạn bảo dọn? | Có / Giữ |
