# Kế hoạch: bấm điểm trực tiếp từng trận, tỉ số lên màn hình TV ngay

- **Nhánh:** `feat/competition-live-score`, tách từ `main` @ `e47a00d`.
- **Ngày:** 02/10/2026.
- **Trạng thái:** đã duyệt ("code đi", theo cả 3 khuyến nghị ở mục 7) → đã làm, kết quả ở mục 8–9; chờ duyệt merge.
- **Phạm vi:** chỉ `services/competition-service` (cùng bàn thử để bấm thử). App chính chưa sửa — giao diện thật
  thuộc bước 4 của plan 18.

## 1. Yêu cầu và cách hiểu

Chủ dự án: *"thêm tính năng tính điểm của mỗi trận đấu, số điểm cập nhật liên tục lên màn hình TV"*.

Tôi hiểu là:
- trong lúc đánh, một người cầm điện thoại **bấm từng điểm** (pha cầu) cho đội thắng pha đó;
- hệ thống tự tính tỉ số theo luật cầu lông của trận (21 điểm, cách 2, trần 30, số game…), tự biết hết game, hết trận;
- **màn hình TV hiện tỉ số đang đánh của từng sân**, đổi ngay khi bấm, không cần tải lại;
- áp dụng cho **mọi trận**: trận giải và trận giao lưu.

Nếu ý anh/chị là *điểm trình* thay đổi sau mỗi trận thì đó là việc khác — nói tôi.

## 2. Hiện trạng

- Tỉ số chỉ nhập **một lần sau khi đánh xong** ("Nhập tỉ số" → `PUT /v1/matches/{id}/result`). Trong lúc đánh, hệ
  thống không biết tỉ số.
- Màn hình TV (bàn thử) tự tải lại 5 giây một lần; mỗi sân chỉ có tên hai đội và đồng hồ.
- Tài liệu 07 dự kiến TV ở app chính nghe SSE sẵn có của app chính, app chính chuyển tiếp sự kiện
  `competition.match.completed`. Sự kiện đó đi qua **outbox**: gửi 5 giây một lần, lỗi thì thử lại tới 24 giờ. Cách
  này hợp với kết quả trận, **không hợp với từng điểm**: điểm đến trễ 5 giây là đã lỡ nhịp, đến trễ vài phút là sai.

## 3. Thiết kế

### 3.1 Màn hình bấm điểm (điện thoại, cầm dọc)

- Hai nửa màn hình to: **Đội A | Đội B** (tên, điểm game đang đánh). Chạm nửa nào thì đội đó được 1 điểm.
- Dòng trên: "Game 2", các game đã xong (vd 21–18), **biểu tượng cầu ở đội đang giao** kèm "giao ô phải / trái".
- Nút **Hoàn tác**: bỏ điểm vừa bấm, kể cả điểm vừa kết thúc game.
- Trước điểm đầu tiên: chọn đội giao trước (mặc định đội A).
- Đủ điểm thắng trận: hiện *"Trận đã xong: 21–18, 21–15"* và nút **Xác nhận kết quả** (ai được xác nhận: mục 7).
- **Không cộng trùng:** mỗi lần bấm gửi kèm "phiên bản tỉ số đã thấy". Bấm hai lần do mạng chậm, hoặc hai máy cùng bấm
  một trận → chỉ một lần được tính; máy kia được báo và tự tải lại tỉ số.

### 3.2 Màn hình TV

- Mỗi sân đang đánh: tên hai đội, **tỉ số game đang đánh thật to**, các game đã xong nhỏ bên dưới, cầu ở đội đang
  giao.
- Sân chưa ai bấm điểm thì hiện như bây giờ (tên + đồng hồ).
- Đổi số ngay khi bấm. Mục tiêu dưới 1 giây (sẽ đo).
- Xác nhận kết quả xong thì sân trống và ô "Chuẩn bị vào sân" hiện ngay, không chờ vòng tải lại.

### 3.3 Luật tính (hàm thuần, có test riêng)

- Dùng chính luật đang kiểm tỉ số (`badmintonScore`):
  - game xong khi đủ P điểm và cách ≥ 2, hoặc chạm trần C;
  - trận xong khi một đội thắng ⌈số game / 2⌉ game.
- **Đội giao** = đội thắng pha trước. Điểm đầu trận: đội được chọn giao trước. Sang game mới, đội thắng game trước giao
  — trùng luật trên.
- **Ô giao:** điểm của đội giao chẵn → ô phải, lẻ → ô trái (luật BWF, đúng cho cả đơn và đôi).
- Đã đủ điểm thắng trận thì không bấm thêm được; chỉ còn xác nhận hoặc hoàn tác.

### 3.4 Dữ liệu

- Bảng mới `match_live_scores`, một dòng cho mỗi trận đã bấm điểm. Lưu:
  - chuỗi pha cầu, mỗi ký tự là đội thắng pha đó (vd `ABBA…`);
  - đội giao trước, phiên bản, người bấm cuối, giờ.
- Tỉ số luôn **tính lại từ chuỗi**: hoàn tác chỉ là bỏ ký tự cuối, không bao giờ lệch. Chuỗi còn giữ lại được để làm
  thống kê sau này.
- Kết quả chính thức vẫn ở `matches.games` như hiện nay, chỉ ghi khi xác nhận.
- Bấm điểm **không đổi `version` của trận**, nên không làm hỏng If-Match của "Nhập tỉ số", và không khoá dòng trận /
  buổi lâu.

### 3.5 API (module `match`)

| Endpoint | Việc |
|---|---|
| `GET /v1/matches/{id}/live` | Tỉ số đang đánh (kèm chuỗi pha cầu) |
| `POST /v1/matches/{id}/live/rallies` `{ side, revision }` | +1 điểm cho đội `side` |
| `POST /v1/matches/{id}/live/undo` `{ revision }` | Bỏ điểm vừa bấm |
| `PUT /v1/matches/{id}/live/server` `{ firstServer, revision }` | Chọn đội giao trước, chỉ trước điểm đầu tiên |
| `POST /v1/matches/{id}/live/confirm` `{ revision }` | Lưu kết quả từ tỉ số đã bấm, cùng đường với "Nhập tỉ số" (xem dưới) |

- **Xác nhận** đi cùng đường với "Nhập tỉ số": điểm trình, nhả sân giao lưu, người thắng vào trận sau, sự kiện
  `competition.match.completed`.
- Mọi chỗ trả về trận có thêm `live` (`null` nếu chưa bấm điểm), nên màn hình lớn có sẵn tỉ số từng sân.
- Mã lỗi mới:
  - `LIVE_CONFLICT` (409): phiên bản lệch; trả kèm tỉ số hiện tại;
  - `MATCH_DECIDED` (409): đã đủ điểm thắng;
  - `MATCH_NOT_DECIDED` (409): xác nhận khi chưa xong trận.
- Trận không còn "đang đánh" → 409 `INVALID_STATE` như các thao tác khác.

### 3.6 Đẩy tỉ số lên TV ngay: luồng SSE của service

Thêm `GET /v1/sessions/{id}/stream` và `GET /v1/tournaments/{id}/stream` (`text/event-stream`). Các sự kiện:

| Sự kiện | Khi nào | TV làm gì |
|---|---|---|
| `snapshot` | Vừa kết nối (cả khi tự nối lại) | Vẽ tỉ số mọi trận đang đánh |
| `score` | Mỗi lần bấm / hoàn tác: `{ matchId, courtRef, live }` | Đổi số của sân đó, không tải gì thêm |
| `board` | Xếp sân, xác nhận, xong, huỷ trận, điểm danh, rời buổi, đóng buổi | Tải lại màn hình lớn |
| `ping` | 25 giây một lần | Biết kết nối còn sống; proxy không cắt kết nối im lặng (như SSE của app chính) |

Cách chạy:
- chỉ phát **sau khi transaction commit**, nên TV không bao giờ thấy dữ liệu chưa lưu;
- token hết hạn (tối đa 5 phút) thì service đóng luồng; trình duyệt tự nối lại và gateway ký token mới. App chính cũng
  đóng SSE sau 20 phút vì cùng lý do;
- tắt service thì đóng mọi luồng trước, để không treo lúc tắt;
- dự phòng: luồng lỗi thì TV vẫn tự tải lại màn hình lớn 10 giây một lần (đúng tài liệu 07).

Vì sao không đi qua outbox: xem mục 2. Outbox vẫn phát `competition.match.completed` khi xác nhận, như cũ.

**Giới hạn:** sự kiện phát trong bộ nhớ của một process. Như vậy đúng khi service chạy một bản, mà mọi cách triển
khai hiện có đều một bản (Render demo, docker compose). Chạy nhiều bản thì cần thêm Redis pub/sub, hoặc cho luồng tự
đọc DB mỗi giây. Sẽ ghi rõ ở tài liệu 01.

**Bước 4:** gateway của app chính chuyển tiếp luồng này nguyên trạng (không đệm). Đường stream được ký token 5 phút
để không phải nối lại mỗi phút.

### 3.7 Quyền

Thêm scope mới `match:score`, nghĩa là "chỉ bấm điểm".

| Ai | Được làm gì |
|---|---|
| Nhân viên (scope `…:operate` sẵn có) | Bấm điểm và xác nhận mọi trận trong chi nhánh |
| Token có `match:score` + `player` | Chỉ bấm điểm trận **mình đang đánh**; service kiểm người chơi có trong trận |
| Xác nhận kết quả | Theo quyết định ở mục 7 |
| Xem luồng TV | Scope đọc sẵn có (`session:read` / `tournament:read`); màn hình TV hiện tại dùng được ngay |

Bảng vai trò → scope của gateway (tài liệu 02 mục 5) sẽ thêm `match:score` cho `customer` nếu anh/chị chọn cho người
chơi bấm điểm.

## 4. Việc sẽ làm

- **A. Luật tính** `match/domain/liveScore.js`, hàm thuần: chuỗi pha cầu + luật trận → các game đã xong, game đang
  đánh, đội giao, ô giao, đã xong trận chưa, đội thắng.
- **B. Dữ liệu + service:**
  - migration `match_live_scores`; xoá trận (huỷ bốc thăm, gỡ migration) thì xoá theo;
  - `matchService`: xem, +1 điểm, hoàn tác, chọn đội giao, xác nhận;
  - trận trả về kèm `live`.
- **C. Đẩy sự kiện:**
  - `platform/realtime` (phát / nghe trong bộ nhớ) và helper SSE (ping, đóng khi token hết hạn, đóng khi tắt service);
  - hai route stream;
  - phát `score` / `board` sau commit từ trận, buổi giao lưu, giải.
- **D. Hợp đồng:**
  - OpenAPI: thêm 7 thao tác, schema `MatchLive`, `Match.live`;
  - scope `match:score`, mã lỗi mới.
- **E. Seed demo:** ở buổi giao lưu đang diễn ra, các sân đang đánh có sẵn tỉ số dở, bấm qua chính API, tái lập được.
  Mở TV là thấy số ngay.
- **F. Tài liệu:**
  - 06 (mục mới "Bấm điểm trực tiếp"), 02 (API, lỗi, luồng, scope, bảng gateway), 07 (màn hình bấm điểm, TV), 01
    (realtime, giới hạn một bản), README;
  - plan này (kết quả), `00-tien-do.md` mục 19.
- **G. Bàn thử** (ngoài repo, không commit):
  - màn hình bấm điểm cho vai nhân viên và vai "người chơi trong trận";
  - TV nghe luồng;
  - proxy chuyển luồng không đệm.

## 5. Kiểm thử thật

- **Unit luật tính:**
  - các ca game: 21–19 xong game; 20–20 → phải tới 22–20; 29–29 → 30–29 là xong (trần);
  - đánh 3 game: 1–1 thì sang game 3; xong trận thì chặn bấm thêm;
  - hoàn tác qua ranh giới game;
  - đội giao và ô giao từng điểm;
  - luật 15 / 21 và 1 game 31 / 40.
- **Integration (API + MySQL thật, response kiểm theo OpenAPI như mọi test hiện có):**
  - nhân viên bấm hết trận rồi xác nhận → trận `completed`, `games` đúng tỉ số đã bấm. Giao lưu: sân được nhả, màn hình
    lớn hiện "Chuẩn bị vào sân". Giải: người thắng vào trận sau, phát `competition.match.completed`;
  - hai lần bấm cùng phiên bản → một lần 409 `LIVE_CONFLICT`, tỉ số chỉ cộng 1;
  - **chịu tải:** 3 sân bấm dồn dập song song, cùng lúc có "Xếp sân trống" và điểm danh → không deadlock, không mất
    điểm, tỉ số cuối đúng bằng số lần bấm thành công;
  - phân quyền:
    - người chơi trong trận bấm được;
    - người ngoài trận → 403; chi nhánh khác → 404;
    - xác nhận đúng quy tắc chốt ở mục 7;
  - nhập tỉ số tay giữa chừng → bấm tiếp bị chặn (409);
  - luồng:
    - kết nối nhận `snapshot`;
    - bấm điểm → nhận `score` (đo độ trễ);
    - xác nhận → nhận `board`;
    - token hết hạn → luồng tự đóng;
    - thiếu token / thiếu scope / chi nhánh khác → 401 / 403 / 404.
- **Chạy lại toàn bộ:**
  - `npm test` trên MySQL 9.5 và MySQL 8.4 kiểu Aiven;
  - image Docker production + kịch bản HTTP, thêm bấm điểm và đọc luồng;
  - seed demo 2 lần ra giống hệt.
- **Bàn thử trên trình duyệt:**
  - bấm điểm trên khung điện thoại (390×844) hết một trận;
  - tab TV đổi số ngay theo từng điểm; đo độ trễ từ lúc bấm tới lúc TV đổi;
  - xác nhận xong thì TV hiện sân trống và "Chuẩn bị vào sân".

## 6. Không làm

- Không theo dõi **người nào** trong đôi đang giao. Không nhắc đổi sân / nghỉ ở điểm 11.
- Không làm thống kê từ chuỗi pha cầu (chuỗi điểm dài nhất, lội ngược dòng…). Dữ liệu đã lưu, làm sau được.
- Không làm màn hình TV riêng cho giải: chưa có màn hình nào như vậy. Luồng của giải có sẵn cho bước 4.
- Giao diện thật trong app chính: bước 4.
- Không chạy nhiều bản service (xem giới hạn ở 3.6).

## 7. Cần anh/chị chốt

1. **Ai được bấm điểm?**
   - **Khuyến nghị:** nhân viên + **người chơi trong trận** (bấm trên điện thoại của mình). Ở giao lưu thường không
     có nhân viên đứng từng sân.
   - Hoặc: chỉ nhân viên.
   - Hoặc: thêm máy tính bảng đặt ở sân. Cần thêm loại tài khoản "thiết bị" ở app chính nên để bước 4; API không đổi.
2. **Đủ điểm thắng thì sao?**
   - **Khuyến nghị:** người bấm thấy "Trận đã xong" và bấm **Xác nhận kết quả** một lần (bấm nhầm điểm cuối thì còn
     hoàn tác được).
     - Trận **không tính điểm** (giao lưu tắt tính điểm): người chơi trong trận tự xác nhận được.
     - Trận **tính điểm** (giải, giao lưu bật tính điểm): chỉ nhân viên xác nhận, tỉ số điền sẵn, một chạm. Như vậy
       không ai tự bấm điểm có lợi cho mình rồi tự lưu.
   - Hoặc: tự lưu ngay khi đủ điểm, không cần xác nhận. Nhanh hơn, nhưng bấm nhầm điểm cuối thì phải "sửa kết quả".
3. **Seed demo có sẵn tỉ số dở ở các sân đang đánh** để mở TV là thấy số: khuyến nghị **có**.

Trả lời "code đi" nghĩa là làm theo các khuyến nghị trên.

## 8. Kết quả — xong trên nhánh `feat/competition-live-score` (02/10/2026), chờ duyệt merge

Chủ dự án duyệt "code đi" theo cả 3 khuyến nghị:
- nhân viên + người chơi trong trận bấm điểm;
- trận không tính điểm thì người chơi tự xác nhận, trận tính điểm thì nhân viên xác nhận;
- seed có sẵn tỉ số dở.

**Đã làm** (đúng các mục A–G ở mục 4):

- **Luật tính** `match/domain/liveScore.js`: chuỗi pha cầu → game đã xong, game đang đánh, đội giao, ô giao, xong trận.
- **Dữ liệu + service:**
  - bảng `match_live_scores` (migration `20261002100001`; xoá trận thì xoá theo);
  - `match/application/liveScoring.js`: bấm, hoàn tác, chọn đội giao, xác nhận, snapshot cho luồng;
  - "Nhập tỉ số" và "Xác nhận" đi chung `applyResult`;
  - mọi trận trả về kèm `live`; `GET /v1/matches/{id}` mở cho người chơi trong trận.
- **Đẩy sự kiện:**
  - `platform/realtime` (phát sau commit, gộp `board`) và `platform/http/sse.js` (snapshot, `ping`, đóng khi token hết
    hạn, đóng hết khi tắt service);
  - luồng `GET /v1/sessions/{id}/stream` và `GET /v1/tournaments/{id}/stream`;
  - trận, buổi, giải phát `board` khi đổi.
- **Hợp đồng:**
  - OpenAPI 0.4.0: **91 thao tác** (thêm 7), schema `MatchLive`, `MatchView.live`;
  - scope `match:score`; mã lỗi mới `LIVE_CONFLICT`, `MATCH_DECIDED`, `MATCH_NOT_DECIDED`, `NOTHING_TO_UNDO`,
    `RALLIES_STARTED` (409), `NOT_A_PARTICIPANT`, `CONFIRM_REQUIRES_STAFF` (403);
  - cấu hình `SSE_HEARTBEAT_MS`.
- **Seed demo:** 3 sân đang đánh của buổi giao lưu demo có sẵn tỉ số dở: 16–12, 10–5, 2–8.
- **Tài liệu:** 01 (bảng, scope, luồng và giới hạn một bản), 02 (API, mã lỗi, mục 2.9 luồng SSE, gateway), 06 (mục 1.5,
  8.2, 13), 07 (màn hình bấm điểm, TV, cách nối lại), README.
- **Bàn thử** (ngoài repo, không commit):
  - màn hình bấm điểm cho điện thoại, chọn được vai nhân viên hoặc từng người chơi trong trận;
  - TV và màn hình buổi giao lưu nghe luồng;
  - ở giải có thêm nút "Gọi ra sân" / "Bấm điểm";
  - proxy chuyển luồng không đệm.

**Kiểm thử thật:**

| Kiểm | Kết quả |
|---|---|
| Unit luật tính | **16 test**: hết game 21–19, 20–20 → 22–20, trần 30–29, không trần 32–30, 3 game 1–1 → game 3, các luật 15 / 21 và 31 / 40, đội giao + ô giao, hoàn tác qua ranh giới game, chuỗi tối đa 1000 pha. Thêm 300 trận bấm ngẫu nhiên: tỉ số luôn qua được bước kiểm khi xác nhận, cùng đội thắng |
| Integration bấm điểm + luồng | **12 test**: bấm hết trận → xác nhận → kết quả đúng tỉ số đã bấm, sân được nhả, "chuẩn bị vào sân" hiện ngay, sự kiện `match.completed`, audit `via: live`; bấm cùng phiên bản → đúng một 409; hoàn tác / đổi đội giao / xác nhận sớm; nhập tay giữa chừng → chặn; phân quyền 403 / 404; người chơi tự xác nhận trận không tính điểm, trận tính điểm → 403 rồi nhân viên xác nhận; trận giải 3 game → người thắng vào chung kết; luồng snapshot → score → board → ping, token hết hạn thì đóng, tắt service thì đóng hết, lỗi quyền trả JSON |
| `npm test` trên MySQL 9.5 | **259 / 259** (159 unit + 100 integration) |
| `npm test` trên MySQL 8.4.11 Docker, `sql_require_primary_key = ON` | **259 / 259** (DB test: 21 bảng, 13 dòng tỉ số trực tiếp) |
| Chịu tải | 3 sân × 3 máy bấm song song (54 điểm), cùng lúc điểm danh, "Xếp sân trống", xem màn hình lớn: không lỗi 5xx; tỉ số cuối mỗi sân đúng bằng số lần bấm thành công (18); có tranh chấp thật (409 `LIVE_CONFLICT`). Chạy 5 lần liền: 0 deadlock (bản đầu có — xem 9.1) |
| Độ trễ bấm → TV | Integration (HTTP thật, máy dev): 44–557 ms tuỳ lần chạy. Container production: 119 ms. Trình duyệt qua bàn thử, từ lúc chạm tới lúc TV đổi số, 5 lần: 377 / 513 / 275 / 436 / 327 ms (trung bình khoảng 390 ms) |
| Seed demo | 2 lần trên 2 DB trống cho dấu vân tay **giống hệt**, gồm cả chuỗi pha cầu. Seed trong container (MySQL 8.4) ra đúng tỉ số dở như ở máy (16–12, 10–5, 2–8) |
| Image Docker production + MySQL 8.4 | Healthy sau 7 giây; seed demo trong container; kịch bản HTTP **36 / 36 bước** (thêm 10 bước: tỉ số dở có sẵn, mở luồng, `score` sau 119 ms, 409 bấm trùng, người chơi bấm / người ngoài 403, bấm tới khi xong, người chơi xác nhận, TV nhận `board`, chuỗi pha cầu khớp tỉ số đã lưu); log không có lỗi. `docker stop` khi đang mở luồng: 1,1 giây, thoát mã 0 |
| Bàn thử trên trình duyệt | Khung điện thoại 390×844: bấm điểm, đổi vai sang người chơi trong trận, bấm tới 21–4, người chơi xác nhận. TV đổi số theo từng điểm, rồi hiện sân trống và "Chuẩn bị vào sân". Màn hình buổi giao lưu đổi tỉ số tại chỗ, không cần tải lại. Service khởi động lại → TV tự nối lại và nhận điểm tiếp (sau khi sửa 9.4) |

## 9. Khác plan / phát hiện khi code

1. **Deadlock khi nhiều máy cùng bấm một trận.**
   - Bản đầu khoá dòng trận `FOR SHARE`. Test chịu tải bắt được 3 lần deadlock: hai lần bấm cùng giữ khoá S trên dòng
     live, rồi cùng xin nâng lên X.
   - Đổi sang khoá dòng trận `FOR UPDATE`, nên mọi lần bấm của cùng một trận xếp hàng → 5 lần chạy liền, 0 deadlock.
   - Vẫn không khoá buổi / giải, nên không chặn "Xếp sân trống", điểm danh.
2. **Dòng tỉ số tạo bằng `INSERT IGNORE` rồi mới khoá.** `SELECT … FOR UPDATE` trên dòng chưa tồn tại sẽ khoá cả
   khoảng trống, nên hai sân bấm điểm đầu tiên cùng lúc có thể deadlock.
3. **`GET /v1/matches/{id}` mở cho người chơi trong trận (`match:score`).** Plan chưa ghi, nhưng màn hình bấm điểm cần
   tên hai đội.
4. **EventSource của trình duyệt bỏ hẳn khi gặp lỗi HTTP.**
   - Lúc service khởi động lại, proxy trả 502 → TV không nhận điểm nữa. Bàn thử bắt được: TV đứng ở 3–1 trong khi tỉ
     số đã là 3–3.
   - Sửa phía client: tự tạo lại kết nối, lùi dần 2 → 30 giây, và tải lại màn hình sau khi nối lại.
   - Đã ghi vào tài liệu 07 cho bước 4, vì gateway cũng sẽ trả lỗi lúc deploy.
5. **SSE nghe `close` của response, không nghe của request.** Từ Node 16, request có thể phát `close` ngay sau khi
   đọc xong body.
6. **Seed: buổi đang diễn ra kết thúc đúng 26 phút sau lúc bắt đầu.** Trước đây seed đọc lại giờ thật, nên chạy qua
   ranh giới phút có thể ra buổi 27 phút → dữ liệu lệch. Đây là lỗi tiềm ẩn từ mục 9 plan 18.
7. **`SSE_HEARTBEAT_MS`** cấu hình được (mặc định 25 giây), để test kiểm được `ping` nhanh.
8. **DB dev:** đã migrate thêm bảng mới, **không seed lại** (dữ liệu chủ dự án đang thử giữ nguyên). Khi bấm thử trên
   buổi "Giao lưu tối nay":
   - Sân 2 được bấm tới 21–4 và người chơi tự xác nhận;
   - Sân 3 đang có tỉ số thử.

   Muốn dữ liệu demo mới có sẵn tỉ số dở ở cả 3 sân thì nói "seed lại".
