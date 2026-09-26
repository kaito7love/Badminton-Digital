# competition-service — Nghiệp vụ (2): Hồ sơ người chơi, thống kê, bảng xếp hạng

> Điểm trình và cách tính: 03. Trận đấu, giải, buổi giao lưu: 06. Màn hình: 07.

## 1. Hồ sơ người chơi — lưu gì, lấy từ đâu, ai thấy

Nguyên tắc: **dữ liệu cá nhân tối thiểu**. Service không lưu SĐT, email, địa chỉ; những thứ đó ở lại app chính.

| Trường | Nguồn | Ai sửa | Ai thấy |
|---|---|---|---|
| `externalRef` (vd `bd:customer:123`) | App chính tạo khi nối hồ sơ | App chính (`player:write`) | Chỉ hệ thống |
| Họ tên (`display_name`) | App chính, đồng bộ qua sự kiện `bd.customer.updated` | Sửa ở app chính | Nhân viên, thành viên; công khai thì rút gọn (mục 1.1) |
| Tên thi đấu (`nickname`) | Người chơi tự đặt, 2–30 ký tự, không trùng trong tenant | Người chơi, nhân viên | Mọi người |
| Giới tính | Form tự chấm (bước 0) | Người chơi **trước trận tính điểm đầu tiên**; sau đó chỉ nhân viên, có nhật ký — tránh đổi giới để lọt vào nội dung khác | Mọi người |
| Năm sinh | Tuỳ chọn | Người chơi | Chỉ hiện **nhóm tuổi** (U18 · 18–34 · 35–44 · 45–54 · 55+), không hiện năm |
| Tay thuận · năm bắt đầu chơi · số buổi / tuần | Form bước 0 | Người chơi | Mọi người (trừ số buổi / tuần: chỉ nhân viên) |
| Lối chơi ưa thích (đơn / đôi / cả hai) · vị trí đánh đôi (lưới / cuối sân / linh hoạt) | Form bước 0 | Người chơi | Mọi người. Sau này dùng làm ràng buộc mềm khi ghép cặp: tránh ghép hai người cùng chỉ thích lưới |
| Chi nhánh thường chơi (`home_organizer_ref`) | Người chơi chọn trong danh sách chi nhánh do app chính đưa | Người chơi, nhân viên | Mọi người. Dùng cho BXH theo chi nhánh |
| Quyền riêng tư (`visibility`) | Mặc định `members` | Người chơi | — (mục 1.1) |
| Ảnh đại diện | (sau này) | | |
| Trạng thái (`active` / `merged` / `anonymized`) | Hệ thống | — | Nhân viên |

### 1.1 Quyền riêng tư

| `visibility` | Bảng xếp hạng công khai (chưa đăng nhập) | Người đã đăng nhập | Nhân viên |
|---|---|---|---|
| `public` | Có. Hiện tên thi đấu; chưa đặt thì hiện tên + chữ cái đầu của họ (vd "An N.") | Có, tên đầy đủ | Có |
| `members` (mặc định) | Không | Có, tên đầy đủ | Có |
| `hidden` | Không | Không (không lên BXH, không mở được hồ sơ) | Có. Vẫn được ghép cặp, vẫn có điểm |

Đối thủ / đồng đội trong một giải luôn thấy tên nhau trên lịch thi đấu của giải đó, bất kể `visibility`.

**Trên BXH** (chốt khi code, bước 1): thứ hạng tính trên cùng một tập người cho mọi người xem — người `hidden` không có
hạng; người `members` vẫn có hạng nhưng người xem chưa đăng nhập thấy dòng đó bị che tên ("Thành viên"). Nhờ vậy số
hạng giống nhau với mọi người xem, không có chuyện khách chưa đăng nhập thấy "hạng 3" còn thành viên thấy "hạng 5".

## 2. Thống kê người chơi

Mọi con số chỉ tính trên **trận đã chốt**: giải đã `finalized`, buổi giao lưu đã `closed`. Giải huỷ chốt thì
thống kê trừ lại.

| Nhóm | Chỉ số |
|---|---|
| **Tổng quan** (mỗi nội dung Đơn / Đôi, tách giải và giao lưu) | Số trận, thắng, thua, **tỉ lệ thắng** · game thắng / thua · điểm thắng / thua |
| **Phong độ** | Chuỗi hiện tại (vd `T3` = thắng 3 trận liền, `B2` = thua 2 liền) · 5 trận gần nhất (T T B T T) · thay đổi điểm trình 30 / 90 ngày |
| **Điểm trình** | Hiện tại · cao nhất (kèm ngày) · biểu đồ theo thời gian (mỗi kỳ một điểm, từ sổ điểm) |
| **Thành tích** | Số giải đã đánh · **vô địch / á quân / bán kết** (theo từng hạng mục MS / WS / MD / WD / XD) · điểm BXH thành tích hiện tại + thứ hạng |
| **Đồng đội** | 5 người hay đánh cặp nhất, số trận cùng nhau, **tỉ lệ thắng khi đánh cùng** |
| **Đối đầu** (tra hai người bất kỳ) | Số lần gặp, thắng – thua, trận gần nhất, tỉ số từng trận |
| **Đối thủ khó chịu nhất / dễ chịu nhất** | Đối thủ gặp ≥ 3 lần có tỉ lệ thắng thấp nhất / cao nhất |

**Lưu trữ:**

- **Nguồn sự thật là bảng `matches` + `match_participants`** (06, mục 1).
- `player_stats` (một dòng / người / nội dung / loại trận) là bảng tổng hợp để đọc nhanh:
  - cập nhật cộng dồn **trong cùng transaction** với chốt giải / đóng buổi;
  - `scripts/rebuild-stats.js` dựng lại toàn bộ từ `matches` nếu nghi lệch.
- Đối đầu và đồng đội truy vấn trực tiếp từ `match_participants` (có index theo `player_id`). Không lưu thêm.

## 3. Bảng xếp hạng

Có **hai bảng**, trả lời hai câu hỏi khác nhau:

- **BXH trình độ:** ai đang đánh hay nhất. Sắp theo điểm trình.
- **BXH thành tích:** ai đánh giải tốt nhất mùa này. Cộng điểm theo thứ hạng ở giải.

Ví dụ: một người trình 3.2 vô địch liên tục các giải "trình ≤ 3.5" sẽ đứng thấp ở BXH trình độ nhưng có thể đứng
cao ở BXH thành tích. Điều đó đúng và tạo động lực đi đánh giải.

### 3.1 BXH trình độ

| | |
|---|---|
| **Hạng mục** | Đơn nam · Đơn nữ (điểm Đơn, lọc theo giới) · Đôi nam · Đôi nữ (điểm Đôi, lọc theo giới). Đôi nam nữ dùng chung điểm Đôi nên không có bảng trình độ riêng |
| **Điều kiện lên bảng** | ≥ **5 trận tính điểm** ở nội dung đó, **hoặc** đã được nhân viên xác nhận trình · có trận trong **12 tháng** gần nhất · `visibility` phù hợp người xem · `status = active` |
| **Sắp xếp** | Điểm trình giảm dần (so tới 0.01). Bằng điểm: người nhiều trận tính điểm hơn xếp trên. Vẫn bằng: đồng hạng |
| **Phạm vi lọc** | Toàn chuỗi · theo chi nhánh thường chơi · theo nhóm tuổi · theo nhãn trình (vd chỉ xem "Khá") |
| **Mỗi dòng hiển thị** | Hạng · ↑↓ so với 7 ngày trước · tên · nhãn trình · điểm · độ tin cậy · số trận |

Người chưa đủ điều kiện vẫn thấy được **vị trí dự kiến** của mình ("Nếu đủ 5 trận, bạn sẽ đứng khoảng hạng 34")
trên trang cá nhân, để có động lực.

### 3.2 BXH thành tích (kiểu điểm xếp hạng BWF, đơn giản hoá)

**Hạng mục:** theo nội dung thi đấu.

| Hạng mục | Đơn nam | Đơn nữ | Đôi nam | Đôi nữ | Đôi nam nữ |
|---|---|---|---|---|---|
| Mã | `MS` | `WS` | `MD` | `WD` | `XD` |

Giải `open` được xếp theo giới của người / thành phần cặp thật: 2 nam → `MD`, nam + nữ → `XD`.

**Điểm một người nhận ở một giải:**

```
điểm = điểm_thứ_hạng × hệ_số_cấp_giải × hệ_số_quy_mô × hệ_số_sức_mạnh        (làm tròn số nguyên)
```

| Thành phần | Giá trị |
|---|---|
| **Điểm thứ hạng** | Vô địch **100** · Á quân **70** · Hạng 3–4 **50** · Hạng 5–8 **32** · Hạng 9–16 **20** · Còn lại **8 + 4 × số trận thắng** (tối đa 19) |
| **Hệ số cấp giải** (`tier`, chọn khi tạo giải) | `club` (giải nội bộ / CLB) **×1** · `open` (giải mở rộng của chi nhánh) **×2** · `chain` (giải toàn chuỗi, chỉ admin tạo) **×3** |
| **Hệ số quy mô** | `clamp(0.5 + số_đội / 32, 0.6, 1.25)` → 4 đội 0.63 · 16 đội 1.0 · 24 đội trở lên 1.25 |
| **Hệ số sức mạnh** | `clamp(trung bình pairingRating của mọi người tham gia / 3.5, 0.6, 1.4)` → giải trình thấp ít điểm hơn giải mở |

- **Ví dụ:** vô địch giải `open`, 16 đội, trình trung bình 3.2 → `100 × 2 × 1.0 × 0.914` = **183 điểm**. Á quân
  giải `club` 8 đội trình trung bình 2.8 → `70 × 1 × 0.75 × 0.8` = **42 điểm**.
- **Tổng điểm BXH** = tổng **6 kết quả tốt nhất trong 52 tuần** gần nhất (cuốn chiếu). Kết quả quá 52 tuần tự rơi
  khỏi bảng. Nhờ vậy BXH phản ánh phong độ gần đây, và người đánh nhiều giải không được lợi vô hạn.
- **Đánh đôi:** mỗi người trong cặp nhận đủ số điểm, tính theo cá nhân. Vì cặp có thể ghép ngẫu nhiên, không có BXH
  "theo cặp".
- **Bằng điểm:** nhiều kết quả được tính hơn xếp trên → điểm trình cao hơn → đồng hạng.
- Giải phải có **≥ 4 đội** và **bật "tính điểm xếp hạng"** mới trao điểm. Buổi giao lưu **không** trao điểm thành
  tích.
- Giải huỷ chốt → thu hồi điểm của giải đó (`revoked_at`), BXH tự cập nhật.
- Thứ hạng chung cuộc của từng đội (vô địch, á quân, hạng 3–4…) được tính khi chốt giải: 06, mục 6.

### 3.3 Lưu trữ và tính toán

| Bảng | Nội dung |
|---|---|
| `ranking_results` | Một dòng / người / giải: `category`, `placement_from`, `placement_to`, `base_points`, `tier_factor`, `size_factor`, `strength_factor`, `points`, `awarded_at`, `expires_at` (= +52 tuần), `revoked_at` |
| `leaderboard_snapshots` | Ảnh chụp hằng ngày (job 03:00, giờ chi nhánh mặc định): `kind` (`rating` / `points`), `category`, `scope`, `date`, `player_id`, `rank`, `value`. Dùng để tính ↑↓ so với 7 ngày trước; giữ 90 ngày |

- BXH hiện tại là một **truy vấn**: `player_ratings` + điều kiện (bảng trình độ), hoặc tổng 6 kết quả tốt nhất chưa
  hết hạn từ `ranking_results` (bảng thành tích). Có cache 60 giây.
- Chốt giải ghi `ranking_results` trong cùng transaction với điểm trình.
- Sự kiện `competition.tournament.finalized` mang theo danh sách điểm thành tích đã trao.

## 4. Gộp và ẩn danh hồ sơ

**Gộp** `merge(target, source)` — khi app chính gộp khách vãng lai vào tài khoản (`bd.customer.merged`):

- **Điểm trình, theo từng nội dung:**
  - chỉ một bên có điểm → đích nhận điểm đó;
  - cả hai có → giữ bên có **nhiều trận tính điểm hơn** (bằng nhau: ưu tiên `verified`, rồi trận gần nhất mới
    hơn), **không cộng** số trận;
  - ghi dòng sổ điểm `reason = merge`, lưu cả giá trị giữ và giá trị bỏ.
- Sổ điểm, bài chấm, `match_participants`, đăng ký giải, `ranking_results` của nguồn chuyển sang đích. Thống kê dựng
  lại cho đích.
- Nguồn và đích **cùng có mặt trong một giải hoặc một trận** → 409 `MERGE_CONFLICT`. Nhân viên rút một bên ra
  trước; sự kiện từ app chính nằm ở trạng thái lỗi (không ghi inbox), gửi lại cùng `id` được.
  - Một bên đã rút **trước bốc thăm** (chưa vào đội nào): bỏ dòng đăng ký đã rút đó rồi gộp.
  - Buổi giao lưu: cùng **đang có mặt** ở một buổi chưa đóng → 409 (cho một bên rời buổi trước); còn lại gộp hai dòng
    điểm danh làm một (cộng số trận, giữ giờ đến sớm hơn).
- Cài đặt (bước 3): mỗi module tự chuyển dữ liệu của mình qua `mergeHandler` trong cùng transaction — `rating` (điểm,
  sổ điểm, bài chấm), `match` (`match_participants`, dựng lại thống kê), `tournament` (đăng ký, đội, thống kê giải),
  `ranking` (`ranking_results`), `session` (điểm danh). Kết quả trả trong `merged` của `POST /v1/players/{id}/merge`.
- Nguồn chuyển `status = merged`, `merged_into_player_id = đích`. Tra theo `external_ref` cũ thì trả về đích.

**Ẩn danh** — khi app chính xoá khách (`bd.customer.deleted`):

- tên → "Người chơi đã xoá";
- `nickname`, `external_ref` → `anon:<uuid>`;
- xoá giới tính, năm sinh, tay thuận, chi nhánh thường chơi;
- ép `visibility = hidden`;
- **giữ** điểm, sổ điểm, kết quả trận, điểm thành tích, để lịch sử và BXH của người khác không bị thủng.
