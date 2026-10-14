# Kế hoạch 31: footer chung cho khu khách, lấy footer `/thi-dau` làm chuẩn

- **Ngày:** 15/10/2026.
- **Trạng thái:** **đã làm xong và đã gộp vào `main` cục bộ (`0ccc767`, 15/10/2026, theo lệnh "merge vào main đi").** Nhánh `feat/footer-thong-nhat`, tách từ `feat/chuyen-dat-san-sang-trang-dat-san` (kế hoạch 30) vì `HomePage.jsx` nằm trong cả hai; gộp cùng một lần. Chưa push.
- **Phạm vi:** chỉ phần chân trang của khu khách. Không đụng header, thân trang, khu nhân viên (không có footer), API, DB.

## 1. Yêu cầu

Chủ dự án (15/10/2026): "làm lại footer đi, lấy footer trang /thi-dau làm chuẩn".

## 2. Hiện trạng (đo bằng Chrome thật, chỉ đọc)

Ba chân trang, ba bản sao riêng, không dùng chung gì:

| Khu | File | Cao 1440 / 390 px | Nội dung |
|---|---|---|---|
| Trang chủ | `pages/Home/HomePage.jsx` (cuối file) | 169 / 265 | ô ⚡ + "BADMINTON DIGITAL" cỡ lớn · "© 2026 BADMINTON DIGITAL // NIKE KINETIC EDITION"; luôn tối; không liên kết |
| Cửa hàng, Tài khoản, Đơn mua, Lịch đặt, Đặt sân, Giỏ… | `layouts/CustomerLayout.jsx` | 109 / 196 | chữ "BADMINTON DIGITAL" · cùng dòng "NIKE KINETIC EDITION"; theo sáng/tối; không liên kết |
| **Thi đấu (chuẩn)** | `features/competition/components/PublicShell.jsx` | **65 / 165** | một dòng "© 2026 Badminton Digital — Giải đấu & giao lưu cầu lông của sân." bên trái · ba liên kết bên phải: Trang chủ Badminton Digital, Bảng xếp hạng, Đặt sân; theo sáng/tối |

Ghi nhận thêm khi đo:
- Liên kết "Đặt sân" ở footer `/thi-dau` đang trỏ `/my-bookings` (lịch sử đặt), lệch với kế hoạch 30 (đặt sân chỉ ở `/dat-san`).
- Dòng "giải đấu & giao lưu của sân" chỉ đúng ở khu Thi đấu; đem nguyên sang Trang chủ / Cửa hàng là sai chữ.
- Bề rộng khác nhau: Trang chủ và khung khách `max-w-7xl`, Thi đấu `max-w-6xl`, trong khi header ở cả ba cùng `max-w-7xl`.

## 3. Hướng làm (đề xuất)

Làm đúng cách đã làm với header ở kế hoạch 28: **một component dùng chung**, dữ liệu liên kết nằm trong `siteNav.js` (đã có test), ba khu chỉ gọi lại.

| Việc | Chi tiết |
|---|---|
| `components/site/SiteFooter.jsx` (mới) | bố cục y hệt footer `/thi-dau`: một hàng — dòng bản quyền bên trái, các liên kết bên phải; dưới `sm` xếp dọc căn giữa; chừa `pb-24` cho thanh tab dưới trên điện thoại, `lg:py-6`; viền trên + nền trắng / `slate-950`. Prop `tone` giống `SiteHeader` (`'dark'` cho Trang chủ vì trang chỉ có bản tối) |
| `siteNav.js` | thêm `footerLinks` vào `buildSiteNav` (kèm test): mục Thi đấu biến mất khi dịch vụ thi đấu tắt, giống menu header, không để liên kết chết |
| `HomePage.jsx`, `CustomerLayout.jsx`, `PublicShell.jsx` | bỏ ba bản `<footer>` riêng, dùng `<SiteFooter />` |
| Bề rộng | **cùng `max-w-7xl` như header** để chân trang thẳng hàng với logo / menu ở mọi trang (`/thi-dau` nội dung 6xl nhưng header đã 7xl) |
| Bỏ | khối logo ⚡ + chữ lớn và dòng "NIKE KINETIC EDITION" ở Trang chủ và khung khách (theo chuẩn `/thi-dau` không có) |
| Test | `siteNav.test.js` (liên kết + ẩn Thi đấu khi tắt); `SiteFooter` bằng `renderToStaticMarkup` (bố cục, liên kết, tone tối, `pb-24`); sửa `PublicShell.test.jsx` (đang kiểm đúng chữ "Trang chủ Badminton Digital" và `pb-24`) |
| Chrome thật | footer ở `/`, `/shop`, `/dat-san`, `/thi-dau`, `/account` × 1440 / 390 × tối / sáng: cùng chiều cao, cùng chữ, thẳng hàng với header, không tràn ngang, không bị thanh tab dưới hay nút lên đầu trang che mất liên kết |

## 4. Quyết định của chủ dự án (15/10/2026)

1. **Áp cho khu nào:** cả ba — Trang chủ + khung khách + Thi đấu, một component dùng chung.
2. **Liên kết và dòng chữ:** bốn liên kết khớp menu header — Trang chủ · Đặt sân (`/dat-san`) · Cửa hàng · Thi đấu — kèm dòng chung "© 2026 Badminton Digital — Đặt sân, cửa hàng và giải đấu cầu lông.".

## 5. Đã làm

| Nơi | Thay đổi |
|---|---|
| `components/site/SiteFooter.jsx` (mới) | `SiteFooterView` thuần (bố cục của footer `/thi-dau`, `max-w-7xl` + lề như header) + `SiteFooter` nối `useCompetition`; prop `tone` ('auto' / 'dark') và `clearBottomBar` |
| `components/site/siteTone.js` | thêm `foot`, `footLink` cho hai tone — đúng bộ lớp của footer `/thi-dau` cũ |
| `components/site/siteNav.js` | `buildSiteNav` trả thêm `footerLinks` = các mục chính của menu (Thi đấu tự biến mất khi dịch vụ tắt) |
| `HomePage.jsx` (`tone="dark"`), `CustomerLayout.jsx`, `PublicShell.jsx` | bỏ ba `<footer>` riêng, dùng `<SiteFooter />` |
| `CustomerLayout` + `BookingPage.jsx` | prop `clearBottomBar` — xem mục 6 |

## 6. Lỗi tìm ra khi kiểm bằng Chrome thật

Thanh tóm tắt cố định của `/dat-san` trên điện thoại (`bottom-[4.75rem]`, cao 74–130 px, luôn hiện kể cả chưa chọn gì) nằm đè lên chân trang khi cuộn tới cuối trang: cao nhất tới 206 px tính từ đáy màn hình, trong khi liên kết footer nằm ở ~100 px. **4/4 liên kết không bấm được** (`elementFromPoint` trả về thanh tóm tắt). Footer cũ không có liên kết nên lỗi này chưa ai thấy. Sửa: `clearBottomBar` đổi `pb-24` → `pb-56` (chỉ dưới `lg`, nơi thanh đó `fixed`); đo lại ở 360 / 390 / 768 px kể cả khi đã chọn một khung giờ (thanh cao nhất): 4/4 bấm trúng.

## 7. Kiểm chứng

| Kiểm | Kết quả |
|---|---|
| Vitest | 473/473 (34 file): thêm `SiteFooter.test.jsx` (7), 1 ca ở `siteNav.test.js`, sửa `PublicShell.test.jsx` |
| `vite build` | sạch |
| Chrome thật, 56 ca | 7 trang (`/`, `/shop`, `/dat-san`, `/account`, `/my-bookings`, `/thi-dau`, `/rankings`) × 1440 / 390 px: đúng một footer, cùng dòng chữ và 4 liên kết, nền tối, không tràn ngang, bấm trúng cả 4 liên kết, chữ đầu footer thẳng hàng với logo header (0 px), **chiều cao bằng nhau** (65 px ở 1440; 181 px ở 390, riêng `/dat-san` 309 px có chủ đích); bản sáng ở `/shop` và `/thi-dau` nền trắng, Trang chủ vẫn tối; bấm thật "Đặt sân", "Cửa hàng", "Thi đấu", "Trang chủ" → đúng trang và về đầu trang; tắt dịch vụ thi đấu → chỉ còn 3 liên kết; không lỗi JS |

Một ca "nền trắng ở `/shop` bản sáng" đỏ một lần trong lượt chạy đầu rồi đạt ở lượt sau và 6/6 khi chạy riêng; nghi do trình tự thao tác của kịch bản (đặt `localStorage` ngay sau khi rời trang cũ), không tái hiện được trên ứng dụng.

## 8. Điều cần biết

- Mất khối logo ⚡ + chữ lớn và dòng "NIKE KINETIC EDITION" ở Trang chủ và khung khách (theo chuẩn `/thi-dau` không có).
- Liên kết "Đặt sân" ở `/thi-dau` trước đây trỏ `/my-bookings`; nay là `/dat-san`. Liên kết "Bảng xếp hạng" không còn ở footer (vẫn có ở menu Thi đấu ▾).
- Trên điện thoại 390 px, nút lên đầu trang nổi nằm sát liên kết cuối ("Thi đấu") khi cuộn tới cuối trang (cách ~10 px, không đè).
- `CLAUDE.md` và `00-tien-do.md` (mục 30) được cập nhật sau, theo yêu cầu, ở nhánh `docs/cap-nhat-footer-chung`.
- Khi push: không đổi API, không migration; chỉ frontend.
