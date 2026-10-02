# Kế hoạch: rà luồng giao lưu + giải đấu, đưa giải đấu từ "xem được" sang "tổ chức và vận hành được"

- **Ngày:** 03/10/2026.
- **Trạng thái:** đã duyệt (03/10, câu trả lời ở mục 5) → đang làm.
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
