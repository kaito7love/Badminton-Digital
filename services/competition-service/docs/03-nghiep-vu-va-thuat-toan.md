# competition-service — Nghiệp vụ (1): Form tự chấm và điểm trình

> Cả bộ nghiệp vụ gồm:
> - **03 (tài liệu này):** form tự chấm, cách ra điểm, cách điểm thay đổi sau thi đấu.
> - `05-ho-so-nguoi-choi-va-bang-xep-hang.md`: thông tin người chơi, thống kê, bảng xếp hạng.
> - `06-tran-dau-giai-dau-giao-luu.md`: tạo trận, tạo giải, bốc thăm, sơ đồ, buổi giao lưu.
> - `07-giao-dien.md`: các màn hình.
>
> Mọi công thức là **hàm thuần** trong `src/modules/*/domain/`, test Jest không cần DB. Mọi con số nằm trong
> `ratingConfig.js` (mục 5).

## 0. Hai khái niệm dễ lẫn

| | **Điểm trình (rating)** | **Thứ hạng (ranking)** |
|---|---|---|
| Trả lời câu hỏi | "Tôi đánh hay cỡ nào?" | "Tôi đứng thứ mấy?" |
| Dạng | Số 1.0 – 7.0, vd `3.47` (TB) | Vị trí trên bảng, vd hạng 12 / 230 |
| Tính từ | Form tự chấm (lúc đầu), rồi **kết quả từng trận** so với trình đối thủ | Có 2 bảng: *BXH trình độ* sắp theo điểm trình; *BXH thành tích* cộng điểm theo thứ hạng đạt được ở các giải |
| Dùng để | **Ghép cặp, chia bảng, điều kiện giải** | Vinh danh, tạo động lực đi đánh giải |
| Tài liệu | **03 (này)** | 05 |

## 1. Thang điểm

**1.0 – 7.0**, trả ra 2 chữ số thập phân. Mỗi người có **2 điểm độc lập**:

- **Đơn** (`singles`);
- **Đôi** (`doubles`): dùng chung cho đôi nam, đôi nữ, đôi nam nữ (như DUPR).

| Điểm | Nhãn (`level`) | Điểm | Nhãn |
|---|---|---|---|
| < 2.0 | Mới chơi | 3.5 – 3.99 | Trung bình khá (TB+) |
| 2.0 – 2.49 | Yếu | 4.0 – 4.49 | Khá |
| 2.5 – 2.99 | Trung bình yếu (TB-) | 4.5 – 4.99 | Khá giỏi |
| 3.0 – 3.49 | Trung bình (TB) | 5.0 – 5.99 | Bán chuyên |
| | | ≥ 6.0 | Chuyên nghiệp |

## 2. Form tự chấm

### 2.1 Mười hai tiêu chí — `rubric v1`

Mỗi tiêu chí có 5 mô tả hành vi. Người chơi chọn mô tả **giống mình nhất ở phần lớn các buổi chơi**, không chọn
theo lúc chơi hay nhất. Không có lựa chọn "không chắc".

**⛓ = tiêu chí then chốt**: mức thấp nhất trong các tiêu chí then chốt sẽ chặn trần điểm (mục 2.2).

Các tiêu chí được gom thành 4 trang, mỗi trang 3 tiêu chí (mục 2.4).

**Trang 1 — Kỹ thuật nền tảng**

**1. `serve` — Giao cầu & đỡ giao cầu** (trọng số Đơn 1 · Đôi 1.5)
1. Giao hay hỏng (chạm lưới, ra ngoài); chưa phân biệt giao ngắn và giao dài.
2. Giao được cả ngắn lẫn dài nhưng cầu ngắn thường cao, dễ bị ép; đỡ giao chủ yếu đánh lên cao.
3. Giao ngắn trái tay sát lưới khá đều; đỡ giao đặt / đẩy được vào khoảng trống, ít khi phải lên cầu bị động.
4. Giao ngắn đều, biết giao bổng / giao nhanh bất ngờ; đỡ giao chủ động ép lại (vê, đẩy nhanh, chặn lưới).
5. Gần như không hỏng giao, đổi nhịp và điểm rơi có chủ đích; đỡ giao gây sức ép ngay từ cú đầu tiên.

**2. `clear` — Cầu cao sâu thuận tay (phông)** (Đơn 1.5 · Đôi 0.5)
1. Phông thuận tay chưa qua được nửa sân bên kia.
2. Phông tới giữa sân bên kia; lùi về cuối sân thì hay trượt cầu.
3. Có thời gian chuẩn bị thì phông từ cuối sân tới gần cuối sân bên kia.
4. Phông cuối sân sang cuối sân ổn định; đánh được cả phông tấn công (thấp, nhanh).
5. Phông sâu, chính xác kể cả khi bị ép; dùng phông để kéo giãn và điều cầu.

**3. `backhand` ⛓ — Trái tay** (Đơn 1.5 · Đôi 1)
1. Gần như không đánh được trái tay, luôn cố chạy vòng sang thuận tay.
2. Đỡ trái tay được cầu giữa sân; lên cầu chưa qua nổi nửa sân đối phương.
3. Giữa sân đẩy trái tay ra cuối sân được; ở cuối sân chỉ đưa được cầu qua lưới.
4. Trái tay cuối sân đánh cao sâu quá nửa sân bên kia; bỏ nhỏ trái tay có chủ đích.
5. Trái tay cuối sân đánh hết sân, đổi hướng được (phông, chặt, bỏ nhỏ) cả khi bị ép.

**Trang 2 — Tấn công**

**4. `smash` — Đập cầu** (Đơn 1 · Đôi 1.5)
1. Chưa đập được, hoặc đập hay vào lưới / ra ngoài.
2. Đập được cầu dễ (cầu cao giữa sân), lực yếu, chủ yếu đập thẳng.
3. Đập có lực từ giữa sân, chọn được hướng thẳng / chéo; cầu sâu thì còn hụt.
4. Đập mạnh cả từ cuối sân, đập dọc biên, có bật nhảy đập, nối được cú tiếp theo.
5. Đập nặng, góc hẹp, liên tục nhiều cú, đổi nhịp đập – chặt – đập để kết thúc pha cầu.

**5. `drop` — Bỏ nhỏ / chặt cầu từ cuối sân** (Đơn 1 · Đôi 0.5)
1. Chưa bỏ nhỏ được từ cuối sân.
2. Bỏ nhỏ được khi có thời gian, nhưng cầu cao, rơi xa lưới.
3. Khi thuận lợi, bỏ nhỏ / chặt từ cuối sân rơi gần lưới.
4. Chặt nhanh, chặt chéo có chủ đích; cùng một động tác chuẩn bị ra được phông, đập hoặc chặt.
5. Chặt / bỏ nhỏ sát lưới cả khi bị ép, đánh lừa được đối phương về hướng và nhịp.

**6. `net` — Kỹ thuật lưới** (Đơn 1 · Đôi 1.5)
1. Ở lưới chủ yếu đánh lên cao, hay chạm lưới.
2. Đưa cầu qua lưới được nhưng cầu cao, dễ bị chặn / dập.
3. Vê lưới, đẩy cầu sang hai góc cuối sân khá ổn định.
4. Vê sát lưới, chặn / dập lưới khi cầu cao, móc chéo lưới.
5. Kiểm soát lưới vượt trội: vê xoáy, giả động tác, tranh cầu sớm, ghi điểm từ lưới.

**Trang 3 — Phòng thủ & thể lực**

**7. `defense` ⛓ — Phòng thủ, đỡ đập, đánh ngang (drive)** (Đơn 1 · Đôi 1.5)
1. Gần như không đỡ được cú đập.
2. Đỡ được đập nhẹ, nhưng cầu trả về cao và ngắn nên bị ép tiếp.
3. Đỡ được đập vừa, trả về cao sâu; drive qua lại được ở tốc độ vừa.
4. Đỡ đập trả ngắn hoặc đẩy nhanh để chuyển sang tấn công; drive nhanh ổn định cả hai tay.
5. Đỡ được đập mạnh sát người và hai bên, phản công ngay (chặn lưới, drive, đỡ dài chéo).

**8. `footwork` ⛓ — Di chuyển** (Đơn 1.5 · Đôi 1)
1. Chạy nhiều bước nhỏ, hay đứng chờ cầu, thường lỡ nhịp.
2. Lên lưới và về cuối sân được, nhưng về vị trí giữa sân chậm.
3. Có bước đệm (split step), về giữa sân sau mỗi cú; góc cuối sân trái tay còn chậm.
4. Di chuyển 6 góc sân nhịp nhàng, bước chéo / bước đuổi đúng, lấy cầu sớm.
5. Nhanh, ít bước thừa, bật nhảy lấy cầu cả hai góc cuối, giữ thăng bằng cả khi bị ép.

**9. `stamina` — Thể lực** (Đơn 1.5 · Đôi 0.5)
1. Mệt rõ sau một set 21 điểm ở cường độ vừa.
2. Đánh được 2–3 set giao lưu, nhưng pha cầu dài thì tụt sức nhanh.
3. Đánh hết một trận 3 set cường độ cao mà vẫn giữ được chất lượng cú đánh.
4. Đánh liên tục nhiều trận trong một buổi giải, phong độ ổn định.
5. Tập thể lực bài bản; giữ tốc độ cao suốt các pha cầu dài và các trận liên tiếp.

**Trang 4 — Tư duy & kinh nghiệm**

**10. `tactics` — Chiến thuật, đọc cầu** (Đơn 1 · Đôi 1)
1. Chủ yếu đánh cầu về giữa sân, chưa có ý đồ.
2. Biết đánh vào chỗ trống khi đối phương đứng lệch rõ.
3. Biết đánh vào điểm yếu của đối phương (vd trái tay), đổi dài – ngắn.
4. Xây dựng pha cầu (kéo giãn rồi mới kết thúc); đổi lối đánh giữa các game.
5. Đọc được ý đồ đối phương, đoán trước hướng cầu, chủ động điều nhịp trận.

**11. `rotation` — Phối hợp đánh đôi** (Đơn 0 · Đôi 1.5)
1. Chưa biết đứng đâu khi đánh đôi, hay tranh cầu hoặc để cầu rơi giữa hai người.
2. Biết đứng trên – dưới khi tấn công và song song khi phòng thủ, nhưng chuyển chậm.
3. Chuyển đội hình công – thủ theo pha cầu khá đúng lúc, ít va chạm với đồng đội.
4. Chủ động tạo cơ hội cho đồng đội (đánh xuống để đồng đội chặn lưới), xoay vòng mượt.
5. Phối hợp nhuần nhuyễn với nhiều kiểu đồng đội, giữ thế tấn công liên tục, bọc lót tốt.

**12. `experience` — Kinh nghiệm thi đấu** (Đơn 1 · Đôi 1)
1. Chơi dưới 6 tháng.
2. Chơi đều 6 tháng – 2 năm, chủ yếu giao lưu, chưa đánh giải.
3. Chơi trên 2 năm, đã đánh giải phong trào (CLB, công ty, phường / xã).
4. Từng vào tứ kết / bán kết giải phong trào cấp quận / huyện hoặc giải mở rộng tương đương.
5. Từng vào bán kết giải cấp tỉnh / thành trở lên, hoặc từng tập ở đội năng khiếu / chuyên nghiệp. **→ gắn cờ
   "Cần BTC xác nhận".**

Tổng trọng số: Đơn = 13, Đôi = 13.

### 2.2 Từ câu trả lời ra điểm — `scoreAssessment(answers, rubric)`

```
raw[d]   = Σ(mức_i × trọng_số_i[d]) / Σ trọng_số_i[d]        d ∈ {singles, doubles}; mức 1..5 → điểm 1.0..5.0
gate     = min(mức backhand, mức defense, mức footwork)
cap      = { 1: 2.49, 2: 3.49, 3: 4.49 }[gate] ?? ∞          (gate ≥ 4 thì không chặn)
rating[d]= min(raw[d], cap, SELF_ASSESS_MAX = 4.5)           (source = staff: bỏ trần 4.5, vẫn giữ trần then chốt)
cappedBy = "gate:<tiêu chí>" | "self_max" | null
needsVerification = (experience == 5) || (raw[d] > 4.5 với d bất kỳ)
```

Cách ánh xạ **1 mức = 1 điểm** được chọn cố ý, để ai cũng tự hiểu: "trung bình tôi ở mức 3 thì tôi là TB (3.x)".

**Ví dụ:**

| Chọn | Đơn | Đôi | Ghi chú |
|---|---|---|---|
| Mức 3 hết | 3.00 TB | 3.00 TB | |
| Mức 4 hết, riêng trái tay mức 2 | 3.49 TB (raw 3.77) | 3.49 TB (raw 3.85) | Bị trần then chốt `gate:backhand` |
| Như ví dụ 4.2 ở tài liệu 02 (lưới 4, phối hợp 4, trái tay 2, còn lại 3) | 2.96 TB- | 3.15 TB | Người mạnh đánh đôi hơn đánh đơn — trọng số khác nhau làm đúng việc của nó |
| Mức 5 hết | 4.50 Khá giỏi (raw 5.00) | 4.50 | Trần tự chấm + cờ "Cần BTC xác nhận" |

### 2.3 Quy tắc áp bài chấm

| Nguồn | Khi nào được nộp | Hiệu lực |
|---|---|---|
| `self` | Khi người chơi **chưa có trận tính điểm** ở cả hai nội dung **và chưa được nhân viên chấm / xác nhận** (bổ sung khi code: tự chấm không được đè lên điểm nhân viên đã xác nhận). Nộp lại thoải mái; bài mới thay bài cũ (`superseded`) | Áp ngay. Điểm = kết quả, `verified = false` |
| `staff` | Người chưa có trận: `rating:assess`. Người đã có trận: `rating:assess:any` | Chưa có trận: áp ngay, `verified = true`. Đã có trận: **không đổi điểm**, chỉ lưu hồ sơ (`status = recorded`); muốn đổi thì dùng chỉnh tay (`rating:adjust`) — vì điểm từ thi đấu đáng tin hơn một lần xem |
| `staff_quick` | Chấm nhanh cho khách vãng lai ở buổi giao lưu: nhân viên chọn **một nhãn** (Yếu / TB / Khá…) → điểm = giữa khoảng của nhãn (vd TB → 3.25) | Áp ngay, `verified = false`, gắn cờ "Chấm nhanh" để mời người đó làm form đầy đủ sau |
| `video_ai` | Mọi lúc | Luôn `pending_review`. Duyệt: người chưa có trận thì áp như `staff`; người đã có trận thì chỉ là gợi ý |

Mỗi lần áp ghi một dòng sổ điểm `reason = assessment` cho từng nội dung.

### 2.4 Luồng màn hình của form (chi tiết giao diện ở 07)

```
[0] Thông tin chơi   →  [1] Kỹ thuật nền tảng  →  [2] Tấn công  →  [3] Phòng thủ & thể lực
                     →  [4] Tư duy & kinh nghiệm  →  [5] Xem lại + xem trước điểm  →  [6] Kết quả
```

- **[0] Thông tin chơi:**
  - giới tính (bắt buộc);
  - năm sinh (tuỳ chọn, chỉ để chia nhóm tuổi trên bảng xếp hạng);
  - tay thuận, năm bắt đầu chơi, số buổi / tuần;
  - thường đánh (đơn / đôi / cả hai); vị trí ưa thích khi đánh đôi (lưới / cuối sân / linh hoạt).
- **[1]–[4]:** mỗi trang 3 tiêu chí, mỗi tiêu chí 5 thẻ mô tả để chọn một, có thanh tiến độ. Chọn đủ 3 mới sang
  trang sau; quay lại sửa được.
- **[5] Xem lại:**
  - bảng 12 tiêu chí với mức đã chọn, bấm vào để sửa;
  - **điểm xem trước** gọi `POST /v1/assessments/preview`, không lưu;
  - nếu bị trần thì giải thích bằng lời: "Điểm được giới hạn ở 3.49 vì bạn chọn Trái tay mức 2";
  - nếu có cờ xác nhận thì báo trước.
- **[6] Kết quả:**
  - hai thẻ điểm Đơn / Đôi (điểm, nhãn), dòng "Tự chấm — chưa xác thực", thanh độ tin cậy 0%;
  - lời mời: "Tham gia giải / buổi giao lưu có tính điểm để điểm được hiệu chỉnh theo kết quả thật".
- Bản nháp tự lưu trên máy (localStorage), nên thoát giữa chừng vào lại vẫn còn.
- Đã có trận tính điểm → form mở ở chế độ **chỉ xem**, ghi rõ lý do.
- **Nhân viên dùng cùng form** (trang Khách hàng → Trình độ → Chấm trình). Khác người chơi ở ba điểm: thêm ô ghi
  chú, không có trần 4.5, có nút "Chấm nhanh".
- Bài chấm AI hiện trên cùng form: mức AI đề xuất có nhãn "AI · tin cậy 86%"; nhân viên sửa / điền nốt rồi duyệt.

## 3. Điểm thay đổi sau thi đấu

### 3.1 Nói bằng lời

- **Thắng người mạnh hơn:** được cộng nhiều. **Thắng người yếu hơn:** được cộng ít.
- **Thua người yếu hơn:** bị trừ nhiều. **Thua người mạnh hơn:** bị trừ ít.
- **Thắng cách biệt** (21-8) cộng nhiều hơn thắng sát nút (22-20). Nhưng **đã thắng thì không bao giờ bị trừ**.
- **Người mới** (ít trận) điểm lên / xuống mạnh, để nhanh chóng sửa sai lệch của việc tự chấm. **Người đánh
  nhiều** thì điểm ổn định.
- **Đánh đôi:** so điểm trung bình hai đội; hai người cùng đội cùng được cộng hoặc cùng bị trừ, mỗi người theo mức
  "mới / ổn định" của riêng mình.
- Điểm được áp **một lần khi chốt giải** (hoặc khi đóng buổi giao lưu có tính điểm), không áp sau từng trận.

Mỗi trận lên / xuống bao nhiêu (tỉ số bình thường, `m = 1`):

| Đối thủ so với bạn | Thắng — người mới / ổn định | Thua — người mới / ổn định |
|---|---|---|
| Yếu hơn 0.5 | +0.07 / +0.02 | −0.23 / −0.06 |
| Ngang trình | +0.15 / +0.04 | −0.15 / −0.04 |
| Mạnh hơn 0.5 | +0.23 / +0.06 | −0.07 / −0.02 |

### 3.2 Công thức (Elo biến thể, K theo độ tin cậy)

```
R_đội        = điểm trung bình 2 người (đơn: điểm người đó)          — dùng điểm hiện tại lúc chốt, KHÔNG dùng pairingRating
E_A          = 1 / (1 + 10^((R_B − R_A) / D))                        D = 1.0 → chênh 0.5 ≈ 76% thắng, chênh 1.0 ≈ 91%
S_A          = 1 nếu A thắng, 0 nếu thua
p            = (tổng điểm đội thắng giành được) / (tổng điểm mọi game đã đánh xong)
m            = clamp(0.9 + 2 × (p − 0.5), 0.9, 1.25)                  hệ số chênh tỉ số
n_eff        = rated_matches, hoặc ⌊rated_matches / 2⌋ nếu trận gần nhất cách > 180 ngày
K(n_eff)     = 0.08 + 0.22 × max(0, 1 − n_eff / 20)                  0.30 (người mới) → 0.08 (≥ 20 trận)
w            = hệ số của trận: 1.0 (giải) · 0.5 (buổi giao lưu có tính điểm)
Δ_người/trận = w × K(người) × (S − E) × m
```

- Tổng Δ của trận **không bằng 0** — cố ý, để người mới hội tụ nhanh mà không kéo điểm người đã ổn định theo.
- **Độ tin cậy** hiển thị = `min(100%, n_eff × 5%)`. Dưới 10 trận là "Tạm tính".
- Điểm luôn bị kẹp trong [1.0, 7.0].

**Ví dụ (đôi):** A1 3.20 (2 trận, K 0.278) + A2 3.80 (30 trận, K 0.08) → đội A **3.50**. B1 3.60 (15 trận,
K 0.135) + B2 3.60 (40 trận) → đội B **3.60**.

`E_A = 0.443`. A thắng 21-17, 21-19 → `p = 42 / 78 = 0.538` → `m = 0.977`.

| Người | Δ | Sau |
|---|---|---|
| A1 | **+0.151** | 3.35 |
| A2 | **+0.044** | 3.84 |
| B1 | **−0.074** (chính xác −0.0735) | 3.53 |
| B2 | **−0.044** | 3.56 |

### 3.3 Kỳ tính điểm

Một giải (hoặc một buổi giao lưu có tính điểm) là một kỳ. Mọi trận trong kỳ dùng **điểm và K tại lúc chốt**, Δ
cộng dồn rồi áp một lần. Hệ quả:

- kết quả không phụ thuộc thứ tự nhập tỉ số;
- sửa tỉ số trước khi chốt thì không phải tính lại dây chuyền.

Sổ điểm ghi **một dòng / người / nội dung / kỳ**, với `calc` chi tiết từng trận:

```json
{ "matches": [ { "matchId": "…", "E": 0.443, "S": 1, "m": 0.977, "K": 0.278, "w": 1, "delta": 0.151 } ],
  "prevRatedMatches": 2, "prevLastMatchAt": "2026-08-30T09:00:00Z" }
```

### 3.4 Trận nào được tính

| Kết quả trận | Tính điểm trình? |
|---|---|
| Bình thường | Có |
| Bỏ cuộc trước trận (W.O.) | **Không** |
| Bỏ cuộc giữa trận (retired) | Chỉ khi đã xong **≥ 1 game** (m tính trên các game đã xong) |
| Trận bị huỷ / giải tắt "tính điểm trình" / buổi giao lưu không tính điểm | Không |

## 4. Chống "giấu trình"

`pairingRating = max(rating, đỉnh_12_tháng − 0.5)`, trong đó `đỉnh_12_tháng` = `rating_after` lớn nhất trong sổ
điểm 365 ngày gần nhất.

- Chỉ dùng cho **ghép cặp, chia bảng, điều kiện giải**. Không dùng tính Elo, không dùng xếp hạng.
- Nhờ vậy, thua liên tục (cố ý hay không) cũng không làm người đó bị xếp thấp quá 0.5 so với đỉnh gần đây.
- Thêm các lớp khác:
  - trần tự chấm 4.5;
  - tiêu chí then chốt;
  - cờ "chưa xác thực" hiện cho BTC khi đăng ký;
  - nhân viên xác nhận trình (`verify`).

**Vì sao chưa dùng Glicko-2:** Glicko-2 xử lý độ bất định chuẩn hơn nhưng khó giải thích cho người chơi. "K theo
số trận" đã lấy được phần lợi chính. Engine chỉ lộ một hàm `computePeriodRatings(input) → changes`, nên thay công
thức chỉ đổi một file.

**Hiệu chỉnh:** khi có ≥ 200 trận thật, `scripts/calibrate.js` thử lại (backtest) nhiều cặp D / K, chấm bằng
Brier score, rồi mới đổi hằng số.

## 5. Hằng số điểm trình (`ratingConfig.js`)

| Hằng số | Giá trị | Ý nghĩa |
|---|---|---|
| `SCALE_MIN` / `SCALE_MAX` | 1.0 / 7.0 | Kẹp điểm |
| `SELF_ASSESS_MAX` | 4.5 | Trần tự chấm |
| `GATE_CAPS` | {1: 2.49, 2: 3.49, 3: 4.49} | Trần theo tiêu chí then chốt yếu nhất |
| `QUICK_LEVEL_POINTS` | Mới chơi 1.5 · Yếu 2.25 · TB- 2.75 · TB 3.25 · TB+ 3.75 · Khá 4.25 | Chấm nhanh |
| `ELO_D` | 1.0 | Độ dốc xác suất thắng |
| `K_MIN` / `K_MAX` / `K_FULL_AFTER` | 0.08 / 0.30 / 20 trận | K theo độ tin cậy |
| `MARGIN_MIN` / `MARGIN_MAX` / `MARGIN_SLOPE` | 0.9 / 1.25 / 2 | Hệ số chênh tỉ số |
| `MATCH_WEIGHT` | giải 1.0 · giao lưu 0.5 | Hệ số trận |
| `PROVISIONAL_BELOW` | 10 trận | Nhãn "Tạm tính" |
| `INACTIVE_AFTER_DAYS` | 180 | Nghỉ lâu → `n_eff` giảm một nửa |
| `ANTI_SANDBAG_WINDOW_DAYS` / `ANTI_SANDBAG_DROP` | 365 / 0.5 | Chống giấu trình |
