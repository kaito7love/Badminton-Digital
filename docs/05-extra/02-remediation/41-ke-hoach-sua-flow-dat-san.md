# Kế hoạch 41 — Sửa F1, F2 và các mục nhỏ F7–F11 của báo cáo 40

**Nhánh:** `fix/flow-dat-san-f1-f2-nho` (cắt từ `test/flow-dat-san` = `ad2a099`, đã có test hồi quy + báo cáo 40)
**Trạng thái:** ✅ **đã duyệt (Q1–Q7 theo mặc định) và làm xong** — xem [kết quả](41-ket-qua-sua-flow-dat-san.md). Nguồn: [báo cáo 40](40-ket-qua-kiem-thu-flow-dat-san.md) §3.
**Không nằm trong kế hoạch này (bạn chưa chọn):** F3 (trần/hết hạn `pending`), F4 (mở sân từ booking sai ngày), F5 (cảnh báo trùng SĐT), F6 (trang nhân viên tự cập nhật).

---

## 1. Việc sẽ làm, từng mục

### F1 — `GET /bookings?date=abc` trả 500 → trả 400
- **Nguyên nhân (đã đọc mã):** `GET /bookings` là route duy nhất của bộ booking không có validator; `BookingService.getAllBookings` đưa `date` thẳng vào `where`. `date=abc`, `date=2026-13-45` → `ER_WRONG_VALUE` → 500 (đã đo lại trên server tạm).
- **Sửa:** thêm `listBookingsRules` vào `validations/bookingValidation.js` và gắn vào `router.get('/')`:
  `date` `isISO8601({ strict: true })` dạng `YYYY-MM-DD` · `courtId` `isInt({ min:1, max:2147483647 })` · `status` `isIn(['pending','confirmed','cancelled','completed'])` (khớp ENUM) · `page`/`limit` giữ nguyên hành vi hiện có (service đã kẹp về 1/20…100, không lỗi).
  Trả `400` cùng khuôn `{ success:false, errors:[{field,message}] }` như các rule khác.
- **Tác động hành vi:** `status=bậy` trước đây trả 200 rỗng → nay 400; `courtId=abc` trước đây 200 (bị bỏ qua) → nay 400. Đã rà mọi nơi gọi `GET /bookings` ở frontend: `BookingsPage` (chỉ `page`), `MyBookingsPage` (`limit`), `HistoryPage` (`status` = `completed`/`cancelled`, `date` lấy từ ô ngày hoặc bỏ trống) — đều hợp lệ; sẽ kiểm lại bằng cách đi thật ở trang Lịch sử.
- **Test:** `tests/` thuần (không DB) kiểm `listBookingsRules`; `test.failing` F1 → `test`.

### F2 — Đặt hộ/mở sân với SĐT không hợp lệ phải bị từ chối
- **Nguyên nhân:** `CustomerService.resolveWalkIn` chuẩn hoá SĐT nhưng **không kiểm hợp lệ** — `"123"` được lưu, `"abc"` thành `NULL` im lặng. Hàm này dùng ở **hai** chỗ: `BookingService.createBooking` (`customerPhone`) và `CourtService.openCourt` (`guestPhone`).
- **Sửa (hai tầng):**
  1. **Service** — trong `resolveWalkIn`: nếu SĐT có nhập (không rỗng sau `trim`) mà `!isValidPhone()` → ném `400 "Số điện thoại không hợp lệ."` (dùng đúng `utils/phone.js#isValidPhone` của đăng ký). Để trống SĐT vẫn được (khách chỉ có tên, như hiện nay).
  2. **Route** — thêm rule `customerPhone` (bookingValidation) và `guestPhone` (courtValidation): `optional({ nullable:true, checkFalsy:true })` + `custom(isValidPhone)` để lỗi trả sớm, đồng nhất thông điệp.
- **Dữ liệu cũ:** hồ sơ đã lưu SĐT rác (vd `"123"` trên DB thử) **không** tự sửa — không có migration; chỉ chặn từ nay. Nếu bạn muốn, liệt kê chúng bằng một câu SQL trong báo cáo để nhân viên tự sửa.
- **Tác động giao diện:** form "Tạo lịch đặt mới" và "Mở sân" sẽ hiện lỗi 400 khi gõ SĐT sai (qua F7 bên dưới là banner chứ không phải `alert`).
- **Test:** `test.failing` F2 → `test`; thêm: `abc`, `123`, `+84 919 000 333` (vẫn 201 và chuẩn hoá), rỗng (201), mở sân với `guestPhone` sai (400).

### F7 — Lỗi ở luồng đặt sân hiện bằng `alert()` → banner trong trang
- **Phạm vi:** chỉ luồng đặt sân: `pages/Bookings/BookingsPage.jsx` (3 chỗ: lưu, huỷ, xác nhận) và `pages/MyBookings/MyBookingsPage.jsx` (1 chỗ: huỷ). Các trang khác còn `alert()` (Customers, Courts, Employees, Accessories, Cart) **để ngoài** — sửa dần ở việc riêng.
- **Sửa:** một component nhỏ dùng chung `components/InlineNotice.jsx` (thuần trình bày: `role="alert"`, nút đóng ✕, đủ cả hai nửa class sáng/tối), mỗi trang giữ state `notice`. Lỗi lưu lịch hiện **trong modal** để người dùng không mất dữ liệu đã gõ.
- **Test:** Vitest `react-dom/server` cho `InlineNotice` (có role alert, không render khi rỗng).

### F8 — Thông báo mơ hồ khi đang chọn sai chi nhánh
- **Sửa (chỉ đổi câu chữ, giữ nguyên mã 404/403, không lộ thêm gì):**
  `"Court not found"` ở `createBooking`/`updateBooking` → `"Không tìm thấy sân trong chi nhánh đang chọn — hãy đổi chi nhánh rồi thử lại."`
  `"Booking không thuộc chi nhánh hiện tại"` → `"Booking thuộc chi nhánh khác — hãy đổi chi nhánh đang chọn rồi thử lại."`
- **Lưu ý:** `CourtService` còn nhiều `'Court not found'` cho các thao tác sân — để nguyên (không thuộc flow đặt sân; đổi sẽ rộng).
- **Test:** cập nhật các test đang so khớp chuỗi cũ (đã tìm: không có test nào trong `tests/`, `tests-security/` hay frontend so khớp hai chuỗi này), thêm một test cho thông điệp mới.

### F9 — Booking vẫn `completed` sau khi huỷ hoá đơn — **đề xuất: không đổi code**
- Booking `completed` nghĩa là "đã chơi xong" — đúng sự thật dù tiền đã hoàn; hoá đơn/thanh toán mới là nơi mang trạng thái `void`/`refunded` (đã đúng trong báo cáo doanh thu và nhật ký `invoice.voided`).
- Thêm trạng thái booking mới = đổi ENUM (migration) + sửa mọi nơi lọc trạng thái + giao diện — quá rộng cho một "mục nhỏ", và mở lại khung giờ đã chơi xong không có ý nghĩa.
- **Việc làm:** chỉ ghi quyết định này vào `CLAUDE.md` (mục Money flows) và báo cáo 40 (đổi F9 từ ❓ thành "ghi nhận có chủ đích"). **Cần bạn xác nhận ở Q4.**

### F10 — "Lịch đặt của tôi" trộn lịch đã huỷ với lịch sắp tới
- **Phát hiện thêm khi đọc mã:** `GET /bookings` luôn sắp **tăng dần** theo ngày và kẹp `limit` ≤ 100 → khách có hơn 100 lịch sẽ chỉ thấy **100 lịch cũ nhất** và không bao giờ thấy lịch mới. Với khách thật hiếm, nhưng là lý do cần sửa ở backend chứ không chỉ giao diện.
- **Sửa:**
  1. Backend: thêm tham số tuỳ chọn `sort=asc|desc` (validate trong `listBookingsRules`; mặc định `asc` → trang nhân viên **không đổi**).
  2. Frontend `/my-bookings`: gọi `sort=desc`, rồi nhóm bằng một hàm thuần `groupMyBookings()` (Vitest): **"Sắp tới"** (pending/confirmed chưa qua giờ kết thúc, xếp tăng dần theo giờ) trên cùng, **"Lịch sử"** (đã chơi/đã huỷ/đã qua, mới nhất trước) bên dưới, thu gọn khi nhiều (hiện 6 dòng + nút "Xem thêm").
- **Cần quyết:** Q3 — có thêm tham số `sort` vào API không (đề xuất: có).
- **Postman:** `sort` là query mới của route cũ — thêm vào collection `GET /bookings` rồi chạy `npm run docs:build` (quy ước CLAUDE.md).

### F11 — Điện thoại: dòng phụ của thanh tóm tắt bị cắt chữ
- **Sửa:** `SummaryBar.jsx` bỏ `truncate` của dòng "Sân · ngày · số giờ", cho xuống tối đa 2 dòng (`line-clamp-2`); không đụng khung giờ (đã ở dòng trên) và giá.
- **Phần "nút ↑ chạm mép thanh":** đọc mã thấy thanh **đã cố ý chừa chỗ bên phải cho nút ↑** (`sm:pr-4`, comment ở dòng 17) — là thiết kế, không sửa. Sẽ đo lại bằng ảnh chụp 390 px sau khi sửa dòng chữ để chắc nút chính không bị che.
- **Test:** kiểm ảnh thật 390 px (kèm trong báo cáo kết quả), Vitest `SummaryBar` hiện có chạy lại.

---

## 2. Cách làm và kiểm chứng

1. Mỗi mục một commit nhỏ trên nhánh `fix/flow-dat-san-f1-f2-nho` (F1, F2, F7, F8, F10, F11, docs F9), thông điệp nêu mã F.
2. Chạy: `npm test` (backend), `npm run test:security` trên DB tạm (`bd_sectest_flow` đang còn), `npm test` frontend (Vitest) + `npm run build`.
3. Đi thật trên Chrome headless (laptop 1366×768 + điện thoại 390×844) cho: nhân viên gõ SĐT sai → banner; nhân viên bấm huỷ lịch đã huỷ → banner; khách mở `/my-bookings` có cả lịch đã huỷ → hai nhóm; thanh tóm tắt điện thoại. Ảnh vào `docs/05-extra/02-remediation/41-anh/`.
4. Cập nhật: `booking-flow.security.test.js` (đổi 2 `test.failing` → `test`, thêm ca mới), báo cáo 40 (đánh dấu từng F đã sửa + commit), `CLAUDE.md` (validator danh sách booking, SĐT walk-in, ghi chú F9), Postman + `docs:build`.
5. **Không** push, **không** merge `main`. Báo cáo kết quả ngắn gọn cho bạn duyệt rồi mới merge.

**Rủi ro:** (a) siết `status/courtId/date` có thể làm hỏng client ngoài frontend đang gửi giá trị lạ — đã rà frontend, không có; (b) siết SĐT khi mở sân có thể làm nhân viên đang quen gõ tự do bị 400 — là chủ đích, banner nói rõ lý do; (c) F10 đụng thứ tự mặc định: đã giữ `asc` làm mặc định để staff không đổi.

---

## 3. Câu hỏi cần bạn trả lời

| # | Câu hỏi | Đề xuất |
|---|---|---|
| **Q1** | F2: chặn SĐT sai ở **cả** đặt hộ (`customerPhone`) và mở sân (`guestPhone`), vì chung một hàm? | Có |
| **Q2** | F7: chỉ thay `alert()` ở luồng đặt sân (BookingsPage + MyBookingsPage), các trang khác để việc riêng? | Có |
| **Q3** | F10: thêm tham số `sort=asc\|desc` cho `GET /bookings` (mặc định `asc`, thêm vào Postman)? | Có |
| **Q4** | F9: giữ `completed` sau khi huỷ hoá đơn, chỉ ghi quyết định vào tài liệu? | Có |
| **Q5** | F8: chỉ đổi câu chữ hai thông báo (giữ mã 404/403)? | Có |
| **Q6** | Merge nhánh này vào `test/flow-dat-san` (gom cùng báo cáo 40) khi xong, **chưa** vào `main`? | Có — `main` chỉ sau khi bạn bảo |
| **Q7** | Sau khi sửa xong, giữ hay dọn môi trường tạm `:5060` / `bd_sectest_flow`? | Giữ tới khi bạn nói dọn |
