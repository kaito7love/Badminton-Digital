# Kế hoạch 28: header thống nhất (Trang chủ, Cửa hàng, Thi đấu)

- **Ngày:** 10/10/2026.
- **Trạng thái:** **đã làm xong 6 bước trên nhánh (kết quả ở mục 12); chờ chủ dự án duyệt gộp vào `main`** (chưa gộp, chưa đẩy). Chủ dự án chọn 1b 2a 3a 4a 5a và bỏ qua câu 6 (trang Trình độ để xử lý sau). Nhánh `feat/header-thong-nhat`, tách từ `main` @ `1c7ef66`.
- **Làm lại từ đầu** theo yêu cầu của chủ dự án (10/10/2026): không kế thừa hướng thiết kế, mã hay tài liệu của các lần trước.
- **Bản mẫu bấm thử:** <https://claude.ai/artifact/5GioM2ctNX4XCSNA7TvE8C>. Chọn "b · Menu phẳng" để xem đúng hướng đã chọn; "Hiện tại" là app đang chạy. Bản mẫu còn hướng a, c để đối chiếu, không dùng.
- **Phạm vi:** chỉ header (kể cả thanh tab dưới trên điện thoại, vì nó là phần điều hướng của header). Mục 6 liệt kê những gì không đụng. Đang tập trung UX/UI: **không tạo endpoint hay xử lý dữ liệu** cho các trang mà menu dẫn tới.

## 1. Yêu cầu

Trang chủ, Cửa hàng và Thi đấu đang có 3 header khác nhau nên logo và tên thương hiệu không đồng nhất. Làm một header chung; xem bản mẫu trước, chốt xong mới sửa.

## 2. Hiện trạng (đo thật trên `main`, Chrome, giao diện tối)

| | Trang chủ (`HomePage.jsx` 313–456) | Cửa hàng + khu khách (`CustomerLayout.jsx` 71–190) | Thi đấu (`PublicShell.jsx`) |
|---|---|---|---|
| Cao thanh | **96 px** (80 khi cuộn); đè lên ảnh | **80 px** (+1 viền) | **64 px** (+1 viền); 118 px ở 390 vì thêm hàng menu |
| Ô logo | 44 px | 40 px | 40 px |
| Tên thương hiệu | BADMINTON DIGITAL **24 px** | BADMINTON DIGITAL **20 px** | **không có** như logo: "THI ĐẤU" lớn, "BADMINTON DIGITAL" nhỏ 10 px |
| Logo trỏ về | `/` (đang ở `/` thì cuộn lên đầu) | `/` | `/thi-dau` |
| Menu | 6 mốc cuộn **tiếng Anh**; không có đường tới Thi đấu | 5 mục, tới 10 khi đã đăng nhập | 5 đến 6 mục dạng nút bo tròn |
| Bên phải | giỏ (biểu tượng), Đăng nhập / Tài khoản, nút Instant Book ⚡; **không có** đổi giao diện | đổi giao diện, tên, Bàn làm việc, Đăng xuất / Đăng nhập, Đăng ký; giỏ là một mục menu | như Cửa hàng; **không có giỏ** |
| Gập thành ☰ | dưới 1024 px | dưới 1280 px | **không có ☰**; hàng menu hiện từ 768 px và **tràn ngang ở 768** (đo: `scrollWidth` > `innerWidth`) |
| Điện thoại | ☰ + lưới 2 cột, không có thanh tab | ☰ + thanh tab dưới 5 ô | hàng menu cuộn ngang |
| x của logo ở 1440 / 1024 / 390 | 104 / 24 / 24 | 104 / 24 / 20 | **160** / 16 / 16 |

## 3. Đã chốt (10/10/2026)

| Câu | Chọn |
|---|---|
| 1 · Hướng | **b · Menu phẳng**: một header chung cho ba khu (a và c không làm) |
| 2 · Cỡ logo | **(b)** ô 44, chữ 24, thanh 96 px (điện thoại: chữ 18, thanh 80). Lúc đầu chọn (a) ô 40 / chữ 20 / thanh 80; đổi sang (b) theo yêu cầu ngày 10/10/2026 |
| 3 · Chữ "THI ĐẤU" cạnh logo | **(a)** bỏ; logo ở Thi đấu trỏ về `/` như hai trang kia |
| 4 · Khung header Thi đấu | (a); chỉ áp cho hướng a nên **không còn tác dụng** với hướng b (header chung rộng 1280) |
| 5 · Nhãn mốc Trang chủ | **(a)** tiếng Việt: Sân · Lịch trống · Tiện ích · Bảng giá · Dụng cụ · Hỏi đáp |

Các yêu cầu bổ sung trong lúc xem bản mẫu (đều đã có trong bản mẫu): menu sổ xuống khi rê chuột ở Trang chủ, Cửa hàng, Thi đấu; Cửa hàng theo danh mục Vợt / Giày / Phụ kiện; mục Đặt sân là liên kết thường (không có menu con); **bỏ nút Instant Book ⚡** của header; Đăng nhập là nút nổi bật, Đăng ký là nút viền; Lịch sử thi đấu thay cho Trình độ + Giải của tôi; thanh tab dưới mới, luôn hiện; menu ☰ chỉ mở sẵn mục con của khu đang đứng; mũi tên ▾ trong ☰ không có nền.

## 4. Thiết kế đã chốt (hướng b)

**Máy tính (từ 1024 px, và còn đủ chỗ):** một thanh cao 80 px, khung 1280 px, lề 24 px.

| Vị trí | Nội dung |
|---|---|
| Trái | logo (ô 40, BADMINTON DIGITAL 20 px, kiểu hiện có), trỏ về `/`; đang ở `/` thì cuộn lên đầu như hôm nay |
| Giữa | **Trang chủ ▾** · **Đặt sân** · **Cửa hàng ▾** · **Thi đấu ▾**; mục của khu đang đứng sáng và có gạch chân |
| Phải | đổi giao diện (ẩn ở Trang chủ, vì Trang chủ chỉ có bản tối), giỏ hàng (biểu tượng + số), rồi **Đăng nhập** (nổi bật) + **Đăng ký** (viền); đã đăng nhập thì một nút tên ▾ |

**Menu con (sổ xuống khi rê chuột; bấm ▾ trên cảm ứng; Esc, bấm ra ngoài hoặc rời chuột để đóng; bấm chữ của mục thì vào trang chính):**

| Mục | Con |
|---|---|
| Trang chủ ▾ | Sân · Lịch trống · Tiện ích · Bảng giá · Dụng cụ · Hỏi đáp (cuộn tới mốc trong Trang chủ; từ trang khác thì chuyển về Trang chủ rồi cuộn) |
| Đặt sân | không có; tới trang **/dat-san** (khung cơ bản, xem mục 13) |
| Cửa hàng ▾ | Vợt · Giày · Phụ kiện (liên kết kiểu `/shop?category=…`) |
| Thi đấu ▾ | Tổng quan · Giải đấu · Giao lưu · Xếp hạng; khách hàng thêm **Lịch sử thi đấu** (dẫn tới trang Giải của tôi) |
| Nút tên ▾ (khách hàng) | Tài khoản · Đơn mua · Lịch đặt · Lịch sử thi đấu · Đăng xuất |
| Nút tên ▾ (nhân viên) | Bàn làm việc · Đăng xuất |

Thi đấu ▾ chỉ hiện khi dịch vụ thi đấu bật (như hôm nay).

**Điện thoại (dưới 1024 px, hoặc khi thanh một tầng không đủ chỗ; đo trong bản mẫu: ~1030 px):**
- Thanh trên 64 px: logo · giỏ · ☰. ☰ mở menu có nền đặc: Trang chủ ▾, Đặt sân, Cửa hàng ▾, Thi đấu ▾, rồi đổi giao diện và các mục tài khoản. Chỉ mục con của **khu đang đứng** mở sẵn; bấm cả hàng để mở / gập.
- Thanh tab dưới **làm lại, luôn hiện ở mọi trang** (cả Trang chủ và Thi đấu), 5 ô: **Trang chủ, Cửa hàng, Đặt sân, Thi đấu, Profile**. Đặt sân tới trang `/dat-san`; Profile tới Tài khoản (khách hàng), Bàn làm việc (nhân viên), Đăng nhập (khách). Giỏ hàng chỉ còn là biểu tượng ở thanh trên; Đơn mua chỉ còn ở menu tài khoản.

### 4.1 Đối chiếu: mục cũ nằm ở đâu

| Mục cũ | Chỗ mới |
|---|---|
| Courts · Schedule · Features · Pricing · Gear · FAQ (Trang chủ) | Trang chủ ▾ (tiếng Việt) |
| Shop · Cửa hàng | Cửa hàng ▾ › Vợt, Giày, Phụ kiện; bấm chữ Cửa hàng = tất cả sản phẩm |
| Giỏ hàng (biểu tượng / mục menu / không có) | biểu tượng giỏ ở cả ba trang |
| Giải đấu · Thi đấu · Giao lưu (mốc) · Xếp hạng | Thi đấu ▾ |
| Giải của tôi | Thi đấu ▾ › **Lịch sử thi đấu** (khách hàng) và menu tên |
| **Trình độ** | **không còn lối vào từ header** (xem câu 6) |
| Đơn mua · Lịch đặt · Tài khoản | menu tên (khách hàng) |
| Bàn làm việc · Đăng xuất | menu tên |
| Đăng nhập · Đăng ký | bên phải, Đăng nhập nổi bật |
| Instant Book ⚡ | **bỏ**, thay bằng mục **Đặt sân** (hành vi đặt sân không đổi) |
| Đổi giao diện | bên phải, ẩn ở Trang chủ |
| Nhãn "THI ĐẤU" lớn cạnh logo | bỏ; logo ghi BADMINTON DIGITAL |

**Kiểm bằng tìm kiếm trong mã:** Đơn mua (`/orders`), Trình độ (`/my-rating`), Giải của tôi (`/my-tournaments`) hiện chỉ có đường vào từ header (từ ngoài khu của chúng); Lịch đặt (`/my-bookings`) còn nút ở trang Tài khoản. Vì vậy Đơn mua và Lịch đặt được chuyển vào menu tên, Giải của tôi thành Lịch sử thi đấu; riêng Trình độ đang chờ câu 6.

## 5. Còn mở

6. **Trang Trình độ (`/my-rating`):** sau khi gộp thành Lịch sử thi đấu, không mục nào dẫn tới trang này. (a) thêm liên kết "Trình độ" vào menu tên; (b) cho vào được từ trang Giải của tôi / Tài khoản (sửa nội dung trang, ngoài phạm vi header); (c) bỏ lối vào. *Gợi ý: (a).* **Chưa làm theo mặc định nào; chờ bạn trả lời.**

Hai việc nhỏ bạn có thể muốn nói luôn: trang đích của "Lịch sử thi đấu" hiện có tiêu đề "Giải của tôi" (đổi tiêu đề là sửa nội dung trang, ngoài phạm vi); nhãn ô cuối của thanh tab đang là "Profile" đúng như bạn viết (có thể đổi thành "Tài khoản" hay "Hồ sơ").

## 6. Ngoài phạm vi (không đụng, trừ khi bạn nói)

Trang Đặt sân đầy đủ (chỉ có khung cơ bản `/dat-san`, chủ dự án tự làm sau) và tách ô đặt nhanh khỏi Trang chủ; bản sáng cho Trang chủ; độ rộng, lề và nội dung thân trang, kể cả khung nội dung Thi đấu; đường dẫn, trang đích sau đăng nhập hay đăng ký; logo ở các trang đăng nhập và khu nhân viên; backend, DB, endpoint và dữ liệu cho danh mục Cửa hàng hay Lịch sử thi đấu (trang Cửa hàng hôm nay lọc danh mục bằng trạng thái trong trang, chưa đọc địa chỉ, nên liên kết `?category=` chỉ dẫn tới trang, phần lọc làm sau); `CLAUDE.md` và các tài liệu khác ngoài file này.

## 7. Chạm tới những gì (khi làm)

- **Mới:** thành phần logo dùng chung; cấu hình menu thuần (một file, có Vitest: mục theo vai trò, khu đang đứng, tính năng thi đấu bật / tắt); thành phần header chung (thanh, menu thả xuống, ☰, thanh tab dưới).
- **Thay khối header (và thanh tab dưới nếu có) ở:** `HomePage.jsx` (kiểu đè lên ảnh, trong suốt ở đầu trang rồi kính mờ khi cuộn), `CustomerLayout.jsx`, `PublicShell.jsx`; viết lại `PublicShell.test.jsx` (giữ hai phép bảo vệ: "Trang chủ" không sáng ở Thi đấu và luôn về `/`; thương hiệu không bị thay chữ).
- **Cần thêm vì header mới:** hiệu ứng cuộn tới mốc khi từ trang khác bấm Trang chủ ▾ hoặc Đặt sân (hiện Trang chủ chỉ cuộn khi bấm trong chính nó); chừa chỗ dưới chân trang cho thanh tab dưới ở mọi trang.
- **Không đổi:** thân trang, ô đặt sân, nút "Đặt sân ngay" trong hero.

## 8. Cách làm và cách kiểm (sau khi bạn nói "code đi")

Mỗi bước một commit trên nhánh này; đo trước, sửa, đo lại bằng Chrome thật (không chỉ đọc mã); Vitest sau mỗi bước.

| Bước | Việc | Kiểm |
|---|---|---|
| 1 | Thành phần logo + cấu hình menu (+ test), chưa dùng ở đâu | Logo dựng ra giống từng điểm ảnh logo hiện có của Cửa hàng; test từng quy tắc menu |
| 2 | Header chung (menu thả xuống, ☰, thanh tab dưới), chưa dùng ở đâu | Thử trong trang tạm **không đưa vào repo**: rê chuột, ▾, Esc, Enter, Tab, chạm; vừa khung ở 1024 / 1100 / 1280 / 1440 / 1920 và 390 / 360 |
| 3 | Cửa hàng + khu khách dùng header chung | Chụp trước / sau các trang khu khách, sáng / tối, 1440 và 390: thân trang giống hệt; bấm thật từng mục và từng vai trò |
| 4 | Thi đấu | Như bước 3 cho `/thi-dau`, `/rankings`, `/players/:id`; bấm mốc `#giai`, `#giao-luu`; hết tràn ngang ở 768 |
| 5 | Trang chủ (kỹ nhất vì có ô đặt sân) | Chụp cả trang bản tối trước / sau (tắt hiệu ứng động): chỉ khác phần header; ghi lại luồng đặt sân thật (khách chưa đăng nhập và đã đăng nhập) trước / sau và so: giống hệt; cuộn tới mốc từ trang khác |
| 6 | Đo cuối | Ô logo và chữ thương hiệu ở `/`, `/shop`, `/thi-dau`, `/rankings` × 1920 / 1440 / 1280 / 1024 / 768 / 390 / 360: sai lệch 0 px; cùng chiều cao thanh; không trang nào tràn ngang |

## 9. Rủi ro

| Rủi ro | Giảm |
|---|---|
| Đổi chiều cao header làm lệch cuộn tới mốc và khối `sticky` (`lg:top-24` ở `Panels.jsx`, `CheckoutPage.jsx`, `OrderDetailPage.jsx`; `scroll-mt-32` ở `atoms.jsx`) | header mới cao 80 px, thấp hơn 96 px của `top-24`; bấm thật để xác nhận trước khi coi là xong |
| Trang chủ: mục Đặt sân, cuộn tới ô đặt sân từ trang khác | ghi lại luồng đặt sân trước / sau |
| Thanh tab dưới che chữ ở chân trang | chừa chỗ dưới chân trang ở cả ba khung; chụp ảnh cuối trang |
| Menu ☰ dài hơn khoảng trống (màn hình thấp) nên mục cuối (Đăng xuất) không cuộn tới được | menu giới hạn chiều cao = chiều cao màn hình trừ thanh trên và thanh tab dưới, tự cuộn bên trong; kiểm ở màn hình thấp (700 px) bằng cách cuộn tới Đăng xuất |
| Ba menu thả xuống khó dùng trên cảm ứng và bàn phím | nút ▾ riêng, thử cả ba cách ở bước 2 |
| Thanh chật ở 1024 đến 1100 px | bản mẫu đo: vừa từ ~1030 px; thấp hơn thì gập ☰ |
| Bản demo Render deploy ngay khi push `main` | không gộp, không đẩy khi bạn chưa nói "merge vào main đi" |

## 10. Lỗi có sẵn thấy khi đo (không sửa, nói nếu muốn làm)

- `scrollToSection` của Trang chủ chỉ trừ 24 px dù thanh cao 96 px (header mới thay phần này).
- Trang Tài khoản bị cắt thẻ hồ sơ ở 390 px (đã có việc riêng).

## 11. Cách làm việc

- Chỉ làm trên nhánh này, mỗi bước một commit; không gộp, không đẩy `main` khi chưa có lệnh của bạn.
- Không sửa `CLAUDE.md`, `00-tien-do.md` hay tài liệu nào khác ngoài file này, nếu bạn chưa nói.
- Không dừng hay chạy lại server, không chạy migration trên DB của bạn, không xóa nhánh hay Artifact khi bạn chưa nói.
- Việc gì không có trong plan này thì hỏi trước khi làm.

## 12. Kết quả (10/10/2026)

Mỗi bước đo trước, sửa, đo lại bằng Chrome thật (chuột, bàn phím, ảnh chụp toàn trang), không chỉ đọc mã. Vitest 311 → 349; `vite build` sạch.

| Bước | Commit | Kết quả |
|---|---|---|
| 1 | `a985226` | `BrandLogo` + `siteNav.js`: 27 test (mục theo vai trò, mốc, danh mục, thanh tab, khu đang đứng, thi đấu tắt) |
| 2 | `4ef6da1` | Header chung (thanh, menu thả xuống, ☰, thanh tab): 14 test dựng bằng react-dom/server |
| 3 | `f3cd109` | `CustomerLayout` 253 → 60 dòng. 7 trang khu khách × sáng / tối × 1440 / 390 (28 ảnh): ở 1440 giống hệt từng điểm ảnh bên dưới header (một ảnh sáng lệch 16 điểm); ở 390 giống hệt sau khi bù 16 px, trừ dải thanh tab mới và vài trăm điểm nền lưới ở bản sáng. 46 phép kiểm tương tác. Sửa một lỗi thật tìm ra khi bấm: chuột bấm ▾ khi menu đã mở do rê chuột thì đóng nó đi |
| 4 | `74f72b3` | `PublicShell` 135 → 48 dòng; khung nội dung giữ nguyên. 4 trang × sáng / tối × 1440 / 390 (16 ảnh): giống hệt bên dưới header sau khi bù độ lệch đã đo, trừ dải thanh tab mới và chân trang bám đáy ở trang ngắn. Hết tràn ngang ở 768 px. 45 đến 46 phép kiểm |
| 5 | `9361a53` | Trang chủ: tắt hiệu ứng động, 1440 giống hệt **0 điểm ảnh** bên dưới header, 390 chỉ khác dải thanh tab; **luồng đặt sân thật** (khách đã / chưa đăng nhập, gồm cất lựa chọn, sang đăng nhập, quay lại) trước và sau **giống hệt**; 33 phép kiểm riêng. Sửa một lỗi thật: đi từ trang khác tới `/#mốc` bị lệch vì khối phía trên tải dữ liệu xong mới nở ra, nay cuộn lại khi dữ liệu về |
| 6 | (đo) | Ô logo và chữ BADMINTON DIGITAL ở `/`, `/shop`, `/thi-dau`, `/rankings` × 1920 / 1440 / 1280 / 1024 / 768 / 390 / 360: **28/28 phép đo khớp tuyệt đối, sai lệch lớn nhất 0 px**; cùng chiều cao thanh (81 px từ 1024, 65 px dưới đó) |

Đã kiểm thêm: không trang nào tràn ngang ở 1920, 1440, 1280, 1100, 1024, 1000, 768, 390, 360 px; đúng bố cục máy tính từ 1024 và điện thoại dưới đó; menu ☰ cuộn tới được mục cuối ở màn hình cao 640 px (không bị thanh tab che); nút lên đầu trang và chữ cuối chân trang nằm trên thanh tab; bản sáng và bản tối của Cửa hàng và Thi đấu; Trang chủ luôn tối kể cả khi giao diện đã lưu là sáng; vai trò khách, khách hàng và quản trị (menu tên và ô Profile đi đúng chỗ).

**Chưa kiểm:** bản chạy thật trên Render (chưa gộp, chưa đẩy); điện thoại thật (chỉ mô phỏng 390 / 360 px trong Chrome).

**Ngoài plan, đã nhắc:** trang Trình độ (`/my-rating`) không còn lối vào từ header (câu 6, bỏ qua theo yêu cầu); tiêu đề trang đích của "Lịch sử thi đấu" vẫn là "Giải của tôi"; liên kết `?category=` của Cửa hàng mới dẫn tới trang, chưa lọc theo địa chỉ; nhãn ô tab cuối đang là "Profile".

## 13. Chỉnh thêm sau khi xem bản chạy (10/10/2026)

- **Header Cửa hàng không dính khi cuộn:** `.kinetic-surface` có `overflow-x: hidden` nên thành vùng cuộn riêng, `position: sticky` của header bám vào nó thay vì cửa sổ (đo: cuộn 900 px thì header ở −900 px). Đổi thành `overflow-x: clip` (`styles/kinetic.css`); mọi trang khu khách, kể cả Cửa hàng, giữ header ở đầu cửa sổ (kiểm trên `/shop`).
- **Cỡ logo 44 / 24, thanh 96** (câu 2 chuyển sang (b)): ô 44, chữ 24 (18 dưới 640 px), thanh 96 px (80 ở điện thoại), menu ☰ cao tối đa trừ 9rem. Bốn khối `sticky` gõ cứng `lg:top-24` (`Panels.jsx` ×2, `CheckoutPage.jsx`, `OrderDetailPage.jsx`) đổi thành `lg:top-28` để không chui dưới header 97 px. Đo lại: 28/28 phép đo logo khớp 0 px (header cao 97 px từ 1024 px, 81 px dưới đó); vừa khung ở 1024 đến 1920 px, không tràn ở 360 đến 1000 px.
- **Trang Đặt sân `/dat-san` (mới, cơ bản):** công khai, dùng khung khách; chỉ có tiêu đề, một câu giải thích và hai nút: "Đặt nhanh ở Trang chủ" (tới ô đặt nhanh) và, với khách hàng, "Lịch đặt của tôi". Mục Đặt sân ở header và ô tab Đặt sân trỏ tới trang này; trang Lịch đặt (`/my-bookings`) cũng sáng mục Đặt sân. Chủ dự án sẽ tự làm trang này sau.

## 14. Thẻ Trình độ ở trang Tài khoản (10/10/2026, theo yêu cầu)

Trang `/account` có thêm thẻ "Trình độ của tôi" (dưới các ô thống kê): khách **chưa chấm** thấy lời mời và nút "Tự chấm trình" → `/my-rating/assess`; khách **đã chấm** chỉ thấy điểm Đơn và Đôi (kèm mức, số trận, "tạm tính") và liên kết "Xem chi tiết →" `/my-rating`. Thi đấu tắt hoặc dịch vụ lỗi thì không hiện thẻ. Việc này cũng trả lời **câu 6**: trang Trình độ có lối vào từ trang Tài khoản. Đã kiểm trên app thật: đã chấm / chưa chấm (giả lập phản hồi) / thi đấu tắt / dịch vụ trả 503, sáng và tối, 1440 và 390 px; Vitest 355.
