# Kế hoạch 30: chuyển mọi việc đặt sân sang trang `/dat-san`

- **Ngày:** 15/10/2026.
- **Trạng thái:** **đã làm xong và đã gộp vào `main` cục bộ (`0ccc767`, 15/10/2026, theo lệnh "merge vào main đi").** Nhánh `feat/chuyen-dat-san-sang-trang-dat-san`, tách từ nhánh `docs/cap-nhat-trang-dat-san-va-han-14-ngay`; hai nhánh này và nhánh kế hoạch 31 gộp cùng một lần. Chưa push.
- **Phạm vi:** phía khách (Trang chủ và các trang trỏ tới ô đặt nhanh). Không đổi API, không đổi DB, không đụng trang `/dat-san` và khu nhân viên.

## 1. Yêu cầu

Chủ dự án (15/10/2026): "khoan giờ tôi muốn là booking thì chuyển hết sang trang đặt sân đi" — *việc đặt sân* chỉ còn ở một nơi là `/dat-san`; Trang chủ và các trang khác chỉ dẫn tới đó.

## 2. Bốn quyết định (đã hỏi, chủ dự án chọn đều theo gợi ý)

| Câu hỏi | Chốt |
|---|---|
| Ô "FAST BOOKING" bên phải hero (form ngày / giờ / sân) | **Thẻ dẫn sang `/dat-san`**: giữ chỗ và kiểu dáng cũ, bên trong chỉ còn câu giới thiệu ngắn, giờ nhận đặt, giá "từ …đ/giờ" và một nút "ĐẶT SÂN" |
| Lưới "Lịch trống" ở Trang chủ (toàn ô giả, giờ và "BOOKED" gõ cứng) và mục "Lịch trống" ở menu header | **Bỏ cả hai** |
| Ba thẻ sân, sơ đồ mặt bằng, ba nút "BOOK NOW" ở bảng giá, nút "RESERVE COURT NOW" ở hero | **Tất cả là liên kết thường tới `/dat-san`**, không điền sẵn sân / giờ |
| Mã của ô cũ (hộp xác nhận, khôi phục `pending_booking`, ước giá, lọc mốc giờ…) | **Xoá cùng với ô** |

## 3. Đã làm

| Nơi | Thay đổi |
|---|---|
| `pages/Home/HomePage.jsx` | 1255 → 611 dòng. Còn: tải danh sách chi nhánh, danh mục sân, sơ đồ; bộ chọn chi nhánh; cuộn tới mốc. Hết: form, hộp xác nhận, toast, `estimatePrice`, `handleQuickBooking`, `handleBookingSubmit`, `startBookingFromCard`, `selectCourtFromLayout`, hiệu ứng khôi phục `pending_booking`, ba hiệu ứng chỉnh giờ / số giờ, lưới "Lịch trống" |
| `pages/Home/BookingCta.jsx` (mới) | thẻ "FAST BOOKING" + `lowestOffpeakPrice(courts)` (chỉ tính sân đang nhận đặt) |
| `components/site/siteNav.js` | bỏ mục "Lịch trống" khỏi menu Trang chủ (6 → 5 mốc) |
| `Shop/ShopPage.jsx`, `Account/AccountPage.jsx`, `MyBookings/MyBookingsPage.jsx` (×2) | `/#booking-widget` → `/dat-san`; câu ở trạng thái rỗng của Lịch đặt nhắc "trang Đặt sân" thay vì "trang chủ" |
| Xoá | `utils/bookingSlots.js` + test; `wallClockPassed` / `nowTimeInZone` trong `utils/datetime.js`; `isBeyondWindow`, `advanceLimitMessage`, `dayMonth` trong `Booking/lib/dayStrip.js` (và test); CSS `.cyber-slot` (cả `:focus-visible` trong `kinetic.css`), `#booking-widget`, `#availability` |
| Chú thích | sửa chỗ còn nhắc "ô đặt nhanh / widget Trang chủ" (`BookingService.js`, `PublicCatalogService.js`, `BookingPage.jsx`, `pendingBooking.js`) — chỉ chú thích, không đổi logic |

`todayInZone` vẫn còn (trang Đặt sân dùng); `datetime.test.js` viết lại chỉ còn kiểm chính hàm đó (qua nửa đêm giờ Việt Nam, khác múi giờ, thiếu múi giờ).

## 4. Kiểm chứng

| Kiểm | Kết quả |
|---|---|
| Vitest | 465/465 (33 file). Giảm so với 486 là do xoá test của mã đã xoá; thêm `BookingCta.test.jsx` (7) |
| Jest backend | 627/627 |
| `vite build` | sạch |
| Chrome thật, 20 ca | không còn form / ô nhập / hộp xác nhận / `#booking-widget` / `#availability` / `.cyber-slot` (chỉ còn `#branch-select`); thẻ ghi đúng giờ mở cửa và giá "từ 60.000đ/giờ" khớp `/public/courts`; **bấm thật** cả 5 nút (hero, thẻ, 3 × BOOK NOW) đều tới `/dat-san` và trang dựng được lưới; sơ đồ mặt bằng; 3 thẻ sân tĩnh (chặn file sơ đồ để dựng nhánh này) → `/dat-san`; menu Trang chủ ▾ = Sân, Tiện ích, Bảng giá, Dụng cụ, Hỏi đáp; `/#pricing` cuộn tới; neo cũ `/#availability` và `/#booking-widget` vẫn mở Trang chủ bình thường; đổi sang Chi nhánh Quận 3 rồi ĐẶT SÂN → `/dat-san` ở đúng Quận 3; điện thoại 390: không tràn ngang, chạm ĐẶT SÂN → `/dat-san`; `/my-bookings`, `/shop`, `/account` (cả trạng thái rỗng) trỏ `/dat-san`; nhân viên vẫn vào được `/bookings`; không lỗi JS chưa bắt |

## 5. Điều cần biết

- **Hiệu ứng phụ có chủ đích:** hết toàn bộ lối "đặt nhanh" ở Trang chủ nên bấm "BOOK COURT 01" hay một ô trên sơ đồ **không** còn điền sẵn sân đó ở `/dat-san` (chủ dự án đã chọn "không deep-link"). Làm sau được bằng `?court=` nếu muốn.
- **Liên kết cũ:** `/#booking-widget` và `/#availability` (đã đánh dấu trang, bài viết ngoài) vẫn mở Trang chủ ở đầu trang, không báo lỗi; chúng không còn nhảy tới đâu.
- **Phiên cũ:** khoá `pending_booking` còn sót trong `sessionStorage` của một tab mở trước khi cập nhật không còn ai đọc; vô hại, hết khi đóng tab.
- **`/public/branches` vẫn trả `timezone`:** client không còn dùng ở Trang chủ, nhưng giữ vì đã là hợp đồng công khai.
- **Chưa đổi:** chữ quảng bá tiếng Anh ở hero ("LIVE STADIUM SYNC: 8 COURTS OPEN RIGHT NOW", "4.9 ★", "12,000+ MATCHES") là số gõ cứng từ trước; không thuộc kế hoạch này.
- **Khi push:** không migration, không đổi API; bản demo Render tự deploy.
