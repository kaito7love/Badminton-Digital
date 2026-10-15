# Kế hoạch 42 — Xử lý F3, F4, F5, F6 của báo cáo 40

**Nhánh:** `fix/flow-dat-san-f3-f6` (cắt từ `test/flow-dat-san` = `388104f`, đã gồm kế hoạch 41)
**Trạng thái:** ⏳ **chờ bạn duyệt** — chưa sửa dòng code nào. Nguồn: [báo cáo 40](40-ket-qua-kiem-thu-flow-dat-san.md) §3–§4; các mặc định dưới đây là cột "Gợi ý mặc định" của §4 đó.
**Khác với kế hoạch 41:** bốn mục này **đổi hành vi nghiệp vụ** (có thể từ chối thứ trước đây được phép, có việc tự chạy nền), nên mỗi mục có công tắc/giá trị cấu hình và có mục "Rủi ro" riêng.

---

## 1. Việc sẽ làm, từng mục

### F3 — Giữ chỗ hàng loạt: trần số lượng + hết hạn `pending` + giới hạn tần suất

Ba lớp, độc lập nhau (một lớp hỏng vẫn còn hai lớp):

**(a) Trần số lịch đang giữ — khách tối đa 5** (`Q1`)
- Trong `BookingService.createBooking`, **chỉ vai `customer`**, **bên trong** transaction SERIALIZABLE sẵn có: đếm lịch của khách ở trạng thái `pending`/`confirmed` mà chưa qua giờ kết thúc (theo lịch + múi giờ chi nhánh, mọi chi nhánh vì khách dùng chung toàn chuỗi). Đủ trần → `400` "Bạn đang giữ 5 lịch chưa chơi (tối đa 5). Hãy huỷ bớt hoặc chơi xong rồi đặt thêm."
- Nhân viên/quản lý/admin **không** bị trần (đặt hộ, giải đấu).
- Kiểm trong transaction nên hai yêu cầu song song không cùng lọt qua trần.
- Hàm thuần `utils/bookingPolicy.js#activeBookingLimitViolation({ activeCount, limit })` (Vitest/Jest không DB), theo khuôn `durationViolation` của R15.

**(b) Tự huỷ `pending` quá hạn** (`Q2`)
- Dùng **vòng quét 5 phút đã có** ở `server.js` (cùng chỗ với `expireStalePendingOrders`): thêm `BookingService.expireStalePendingBookings()`.
- Chỉ xét lịch **do khách tự đặt** (`createdBy` là tài khoản vai `customer`); lịch nhân viên tạo thì không bao giờ tự huỷ.
- Hạn: `expireAt = max( createdAt + 15 phút, min( createdAt + 24 giờ, giờ bắt đầu − 60 phút ) )` — tức "24 giờ không ai duyệt, hoặc còn 60 phút tới giờ chơi mà chưa duyệt, nhưng luôn được giữ ít nhất 15 phút" (khách đặt gấp trong 30 phút nữa không bị huỷ ngay).
- Huỷ = `status = cancelled` + `ActivityLog` hành động mới `booking.expired` (người thực hiện: hệ thống, `userId` NULL) + phát sự kiện realtime (F6). Khách thấy "Đã huỷ" ở Lịch của tôi (không thêm trạng thái ENUM mới).
- Hàm thuần `pendingExpiryAt({ createdAt, startAt })` có test; sweeper đọc theo lô nhỏ (LIMIT 200) để không giữ khoá lâu.

**(c) Giới hạn tần suất `POST /bookings`** (`Q3`)
- `express-rate-limit` ở `bookingRoutes.js`: **20 lần / 10 phút**, khoá theo **user id** (không theo IP — cả sân dùng chung Wi-Fi), **chỉ áp cho vai `customer`** (`skip` với vai khác). Trả `429` cùng khuôn envelope `{ success:false, message:"Bạn thao tác quá nhanh…" }`.
- Frontend `/dat-san`: `bookingError.js` đã nhận thông điệp server; thêm một ca test cho 429.

**Cấu hình:** khoá cài đặt mới `booking_policy` = `{ maxActivePerCustomer: 5, pendingExpiryHours: 24, pendingExpireBeforeStartMinutes: 60 }` (chưa cấu hình/sai thì lấy mặc định, theo khuôn `discount_policy`: `utils/bookingPolicy.js#normalizeBookingPolicy`). Thêm vào `KNOWN_KEYS` và kiểm kiểu trong `settingValidation.js`. **Chưa làm màn hình Cài đặt cho khoá này** (admin sửa qua `PUT /settings`; UI là việc riêng nếu bạn muốn).

### F4 — Mở sân từ booking phải kiểm ngày/giờ của booking (`Q4`)
- `CourtService.openCourt` khi có `bookingId`, sau khi tìm thấy booking:
  1. **Khác ngày hôm nay** (theo múi giờ chi nhánh) → `400` "Lịch này đặt cho ngày dd/mm/yyyy, chưa tới/đã qua ngày chơi — hãy dùng đúng lịch hoặc mở sân không kèm lịch." **Chặn cứng.**
  2. **Cùng ngày nhưng lệch giờ** (bây giờ sớm hơn giờ bắt đầu hơn 60 phút, hoặc đã qua giờ kết thúc) → `409` mã `BOOKING_TIME_MISMATCH` kèm giờ của lịch; nhân viên xác nhận rồi gọi lại với `acknowledgeTimeMismatch: true` thì mở được (ghi cờ vào nhật ký `court.session_opened`).
- Frontend `CourtsPage`: nhận `409 BOOKING_TIME_MISMATCH` → `window.confirm` nêu rõ giờ lịch, đồng ý thì gửi lại kèm cờ (cùng cách các hộp xác nhận hiện có của trang).
- Hàm thuần `utils/bookingOpenWindow.js#openWindowViolation({ bookingDate, startTime, endTime, now, timezone })` — test đủ: hôm qua / hôm nay đúng giờ / sớm 2 giờ / muộn / ngày mai / múi giờ biên nửa đêm.
- Postman: thêm `acknowledgeTimeMismatch` vào body "Mở sân" (route cũ, không thêm route).

### F5 — Đặt hộ trùng SĐT khách có sẵn: cho nhân viên **thấy** trước và sau (`Q5`)
- **Trước khi lưu (chính):** ở form "Tạo lịch đặt mới", khi rời ô SĐT hợp lệ, gọi `GET /customers?search=<số đã chuẩn hoá>` (route staff-only sẵn có), lấy hồ sơ khớp đúng SĐT → hiện dòng "Khớp khách **Nguyễn Văn Khách** (0903 333 333)" ngay dưới ô; nếu tên đang gõ khác tên đó → dòng cảnh báo vàng "Tên bạn gõ khác tên đã lưu — lịch sẽ gắn vào hồ sơ trên. Kiểm lại SĐT?".
- **Sau khi lưu (chốt chặn):** `CustomerService.resolveWalkIn` giữ nguyên hợp đồng; thêm `resolveWalkInDetailed` trả `{ customer, matched, nameDiffers }` (hai nơi gọi cũ không đổi). `createBooking` thêm vào phản hồi trường **không lưu DB** `customerMatch: { id, fullName, nameDiffers }` **chỉ khi người gọi là nhân viên**; trang hiện banner xanh/vàng tương ứng. Khách (vai `customer`) không bao giờ đi nhánh này nên không lộ tên ai.
- Không đổi logic gắn theo SĐT (đó là thiết kế danh tính xuyên chi nhánh) — chỉ làm cho nó **không im lặng**.

### F6 — Trang Quản lý đặt sân của nhân viên tự cập nhật (`Q6`)
- **Backend:** `BookingService` phát `booking:changed` qua `realtimeBus` **sau commit** ở `createBooking`, `updateBooking`, `cancelBooking`, `confirmBooking` và ở sweeper F3(b). Payload tối thiểu `{ branchId, bookingId, status }` — **không có tên/SĐT** (giữ nguyên tính chất G3 của báo cáo 40). `realtimeController.stream` đăng ký thêm `booking:changed`, lọc theo `branchId` kết nối như `court:updated`.
- **Frontend:** `realtimeClient.js` lắng nghe thêm `booking:changed`; `BookingsPage` gọi `connectRealtimeStream` giống `CourtsPage` (nhận sự kiện = **tải lại trang hiện tại**, không ráp state từ payload; `onReconnect` + `visibilitychange` cũng tải lại). **Không tải lại khi modal tạo/sửa đang mở** (không làm mất dữ liệu đang gõ) — hoãn tới khi đóng modal. Hiện dòng "đang kết nối lại…" khi `reconnecting`, như trang Sân.
- Ghi chú đã có sẵn trong `realtimeBus.js`: chỉ đúng khi chạy **một** tiến trình backend (đúng Render/compose hiện tại).

---

## 2. Cách làm và kiểm chứng

1. Mỗi mục một commit: F3a+c, F3b, F4, F5, F6, docs (nhánh `fix/flow-dat-san-f3-f6`).
2. **Test mới:** hàm thuần (`bookingPolicy`, `pendingExpiryAt`, `openWindowViolation`) Jest không DB; `tests-security/booking-flow.security.test.js` thêm: khách đặt tới trần → lần thứ 6 `400`, nhân viên không bị trần; hai yêu cầu song song ở ngưỡng chỉ một lọt; sweeper huỷ `pending` quá hạn của khách và **không** đụng `pending` của nhân viên; mở sân với booking ngày khác → `400`, lệch giờ → `409` rồi `201` khi có cờ; `customerMatch` có với nhân viên, không có với khách; SSE nhận `booking:changed` **không chứa PII**; `429` khi vượt 20 lượt (dùng cửa sổ nhỏ qua cấu hình test).
3. Frontend Vitest: lookup SĐT (chuẩn hoá `+84`→`0`), `bookingError` với 429/trần, tải lại hoãn khi modal mở (hàm thuần).
4. **Đi thật bằng Chrome** (laptop + điện thoại) trên DB tạm `bd_sectest_flow`: khách đặt tới trần → thấy thông báo, huỷ một cái → đặt được; nhân viên mở trang `/bookings`, khách đặt ở tab khác → dòng mới hiện **không cần tải lại**; gõ SĐT khách có sẵn → thấy dòng khớp + cảnh báo tên; mở sân từ lịch ngày mai → bị chặn, lịch hôm nay lệch giờ → hộp xác nhận. Ảnh vào `docs/05-extra/02-remediation/42-anh/`.
5. Cập nhật: `CLAUDE.md` (mục Booking rules/Realtime: trần, hết hạn, `booking_policy`, `booking:changed`), báo cáo 40 (đánh dấu F3–F6), Postman + `docs:build`, và bộ `npm test`/`test:security`/Vitest/build như kế hoạch 41.
6. **Không** push, **không** merge `main`; merge vào `test/flow-dat-san` khi bạn duyệt kết quả.

---

## 3. Rủi ro và cách giảm

| Rủi ro | Mức | Cách giảm |
|---|---|---|
| Khách thật bị chạm trần 5 khi đặt nhiều buổi liền (vd cả tuần) | 🟡 | Trần đếm lịch **chưa chơi**, đổi được bằng `booking_policy` không cần deploy code; thông báo nói rõ cách xử lý. Nếu bạn muốn khoan dung hơn: 8–10 |
| Tự huỷ làm khách mất chỗ vì nhân viên duyệt chậm | 🟠 | Chỉ huỷ lịch **chưa được duyệt**, luôn giữ ≥15 phút, có nhật ký `booking.expired`; hệ thống **chưa có thông báo** cho khách — họ chỉ thấy "Đã huỷ" khi mở lại trang (xem Q2) |
| Sweeper chạy nhầm huỷ lịch hợp lệ | 🟠 | Chỉ `pending` + do khách tự tạo; hàm thuần có test biên; lô nhỏ; chạy thử trên DB tạm trước |
| `429` theo user nhưng sau reverse proxy | 🟢 | Khoá theo `req.user.id`, không phụ thuộc IP/`TRUST_PROXY_HOPS` |
| Chặn mở sân khác ngày làm hỏng một cách làm việc quen của quầy (vd mở sớm cho lịch ngày mai) | 🟡 | Nhân viên vẫn mở sân **không kèm lịch**; lệch giờ trong ngày chỉ cần một lần xác nhận |
| `booking:changed` tăng tải SSE | 🟢 | Sự kiện nhỏ, đã lọc theo chi nhánh; trang tải lại **một** trang danh sách |
| `booking_policy` chưa có màn hình Cài đặt | 🟢 | Mặc định hợp lý; làm UI nếu bạn cần chỉnh thường xuyên |

---

## 4. Câu hỏi cần bạn trả lời

| # | Câu hỏi | Gợi ý mặc định |
|---|---|---|
| **Q1** | F3a: trần lịch chưa chơi mỗi khách | **5**, nhân viên không bị trần |
| **Q2** | F3b: tự huỷ `pending` của khách sau **24 giờ** không duyệt hoặc còn **60 phút** tới giờ chơi (giữ tối thiểu 15 phút)? Có làm **thông báo cho khách** (email/SMS) khi bị huỷ không? | Có tự huỷ như trên; **chưa** làm thông báo (hệ thống chưa có kênh nào — để việc riêng) |
| **Q3** | F3c: giới hạn `POST /bookings` của khách | **20 lượt / 10 phút / user** |
| **Q4** | F4: khác ngày → chặn cứng; lệch giờ trong ngày → hộp xác nhận | Đúng như vậy |
| **Q5** | F5: tra SĐT ngay trong form (khi rời ô) **và** banner sau khi lưu | Cả hai |
| **Q6** | F6: dùng SSE (kèm hoãn tải lại khi modal mở), không polling | SSE |
| **Q7** | Gom F3–F6 một nhánh `fix/flow-dat-san-f3-f6` hay tách F3 (rủi ro cao nhất) thành nhánh riêng để duyệt/merge riêng? | Một nhánh, nhiều commit; F3b có công tắc: `pendingExpiryHours = 0` tắt hẳn tự huỷ |
| **Q8** | Sau khi xong: merge vào `test/flow-dat-san` (chưa `main`); giữ môi trường tạm `:5060/:5062` tới khi bạn bảo dọn? | Có / Giữ |
