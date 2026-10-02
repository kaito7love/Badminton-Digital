# Kế hoạch: rà luồng giao lưu + giải đấu, đưa giải đấu từ "xem được" sang "tổ chức và vận hành được"

- **Ngày:** 03/10/2026.
- **Trạng thái:** đã duyệt (03/10, câu trả lời ở mục 5) → đã làm, kết quả ở mục 6; chờ duyệt merge.
- **Nhánh:** `feat/competition-tournament-ops`, tách từ `feat/competition-live-score` @ `f24deaa` (cần màn hình bấm
  điểm của nhánh đó).
- **Phạm vi:** `services/competition-service` + bàn thử. App chính vẫn để bước 4 (plan 18), tài liệu 07 cập nhật cho
  bước đó.

## 0. Chủ dự án yêu cầu

> Check giúp 2 flow: (1) giao lưu đang hoạt động ổn — rà lại còn case nào bỏ lỡ không; (2) giải đấu: từ khâu đăng ký,
> điểm danh, chia cặp theo từng thể thức (đôi: 2 người đăng ký chung 1 đội, không phải bốc ngẫu nhiên 2 người ghép
> lại), tính điểm (vòng tròn, vòng bảng, loại trực tiếp), mô phỏng bảng đấu. Giải đấu hiện chỉ xem được, chưa tổ chức
> hay vận hành được.

**Cách rà:**
- đọc thiết kế (06 mục 2–8) và code;
- **chạy thật** trên bản kiểm riêng: service + DB tạm `cs_review`, seed demo, gọi API qua bàn thử với vai Quản lý /
  Nhân viên;
- kịch bản ở scratchpad `review-tournament.js`, `review-session.js` — không vào repo.

## 1. Giao lưu

**Đã ổn** (đã test thật ở plan 18, 19 và lần rà này):
- điểm danh, chấm nhanh khi điểm danh, đến muộn được bù trận, rời buổi / quay lại;
- "Xếp sân trống" có xem trước và đổi tay; mô phỏng 200 buổi cho thấy không ai ít trận hơn phải ngồi chờ thay người
  nhiều trận hơn;
- xong không tỉ số, huỷ trận, bấm điểm trực tiếp, TV, bo3, đổi sân, đổi luật giữa buổi;
- đóng buổi (tính điểm trình hệ số 0.5 nếu bật), huỷ buổi.

**Còn bỏ lỡ:**

| # | Trường hợp | Hiện tại (chạy thật) | Hậu quả |
|---|---|---|---|
| G1 | Một người đang **có mặt ở buổi khác chưa đóng** được điểm danh vào buổi thứ hai | Cho phép (201) | Buổi hôm trước quên đóng / quên bấm "Rời buổi" → người đó có thể bị xếp ra sân ở hai nơi |
| G2 | **Thay người giữa trận** (đau chân, có việc phải về) | Không có API (404) | Chỉ "Huỷ trận" (4 người về hàng chờ, mất trận) hoặc "Xong (không tỉ số)" |
| G3 | **Buổi quên đóng** | Mở mãi, người vẫn "có mặt" | Gây ra G1; thống kê / điểm trình của buổi không được tính |
| G4 | **Buổi nam nữ:** ghép không xét giới tính | 40 lần xem trước trên dữ liệu demo: 0 / 80 sân "2 nam đấu 2 nữ" (do nam trình cao hơn nữ nên cân trình tự ra 1 nam + 1 nữ) | Khi trình nam nữ gần nhau có thể ra 2 nam đấu 2 nữ |
| G5 | **Cặp muốn luôn đánh chung** trong buổi | Không có | Người điều phối đổi tay ở bản xem trước mỗi lượt |

## 2. Giải đấu

### 2.1 Service (API): luồng chính đã chạy đúng — 17 / 17 bước đạt, không lỗi

| Thể thức | Kiểm thật | Kết quả |
|---|---|---|
| **Vòng tròn**, đơn, 5 người, 2 sân | Lịch, hoà 3 người, chốt giải | 10 trận / 5 lượt, không ai đánh 2 trận cùng lượt, ước tính 75 phút. Ba người cùng 3 thắng, cùng hiệu số game → phân hạng theo hiệu số điểm (32 / 13 / 11). Chốt ra hạng 1–5 |
| **Vòng bảng + loại trực tiếp**, đôi **cặp đăng ký sẵn**, 8 cặp, 2 bảng, đi tiếp 2, tranh hạng 3 | Đăng ký, bốc thăm, rút giữa chừng, sơ đồ, chốt | Thiếu đồng đội → 422 `PARTNER_REQUIRED`; một người đứng 2 cặp → 409 `ALREADY_REGISTERED`; **bốc thăm giữ nguyên 8 cặp đã đăng ký** (không ghép ngẫu nhiên). Một cặp rút sau bốc thăm → 3 trận còn lại thành W.O. Bảng 1 hoà 3 đội 2 thắng vẫn phân hạng. Nhất bảng gặp nhì bảng kia ở bán kết; thắng vào chung kết, thua vào tranh hạng 3; gọi chung kết khi chưa có đội → 409 `TEAMS_NOT_SET`. Chốt: Vô địch / Á quân / Hạng 3 / Hạng 4 / 4 đội "Vòng bảng" |
| **Loại trực tiếp**, đôi nam nữ cặp sẵn, 6 cặp, 3 game × 21 | Đăng ký sai giới, sơ đồ có miễn đấu, bấm điểm, chốt | 2 nam đăng ký giải nam nữ → 422 `NOT_ELIGIBLE`. Sơ đồ 8, 2 hạt giống đầu miễn vòng 1. Bấm điểm trực tiếp 21–15, 17–21, 21–19 rồi xác nhận. Chốt ra Vô địch / Á quân / 2 Bán kết / 2 Tứ kết |
| Giới hạn số người, mở lại, huỷ | | Người thứ 5 (giới hạn 4) vào danh sách chờ; có người rút → được lên; huỷ bốc thăm mở lại đăng ký; huỷ giải |

Ngoài ra đã có (kiểm ở bước 2 plan 18): **bốc thăm ghép cặp cân bằng** (khác bốc ngẫu nhiên: chọn cách ghép để các
đội có trình gần nhau nhất), chia bảng rải hạt giống / theo trình, nhập tỉ số W.O. / bỏ cuộc, sửa kết quả, huỷ chốt.

### 2.2 Service: thiếu cho vận hành ngày thi đấu

| # | Thiếu | Chạy thật | Hậu quả |
|---|---|---|---|
| T1 | **"Gọi ra sân" không kiểm gì** | Một cặp đang đánh Sân 1 vẫn được gọi ra Sân 2; Sân 1 đang có trận vẫn gọi thêm trận; gọi ra "Sân 9" khi giải chỉ có 2 sân cũng được | Lỗi vận hành thật: một đội ở hai sân, hai trận một sân. Giải chỉ lưu **số sân**, không lưu **sân nào** |
| T2 | **Điểm danh ngày thi đấu** | Không có (404) | Đội vắng phải tìm và "rút" từng đội. Không có bước "chỉ bốc thăm những người đã có mặt" |
| T3 | **Đổi đồng đội** của cặp đã đăng ký | Không có (405) | Một người bận / đau trước giải → phải rút cả cặp rồi đăng ký lại, mất thứ tự ở danh sách chờ |
| T4 | **Lịch theo giờ và "gọi trận kế tiếp"** | Không có (404) | Giải chỉ có ngày, không có giờ bắt đầu; trận có "lượt" nhưng không có giờ dự kiến. Sân trống thì người điều hành tự dò trận nào kế tiếp, đội nào đang rảnh |
| T5 | **Khách tự đăng ký online** | Chưa có (06 mục 4.2 ghi "sau này") | Nhân viên nhập hết |
| T6 | **Dữ liệu demo** chỉ có giải "đôi nam nữ bốc thăm ghép cặp" | | Bàn thử không có giải đơn, giải cặp đăng ký sẵn, vòng tròn, loại trực tiếp để xem |

### 2.3 Bàn thử: vì sao "chỉ xem được"

API đã có gần đủ, nhưng màn hình giải trên bàn thử mới làm phần xem + vài nút (bốc thăm, khoá sơ đồ, gọi ra sân,
nhập tỉ số, bấm điểm, chốt). Thiếu:

| # | Thiếu trên bàn thử | API |
|---|---|---|
| P1 | **Tạo giải** (wizard 4 bước theo 06 mục 2, kèm gợi ý thể thức + ước tính thời gian), **Mở đăng ký**, **Huỷ giải** | Có |
| P2 | **Đăng ký**: chọn người, giải đôi cặp sẵn thì chọn **đồng đội**; **Rút**; danh sách hiện theo cặp + danh sách chờ | Có |
| P3 | **Bốc thăm**: giải cặp sẵn thì đổi **cả đội** giữa hai bảng (đổi người sẽ bị từ chối); xem trước **lịch theo lượt** và **sơ đồ**; **Mở lại đăng ký** | Có |
| P4 | **Sơ đồ loại trực tiếp**: xem trước, đổi hai ô, rồi khoá (hiện chỉ có "Khoá") | Có |
| P5 | Nhập tỉ số: **W.O. / bỏ cuộc giữa trận**; **thêm trận tay** | Có |
| P6 | Gọi ra sân: **chọn sân**, gợi ý trận kế tiếp; **TV cho giải** (sân đang đánh, trận sắp tới, bảng xếp hạng, sơ đồ) | Một phần (T1, T4) |

## 3. Đề xuất làm

**A. Service — sửa lỗi vận hành (nên làm):**
1. **T1** — giải lưu **danh sách sân** (`courtRefs`, như buổi giao lưu; `courtCount` = số sân). "Gọi ra sân" chặn:
   - sân không thuộc giải → 422 `COURT_NOT_IN_CONTEXT`;
   - sân đang có trận → 409 `COURT_BUSY`;
   - một người của trận đang đánh trận khác → 409 `PLAYER_BUSY` (kiểm theo người, nên chặn được cả người đánh hai
     nội dung).
2. **G1** — điểm danh khi đang có mặt ở buổi khác chưa đóng → 409 `PRESENT_ELSEWHERE` kèm tên buổi; nút "Cho rời buổi
   cũ rồi điểm danh" (chặn nếu đang ở sân bên buổi cũ).

**B. Service — tính năng vận hành giải:**
1. **T2 điểm danh:**
   - mỗi đội / người đăng ký có "đã có mặt";
   - **bốc thăm tại sân:** giải bật "cần điểm danh" thì bốc thăm chỉ lấy người đã điểm danh, người vắng sang danh sách
     chờ;
   - **đã bốc thăm trước:** nút "Xử W.O. các đội vắng" (dùng đúng đường rút lui hiện có).
2. **T3 đổi đồng đội** (trước bốc thăm): kiểm lại điều kiện giới / trình / tổng trình cặp, giữ thứ tự đăng ký.
3. **T4 lịch theo giờ + gọi trận kế tiếp:**
   - giải có **giờ bắt đầu**, mỗi lượt có giờ dự kiến;
   - API "trận kế tiếp cho sân X" chọn trận lượt sớm nhất mà mọi người đều rảnh, ưu tiên đội đã nghỉ lâu hơn;
   - người điều hành vẫn gọi tay được.
4. **T6 seed demo:** thêm giải đơn vòng tròn, giải đôi cặp sẵn vòng bảng + loại trực tiếp (đang đá vòng bảng), giải
   loại trực tiếp (đang dở); tái lập được như seed hiện tại.

**C. Bàn thử: tổ chức và vận hành giải trọn vòng** (P1–P6). Các thao tác bám theo tài liệu 07 mục 2 để bước 4 làm
lại y như vậy ở app chính:
- tạo giải, đăng ký, điểm danh;
- bốc thăm (xem trước lịch / sơ đồ), sơ đồ;
- gọi trận kế tiếp, nhập tỉ số (W.O. / bỏ cuộc), bấm điểm;
- chốt giải, TV giải.

**D. Tài liệu + test:** 02 (API mới, mã lỗi), 06 (mục 4, 7.4), 07 (màn hình giải, TV giải); test unit + integration
cho từng mục; chạy thật trọn 3 thể thức trên trình duyệt như mục 2.1, kèm điểm danh và gọi trận kế tiếp.

**Không làm trong plan này** (tuỳ câu trả lời mục 4): G2, G4, G5, T5, tự đóng buổi (G3).

## 4. Cần anh/chị chốt

1. **Bốc thăm lúc nào?**
   - **Khuyến nghị:** hỗ trợ cả hai. Giải CLB thường **điểm danh rồi bốc thăm tại sân**; giải lớn bốc trước, đội vắng
     xử W.O.
   - Hoặc chỉ một cách.
2. **Giải đôi giữ cả hai cách ghép cặp không?**
   - **Khuyến nghị:** giữ cả hai, **mặc định "cặp đăng ký sẵn"** (2 người đăng ký chung một đội, như anh/chị mô tả).
     "Bốc thăm ghép cặp cân bằng" là tuỳ chọn cho giải giao hữu đông người lẻ (không phải bốc ngẫu nhiên: máy chọn cách
     ghép để các đội có trình gần nhau nhất).
   - Hoặc bỏ hẳn bốc thăm ghép cặp.
3. **Giao lưu — làm thêm những gì?**
   - **Khuyến nghị:** G1 (trong A) + **G2 thay người giữa trận**.
   - G4 buổi nam nữ, G5 cặp cố định: chỉ làm nếu CLB của anh/chị hay gặp.
   - G3 tự đóng buổi: để sau.
4. **Khách tự đăng ký giải online (T5)?**
   - **Khuyến nghị:** để bước 4, vì cần màn hình app chính + đăng nhập khách hàng.

Trả lời **"code đi"** nghĩa là làm A + B + C + D, thêm G2, theo các khuyến nghị trên.

## 5. Anh/chị đã chốt (03/10)

> code đi — phần thay người giữa trận (đau chân, có việc phải về): xử thua luôn nếu không thể tiếp tục thi đấu (vì đây
> là giải); còn giao lưu thì "huỷ trận" hoặc "xong".

- Câu 1, 2, 4: theo khuyến nghị.
- Câu 3: làm G1. **Không làm thay người (G2).** Thay vào đó có thao tác **"Không đánh tiếp được"**:
  - **trận giải** → xử thua đội không đánh tiếp được:
    - kết quả "bỏ cuộc giữa trận", giữ các game đã xong, đối thủ thắng;
    - đang ở sơ đồ thì đối thủ đi tiếp;
    - bấm được ngay từ màn hình bấm điểm (chỉ nhân viên);
  - **trận giao lưu** → "Huỷ trận" hoặc "Xong (không tỉ số)" như hiện có, thêm vào màn hình bấm điểm cho tiện.
  - Trước giờ đánh mà vắng: điểm danh + "Xử W.O. các đội vắng" (mục 3 B1).

## 6. Kết quả — xong trên nhánh `feat/competition-tournament-ops` (03/10/2026), chờ duyệt merge

### 6.1 Đã làm

**Service (API 0.5.0, 91 → 100 thao tác, 1 migration chỉ thêm cột):**

| Mục | Làm gì |
|---|---|
| T1 gọi ra sân | Giải có **danh sách sân** (`courtRefs`, sửa được trong ngày qua `PUT …/courts`). "Gọi ra sân" kiểm trên **mọi giải / buổi** của chuỗi: sân đang có trận → 409 `COURT_BUSY`; người đang đánh ở sân khác → 409 `PLAYER_BUSY` (kèm tên, sân); sân ngoài giải → 422 `COURT_NOT_IN_CONTEXT`. Giải cũ chưa có danh sách sân vẫn chạy (chỉ kiểm bận) |
| T2 điểm danh | Điểm danh / bỏ điểm danh **từng người**. Giải "bốc thăm tại sân": bốc thăm chỉ lấy người đã điểm danh (đôi cặp sẵn thiếu một người = cả cặp vắng → danh sách chờ lý do `absent`, mở lại thì trở lại). Bốc trước: `GET / POST …/no-shows` xem danh sách đội vắng rồi xử W.O. theo đúng đường rút lui |
| T3 đổi đồng đội | `PUT …/entries/{id}/partner` (trước bốc thăm): người cũ rời giải, người mới vào đúng chỗ của cặp, kiểm lại điều kiện |
| T4 lịch theo giờ, trận kế tiếp | `startTime` → `expectedTime` từng lượt. `GET …/next-matches`: trận gọi được (nghỉ đủ 5 phút trước → lượt sớm hơn → nghỉ lâu hơn) + `blocked` (trận đang chờ ai, ở sân nào). `POST …/call-next {courtRef}` |
| G1 giao lưu | Điểm danh người đang có mặt ở buổi khác chưa đóng → 409 `PRESENT_ELSEWHERE` (kèm id buổi kia) |
| Không đánh tiếp được | `POST /v1/matches/{id}/live/retire {side, revision}`: trận giải → đội đó thua (`retired`), giữ game đã xong, đối thủ thắng / đi tiếp. Chỉ nhân viên; trận giao lưu → 409 `RESULT_NOT_REQUIRED` |
| Sửa lỗi phát hiện khi làm | Hai đội đã rút gặp nhau ở sơ đồ loại trực tiếp: trước đây trận đó "chờ" mãi, **chặn chốt giải**. Giờ xử cho ô A đi tiếp như đội đã rút → gặp đội còn thi đấu ở vòng sau thì đội đó thắng W.O. |
| T6 seed demo | Thêm 14 người chơi riêng + 3 giải hôm nay: đơn nữ vòng tròn (đang đánh, có tỉ số dở ở Sân 4), đôi cặp đăng ký sẵn vòng bảng + loại trực tiếp (lượt 1 đã đánh, Sân 5–6), đơn nam bốc thăm tại sân (6 đăng ký, 4 đã điểm danh, Sân 7–8). Không ai vừa ở buổi giao lưu đang diễn ra vừa ở giải. Dữ liệu cũ giữ nguyên |

**Bàn thử:** màn hình giải làm lại để **tổ chức và vận hành trọn vòng**:
- tạo giải (4 phần như wizard, phần "Xem lại" gợi ý thể thức + ước tính giờ xong), mở đăng ký, huỷ;
- đăng ký **theo cặp** (chọn người + đồng đội; chưa có điểm → chấm nhanh rồi đăng ký), đổi đồng đội, rút, **điểm danh
  bấm tên**;
- bốc thăm: người vắng, đổi chỗ **cả đội** giữa hai bảng / hai ô (giải cặp sẵn không tách cặp), lịch theo lượt kèm giờ;
- khối **Sân**: sân đang đánh (bảng điểm), sân trống + trận kế tiếp + "Gọi trận kế tiếp" / "Chọn trận khác…", lý do
  chưa gọi được;
- lịch: gọi ra sân chọn sân, "chờ: X đang ở Sân Y"; nhập tỉ số có **W.O. / bỏ cuộc giữa trận**; thêm trận tay;
- sơ đồ loại trực tiếp: xem trước, đổi ô (cảnh báo "cùng bảng"), khoá; "Xử W.O. đội vắng"; "Sân của giải";
- **TV của giải** (`/tv?tournament=…`); màn hình bấm điểm có **"Không đánh tiếp được…"**; điểm danh giao lưu hỏi "Rời
  buổi kia rồi điểm danh?".

**Tài liệu:** 02 (endpoint, mã lỗi), 06 (mục 2, 4.2, 4.5, 7.4, 8.2, **mục 14 mới**: chốt khi code), 07 (tạo giải, tab
**Sân**, các tab, bấm điểm, TV), README.

### 6.2 Kiểm thử thật

| Kiểm | Kết quả |
|---|---|
| Toàn bộ test service, MySQL 9.5 | **285 / 285** đạt (thêm 19: 7 unit, 12 integration) |
| Toàn bộ test service, MySQL 8.4.11 bắt buộc khoá chính (kiểu Aiven) | **285 / 285** đạt |
| Seed demo chạy 2 lần, so dấu vân tay (gồm mọi giải, đăng ký, điểm danh, trận, tỉ số dở) | **Giống hệt**; phần dữ liệu cũ ra như trước (Sân 1 16–12, Sân 2 10–5, Sân 3 2–8) |
| Bàn thử trên trình duyệt (bản kiểm riêng: service + DB tạm, đã xoá) | Tạo giải đôi cặp sẵn "bốc thăm tại sân" qua form → đăng ký 5 cặp → đổi đồng đội 1 cặp → điểm danh 9 / 10 người → xem trước bốc thăm: 4 cặp, cặp thiếu người ở mục "Vắng" → xác nhận → cặp đó "chờ — vắng lúc bốc" → "Gọi trận kế tiếp" 2 sân. Giải demo cặp sẵn: gọi trận có người đang ở Sân 5 ra Sân 6 → 409 `PLAYER_BUSY`, lịch ghi "chờ: … đang ở Sân 5". Màn hình bấm điểm "Không đánh tiếp được" → đội kia thắng, "← Về giải đấu". Sơ đồ: đổi ô → cảnh báo "cùng bảng", khoá → bán kết. TV giải. Giao lưu: điểm danh người đang ở buổi demo → hỏi → rời buổi kia + điểm danh. Không có lỗi JavaScript |

### 6.3 Còn lại / không làm

- Không làm (theo mục 5): thay người giữa trận, buổi nam nữ, cặp cố định trong buổi, tự đóng buổi, khách tự đăng ký
  online (bước 4).
- "Xếp sân trống" của giao lưu chưa trừ người đang đánh ở giải khác (06 mục 14) — hiếm, để sau.
- DB dev của anh/chị **đã migrate** (thêm cột, không đổi dữ liệu) nhưng **chưa seed lại** — muốn có 3 giải "hôm nay"
  để thử thì nói "seed lại".

## 7. Bấm thử như người dùng thật (03/10) — chỗ khó dùng và kế hoạch sửa

- **Chủ dự án:** "từng chức năng thì tạm ổn, nhưng test đúng flow user dùng thử xem, tôi đang gặp khó khăn khi sử dụng".
- **Cách thử:**
  - Chrome chạy ngầm, cỡ laptop 1366 × 768 và điện thoại 390 × 844;
  - chỉ bấm chuột vào nút / gõ phím như người dùng, chụp màn hình từng bước;
  - bản kiểm riêng (DB tạm, seed demo, đã xoá);
  - kịch bản ở scratchpad `ux/` — không vào repo.
- **Luồng đã chạy (vai Quản lý):** tạo giải đôi CLB "cặp đăng ký sẵn", vòng bảng + loại trực tiếp, bốc thăm tại sân
  → đăng ký 8 cặp → điểm danh 15 / 16 người → bốc thăm (cặp thiếu người sang danh sách chờ) → gọi trận kế tiếp → bấm
  điểm trên cửa sổ riêng → xác nhận → quay về → nhập tỉ số các trận còn lại → khoá sơ đồ → bán kết, tranh hạng 3,
  chung kết → chốt. **Đi được tới cuối, không lỗi JavaScript**, nhưng gặp các chỗ dưới đây.

### 7.1 Lỗi (thấy khi bấm thử)

| # | Chuyện gì xảy ra | Vì sao |
|---|---|---|
| L1 | **Sân hiện gợi ý một trận, bấm "Gọi trận kế tiếp" lại gọi trận khác** (Sân 5 hiện "Bảng 1 · lượt 2", gọi ra "Bảng 2 · lượt 1") | Nút gọi "trận đầu danh sách" phía service, còn màn hình chia gợi ý theo từng sân |
| L2 | **Sân trống báo "Chưa có trận gọi được" dù còn 3 trận gọi được** | Sân đang bận việc khác (giải demo khác) vẫn được chia gợi ý, "ăn" mất trận |
| L3 | **Đang chọn người ở ô điểm danh giao lưu thì mất lựa chọn** khi máy khác lưu kết quả / xếp sân | Mỗi lần có cập nhật, trang tự tải lại toàn bộ |
| L4 | Hộp "Chọn trận khác…" đang mở không cập nhật; bấm vào trận vừa có kết quả → lỗi kỹ thuật "409 INVALID_STATE" | Như L3, và lỗi không được dịch ra câu dễ hiểu |
| L5 | **Chốt giải xong, cột danh sách bên trái vẫn ghi "Đang đấu"** | Danh sách giải không tải lại sau thao tác |

### 7.2 Khó dùng

| # | Chỗ khó | Bằng chứng |
|---|---|---|
| K1 | **Một trang dài chứa mọi thứ.** Đầu trang 9 nút ngang hàng (Bốc thăm lại, Mở lại đăng ký, Xử W.O., Thêm trận tay, Xem trước khi chốt, TV, Sân của giải, Huỷ giải, Tải lại); bảng đăng ký vẫn chiếm giữa trang khi đang thi đấu / đã chốt; lịch ở cuối | Mỗi lần nhập tỉ số phải cuộn xuống 1 100–1 600 px |
| K2 | **Không biết bước tiếp theo.** Vừa tạo giải (0 người) nút nổi bật nhất là "Bốc thăm…"; giai đoạn nào cần làm gì không được nói | Ảnh 04 |
| K3 | **Người / sân "bận" do dữ liệu demo không được báo trước.** Form tạo giải chọn sẵn Sân 4 – 5 (Sân 4 đang có giải demo); ô chọn người không cho biết ai đang đánh ở buổi giao lưu demo → giải tự tạo bị chặn trận lượt 1 | Lịch: "chờ: Ngô Đức Phúc đang ở Sân 3, Lâm Bích Ngọc đang ở Sân 4" |
| K4 | **Điểm danh không giống điểm danh:** tên người là nút trơn, chưa / đã điểm danh khác nhau ít; mỗi người một lần bấm, không có "cả cặp" | 15 lần bấm / 20 giây cho 15 người |
| K5 | **Chọn người bằng danh sách thả xuống dài** (39 tên kèm điểm), không gõ tìm được | Ảnh 06 |
| K6 | **Lịch rối:** chữ "chờ" hai nghĩa (chưa đánh / đang chờ người ở sân khác), mỗi hàng 2 nút xếp chồng, cao | Ảnh 10 |
| K7 | **Điện thoại:** thanh trên chiếm 1/4 màn hình, danh sách giải nằm trước, khối Sân cách đầu trang 1 344 px, tràn ngang 3 px | Ảnh 21 |

### 7.3 Đề xuất sửa (bàn thử + tài liệu 07 cho bước 4; service không đổi trừ một chỗ nhỏ nếu cần)

**A. Sửa lỗi:**
1. **L1, L2:** nút trên mỗi sân là **"Gọi trận này"**, gọi đúng trận đang hiện. Sân bận việc khác không nhận gợi ý.
2. **L3, L4:** đang thao tác dở (đã chọn trong ô, đang mở form / hộp) thì **không tự tải lại**. Thay vào đó hiện dải
   "Có cập nhật mới — bấm để tải lại" (tự tải khi thao tác xong). Hộp chọn trận tự làm mới. Lỗi 409 hiện câu dễ hiểu,
   vd "Trận này vừa có kết quả ở máy khác".
3. **L5:** tải lại danh sách giải sau mọi thao tác đổi trạng thái.

**B. Dễ dùng hơn:**
1. **K1 — chia tab** như tài liệu 07: **Sân** · **Đăng ký & điểm danh** · **Lịch & kết quả** · **Bảng đấu / Sơ đồ** ·
   **Kết quả chung cuộc**.
   - Tự mở đúng tab theo giai đoạn: đang nhận đăng ký → Đăng ký; ngày thi đấu → Sân; đã chốt → Kết quả.
   - Nút ít dùng gom vào **"Thêm ▾"**: mở lại đăng ký, bốc thăm lại, thêm trận tay, sân của giải, huỷ giải.
2. **K2 — thanh tiến trình** đầu trang: ① Đăng ký → ② Điểm danh → ③ Bốc thăm → ④ Vòng bảng → ⑤ Loại trực tiếp →
   ⑥ Chốt. Bước hiện tại sáng lên, kèm **một nút chính** đúng bước và một câu "việc cần làm", vd "Còn 3 trận vòng bảng
   — xong thì khoá sơ đồ".
3. **K3:**
   - ô chọn sân ghi "(đang có trận)" và không chọn sẵn sân đang bận;
   - ô chọn người ghi "đang ở buổi giao lưu / đang đánh Sân 3" và xếp xuống cuối.
4. **K4 — điểm danh dạng ô tích ☐ / ☑** rõ ràng, thêm "☑ cả cặp" một chạm, ô "Chỉ hiện người chưa đến".
5. **K5 — ô gõ tìm tên** (lọc ngay khi gõ) cho người chơi / đồng đội.
6. **K6 — lịch gọn:**
   - lọc "Sắp tới / Đang đánh / Đã xong";
   - mỗi hàng một dòng, hai đội cùng dòng;
   - trạng thái rõ: "chưa đánh", "chờ: X đang ở Sân 3", "đang đánh Sân 5", "21–13".
7. **K7 — điện thoại:**
   - thanh trên gọn (vai trò vào menu);
   - chọn giải bằng ô chọn thay cho cột trái;
   - tab Sân lên đầu, nút to, không tràn ngang.

**C. Kiểm lại:** chạy lại đúng kịch bản bấm thử ở trên (laptop + điện thoại) trước và sau khi sửa, so số lần bấm /
cuộn, chụp ảnh. Cập nhật tài liệu 07 (tab, thanh tiến trình, điểm danh ô tích, tìm tên) cho bước 4.

**Cần anh/chị chốt:** làm A + B theo thứ tự trên? Trả lời **"code đi"** là làm hết A + B + C. Nếu chỉ muốn sửa lỗi
trước thì nói "chỉ A".

### 7.4 Kết quả (chủ dự án "code đi", 03/10)

**Đã làm** — bàn thử (không vào repo) + tài liệu 07 (cho bước 4). **Service không đổi.**
- **A. Lỗi:**
  - L1 / L2: nút trên mỗi sân thành "Gọi trận này ra Sân n", gọi đúng trận đang hiện; sân bận việc khác không nhận gợi ý;
  - L3: đang thao tác dở thì không tự tải lại — dải "Có cập nhật mới", xong thì tự tải; dùng cho cả trang giải và trang
    giao lưu;
  - L4: hộp "Chọn trận khác…" lấy danh sách mới lúc mở; lỗi do máy khác vừa đổi hiện câu dễ hiểu, mã lỗi để nhỏ;
  - L5: dòng của giải ở cột trái cập nhật mỗi lần mở / tải lại giải.
- **B. Dễ dùng:** thanh tiến trình + "việc cần làm" + một nút chính; 5 tab tự mở theo giai đoạn; "Thêm ▾"; điểm danh ô
  tích + "☑ cả cặp" + lọc chưa đến; ô gõ tìm tên không dấu, con trỏ tự về sau mỗi lần đăng ký; người / sân đang bận có
  ghi chú (form tạo giải chỉ chọn sẵn sân không đang dùng); lịch lọc Sắp tới / Đang đánh / Đã xong, mỗi trận một hàng;
  giao diện điện thoại.

**Bấm thử lại đúng kịch bản** (Chrome chạy ngầm, chỉ bấm chuột / gõ phím, DB tạm đã xoá):

| Việc | Trước | Sau |
|---|---|---|
| Vừa tạo giải | Nút nổi bật nhất "Bốc thăm…" (0 người), không biết làm gì | Tab Đăng ký mở sẵn, "Đăng ký các cặp — đang có 0 cặp", thanh tiến trình ở bước 1 |
| Sân chọn sẵn khi tạo giải | Sân 4 – 5 (Sân 4 đang có giải demo → trận phải chờ) | Sân 7 – 8 (không đang dùng); mỗi sân ghi đang được ai dùng |
| Đăng ký 8 cặp | 2 ô chọn 39 tên; không biết ai đang bận | Gõ "ly cong" + Enter; gõ người đang đánh giao lưu → "⚠ đang đánh Sân 3 (giao lưu)"; con trỏ tự về ô tìm |
| Điểm danh 15 / 16 người | 15 lần bấm, 20 giây; nút tên trơn | **8 lần bấm, 14 giây** ("☑ cả cặp"); lọc còn đúng cặp thiếu người |
| Sau bốc thăm | Đầu trang **9 nút**, một trang dài | **3 nút** (TV, Thêm ▾, Tải lại); tự mở tab **Sân** |
| Gọi trận ra sân | Sân 5 hiện "Bảng 1 · lượt 2" nhưng gọi ra "Bảng 2 · lượt 1"; sân trống báo "chưa có trận" dù còn 3 trận | Bấm Sân 8 trước rồi Sân 7: **cả hai đúng trận đang hiện** |
| Nhập tỉ số các trận | Cuộn xuống **1 100 – 1 600 px** mỗi lần | Tab Lịch, lọc "Sắp tới": vị trí cuộn **6 px** |
| Sang loại trực tiếp / chốt | Tự tìm nút trong 9 nút | Nút chính ở "việc cần làm": "Sơ đồ loại trực tiếp…" → "Chốt giải…" → tự mở tab Kết quả |
| Sau khi chốt | Cột trái vẫn "Đang đấu" | "Đã chốt" |
| Đang chọn người điểm danh (giao lưu), máy khác bấm "Xong" một sân | **Mất lựa chọn** | Lựa chọn còn, dải "Có cập nhật mới"; điểm danh xong trang tự cập nhật |
| Hộp "Chọn trận" mở, máy khác ghi kết quả trận đó, bấm vào | "409 INVALID_STATE — Chỉ gọi ra sân được trận đang chờ" | "Trận này vừa được gọi hoặc vừa có kết quả ở máy khác — đã tải lại." |
| Điện thoại 390 px | Thanh trên chiếm 1/4 màn hình, khối Sân ở 1 344 px, tràn ngang | Không tràn ngang; chọn giải bằng ô chọn; **nút "Gọi trận này" ở 819 px** (màn hình đầu) |
| TV giải / TV giao lưu / bảng xếp hạng / tự chấm trình / màn hình bấm điểm | — | Vẫn chạy, không lỗi JavaScript |

**Còn lại:** trang giao lưu chỉ được thêm phần "không làm mất thao tác dở" (chủ dự án đánh giá luồng giao lưu ổn); ô
chọn người điểm danh giao lưu vẫn là danh sách thả xuống.
