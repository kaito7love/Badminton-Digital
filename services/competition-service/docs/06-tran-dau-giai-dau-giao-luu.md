# competition-service — Nghiệp vụ (3): Trận đấu, giải đấu, buổi giao lưu

> Điểm trình: 03. Hồ sơ, thống kê, bảng xếp hạng: 05. Màn hình: 07.

## 1. Trận đấu — một mô hình chung cho mọi nơi tạo trận

### 1.1 Trận được tạo ra từ đâu

| Nguồn | Ai / cái gì tạo | Khi nào | Tính điểm trình | Vào thống kê | Điểm BXH thành tích |
|---|---|---|---|---|---|
| **Vòng bảng / vòng tròn của giải** | Hệ thống | Khi BTC **xác nhận bốc thăm** (mục 4) | Có (hệ số 1.0) nếu giải bật "tính điểm trình" | Có | Có (qua thứ hạng chung cuộc) |
| **Loại trực tiếp của giải** | Hệ thống sinh sơ đồ; người thắng **tự vào ô tiếp theo** | Khi vòng bảng xong (hoặc ngay khi bốc thăm, với thể thức loại trực tiếp) (mục 5) | Như trên | Có | Có |
| **Trận thêm tay trong giải** | BTC | Bất kỳ lúc nào khi giải đang đấu (vd trận play-off, trận tranh hạng) | Như trên | Có | Không trực tiếp |
| **Buổi giao lưu** | Hệ thống xếp theo số sân trống (mục 8) | Mỗi lần bấm "Xếp sân trống" | Chỉ khi buổi bật "tính điểm", hệ số **0.5** | Có (tách riêng "giao lưu") | Không |

Chưa có "trận tự khai" (người chơi tự báo kết quả trận ngoài hệ thống). Dễ bị dựng trận ảo để nâng điểm, nên để
sau, kèm cơ chế đối thủ xác nhận.

### 1.2 Dữ liệu một trận

- `matches`:
  - ngữ cảnh: `context_type` (`tournament` / `session`), `context_id`;
  - nội dung: `discipline`;
  - vị trí trong giải: `stage` (`group` / `knockout` / `extra`), `group_no`, `round_no`, `slot_no` (lượt thi
    đấu), `bracket_pos`, `next_match_id`, `next_slot`;
  - đội: `team_a_id`, `team_b_id` (đội của giải, null với trận giao lưu);
  - kết quả: `scoring` (sao từ giải / buổi), `games` JSON, `outcome` (`normal` / `walkover` / `retired`),
    `winner_side` (`A` / `B`);
  - trạng thái: `status`, `rating_weight`, `court_ref`, `called_at`, `completed_at`, `recorded_by_ref`, `version`.
- `match_participants` (`match_id`, `side`, `player_id`): **1 dòng / người / trận**. Index theo `player_id` →
  lịch sử đấu, đối đầu, đồng đội đều truy vấn từ đây (05, mục 2).

### 1.3 Vòng đời một trận

```
scheduled ──gọi ra sân (chọn sân)──▶ in_play ──nhập tỉ số──▶ completed
    │                                   │
    └───────────── huỷ ─────────────────┴──▶ cancelled        (W.O. / bỏ cuộc giữa trận = completed với outcome tương ứng)
```

- **Gọi ra sân** (`POST /v1/matches/{id}/call { courtRef }`) là tuỳ chọn. Nó giúp bảng điều khiển biết sân nào
  đang bận, trận nào đang đánh.
- Trận loại trực tiếp chưa biết đủ hai đội thì ở trạng thái `scheduled` với ô trống, chưa gọi ra sân được.

### 1.4 Nhập tỉ số

**Màn hình:** chọn trận → nhập game 1 (A – B) → game 2 → game 3 chỉ hiện khi hai bên 1–1 → Lưu.

- Lỗi luật hiện **ngay khi gõ**: "21-20 không hợp lệ: phải thắng cách 2 điểm".
- Có nút riêng cho "W.O." và "Bỏ cuộc giữa trận" (chọn bên bỏ cuộc).

**Luật một game** (`points = P`, `cap = C`, `w` = điểm cao, `l` = điểm thấp):

- `w = P` → hợp lệ khi `l ≤ P − 2`;
- `P < w < C` → hợp lệ khi `w − l = 2`;
- `w = C` → hợp lệ khi `l ≥ C − 2`;
- còn lại → sai.

Với 21 / 30:

| Hợp lệ | Không hợp lệ |
|---|---|
| `21-19`, `22-20`, `29-27`, `30-28`, `30-29` | `21-20`, `23-20`, `31-29` |

**Luật cả trận:** `bestOf 3` → bên thắng có đúng 2 game, không có game sau khi đã phân thắng bại. `bestOf 1` → đúng
1 game.

**Thể thức có sẵn:**

- 3 game × 21 điểm (trần 30) — chuẩn BWF;
- 1 game × 21 điểm (trần 30);
- 3 game × 15 điểm (trần 21);
- 1 game × 31 điểm (trần do BTC đặt);
- tuỳ chỉnh `points` / `cap`.

**Bỏ cuộc:**

- **W.O.:** bên thắng được ghi 2–0 game (1–0 nếu đánh 1 game), không có điểm số. Không tính điểm trình.
- **Bỏ cuộc giữa trận:** giữ các game đã xong. Bên thắng được cộng số game còn thiếu. Chỉ tính điểm trình nếu đã xong
  ≥ 1 game.

**Sửa tỉ số:**

- Trước khi chốt: `PUT` lại kèm `If-Match`. Mỗi lần sửa ghi `audit_log` (ai, lúc nào, trước / sau).
- Trận loại trực tiếp đã có trận sau bắt đầu thì **không** đổi được người thắng (phải huỷ trận sau trước).
- Sau khi chốt: huỷ chốt (mục 7.3) hoặc chỉnh điểm tay.

## 2. Tạo giải đấu — wizard 4 bước

| Bước | Trường | Ghi chú |
|---|---|---|
| **1. Thông tin** | Tên giải · ngày thi đấu · chi nhánh tổ chức (lấy theo chi nhánh đang chọn) · cấp giải (`club` / `open` / `chain` — `chain` chỉ admin) · điều lệ (văn bản) · số sân dự kiến | Cấp giải quyết định hệ số điểm BXH thành tích (05, mục 3.2) |
| **2. Nội dung & điều kiện** | Đơn / Đôi · giới (nam / nữ / nam nữ / mở) · cách ghép đôi (**cặp đăng ký sẵn** / **bốc thăm ghép cặp cân bằng**) · điều kiện trình (không giới hạn / từng người min–max / tổng cặp ≤ X) · số đội (hoặc người) tối đa | Vượt số tối đa → danh sách chờ. Tổng cặp chỉ dùng với cặp đăng ký sẵn |
| **3. Thể thức** | `round_robin` / `groups_knockout` / `knockout` (mục 3) · số bảng · số đội đi tiếp mỗi bảng (1 / 2) · chia bảng (rải hạt giống / theo trình) · có tranh hạng 3 không · luật tỉ số · **tính điểm trình** (bật / tắt) · **tính điểm BXH thành tích** (bật / tắt) | Hệ thống gợi ý số bảng theo số đội dự kiến |
| **4. Xem lại** | Tóm tắt + **ước tính**: số trận, số lượt thi đấu, thời gian dự kiến (= số lượt × phút / trận), dựa trên số sân | Tạo → `draft`. "Mở đăng ký" → `open` |

**Ước tính thời gian mặc định:** 1 game 21 điểm ≈ 15 phút · 3 game 21 điểm ≈ 35 phút · 3 game 15 điểm ≈ 25 phút.
BTC sửa được.

## 3. Thể thức thi đấu

| Thể thức | Mô tả | Gợi ý dùng khi |
|---|---|---|
| `round_robin` | Một bảng, ai cũng gặp ai. Thứ hạng = bảng xếp hạng | 3–6 đội |
| `groups_knockout` | Vòng bảng (vòng tròn trong bảng) → nhất (và nhì) mỗi bảng vào sơ đồ loại trực tiếp | 7–32 đội |
| `knockout` | Loại trực tiếp ngay, hạt giống theo điểm trình | Đông đội, ít thời gian |

**Gợi ý số bảng** (sửa được):

- `groups_knockout`: số bảng = `round(số đội / 4)`, mỗi bảng 3–5 đội; đi tiếp 2 đội / bảng nếu tổng số đội đi tiếp
  ≤ 16, không thì 1 đội / bảng.
- 7–8 đội → 2 bảng, vào bán kết.
- 9–12 đội → 3 bảng; đi tiếp 2 / bảng = 6 đội → sơ đồ 8 với 2 lượt miễn đấu (bye).
- 16 đội → 4 bảng × 4, vào tứ kết.

## 4. Vòng đời giải, đăng ký, bốc thăm

### 4.1 Vòng đời

```
draft ──mở đăng ký──▶ open ──xác nhận bốc thăm──▶ drawn ──kết quả đầu tiên──▶ in_progress ──chốt──▶ finalized
                        ▲                            │        (stage: group → knockout)   ▲            │
                        └──── reopen (chưa có KQ) ───┘                                    └─ unfinalize┘
mọi trạng thái trừ finalized ──huỷ──▶ cancelled
```

### 4.2 Đăng ký

- **Người đăng ký:**
  - nhân viên chọn người chơi từ danh sách (tìm theo tên / SĐT phía app chính);
  - cặp đăng ký sẵn thì chọn 2 người;
  - (sau này) khách tự đăng ký online.
- **Kiểm tra ngay khi chọn** (`eligibility.js`):
  - người chưa có điểm ở nội dung của giải → nút **"Chấm trình ngay"** (form ở 03), chấm xong đăng ký tiếp;
  - giới tính theo `gender_rule`;
  - điều kiện trình tính trên `pairingRating` (03, mục 4);
  - không trùng người trong cùng giải;
  - quá số tối đa → vào danh sách chờ.
- Danh sách đăng ký hiện cờ **"Tự chấm — chưa xác thực"** / **"Chấm nhanh"** để BTC để ý trước khi bốc thăm.

### 4.3 Ghép đồng đội cân bằng — `formBalancedTeams` (chỉ giải "bốc thăm ghép cặp")

```
1. Chọn người vào đội
   doubles: số người lẻ → người đăng ký sau cùng vào danh sách chờ
   mixed  : k = min(#nam, #nữ); giới dư → những người đăng ký sau cùng của giới đó vào danh sách chờ
2. Lời giải gốc "gấp đôi": sắp giảm dần theo pairingRating; đội i = (người i, người n−1−i)
   mixed: nam giảm dần ghép nữ tăng dần
3. Tìm kiếm cục bộ ngẫu nhiên (PRNG theo seed):
   30 lần khởi đầu (lần 1 = lời giải gốc, còn lại ghép ngẫu nhiên hợp lệ)
   mỗi lần 50·n bước: chọn 2 đội, đổi chéo 1 người (mixed: đổi 2 bạn nữ) → giữ nếu cost không tăng
   lấy mẫu các lời giải có cost ≤ best + 0.03 → pool (khử trùng lặp)
4. Lọc pool theo best cuối cùng + 0.03 → PRNG chọn 1

cost = độ lệch chuẩn điểm đội
     + 1.0  × Σ max(0, |p1 − p2| − chênh_lệch_tối_đa_trong_cặp)    (nếu BTC đặt)
     + 0.02 × số cặp trùng đồng đội ở 3 giải gần nhất
     + 0.02 × số cặp mà cả hai đều chỉ thích đứng lưới (hoặc đều chỉ thích cuối sân)
```

- Ví dụ 8 người 4.6 / 4.1 / 3.8 / 3.5 / 3.3 / 3.0 / 2.7 / 2.2: lời giải gốc cho cả 4 đội đều **3.40**. Bốc thăm
  thuần tuý có thể ra đội 4.35 gặp đội 2.45.
- 128 người: vài chục ms.
- Cùng input + cùng seed → cùng kết quả. Seed lưu ở giải, nên ai cũng kiểm chứng được là bốc thăm không bị "xếp".

### 4.4 Chia bảng — `drawGroups`

- `seeded` (rải hạt giống):
  1. sắp đội giảm dần;
  2. cắt thành các "nhóm hạt giống", mỗi nhóm có `số bảng` đội;
  3. với từng nhóm: xáo theo seed rồi chia lần lượt vào bảng 1..G.

  Kết quả: bảng nào cũng có đội mạnh và đội yếu.
- `level` (theo trình): sắp giảm dần, cắt liền thành G bảng, bảng 1 mạnh nhất. Trận nào cũng sát sức.
- Các bảng lệch nhau tối đa 1 đội.

### 4.5 Lịch thi đấu

- **`roundRobin`** (phương pháp xoay vòng) sinh các vòng: mỗi cặp đội trong bảng gặp nhau đúng một lần; số đội lẻ
  thì mỗi vòng có một đội nghỉ.
- **`scheduleSlots(matches, số sân)`** xếp trận của mọi bảng vào các **lượt thi đấu** (mỗi lượt ≤ số sân trận):
  - không đội nào đánh hai trận trong cùng lượt;
  - ưu tiên đội đã nghỉ lâu nhất (tránh đánh liền hai lượt);
  - xen kẽ các bảng.

  Kết quả là `slot_no` cho từng trận và thời gian dự kiến.

### 4.6 Xem trước và xác nhận bốc thăm

1. `draw/preview` trả về: đội, danh sách chờ, bảng, lịch theo lượt, thống kê cân bằng (độ lệch so với bốc thuần
   tuý).
2. BTC có thể **bốc lại** (seed mới) hoặc **đổi tay**: đổi hai người giữa hai đội, chuyển đội giữa hai bảng.
3. `draw` (xác nhận) chỉ lưu khi:
   - mọi người `registered` nằm trong đúng một đội, trừ số người bắt buộc vào danh sách chờ;
   - đội nam nữ luôn 1 nam + 1 nữ;
   - đúng giới;
   - mọi đội thuộc đúng một bảng;
   - các bảng lệch ≤ 1.

   Sai → 422 `DRAW_INVALID`.

   Đạt → sinh các `matches` vòng bảng, trạng thái giải thành `drawn`. Sự kiện `competition.tournament.drawn`.

## 5. Sơ đồ loại trực tiếp

**Kích thước và lượt miễn đấu:** số đội đi tiếp `Q` → sơ đồ `B` = luỹ thừa của 2 nhỏ nhất ≥ Q (4, 8, 16, 32…).
`B − Q` lượt miễn đấu (bye) dành cho **hạt giống cao nhất**.

**Xếp hạt giống:**

- **Từ vòng bảng** (`groups_knockout`):
  - Thứ tự hạt giống: mọi đội **nhất bảng** trước, sắp theo tỉ lệ thắng → hiệu số game / trận → hiệu số điểm /
    trận → điểm đội. Sau đó mọi đội **nhì bảng**, sắp cùng cách.
  - Đặt vào vị trí chuẩn của sơ đồ (1 và 2 ở hai nửa; 3, 4 ở hai phần tư còn lại…). Nhất gặp nhì ở vòng đầu.
  - **Nhất và nhì cùng một bảng luôn ở hai nửa sơ đồ** → chỉ gặp lại ở chung kết.
  - Đội cùng bảng không gặp nhau ở vòng đầu: nếu trùng, đổi với đội cùng mức hạt giống gần nhất.
- **Loại trực tiếp ngay** (`knockout`):
  - `B / 4` hạt giống (tối thiểu 2) theo điểm đội, đặt vào vị trí hạt giống chuẩn;
  - các đội còn lại bốc thăm (theo seed) vào các vị trí còn trống.

**Tiến trình:**

- Mỗi trận có `next_match_id` + `next_slot`. Nhập kết quả (kể cả W.O. / bỏ cuộc) thì người thắng **tự điền** vào ô
  tiếp theo.
- Có tranh hạng 3 thì hai đội thua bán kết tự vào trận tranh hạng 3.

**Xác nhận:** `knockout/preview` (xem sơ đồ, đổi tay hai ô cùng vòng đầu) → `knockout` (khoá sơ đồ, sinh trận).
Giải chuyển `stage = knockout`.

## 6. Xếp hạng trong bảng và thứ hạng chung cuộc

**Bảng xếp hạng trong bảng:**

1. Số trận thắng.
2. Hai đội bằng nhau: đối đầu trực tiếp.
3. Từ ba đội bằng nhau: hiệu số game, rồi hiệu số điểm (trong các trận của bảng). Còn đúng hai đội bằng nhau → đối
   đầu. Vẫn bằng → bốc thăm bằng seed của giải.

**Thứ hạng chung cuộc** (tính khi chốt, lưu `tournament_placements`; là đầu vào điểm BXH thành tích ở 05, mục 3.2):

| Thể thức | Thứ hạng |
|---|---|
| Có loại trực tiếp | Vô địch **1** · thua chung kết **2** · tranh hạng 3: thắng **3**, thua **4**; không tranh: cả hai **3–4** · thua tứ kết **5–8** · thua vòng 16 **9–16** · … |
| Đội bị loại ở vòng bảng | Xếp sau mọi đội vào vòng trong: theo thứ hạng trong bảng → tỉ lệ thắng → hiệu số game / trận → hiệu số điểm / trận |
| `round_robin` một bảng | Đúng bằng bảng xếp hạng |

## 7. Chốt giải, huỷ chốt, tình huống biên

### 7.1 Xem trước khi chốt

`GET /v1/tournaments/{id}/finalize-preview` cho xem trước:

- thứ hạng chung cuộc;
- **điểm trình trước / sau từng người**;
- **điểm BXH thành tích** từng người sẽ nhận.

### 7.2 Chốt — `finalize` (một transaction)

1. `SELECT … FOR UPDATE` dòng giải. Kiểm tra `in_progress` và mọi trận đã `completed` / `cancelled`.
2. Khoá `player_ratings` của mọi người trong giải **theo thứ tự id** (tránh deadlock khi hai giải có chung người
   chốt cùng lúc).
3. `computePeriodRatings` (03, mục 3) → cập nhật `player_ratings`, ghi sổ điểm (`reason = tournament`). Bỏ qua nếu
   giải tắt "tính điểm trình".
4. Tính `tournament_placements` → ghi `ranking_results` (bỏ qua nếu tắt "tính điểm BXH" hoặc < 4 đội).
5. Cộng dồn `player_stats`.
6. Ghi outbox: `competition.player.rating_changed` (từng người), `competition.tournament.finalized` (kèm thứ hạng
   + điểm thành tích). Commit.

Nếu giữa lúc xem trước và lúc chốt có người đổi điểm (vì giải khác vừa chốt), response chốt đánh dấu những người
lệch so với bản xem trước.

### 7.3 Huỷ chốt — `unfinalize`

- Chỉ được khi, với **mọi** người trong giải, dòng sổ điểm mới nhất của nội dung đó là dòng của giải này.
- Ngược lại → 409 `ROLLBACK_BLOCKED` kèm danh sách người bị chặn. Khi đó sửa bằng chỉnh tay có lý do.
- Hoàn tác:
  - ghi dòng `reason = rollback`;
  - trừ lại `rated_matches`;
  - khôi phục `last_match_at`;
  - thu hồi `ranking_results`;
  - trừ lại `player_stats`.

  **Không xoá dòng cũ.**

### 7.4 Tình huống biên

| Tình huống | Xử lý |
|---|---|
| Rút khỏi giải sau bốc thăm | Trận **chưa đánh** thành W.O. cho đối thủ; trận đã đánh vẫn tính. Đang ở sơ đồ loại trực tiếp → đối thủ đi tiếp |
| Một người trong cặp rút | Cả đội rút |
| Thiếu người lúc bốc thăm (lẻ / lệch nam–nữ) | Người đăng ký sau cùng vào danh sách chờ; BTC đổi tay được |
| Một người đánh hai giải cùng lúc ở hai chi nhánh | Giải nào chốt trước thì giải sau dùng điểm mới |
| Giải chỉ có 2 đội | Một trận, thứ hạng 1–2, không đủ điều kiện điểm BXH (< 4 đội) |
| Người chơi bị gộp hồ sơ khi đang ở trong giải | 05, mục 4 |

## 8. Buổi giao lưu — xếp trận tại sân

**Mục đích:** buổi đánh giao lưu ở CLB / sân, 8–40 người, vài sân. Hệ thống xếp ai đánh sân nào với ai, sao cho:

- ai cũng được đánh đều;
- đồng đội thay đổi liên tục;
- trận nào cũng cân (hoặc cùng trình với nhau, tuỳ chế độ).

Người điều phối bấm một nút thay cho việc gọi tên bằng miệng.

### 8.1 Tạo buổi

| Trường | Giá trị |
|---|---|
| Tên, chi nhánh, giờ bắt đầu | |
| Sân dùng (`court_refs`) | Chọn từ danh sách sân của chi nhánh (app chính cung cấp) |
| Hình thức | Đôi (4 người / sân) hoặc Đơn (2 người / sân) |
| Chế độ ghép | **`balanced`**: đội cân nhau trong từng sân (mặc định) · **`level`**: người cùng trình vào cùng sân · **`random`**: ngẫu nhiên, chỉ tránh lặp đồng đội |
| Luật tỉ số | Mặc định 1 game × 21 (trần 30). Có thể không nhập tỉ số |
| Tính điểm trình | **Tắt** mặc định. Bật → trận có tỉ số hợp lệ được tính với hệ số 0.5 khi đóng buổi |

### 8.2 Trong buổi

- **Điểm danh:**
  - thêm người có mặt; ai chưa có hồ sơ thì nhân viên **chấm nhanh** một nhãn (03, mục 2.3);
  - người đến muộn được thêm bất cứ lúc nào (tính như đã đánh bằng số trận ít nhất của những người đang có mặt, để
    không được ưu tiên quá hay bị thiệt);
  - người về sớm bấm "Rời buổi".
- **"Xếp sân trống"**: hệ thống xếp trận cho **mọi sân đang trống**.
  - Đầu buổi mọi sân trống → xếp cả lượt.
  - Giữa buổi sân nào đánh xong thì bấm lại, chỉ sân đó được xếp; người đang đánh sân khác không bị lấy.
- Nhập tỉ số (tuỳ chọn), rồi sân trở thành trống.
- **Màn hình lớn (TV)**: sân nào – ai với ai – đã đánh bao lâu, danh sách người đang chờ theo thứ tự ưu tiên.

### 8.3 Thuật toán — `fillCourts` (hàm thuần trong module `matchmaking`)

```
input: người có mặt và rảnh (không đang ở sân) { id, pairingRating, gamesPlayed, waitingSince, gender },
       sân trống S, hình thức (đôi: 4 người / sân), chế độ, lịch sử trong buổi (ai từng là đồng đội / đối thủ của ai), seed

1. Số sân dùng được = min(S, ⌊số người rảnh / 4⌋)
2. Chọn người ra sân: sắp theo (chờ lâu nhất trước, đánh ít trận nhất trước, đến sớm trước, ngẫu nhiên)
   → lấy 4 × số_sân người đầu
3. Chia vào các sân:
   level    : sắp theo pairingRating, cắt 4 người / sân (sân đầu mạnh nhất)
   balanced : xáo ngẫu nhiên, rồi đổi người giữa các sân nếu giảm được tổng cost bước 4
   random   : xáo ngẫu nhiên
4. Mỗi sân 4 người có 3 cách chia đội ({ab|cd}, {ac|bd}, {ad|bc}); chọn cách có cost nhỏ nhất:
   cost = |R_đội1 − R_đội2|                            (bỏ qua ở chế độ random)
        + 0.30 × số cặp đã từng là đồng đội trong buổi
        + 0.10 × số cặp đã từng là đối thủ trong buổi
5. Trả về: sân → đội A / đội B, danh sách người tiếp tục chờ
```

- **Công bằng:** chênh lệch số trận giữa những người có mặt từ đầu buổi không quá 1 (có test mô phỏng 3 giờ,
  20 người, 4 sân).
- Có bước **xem trước**: người điều phối đổi tay hai người rồi mới xác nhận → sinh `matches` (`context_type =
  session`).
- `POST /v1/matchmaking/session-round` là phiên bản không trạng thái của thuật toán này, cho hệ thống khác dùng.

### 8.4 Đóng buổi

`POST /v1/sessions/{id}/close`:

- trận chưa có tỉ số → `cancelled`;
- nếu bật tính điểm: một kỳ tính điểm với hệ số 0.5 (03, mục 3.3);
- cộng thống kê "giao lưu";
- sự kiện `competition.session.closed`.

## 9. Ví dụ đầy đủ: giải "Đôi nam nữ ghép cặp — trình ≤ 4.0"

1. **Tạo** (wizard):
   - `open` ×2 · đôi, `mixed`, `random_balanced`;
   - `groups_knockout`: 3 bảng, đi tiếp 2 / bảng, rải hạt giống, không tranh hạng 3;
   - 1 game × 21; 4 sân; bật cả hai loại điểm.
2. **Đăng ký** 14 nam, 12 nữ:
   - 1 nam `pairingRating` 4.3 bị từ chối (`NOT_ELIGIBLE`), còn 13 nam;
   - 2 người chưa có điểm → nhân viên bấm "Chấm trình ngay" rồi đăng ký tiếp.
3. **Xem trước bốc thăm:**
   - 12 đội nam nữ; 1 nam đăng ký sau cùng vào danh sách chờ;
   - độ lệch chuẩn điểm đội 0.03, so với khoảng 0.4 nếu bốc thuần;
   - 3 bảng × 4 đội → 18 trận vòng bảng, xếp thành 5 lượt trên 4 sân, dự kiến khoảng 1 giờ 15 phút.
4. BTC đổi tay hai bạn nữ giữa hai đội → xác nhận → `drawn`.
5. Nhập kết quả vòng bảng.
6. **Sơ đồ loại trực tiếp:** 6 đội đi tiếp → sơ đồ 8, 2 lượt miễn đấu cho 2 hạt giống đầu. Nhất – nhì cùng bảng ở
   hai nửa.
7. Tứ kết (2 trận) → bán kết → chung kết.
8. **Xem trước khi chốt** → chốt:
   - 24 người có điểm trình mới;
   - vô địch nhận `100 × 2 × 0.875 × 0.971 ≈ 170` điểm thành tích mỗi người (12 đội → hệ số quy mô 0.875; trình
     trung bình 3.4 → hệ số sức mạnh 0.971).

## 10. Hằng số (giải đấu, ghép cặp, giao lưu)

| Hằng số | Giá trị |
|---|---|
| `PAIRING_TOLERANCE` / `PAIRING_RESTARTS` / `PAIRING_STEPS_PER_PLAYER` | 0.03 (ban đầu 0.05 — test thật cho thấy quá rộng khi danh sách lệch hai đầu) / 30 / 50 |
| `PAIRING_REPEAT_PARTNER_PENALTY` / `PAIRING_SAME_POSITION_PENALTY` / `PAIRING_REPEAT_LOOKBACK` | 0.02 / 0.02 / 3 giải |
| `SESSION_REPEAT_PARTNER_PENALTY` / `SESSION_REPEAT_OPPONENT_PENALTY` | 0.30 / 0.10 |
| `MATCH_MINUTES` | 1×21: 15 · 3×21: 35 · 3×15: 25 (BTC sửa được) |
| `RANKING_MIN_TEAMS` | 4 |
