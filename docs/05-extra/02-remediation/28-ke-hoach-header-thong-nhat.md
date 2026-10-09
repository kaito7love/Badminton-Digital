# Kế hoạch 28: header thống nhất (Trang chủ, Cửa hàng, Thi đấu)

- **Ngày:** 10/10/2026.
- **Trạng thái:** **bản nháp chờ chủ dự án duyệt. Chưa sửa mã nào.** Nhánh `feat/header-thong-nhat`, tách từ `main` @ `1c7ef66`; trên nhánh có đúng file này.
- **Làm lại từ đầu** theo yêu cầu của chủ dự án (10/10/2026): không kế thừa hướng thiết kế, mã hay tài liệu của các lần trước.
- **Bản mẫu bấm thử:** <https://claude.ai/artifact/5GioM2ctNX4XCSNA7TvE8C>. Mở bằng "Hiện tại" để thấy app đang chạy, bấm a, b, c để xem từng hướng; bảng "Đo logo ở cả ba trang" đo thật ở bề rộng đang chọn.
- **Phạm vi:** chỉ header. Mục 6 liệt kê những gì không đụng.

## 1. Yêu cầu

Trang chủ, Cửa hàng và Thi đấu đang có 3 header khác nhau nên logo và tên thương hiệu không đồng nhất. Đưa ra hướng giải quyết, làm plan và bản mẫu để xem trước; chốt xong mới sửa.

## 2. Hiện trạng (đo thật trên `main`, Chrome, giao diện tối)

| | Trang chủ (`HomePage.jsx` 313–456) | Cửa hàng + khu khách (`CustomerLayout.jsx` 71–190) | Thi đấu (`PublicShell.jsx`) |
|---|---|---|---|
| Cao thanh | **96 px** (80 khi cuộn); đè lên ảnh | **80 px** (+1 viền) | **64 px** (+1 viền); 118 px ở 390 vì thêm hàng menu |
| Ô logo | 44 px | 40 px | 40 px |
| Tên thương hiệu | BADMINTON DIGITAL **24 px** | BADMINTON DIGITAL **20 px** | **không có** như logo: "THI ĐẤU" lớn, "BADMINTON DIGITAL" nhỏ 10 px |
| Logo trỏ về | `/` (đang ở `/` thì cuộn lên đầu) | `/` | `/thi-dau` |
| Menu | 6 mốc cuộn **tiếng Anh**; không có đường tới Thi đấu | 5 mục, tới 10 khi đã đăng nhập | 5 đến 6 mục dạng nút bo tròn |
| Bên phải | giỏ (biểu tượng), Đăng nhập / Tài khoản, nút Instant Book ⚡; **không có** đổi giao diện | đổi giao diện, tên, Bàn làm việc, Đăng xuất / Đăng nhập, Đăng ký; giỏ là một mục menu | đổi giao diện, tên, Bàn làm việc, Đăng xuất / Đăng nhập, Đăng ký; **không có giỏ** |
| Gập thành ☰ | dưới 1024 px | dưới 1280 px | **không có ☰**; hàng menu hiện từ 768 px và **tràn ngang ở 768** (đo: `scrollWidth` > `innerWidth`) |
| Điện thoại | ☰ + lưới 2 cột, không có thanh tab | ☰ + thanh tab dưới 5 ô | hàng menu cuộn ngang |
| x của logo ở 1440 / 1024 / 390 | 104 / 24 / 24 | 104 / 24 / 20 | **160** / 16 / 16 |

Chín chỗ lệch: 3 kiểu chữ thương hiệu; ô logo 44 / 40; ba chiều cao; logo Thi đấu trỏ về chỗ khác; ba danh sách menu, hai ngôn ngữ; Trang chủ không có đường tới Thi đấu; giỏ hàng có ba kiểu; nút đổi giao diện lúc có lúc không; ba ngưỡng gập; logo Thi đấu lệch 56 px ở 1440.

## 3. Ba hướng, từ nhỏ đến lớn

| | **a · Thống nhất thương hiệu** | **b · Menu phẳng** | **c · Menu phẳng + bảng** |
|---|---|---|---|
| Ý tưởng | Chỉ sửa thứ gây ra lỗi đã báo: logo, tên thương hiệu, chiều cao, khung. Mỗi khu giữ menu riêng | Một header chung cho ba khu: **Trang chủ ▾ · Cửa hàng ▾ · Thi đấu ▾**, giỏ, tài khoản. Rê chuột vào từng mục thì sổ xuống: Trang chủ (6 mốc), Cửa hàng (**Vợt, Giày, Phụ kiện**), Thi đấu (Tổng quan, Giải đấu, Giao lưu, Xếp hạng, + Lịch sử thi đấu cho khách hàng) | Như b, thêm nút **Menu** mở một bảng liệt kê mọi liên kết theo khu |
| Đổi | ô logo, chữ, chiều cao, khung và lề của cả ba header (dùng chung một thành phần logo) | toàn bộ ba header thành một thành phần | như b |
| Giữ nguyên | mọi mục menu và nút của từng khu, ☰, thanh tab dưới (chỉ ở khu khách) | — | — |
| Dời | không | Đơn mua, Lịch đặt sang menu tài khoản, kèm mục **Lịch sử thi đấu** (dẫn tới trang Giải của tôi: các giải và buổi giao lưu đã đăng ký) | như b |
| Bỏ khỏi header (**cần bạn đồng ý**) | không | không bỏ mục nào (Đơn mua chỉ còn ở menu tài khoản; giỏ chỉ còn là biểu tượng) | **không bỏ gì** |
| Ưu | ít file nhất, ít rủi ro nhất, đo được ngay | header thật sự giống nhau; gọn nhất | giống nhau và không mất lối vào nào |
| Nhược | menu vẫn khác nhau; Trang chủ vẫn không có đường tới Thi đấu; tràn ngang ở 768 của Thi đấu vẫn còn | ba menu sổ xuống cần thử kỹ trên cảm ứng và bàn phím; Cửa hàng không còn mục Giỏ hàng / Đơn mua trong menu con | tới mục con mất hai lần bấm; bảng Menu là thành phần mới phải thử kỹ trên cảm ứng |
| Thanh tab dưới (điện thoại) | giữ nguyên, chỉ ở khu khách | **hiện ở mọi trang** (cả Trang chủ và Thi đấu), cùng 5 ô: Trang chủ, Cửa hàng, Giỏ hàng, Đơn mua (khách), Thi đấu | như b |
| Chạm tới | thành phần logo mới + khối header của `HomePage`, `CustomerLayout`, `PublicShell` | các file của a + thành phần header chung, cấu hình menu (có test), ngưỡng hiện thanh tab, hiệu ứng cuộn tới mốc ở Trang chủ nếu giữ nút Instant Book ở mọi trang | như b + bảng Menu |
| Ngưỡng gập ☰ (đo trong bản mẫu, khách) | không đổi (1024 / 1280 / không có) | ~1030 px (khách), ~1040 px (khách hàng); đo lại sau khi thêm hai menu con | ~1100 px (~1130 khi đã đăng nhập) |

**Gợi ý của tôi:** làm **a** trước. Nó sửa đúng điều bạn báo, đo được bằng số, rồi xem trên app thật. Nếu sau đó bạn vẫn muốn một header chung thì làm b hoặc c, lúc đó đã thấy logo thống nhất trong app thật. Chọn b hoặc c ngay cũng được, nhưng b có phần bỏ cần bạn đồng ý, còn c giữ đủ nhưng thêm một thành phần mới.

### 3.1 Đối chiếu cho hướng b và c

| Mục cũ | Chỗ mới |
|---|---|
| Courts · Schedule · Features · Pricing · Gear · FAQ (Trang chủ) | **Trang chủ ▾** (b) / bảng Menu › Trang chủ (c); nhãn theo câu 6 |
| Shop · Cửa hàng | mục **Cửa hàng ▾** › Vợt, Giày, Phụ kiện (liên kết kiểu `/shop?category=…`; trang Cửa hàng hôm nay lọc theo danh mục bằng trạng thái trong trang, chưa đọc địa chỉ, nên phần lọc theo liên kết làm sau, như bạn nói: bây giờ chỉ làm UX/UI) |
| Giỏ hàng (biểu tượng ở Trang chủ, mục menu ở Cửa hàng, không có ở Thi đấu) | biểu tượng giỏ ở **cả ba trang** (không còn trong menu con Cửa hàng) |
| Giải đấu (`/thi-dau`) · Thi đấu | mục **Thi đấu** |
| Giải đấu · Giao lưu (mốc), Xếp hạng | b: **Thi đấu ▾** sổ xuống khi rê chuột (bấm ▾ trên cảm ứng). c: bảng Menu |
| Đơn mua, Lịch đặt, Tài khoản | menu tài khoản (b, c) và cột "Của tôi" của bảng Menu (c) |
| Trình độ, Giải của tôi | gộp thành **Lịch sử thi đấu** (khách hàng) ở **Thi đấu ▾** (b) / bảng Menu (c) và menu tài khoản. **Trang Trình độ (`/my-rating`) mất lối vào từ header**: hiện chỉ header dẫn tới nó từ ngoài khu thi đấu — cần bạn quyết (câu 7) |
| Bàn làm việc · Đăng xuất · tên | menu tài khoản |
| Đăng nhập · Đăng ký | bên phải, giữ hai nút |
| Instant Book ⚡ | bên phải (câu 4) |
| Đổi giao diện | bên phải, ẩn ở Trang chủ như hôm nay (Trang chủ chưa có bản sáng) |
| Nhãn "THI ĐẤU" lớn | bỏ hoặc nhãn nhỏ (câu 3) |

**Kiểm bằng tìm kiếm trong mã:** Đơn mua (`/orders`), Trình độ (`/my-rating`) và Giải của tôi (`/my-tournaments`) hiện chỉ có đường vào từ header (từ ngoài khu của chúng); Lịch đặt (`/my-bookings`) còn nút ở trang Tài khoản. Nếu bỏ chúng khỏi header mà không có chỗ khác thì khách mất lối vào; vì vậy b và c gộp Trình độ, Giải của tôi thành Lịch sử thi đấu (trang Trình độ mất lối vào, xem câu 7) và chuyển Đơn mua, Lịch đặt vào menu tài khoản.

## 4. Phần chung của cả ba hướng

- **Logo:** một thành phần dùng cho ba header, cùng ô logo và cùng chữ BADMINTON DIGITAL ở cả ba (cỡ theo câu 2), giữ nguyên kiểu hiện có (viền gradient lục–chanh, nền tối, vợt, "DIGITAL" gradient). Logo ở cả ba trỏ về `/` (đang ở `/` thì cuộn lên đầu như hôm nay); riêng Thi đấu hôm nay trỏ về `/thi-dau`, nên đây là một thay đổi nhỏ cần bạn biết (câu 3).
- **Chiều cao, khung, lề:** thanh 80 px (điện thoại 64) hoặc 96 / 80 theo câu 2, khung 1280 px, lề 24 px (20 dưới 640 px).
- Thanh tab dưới của khu khách, thân trang, nút Instant Book trong hero và ô đặt sân của Trang chủ **không đổi**.
- Chỗ khác dựng logo bằng tay (4 trang đăng nhập / quên / đặt lại mật khẩu / đăng ký, ô logo của `SidebarLayout`) **giữ nguyên**.

## 5. Quyết định cần bạn trả lời

Chưa có mặc định nào được làm. Đổi từng câu trong bản mẫu rồi trả lời; câu nào không thuộc hướng bạn chọn thì bỏ qua.

1. **Hướng:** a, b hoặc c (mục 3). *Gợi ý: a.*
2. **Cỡ logo chuẩn:** (a) ô 40, chữ 20, thanh 80 px, điện thoại 64 (như Cửa hàng; Trang chủ nhỏ đi một chút); (b) ô 44, chữ 24, thanh 96 px, điện thoại 80 (như Trang chủ; thanh chật hơn). *Gợi ý: (a).*
3. **Chữ "THI ĐẤU" cạnh logo ở khu Thi đấu:** (a) bỏ, logo trỏ về `/`; (b) giữ thành nhãn nhỏ "Thi đấu" cạnh logo, logo trỏ về `/`. *Gợi ý: (a).*
4. **Nút Instant Book ⚡ (chỉ hướng b, c):** (a) ở bên phải cả ba trang; (b) chỉ ở Trang chủ như hôm nay. *Gợi ý: (a), vì đây là hành động chính của sân.*
5. **Khung header Thi đấu (chỉ hướng a):** (a) rộng 1280 như hai trang kia, logo cùng chỗ ở cả ba, lệch 56 px so với nội dung Thi đấu (plan không đổi thân trang); (b) giữ khung hôm nay, logo khớp nội dung Thi đấu nhưng lệch 56 px so với hai trang kia. *Gợi ý: (a).*
6. **Nhãn mốc Trang chủ (hướng b, c):** (a) tiếng Việt: Sân · Lịch trống · Tiện ích · Bảng giá · Dụng cụ · Hỏi đáp; (b) giữ tiếng Anh. *Gợi ý: (a).*

7. **Trang Trình độ (`/my-rating`), hướng b, c:** sau khi gộp thành Lịch sử thi đấu, không còn mục nào dẫn tới trang này. (a) đặt một liên kết "Trình độ" trong menu tài khoản; (b) để trang đó vào được từ trang Giải của tôi / Tài khoản (sửa nội dung trang, ngoài phạm vi header); (c) bỏ lối vào. *Gợi ý: (a).*

## 6. Ngoài phạm vi (không đụng, trừ khi bạn nói)

Ghi chú của chủ dự án (10/10/2026): đang tập trung UX/UI; **không tạo endpoint hay xử lý dữ liệu** cho các trang mà menu dẫn tới (danh mục Cửa hàng, Lịch sử thi đấu, v.v.). Liên kết trong header chỉ dẫn tới trang đã có hoặc tham số địa chỉ; phần lọc và dữ liệu làm sau.

Trang Đặt sân mới và tách ô đặt nhanh khỏi Trang chủ; bản sáng cho Trang chủ; độ rộng, lề và nội dung thân trang, kể cả khung nội dung Thi đấu; đường dẫn, trang đích sau đăng nhập hay đăng ký; logo ở các trang đăng nhập và khu nhân viên; backend, DB; `CLAUDE.md` và các tài liệu khác ngoài file này.

## 7. Cách làm và cách kiểm (sau khi bạn duyệt)

Mỗi bước một commit trên nhánh này; đo trước, sửa, đo lại bằng Chrome thật (không chỉ đọc mã).

| Bước | Việc | Kiểm |
|---|---|---|
| 1 | Thành phần logo dùng chung + test | Dựng ra giống từng điểm ảnh logo hiện có của Cửa hàng |
| 2 | Cửa hàng + khu khách dùng nó (hướng a); với b, c: header chung dựng ở bước riêng, chưa dùng ở đâu | Chụp trước / sau các trang khu khách, sáng / tối, 1440 và 390: thân trang giống hệt; bấm thật từng mục |
| 3 | Thi đấu | Như bước 2 cho `/thi-dau`, `/rankings`, `/players/:id`; bấm mốc `#giai`, `#giao-luu` |
| 4 | Trang chủ (kỹ nhất vì có ô đặt sân) | Chụp cả trang bản tối trước / sau (tắt hiệu ứng động): chỉ khác phần header; ghi lại luồng đặt sân thật (khách chưa đăng nhập và đã đăng nhập) trước / sau và so: giống hệt |
| 5 | Đo cuối | Ô logo và chữ thương hiệu ở `/`, `/shop`, `/thi-dau`, `/rankings` × 1920 / 1440 / 1280 / 1024 / 768 / 390 / 360: sai lệch 0 px (hướng a theo cỡ chọn ở câu 2; câu 5b thì vị trí logo Thi đấu khác có chủ đích) |

Vitest chạy sau mỗi bước.

## 8. Rủi ro

| Rủi ro | Giảm |
|---|---|
| Đổi chiều cao header làm lệch cuộn tới mốc và khối `sticky` (`lg:top-24` ở `Panels.jsx`, `CheckoutPage.jsx`, `OrderDetailPage.jsx`; `scroll-mt-32` ở `atoms.jsx`) | header sau khi đổi cao 80 đến 96 px, thấp hơn hoặc bằng 96 px của `top-24`; bấm thật để xác nhận trước khi coi là xong |
| Trang chủ: nút Instant Book và cuộn tới ô đặt sân (hướng b, c) | ghi lại luồng đặt sân trước / sau; hiệu ứng cuộn tới mốc khi đi từ trang khác |
| Thanh chật ở 1024 đến 1280 px (hướng b, c) | bản mẫu đã đo; quyết theo số đo khi làm |
| Bản demo Render deploy ngay khi push `main` | không gộp, không đẩy khi bạn chưa nói "merge vào main đi" |

## 9. Lỗi có sẵn thấy khi đo (không sửa, nói nếu muốn làm)

- Header Thi đấu tràn ngang ở 768 px (hướng a không sửa; b và c thì hết vì header gập ☰).
- `scrollToSection` của Trang chủ chỉ trừ 24 px dù thanh cao 96 px.
- Trang Tài khoản bị cắt thẻ hồ sơ ở 390 px (đã có việc riêng).

## 10. Cách làm việc

- Chỉ làm trên nhánh này, mỗi bước một commit; không gộp, không đẩy `main` khi chưa có lệnh của bạn.
- Không sửa `CLAUDE.md`, `00-tien-do.md` hay tài liệu nào khác ngoài file này, nếu bạn chưa nói.
- Không dừng hay chạy lại server, không chạy migration trên DB của bạn, không xóa nhánh hay Artifact khi bạn chưa nói.
- Việc gì không có trong plan này thì hỏi trước khi làm.
