# Kế hoạch: sơ đồ loại trực tiếp dạng hình (giống ảnh mẫu), 8–16 đội và 16–32 đội

- **Ngày:** 03/10/2026.
- **Trạng thái:** đã duyệt ("code đi") → đã làm, kết quả ở mục 4; **đã merge vào `main` 03/10/2026** (fast-forward tới `62cb891`).
- **Nhánh:** `feat/competition-bracket-view`, tách từ `main` @ `b7f4434`. Hai nhánh `feat/competition-tournament-ops`
  và `feat/competition-live-score` đã merge vào `main` (mục 19, 20) nên không làm tiếp trên đó.
- **Phạm vi:** bàn thử (không vào repo) + module vẽ sơ đồ tham chiếu
  `services/competition-service/docs/ui-prototype/bracket-view.js` + tài liệu 07. **Service không đổi** (không có
  migration, không đổi API, không cần chạy lại bộ test của service).

## 0. Chủ dự án yêu cầu

> Phần giải đấu đang thiếu một phần nhỏ: hiển thị sơ đồ dạng hình ảnh như ảnh 1 (quy mô lớn, 16–32 đội) và ảnh 2
> (quy mô nhỏ, 8–16 đội).

Giao diện giải đấu **chưa nằm trong repo** (bước 4 của plan 18 chưa làm): cái đang bấm thử là bàn thử ở scratchpad,
tab "Bảng đấu & sơ đồ" của nó vẽ sơ đồ bằng các cột thẻ chữ. Nên phần này làm trên bàn thử và để lại module vẽ độc
lập cho bước 4.

## 1. Thiết kế

| Số ô sơ đồ (= 2^vòng) | Kiểu | Giống |
|---|---|---|
| ≤ 16 (đến 16 đội) | **Một chiều**, vòng 1 bên trái → cúp + ô "VÔ ĐỊCH" bên phải; tông xanh lá | ảnh 2 |
| ≥ 32 (17–32 đội) | **Đối xứng hai nửa**; hai ô chung kết + cúp + ô vô địch ở giữa; tông vàng đồng | ảnh 1 |

- Dữ liệu lấy nguyên từ `GET /tournaments/:id/bracket`; vòng 1 không có trận cho ô miễn đấu — module tự dựng lại
  (ô "miễn đấu" + đội đi thẳng vòng 2). Không dùng logo / chữ của ảnh mẫu: ô giữa ghi "CHUNG KẾT" + tên giải.
- Ô = đội đã vào vòng đó (đúng kiểu ảnh): đội thắng sáng + tô đậm đường đi, đội thua mờ, trận đang đánh có chấm đỏ,
  tỉ số từng game hiện bên phải ô, W.O. / bỏ cuộc ghi "W.O." / "BC". Đôi hiện hai dòng. Tranh hạng 3 là khung nhỏ dưới
  cúp.
- Bấm một ô: đang đánh → mở màn bấm điểm; còn lại → nhảy sang tab "Lịch & kết quả", lọc đúng nhóm, viền sáng hàng của
  trận đó.
- Điện thoại: tự chọn "Vừa màn hình" khi thu nhỏ còn ≥ 50%, nếu không thì "Cỡ thật" + cuộn ngang; có hai nút chuyển.
- Dùng ở 3 chỗ: tab Bảng đấu & sơ đồ, hộp xem trước "Sơ đồ loại trực tiếp…" (bấm hai ô để đổi chỗ, cảnh báo "cùng
  bảng" giữ nguyên), màn hình TV của giải (không nút phóng / thu).

## 2. Việc đã làm

- `bracket-view.js`: `BK.render(rounds, opts)` + `BK.mount(root, handlers)`; HTML + SVG tự dựng, không thư viện; hình
  học tính theo số vòng nên 64 đội cũng vẽ được (kiểu đối xứng).
- Bàn thử nhúng nguyên file (script `inline-bk.js` ở scratchpad), thay phần vẽ cột thẻ cũ, nối vào tab, hộp xem trước,
  màn hình TV.
- Tài liệu 07: dòng "Bảng đấu & sơ đồ", dòng màn hình TV, mục 5 mới (sơ đồ dạng hình).

## 3. Không làm (ghi rõ)

- Không có nút "Danh sách" thay thế trong tab sơ đồ: danh sách trận đã có ở tab "Lịch & kết quả".
- Trận đang đánh chỉ hiện chấm đỏ, chưa hiện tỉ số bấm dở trong ô (tab Sân và màn hình TV đã hiện).
- Chưa có xuất ảnh / in sơ đồ.

## 4. Kết quả bấm thử

Môi trường: service tạm `:5101` + DB tạm `competition_bk_tmp` + bàn thử `:5191` (không đụng DB dev của chủ dự án);
Chrome chạy ngầm, bấm chuột như người dùng.

| Kịch bản | Kết quả |
|---|---|
| Giải 32 đội đã đánh xong (có tranh hạng 3) | đối xứng 63 ô (32+16+8+4+2 + vô địch), đường đi đội vô địch tô vàng, tranh hạng 3 dưới hai ô chung kết |
| Giải 16 đội đã xong; 8 đội đang đánh dở | một chiều; 8 đội có 1 bán kết đang đánh → chấm đỏ ở 2 ô |
| 12 đội, 24 đội (miễn đấu) | ô "miễn đấu" mờ, đội đi thẳng vòng 2 ghi "miễn đấu — đi thẳng" |
| Đôi 16 cặp | mỗi ô hai dòng tên, không tràn |
| Bấm ô đang đánh / ô đã xong | mở màn bấm điểm / sang tab Lịch, lọc "Đã xong (5)", hàng trận viền sáng |
| Giải vòng bảng + loại trực tiếp (8 và 16 bảng) → "Sơ đồ loại trực tiếp…" | xem trước dạng hình 16 ô và 32 ô; bấm ô 1 rồi ô 6 → hai đội đổi chỗ đúng; "Khoá sơ đồ" → sơ đồ 31 ô, việc cần làm đổi thành "Loại trực tiếp: còn 15 trận" |
| Màn hình TV `/tv?tournament=…` 32 đội | sơ đồ dưới các sân, vừa 1 440 px, không nút phóng / thu |
| Điện thoại 390 px | 32 và 16 đội: "Cỡ thật", cuộn ngang, chữ đọc được |

Lỗi gặp và sửa trong lúc làm: (1) CSS của đường nối áp nhầm vào hình cúp (cúp chỉ còn viền) → tách lớp `bklines`;
(2) mã dư (biến không dùng) dọn trước khi commit.
