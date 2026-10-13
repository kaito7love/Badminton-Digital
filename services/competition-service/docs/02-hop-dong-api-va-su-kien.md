# competition-service — Hợp đồng API và sự kiện

> Bản mô tả bằng lời để duyệt. Khi code, bản chính thức là `openapi/competition-service.v1.yaml` và
> `contracts/events/*.schema.json`. Viết hai file đó **trước**, rồi mới code theo (contract-first).

## 1. Quy ước chung

### 1.1 Envelope

Dùng đúng envelope của app chính để gateway chuyển thẳng, không phải dịch. Thêm `code` (mã lỗi máy đọc được):

```json
// thành công
{ "success": true,  "data": { ... }, "message": "Đã chốt giải", "errors": null }
// lỗi
{ "success": false, "data": null, "message": "Người chơi đã có trận tính điểm, không tự chấm lại được",
  "code": "SELF_ASSESSMENT_LOCKED", "errors": [{ "field": "answers.backhand", "message": "..." }] }
```

`errors` chỉ gồm `{ field, message }`. Không bao giờ trả nguyên object lỗi của Sequelize (bài học từ
`errorHandler.js` của app chính).

### 1.2 Mã HTTP và mã lỗi

| HTTP | Khi nào | `code` ví dụ |
|---|---|---|
| 400 | Body sai định dạng / sai spec OpenAPI | `VALIDATION_FAILED` |
| 401 | Thiếu / sai / hết hạn token | `UNAUTHENTICATED` |
| 403 | Đủ token nhưng thiếu scope; người chơi bấm điểm trận không phải của mình; người chơi xác nhận trận tính điểm / xử bỏ cuộc | `FORBIDDEN_SCOPE`, `NOT_A_PARTICIPANT`, `CONFIRM_REQUIRES_STAFF`, `RETIRE_REQUIRES_STAFF` |
| 404 | Không có, **hoặc** thuộc tenant / organizer khác, **hoặc** hồ sơ `hidden` với người xem không phải nhân viên | `NOT_FOUND` |
| 409 | Sai trạng thái nghiệp vụ, lệch version | `INVALID_STATE`, `VERSION_CONFLICT`, `SELF_ASSESSMENT_LOCKED`, `ROLLBACK_BLOCKED`, `MERGE_CONFLICT`, `NEXT_MATCH_STARTED`, `LIVE_CONFLICT`, `MATCH_DECIDED`, `MATCH_NOT_DECIDED`, `NOTHING_TO_UNDO`, `RALLIES_STARTED`, `COURT_BUSY`, `PLAYER_BUSY`, `PRESENT_ELSEWHERE`, `RESULT_NOT_REQUIRED`, `NOT_ABSENT` |
| 412 | Thiếu `If-Match` ở endpoint bắt buộc | `PRECONDITION_REQUIRED` |
| 422 | Đúng định dạng nhưng sai luật nghiệp vụ | `SCORE_INVALID`, `NOT_ELIGIBLE`, `NEEDS_ASSESSMENT`, `DRAW_INVALID`, `BRACKET_INVALID`, `NICKNAME_TAKEN`, `IDEMPOTENCY_KEY_REUSED`, `COURT_REQUIRED`, `COURT_NOT_IN_CONTEXT`, `PARTNER_NOT_ALLOWED`, `NOTHING_TO_CALL`, `NOTHING_TO_DO` |
| 503 | DB chưa sẵn sàng | `NOT_READY` |

### 1.3 Idempotency, đồng thời, phân trang, thời gian

- **Idempotency:**
  - `Idempotency-Key` (UUID) **bắt buộc** với mọi POST / PUT có tác dụng phụ: nộp bài chấm, chỉnh điểm, đăng ký,
    xác nhận bốc thăm / sơ đồ, xếp sân, ghi kết quả, bấm điểm, chốt / huỷ chốt, gộp hồ sơ, đóng buổi. Thiếu → 400.
  - Cùng key + cùng body → trả lại đúng response cũ (có header `Idempotent-Replayed: true`).
  - Cùng key + khác body → 422.
- **Đồng thời:**
  - Tài nguyên có `version` trả kèm header `ETag: "<version>"`.
  - Lệnh sửa giải / trận / buổi bắt buộc gửi `If-Match` → lệch thì 409 `VERSION_CONFLICT`.
- **Phân trang:** `?page=1&limit=20` (giống app chính), trả về `data.items`, `data.total`, `data.page`,
  `data.totalPages`.
- **Thời gian:** ISO-8601 UTC. Ngày thi đấu là `DATE`.
- **Điểm trình:** 2 chữ số thập phân khi trả ra; nội bộ lưu 3.

## 2. Danh mục endpoint (`/v1`)

Scope viết tắt:

| Viết tắt | Scope |
|---|---|
| `r` | `rating:*` |
| `t` | `tournament:*` |
| `s` | `session:*` |
| `rk` | `ranking:read` |
| `pub` | `public:read` — xem giải / buổi giao lưu trên trang công khai (mục 2.10) |
| `es` | `entry:self` — khách tự đăng ký / rút giải, tìm đồng đội (mục 2.11); chỉ cấp cho `customer` |
| `mm` | `matchmaking:compute` |
| `pw` | `player:write` |
| `ms` | `match:score` — token "chỉ bấm điểm" của người chơi (kèm claim `player`): chỉ trận mình đang đánh |

### 2.1 Người chơi, hồ sơ, thống kê (module `player`, tài liệu 05)

| Method + đường dẫn | Scope | Việc |
|---|---|---|
| `GET /v1/me` | `r:self` | Hồ sơ + điểm + thống kê tóm tắt của chính mình (theo claim `player`). Lần đầu tự tạo hồ sơ (JIT) |
| `PATCH /v1/me` | `r:self` | Tên thi đấu, quyền riêng tư, chi nhánh thường chơi, lối chơi, tay thuận, năm sinh; giới tính (chỉ khi chưa có trận tính điểm) |
| `GET /v1/me/tournaments` · `GET /v1/me/matches` | `r:self` | Giải của tôi (đang / đã đánh), lịch trận của tôi |
| `PUT /v1/players/by-ref/{externalRef}` | `pw` | Tạo / cập nhật hồ sơ theo mã ngoài (vd `bd:customer:123`) |
| `GET /v1/players/by-ref/{externalRef}` · `POST /v1/players/lookup` | `r:read` | Tra một / hàng loạt (≤ 100) |
| `GET /v1/players` | `r:read` | Tìm: `search`, `gender`, `discipline`, `minRating`, `maxRating`, `flag` (`unverified` / `needs_verification` / `quick`) |
| `GET /v1/players/{id}` | `r:read` | Bản đầy đủ cho nhân viên (ví dụ 4.1) |
| `GET /v1/players/{id}/public` | `rk` | Bản rút gọn theo `visibility` (05, mục 1.1) |
| `PATCH /v1/players/{id}` | `pw` | Nhân viên sửa hồ sơ (kể cả giới tính sau khi đã có trận — ghi nhật ký) |
| `GET /v1/players/{id}/stats` | `rk` | Thống kê theo `discipline`, `context` (05, mục 2) |
| `GET /v1/players/{id}/matches` | `rk` | Lịch sử trận, phân trang |
| `GET /v1/players/{id}/partners` | `rk` | Đồng đội hay đánh + tỉ lệ thắng |
| `GET /v1/players/{id}/head-to-head/{otherId}` | `rk` | Đối đầu hai người |
| `GET /v1/players/{id}/rating-history` | `rk` | Sổ điểm theo `discipline`, để vẽ biểu đồ |
| `POST /v1/players/{id}/merge` · `POST /v1/players/{id}/anonymize` | `pw` | Gộp / ẩn danh (05, mục 4) |

### 2.2 Chấm trình (module `rating`, tài liệu 03)

| Method + đường dẫn | Scope | Việc |
|---|---|---|
| `GET /v1/rubrics/current` · `GET /v1/rubrics/{version}` | mọi scope `r:*` | Bộ tiêu chí để vẽ form (frontend không chép lại) |
| `POST /v1/assessments/preview` | `r:self` hoặc `r:assess` | Tính thử điểm, **không lưu** (bước "Xem lại" của form) |
| `POST /v1/me/assessments` | `r:self` | Tự chấm. Đã có trận tính điểm → 409 `SELF_ASSESSMENT_LOCKED` |
| `POST /v1/players/{id}/assessments` | `r:assess` (người chưa có trận) · `r:assess:any` | Nhân viên chấm đủ form (`staff`) |
| `POST /v1/players/{id}/assessments/quick` | `r:assess` | Chấm nhanh một nhãn (`staff_quick`), chỉ cho người chưa có điểm |
| `POST /v1/players/{id}/assessments/ai` | `assessment:submit-ai` | Cho video-analysis-service; luôn `pending_review` |
| `GET /v1/assessments?status=pending_review&flag=needs_verification` | `r:assess:any` | Hàng chờ duyệt |
| `POST /v1/assessments/{id}/review` | `r:assess:any` | `{ decision, answers?, note }`. Duyệt kèm sửa / điền nốt tiêu chí |
| `POST /v1/players/{id}/verify` | `r:assess:any` | Xác nhận trình cho một `discipline` |
| `POST /v1/players/{id}/rating-adjustments` | `r:adjust` | `{ discipline, newRating, reason }`, lý do ≥ 10 ký tự |

### 2.3 Bảng xếp hạng (module `ranking`, tài liệu 05)

| Method + đường dẫn | Scope | Việc |
|---|---|---|
| `GET /v1/leaderboards/rating` | `rk` | `category` (`MS` / `WS` / `MD` / `WD`), `organizerRef?`, `ageGroup?`, `level?`, phân trang. Mỗi dòng: `rank`, `movement`, người chơi (rút gọn theo quyền riêng tư), `rating`, `level`, `reliability`, `ratedMatches` |
| `GET /v1/leaderboards/points` | `rk` | `category` (`MS` / `WS` / `MD` / `WD` / `XD`), `organizerRef?`. Mỗi dòng: `rank`, `movement`, `points`, `countedResults`, 6 kết quả được tính |
| `GET /v1/players/{id}/ranking` | `rk` | Vị trí của một người trên mọi bảng; chưa đủ điều kiện thì trả `projectedRank` |

### 2.4 Xếp cặp — không trạng thái, không ghi DB (module `matchmaking`, tài liệu 06)

| Method + đường dẫn | Scope | Việc |
|---|---|---|
| `POST /v1/matchmaking/teams` | `mm` | Ghép đồng đội cân bằng (06, mục 4.3) |
| `POST /v1/matchmaking/groups` | `mm` | Chia bảng `seeded` / `level` (06, mục 4.4) |
| `POST /v1/matchmaking/round-robin` · `POST /v1/matchmaking/schedule` | `mm` | Lịch vòng tròn · xếp trận vào lượt theo số sân (06, mục 4.5) |
| `POST /v1/matchmaking/bracket` | `mm` | Sơ đồ loại trực tiếp từ danh sách hạt giống (06, mục 5) |
| `POST /v1/matchmaking/session-round` | `mm` | Xếp sân giao lưu (06, mục 8.3). Người chơi có thể kèm `newcomer` (chưa đánh trận nào trong buổi — không bị kéo lên trước); kết quả có thêm `order` (thứ tự ưu tiên đầy đủ) |

Nhận **điểm do bên gọi cung cấp**, không đọc DB. Hệ thống nào cũng dùng được.

### 2.5 Trận đấu (module `match`, tài liệu 06 mục 1)

| Method + đường dẫn | Scope | Việc |
|---|---|---|
| `GET /v1/matches/{id}` | `t:read` hoặc `s:read` (theo ngữ cảnh), hoặc `ms` (người chơi trong trận) | Chi tiết trận, kèm `live` = tỉ số đang bấm (`null` nếu chưa ai bấm) |
| `POST /v1/matches/{id}/call` | `t:operate` / `s:operate` | Gọi ra sân `{ courtRef }` → `in_play`. Kiểm trên **mọi** giải / buổi của tenant (sân, người là thật — plan 20): sân đang có trận → 409 `COURT_BUSY`; một người của trận đang đánh ở sân khác → 409 `PLAYER_BUSY` (kèm tên, sân). Giải có danh sách sân thì bắt buộc chọn sân trong danh sách (422 `COURT_REQUIRED` / `COURT_NOT_IN_CONTEXT`) |
| `PUT /v1/matches/{id}/result` | `t:operate` / `s:operate` | `{ games }` \| `{ outcome: "walkover", winnerSide }` \| `{ games, outcome: "retired", winnerSide }`. `If-Match` bắt buộc. Trận loại trực tiếp: người thắng tự vào ô sau; đổi người thắng khi trận sau đã bắt đầu → 409 `NEXT_MATCH_STARTED` |
| `POST /v1/matches/{id}/cancel` | `t:manage` / `s:operate` | Huỷ trận chưa có kết quả. Trận trong sơ đồ loại trực tiếp không huỷ được (xử W.O.). Trận giao lưu bị huỷ không tính là đã đánh |
| `POST /v1/matches/{id}/end` | `s:operate` | Trận giao lưu "xong, không nhập tỉ số" → `ended`, sân được nhả; nhập tỉ số sau vẫn được. Trận giải → 409 `RESULT_REQUIRED` |
| `GET /v1/matches/{id}/live` | như `GET /v1/matches/{id}` | Tỉ số đang bấm (`MatchLive`): chuỗi pha cầu, các game đã xong, game đang đánh, đội giao + ô giao, `endsSwapped` (hai đội đang ở ngược đầu sân so với lúc đầu — màn hình bấm điểm đổi bên theo; luật ở 06 mục 1.5), `decided`, `revision`. Chưa ai bấm → `revision` 0 |
| `POST /v1/matches/{id}/live/rallies` | `t:operate` / `s:operate` / `ms` | `{ side, revision }` → +1 điểm cho đội thắng pha cầu (06, mục 1.5). Phiên bản lệch → 409 `LIVE_CONFLICT`; đã đủ điểm thắng → 409 `MATCH_DECIDED`; trận không đang đánh → 409 `INVALID_STATE` |
| `POST /v1/matches/{id}/live/undo` | như trên | `{ revision }` → bỏ điểm vừa bấm (kể cả điểm vừa xong game). Chưa có điểm → 409 `NOTHING_TO_UNDO` |
| `PUT /v1/matches/{id}/live/server` | như trên | `{ firstServer, revision }` → đội giao trước; đã bấm điểm → 409 `RALLIES_STARTED` |
| `POST /v1/matches/{id}/live/confirm` | như trên | `{ revision }` → lưu kết quả từ tỉ số đã bấm, cùng đường với `PUT …/result`. Người chơi (`ms`) chỉ xác nhận được trận **không tính điểm** (403 `CONFIRM_REQUIRES_STAFF`); chưa đủ điểm thắng → 409 `MATCH_NOT_DECIDED` |
| `POST /v1/matches/{id}/live/retire` | như trên (chỉ nhân viên) | **Không đánh tiếp được** (plan 20): `{ side, revision }` — đội `side` bỏ cuộc giữa trận → kết quả `retired`, giữ các game đã xong (game đang dở bỏ), đối thủ thắng / đi tiếp. Người chơi → 403 `RETIRE_REQUIRES_STAFF`; trận giao lưu → 409 `RESULT_NOT_REQUIRED` (dùng huỷ trận / xong không tỉ số); đã đủ điểm thắng → 409 `MATCH_DECIDED` |

### 2.6 Giải đấu (module `tournament`, tài liệu 06)

| Method + đường dẫn | Scope | Trạng thái | Việc |
|---|---|---|---|
| `POST /v1/tournaments/advice` | `t:read` | — | Gợi ý thể thức / số bảng / ước tính thời gian theo số đội dự kiến (wizard bước 3–4) |
| `POST /v1/tournaments` | `t:manage` | — | Tạo (`draft`). `organizerRef` ∈ `org`; `tier = chain` cần `org = *`. Có thể kèm `courtRefs` (sân của giải → `courtCount` = số sân), `startTime` (`HH:MM`, giờ dự kiến từng lượt), `checkInRequired` (bốc thăm tại sân) |
| `GET /v1/tournaments` · `GET /v1/tournaments/{id}` | `t:read` | — | Danh sách (lọc trạng thái, ngày, nội dung) · chi tiết + tiến độ |
| `PATCH /v1/tournaments/{id}` | `t:manage` | `draft`, `open` | Sửa (`If-Match` bắt buộc); đã có người đăng ký thì không đổi nội dung / giới / cách ghép / luật điểm / điều kiện trình → 409 `LOCKED_AFTER_ENTRIES` |
| `POST /v1/tournaments/{id}/open` | `t:manage` | `draft` | Mở đăng ký |
| `GET/POST /v1/tournaments/{id}/entries` · `DELETE …/entries/{entryId}` | `t:operate` | `open` (thêm) · mọi lúc trước chốt (rút) | Đăng ký / rút (06, mục 4.2, 7.4). Đôi cặp sẵn: `{ playerId, partnerPlayerId }` — 2 người đăng ký chung một đội |
| `POST` · `DELETE /v1/tournaments/{id}/entries/{entryId}/check-in` | `t:operate` | `open`, `drawn`, `in_progress` | Điểm danh ngày thi đấu / bỏ điểm danh (từng người; đôi = cả hai người) |
| `PUT /v1/tournaments/{id}/entries/{entryId}/partner` | `t:operate` | `open` | Đổi đồng đội `{ partnerPlayerId }` (đôi cặp sẵn): người cũ rời giải, người mới vào đúng chỗ của cặp, kiểm lại điều kiện |
| `PUT /v1/tournaments/{id}/courts` | `t:manage` | trừ `finalized`, `cancelled` | Sân của giải `{ courtRefs }` (thêm / bớt trong ngày; bỏ sân đang có trận → 409 `COURT_BUSY`) |
| `POST /v1/tournaments/{id}/draw/preview` | `t:manage` | `open`, `drawn` chưa có kết quả | `{ seed? }` → đội + chờ + bảng + lịch theo lượt + thống kê cân bằng; giải bốc thăm tại sân: `absent` = người chưa điểm danh (xác nhận thì sang danh sách chờ, lý do `absent`) |
| `POST /v1/tournaments/{id}/draw` | `t:manage` | như trên | `{ seed, teams, groups }` đã chỉnh tay → kiểm tra → sinh trận → `drawn` |
| `POST /v1/tournaments/{id}/reopen` | `t:manage` | `drawn` chưa có kết quả | Huỷ bốc thăm, về `open` |
| `GET /v1/tournaments/{id}/teams` · `…/matches` · `…/standings` · `…/bracket` | `t:read` | — | Các đội · lịch theo lượt / bảng · xếp hạng từng bảng · sơ đồ |
| `POST /v1/tournaments/{id}/matches` | `t:manage` | `in_progress` | Thêm trận tay `{ teamAId, teamBId, label }` |
| `GET /v1/tournaments/{id}/next-matches` | `t:read` | `drawn`, `in_progress` | Trận kế tiếp cho sân vừa trống: `freeCourts`, `items` (trận gọi được: đã nghỉ đủ 5 phút trước → lượt sớm hơn → đội nghỉ lâu hơn), `blocked` (trận đủ đội nhưng có người đang ở sân — ai, sân nào). Lịch (`…/matches`) có `expectedTime` theo `startTime` |
| `POST /v1/tournaments/{id}/call-next` | `t:operate` | `drawn`, `in_progress` | `{ courtRef }` → gọi trận đầu danh sách ra sân (cùng kiểm tra như gọi ra sân); không có → 422 `NOTHING_TO_CALL` |
| `GET` · `POST /v1/tournaments/{id}/no-shows` | `t:operate` | `drawn`, `in_progress` | Đội vắng (chưa đánh trận nào, chưa đủ người điểm danh) / xử W.O. `{ teamIds? }` theo đúng đường rút lui |
| `POST /v1/tournaments/{id}/knockout/preview` · `POST …/knockout` | `t:manage` | vòng bảng xong | Xem trước / khoá sơ đồ (kèm đổi ô) → `stage = knockout` |
| `GET /v1/tournaments/{id}/finalize-preview` | `t:read` | mọi trận xong | Thứ hạng + điểm trình trước / sau + điểm thành tích |
| `POST /v1/tournaments/{id}/finalize` · `…/unfinalize` | `t:manage` | `in_progress` / `finalized` | Chốt / huỷ chốt (06, mục 7) |
| `GET /v1/tournaments/{id}/placements` | `t:read` | `finalized` | Thứ hạng chung cuộc |
| `GET /v1/tournaments/{id}/stream` | `t:read` | mọi trạng thái | Luồng SSE: tỉ số trực tiếp các trận đang đánh, báo lịch / bảng đấu đổi (mục 2.9) |
| `POST /v1/tournaments/{id}/cancel` | `t:manage` | trừ `finalized` | Huỷ, không áp điểm |

### 2.7 Buổi giao lưu (module `session`, tài liệu 06 mục 8)

| Method + đường dẫn | Scope | Việc |
|---|---|---|
| `POST /v1/sessions` · `GET /v1/sessions` · `GET/PATCH /v1/sessions/{id}` | `s:operate` / `s:read` | Tạo (mở ngay) / xem (kèm tiến độ, số đăng ký online) / sửa buổi (`PATCH` bắt buộc `If-Match`; có trận thì khoá Đơn / Đôi; không bỏ được sân đang có trận). `maxPlayers` 2–200 hoặc `null` = sức chứa cho đăng ký online — tăng / bỏ thì người chờ được lên |
| `GET /v1/sessions/{id}/players` · `POST …/players` · `DELETE …/players/{playerId}` | `s:read` / `s:operate` | Danh sách điểm danh / điểm danh (kèm `quickLevel` nếu chưa có điểm — cần thêm `rating:assess`; đang có mặt ở buổi khác chưa đóng → 409 `PRESENT_ELSEWHERE`, `errors[].field` = id buổi kia) / rời buổi (đang ở sân → 409 `PLAYER_ON_COURT`) |
| `POST /v1/sessions/{id}/fill-courts/preview` · `POST …/fill-courts` | `s:operate` | Xếp sân trống: xem trước (đổi tay được, có `repeatPartners`) / xác nhận bản gửi lại nguyên văn hoặc để hệ thống tự xếp → sinh trận đang đánh. Bản cũ → 409 `FILL_STALE`; không có gì để xếp → 422 `NOTHING_TO_FILL` |
| `GET /v1/sessions/{id}/matches` | `s:read` | Các trận của buổi theo lượt |
| `GET /v1/sessions/{id}/board` | `s:read` | Dữ liệu màn hình lớn: sân – ai với ai – từ lúc nào (kèm `serverTime`); `upcoming` = ai sẽ vào các sân đang trống nếu bấm "Xếp sân trống" ngay (cùng hàm, cùng seed — rỗng khi không có sân trống); hàng chờ theo thứ tự ưu tiên của thuật toán, `next` = nằm trong `upcoming`; kết quả gần nhất |
| `GET /v1/sessions/{id}/signups` · `DELETE …/signups/{signupId}` | `s:read` / `s:operate` | Đăng ký online (mục 2.11): danh sách ai đã báo trước (kèm đã có mặt chưa, điểm, cờ — để điểm danh nhanh) / gỡ một đăng ký (nhường chỗ cho người chờ). Điểm danh vẫn là `POST …/players` — người đã đăng ký tự thành `attended` |
| `GET /v1/sessions/{id}/stream` | `s:read` | Luồng SSE cho màn hình TV (mục 2.9) |
| `GET /v1/sessions/{id}/close-preview` · `POST …/close` · `POST …/cancel` | `s:read` / `s:operate` | Xem trước khi đóng / đóng (trận chưa tỉ số bị huỷ, áp điểm hệ số 0.5 nếu bật, cộng thống kê "giao lưu") / huỷ buổi |

### 2.8 Tích hợp & vận hành

| Method + đường dẫn | Xác thực | Việc |
|---|---|---|
| `POST /v1/events` | Chữ ký HMAC của hệ thống gửi | Nhận sự kiện từ app chính (mục 3.3) |
| `GET /v1/ops/outbox?status=dead` · `POST /v1/ops/outbox/{id}/replay` | `ops:admin` | Xem / gửi lại sự kiện kẹt |
| `GET /health/live` · `GET /health/ready` | không | Health check |
| `GET /openapi.json` · `GET /docs` | không (tắt `/docs` ở production) | Hợp đồng + Swagger UI |

### 2.9 Luồng SSE cho màn hình TV (plan 19)

`GET /v1/sessions/{id}/stream` (scope `s:read`) và `GET /v1/tournaments/{id}/stream` (scope `t:read`) trả về
`text/event-stream`. Lỗi quyền vẫn trả JSON như mọi endpoint (401 / 403 / 404), không mở luồng.

| Sự kiện | `data` | Khi nào | Client làm gì |
|---|---|---|---|
| `snapshot` | `{ serverTime, matches: [{ matchId, courtRef, live }] }` | Vừa kết nối (cả khi tự nối lại) — các trận đang đánh đã có người bấm điểm | Vẽ tỉ số |
| `score` | `{ matchId, courtRef, live }` (`live` = `MatchLive`) | Mỗi lần bấm / hoàn tác / chọn đội giao | Đổi số của sân đó; bỏ qua nếu `live.revision` cũ hơn cái đang có |
| `board` | `{ reason }` (`result`, `filled`, `checked_in`, `left`, `called`, `ended`, `cancelled`, `drawn`, …) | Sân / trận / hàng chờ / lịch đổi | Tải lại màn hình lớn (`…/board`) hoặc lịch |
| `ping` | `{}` | `SSE_HEARTBEAT_MS` (mặc định 25 giây) | Không nhận được lâu → kết nối đã chết, tự mở lại |

- Chỉ phát **sau khi transaction commit**. `board` gộp một lần cho mỗi thao tác.
- Service **đóng luồng khi token hết hạn** (≤ 5 phút). EventSource tự nối lại sau 2 giây (`retry: 2000`), gateway ký
  token mới — như SSE của app chính (đóng sau 20 phút).
- Đẩy trong bộ nhớ một process: đúng khi service chạy **một bản** (01, mục 9). Tỉ số không đi qua outbox (5 giây / lần,
  thử lại tới 24 giờ — hợp với kết quả trận, không hợp với từng điểm). Xác nhận kết quả vẫn phát
  `competition.match.completed` qua outbox như cũ.

### 2.10 Trang công khai — xem giải / buổi giao lưu không cần quyền nhân viên (plan 27)

Tiền tố riêng `/v1/public/*`, **chỉ GET**, scope `pub` = `public:read` (gateway cấp cho cả người chưa đăng nhập, khách và
nhân viên). Tách khỏi route của nhân viên thay vì mở chúng ra: dữ liệu đi qua một bộ gọt liệt kê **từng trường được lộ**
(hợp đồng đóng `additionalProperties: false`, test so tập khoá) và tên người chơi theo quyền riêng tư.

| Method + đường dẫn | Việc |
|---|---|
| `GET /v1/public/tournaments` | Danh sách giải của **mọi chi nhánh**: chỉ `open / drawn / in_progress / finalized` (nháp, đã huỷ không có). `status` một hoặc nhiều giá trị cách nhau dấu phẩy, `organizerRef`, `q` (tìm trong tên), `order` `asc` (mặc định, ngày sớm nhất trước) / `desc`, phân trang. Mỗi giải kèm `registration` = { `open`, `needsPartner`, `registered`, `waitlisted`, `maxEntries`, `spotsLeft` } — đếm theo **người**, như lúc đăng ký |
| `GET /v1/public/tournaments/{id}` | Chi tiết (kèm `matches` { total, completed }). Giải nháp / huỷ / không có → 404 |
| `GET …/{id}/entries` | Danh sách đăng ký, **mỗi dòng một người hoặc một cặp**: `status` (`registered` / `waitlisted`), `waitlistPosition` (chỉ khi chờ vì hết chỗ), `players[]`, `mine`. Người đã rút không có |
| `GET …/{id}/matches` · `…/standings` · `…/bracket` · `…/placements` | Lịch + kết quả (có `live` nếu đang bấm điểm, `expectedTime`), bảng vòng bảng, sơ đồ loại trực tiếp, thứ hạng cuối |
| `GET …/{id}/stream` | Luồng SSE như mục 2.9, chỉ cho giải xem công khai |
| `GET /v1/public/sessions` | Buổi `open` và buổi `closed` trong **30 ngày** gần đây (huỷ không có); `status`, `organizerRef`, `order`, phân trang; mỗi buổi kèm `players.present` |
| `GET /v1/public/sessions/{id}` · `…/board` · `…/signups` · `…/stream` | Chi tiết (kèm `matches`, `signup` = { `open`, `maxPlayers`, `registered`, `waitlisted`, `spotsLeft` } và — với khách đăng nhập — `me` = { `status` `registered` / `waitlisted` / `attended`, `waitlistPosition`, `canCancel` }), bảng sân (sân đang đánh, người sắp vào sân, hàng chờ, kết quả gần đây), **ai đã đăng ký** (giữ chỗ / chờ / đã đến, tên theo quyền riêng tư; người đã đăng ký thấy tên đầy đủ của nhau), luồng SSE. `signup` cũng có ở danh sách buổi |

**Tên người chơi** (`player.domain.profile.publicRef`, cùng luật 05 mục 1.1; mỗi người là `{ id, name, masked }`):

| Người xem | `public` | `members` (mặc định) | `hidden` |
|---|---|---|---|
| Chưa đăng nhập (`sub = anonymous`) | tên thi đấu, hoặc "Tên H." (vd "An N.") | **che** | **che** |
| Đã đăng nhập | tên đầy đủ | tên đầy đủ | **che** |
| Nhân viên (`rating:read`), chính chủ, **người cùng tham gia giải / buổi đó** | tên đầy đủ | tên đầy đủ | tên đầy đủ |

"Che" = `{ id: null, name: "Thành viên A3F2", masked: true }`: mã 4 ký tự suy từ id người chơi (SHA-1) nên **ổn định** giữa
các lần gọi và giữa các route (một sơ đồ có nhiều người bị che vẫn phân biệt được) mà không lộ id — và không mở được hồ sơ.
"Người cùng tham gia" khớp nguyên tắc "đối thủ / đồng đội luôn thấy tên nhau" (05 mục 1.1): người đang đăng ký giải (chưa
rút) hoặc có tên trong danh sách buổi giao lưu thấy tên đầy đủ của mọi người trong **giải / buổi đó**.

Không có trong dữ liệu công khai: `courtRefs`, `createdByRef`, `drawSeed`, `version`, `contextId`, điểm trình và cờ của người chơi.

**Giới hạn ở gateway:** `GET /public/*` không cần đăng nhập có bộ giới hạn tần suất RIÊNG, thoáng hơn BXH (**900 lần / phút / IP**, BXH vẫn 120): cả sân xem giải
bằng điện thoại trên cùng một Wi-Fi (một IP công khai) không được chặn lẫn nhau. Luồng SSE công khai bị giới hạn **40 luồng / IP và 300 luồng cả hệ thống**
(429 `TOO_MANY_STREAMS`) — mỗi luồng giữ một kết nối tới service và một ít RAM của gói free, nên tổng mới là chốt. Luồng của nhân viên (`/tournaments/{id}/stream`)
không bị giới hạn này; người bị chặn luồng vẫn xem được vì trang tự poll dự phòng.

### 2.11 Khách tự đăng ký giải (plan 27, p1)

Scope `es` = `entry:self` — gateway chỉ cấp cho `customer` (nhân viên đăng ký hộ bằng `t:operate`, mục 2.6). Người đăng ký **luôn là chính
mình** (claim `player` của token; hồ sơ tự tạo lần đầu từ `player_name`). Dùng lại đúng lệnh đăng ký / rút của nhân viên — cùng kiểm điều
kiện, cùng khoá giải, cùng hết chỗ → danh sách chờ (06, mục 4.2 và 15).

| Method + đường dẫn | Scope | Việc |
|---|---|---|
| `POST /v1/me/tournaments/{id}/entries` | `es` | Tự đăng ký. Giải đánh đơn / ghép cặp ngẫu nhiên: không gửi gì. **Đôi cặp cố định**: `{ "partner": { "playerId" } }` (người đã có hồ sơ) **hoặc** `{ "partner": { "guest": { name, phone, gender, level } } }` (người chưa có tài khoản) — nhận **cả hai người trong một lần**. `201` + chi tiết giải công khai kèm `me`. Giải nháp / huỷ → 404; không còn mở đăng ký → 409 `INVALID_STATE`; trùng → 409 `ALREADY_REGISTERED`; 422 `NEEDS_ASSESSMENT`, `NOT_ELIGIBLE`, `PARTNER_REQUIRED`, `PARTNER_NOT_ALLOWED`, `PARTNER_INVALID`, `INVALID_GUEST`, `GUEST_LIMIT` |
| `DELETE /v1/me/tournaments/{id}/entries` | `es` | Rút (cả cặp rút). Chỉ khi giải còn `open`: sau bốc thăm → 409 `WITHDRAW_LOCKED` (liên hệ nhân viên); chưa đăng ký → 404 `NOT_REGISTERED`. Nhường chỗ cho người đầu danh sách chờ |
| `GET /v1/me/partners?search=&limit=` | `es` | Tìm đồng đội: tối thiểu 2 ký tự, tối đa 20 kết quả, chỉ người đang hoạt động mà **thành viên** được thấy (`public` / `members`) — không có chính mình, hồ sơ `hidden`, hồ sơ khách. Mỗi dòng `{ id, name, nickname, gender, rated }` (`rated` = đã có điểm; chưa có thì đăng ký bị `NEEDS_ASSESSMENT`) |

`GET /v1/public/tournaments/{id}` (mục 2.10) có thêm **`me`** khi người xem là khách đăng nhập: `{ entry, canWithdraw }` — đăng ký của chính mình
(gồm cả khi mình chỉ là người được thêm làm đồng đội), `null` nếu chưa đăng ký; không có khoá `me` với người chưa đăng nhập và nhân viên.
`canWithdraw` chỉ đúng khi giải còn `open`.

**Buổi giao lưu (p2)** — cùng scope `es`:

| Method + đường dẫn | Việc |
|---|---|
| `POST /v1/me/sessions/{id}/signup` | Báo trước "tôi sẽ đến". Chỗ = đã đăng ký giữ chỗ ∪ đang có mặt so với `maxPlayers`; hết chỗ → danh sách chờ. `201` + chi tiết buổi công khai kèm `me`. Buổi huỷ / không có → 404; buổi đã đóng → 409 `SESSION_CLOSED`; trùng → 409 `ALREADY_SIGNED_UP`; đã điểm danh → 409 `ALREADY_PRESENT`. Không đòi có điểm trình (điểm danh tại quầy vẫn kèm `quickLevel` nếu chưa có điểm) |
| `DELETE /v1/me/sessions/{id}/signup` | Huỷ (nhường chỗ cho người chờ). Chưa đăng ký / đã đến → 404 `NOT_SIGNED_UP`; buổi đã đóng → 409 `SESSION_CLOSED` |
| `GET /v1/me/sessions` | Các buổi **đang mở** mà mình đã đăng ký (giữ chỗ hoặc chờ, kèm thứ tự chờ), sắp theo giờ bắt đầu |

## 3. Sự kiện

### 3.1 Vỏ sự kiện (theo CloudEvents 1.0, dạng JSON)

```json
{
  "specversion": "1.0",
  "id": "01927c3e-5b7a-7cc3-9d1e-2f4a8b6c0d11",
  "type": "competition.tournament.finalized",
  "source": "competition-service",
  "time": "2026-10-05T14:30:00Z",
  "tenant": "badminton-digital",
  "subject": "tournament/01927c…",
  "dataschema": "competition.tournament.finalized/v1",
  "data": { ... }
}
```

**Giao nhận:**

- Webhook `POST` tới URL đăng ký (env `WEBHOOK_TARGETS`: url + secret + danh sách type).
- Kèm header `X-Timestamp`, `X-Signature`.
- Bên nhận trả 2xx là xong.
- Đảm bảo **ít nhất một lần**: bên nhận khử trùng lặp theo `id`.
- Thứ tự chỉ đảm bảo theo từng `subject`.

### 3.2 Phát ra (competition-service → hệ thống khác)

| Type | `data` chính | Ai dùng (dự kiến) |
|---|---|---|
| `competition.player.rating_changed` | `playerId`, `externalRef`, `discipline`, `before`, `after`, `reason`, `contextType?`, `contextId?` | App chính: thông báo cho khách (sau này) |
| `competition.assessment.submitted` | `assessmentId`, `playerId`, `externalRef`, `source`, `status`, `needsVerification` | App chính: nhắc quản lý duyệt |
| `competition.tournament.drawn` | `tournamentId`, `organizerRef`, `teams`, `groups`, `slots`, `seed`, `manualEdits` | App chính: giữ sân cho lịch thi đấu (sau này) |
| `competition.match.completed` | `matchId`, `contextType`, `contextId`, `sides`, `games`, `outcome`, `winnerSide` | App chính: đẩy qua SSE cho bảng kết quả / màn hình TV |
| `competition.tournament.finalized` | `tournamentId`, `organizerRef`, `placements[]`, `ratingChanges[]`, `rankingPoints[]` | App chính: ghi `ActivityLog`, thông báo kết quả |
| `competition.tournament.unfinalized` · `…cancelled` | `tournamentId`, `reason` | như trên |
| `competition.session.closed` | `sessionId`, `organizerRef`, `rated`, `matches` (số trận có tỉ số), `ratingChanges[]` | App chính: ghi `ActivityLog` |

**v1 của app chính chưa bắt buộc tiêu thụ sự kiện nào.** Hợp đồng có sẵn để bật dần.

### 3.3 Nhận vào (app chính → competition-service qua `POST /v1/events`)

| Type | `data` | Service làm gì |
|---|---|---|
| `bd.customer.updated` | `externalRef`, `fullName`, `version` | Đổi `display_name` (bỏ qua bản cũ hơn bản đã áp) |
| `bd.customer.merged` | `sourceRef`, `targetRef` | Gộp hồ sơ (05, mục 4). Chỉ nguồn có hồ sơ → đổi `external_ref` sang đích |
| `bd.customer.deleted` | `externalRef` | Ẩn danh hoá (05, mục 4) |

App chính phát 3 sự kiện này bằng outbox của nó, ghi cùng transaction với `CustomerService.updateCustomer` /
`mergeIntoAccount` / `deleteCustomer` (bước tích hợp).

## 4. Ví dụ request / response

### 4.1 `GET /v1/players/{id}`

```json
{ "success": true, "data": {
  "id": "01927c…", "externalRef": "bd:customer:123", "displayName": "Nguyễn Văn An", "nickname": "An Smash",
  "gender": "male", "ageGroup": "18-34", "dominantHand": "right", "playingSinceYear": 2021,
  "preferredPlay": "doubles", "doublesPosition": "back", "homeOrganizerRef": "bd:branch:1",
  "visibility": "members", "status": "active",
  "ratings": {
    "singles": { "rating": 3.12, "level": "TB", "ratedMatches": 4, "reliability": 20,
                 "provisional": true, "verified": false, "pairingRating": 3.12 },
    "doubles": { "rating": 3.47, "level": "TB", "ratedMatches": 23, "reliability": 100,
                 "provisional": false, "verified": true, "pairingRating": 3.55 }
  },
  "ranking": { "rating": { "MD": { "rank": 18, "movement": 2 } },
               "points": { "MD": { "rank": 7, "points": 412 }, "XD": { "rank": 21, "points": 150 } } },
  "summary": { "doubles": { "matches": 41, "wins": 26, "winRate": 0.63, "streak": "T3", "titles": 1 } },
  "flags": []
}, "message": null, "errors": null }
```

`pairingRating` (3.55 > 3.47) cho thấy luật chống giấu trình đang có hiệu lực: đỉnh 12 tháng là 4.05, trừ 0.5
thành 3.55.

### 4.2 `POST /v1/me/assessments`

```json
// request — Idempotency-Key: 5f0c…
{ "rubricVersion": "v1",
  "profile": { "gender": "female", "birthYear": 1996, "dominantHand": "right", "playingSinceYear": 2022,
               "sessionsPerWeek": 3, "preferredPlay": "doubles", "doublesPosition": "front" },
  "answers": { "serve": 3, "clear": 3, "backhand": 2, "smash": 3, "drop": 3, "net": 4,
               "defense": 3, "footwork": 3, "stamina": 3, "tactics": 3, "rotation": 4, "experience": 3 } }
// response 201
{ "success": true, "data": {
  "assessmentId": "…", "status": "applied",
  "result": {
    "singles": { "raw": 2.96, "rating": 2.96, "level": "TB-", "cappedBy": null },
    "doubles": { "raw": 3.15, "rating": 3.15, "level": "TB", "cappedBy": null },
    "needsVerification": false
  } }, "message": "Đã ghi nhận bài tự chấm", "errors": null }
```

Cách tính (Đơn: 38.5 / 13 = 2.96; Đôi: 41 / 13 = 3.15) ở 03, mục 2.2. Trái tay mức 2 đặt trần 3.49, nhưng cả hai
điểm đều dưới trần.

### 4.3 `POST /v1/tournaments/{id}/draw/preview`

```json
{ "success": true, "data": {
  "seed": "a91f03c2",
  "teams": [ { "tempId": "T1", "players": ["…", "…"], "teamRating": 3.40 }, "…" ],
  "waitlist": [ { "playerId": "…", "reason": "GENDER_IMBALANCE" } ],
  "groups": [ { "groupNo": 1, "teams": ["T1", "T6", "T7", "T12"] }, "…" ],
  "slots":  [ { "slotNo": 1, "matches": [ { "groupNo": 1, "teamA": "T1", "teamB": "T12" }, "…" ] }, "…" ],
  "estimate": { "matches": 18, "slots": 5, "minutes": 75 },
  "stats": { "teamRatingStdDev": 0.031, "teamRatingRange": 0.10, "baselineRandomStdDev": 0.412 }
}, "message": null, "errors": null }
```

### 4.4 `PUT /v1/matches/{id}/result`

```json
// If-Match: "3" · Idempotency-Key: …
{ "games": [[21, 17], [18, 21], [30, 29]] }
// 200 → status = completed, winnerSide = "A", version 4; trận loại trực tiếp → đội A được điền vào trận sau
// { "games": [[21, 20]] } → 422 SCORE_INVALID: "Game 1: 21-20 không hợp lệ — phải thắng cách 2 điểm (tối đa 30)"
```

### 4.5 `GET /v1/leaderboards/points?category=XD`

```json
{ "success": true, "data": { "items": [
  { "rank": 1, "movement": 0, "player": { "id": "…", "name": "Thảo N.", "level": "Khá" }, "points": 512,
    "countedResults": 5,
    "results": [ { "tournament": "Mở rộng Q1 tháng 9", "placement": "Vô địch", "points": 183, "expiresAt": "2027-09-20" } ] },
  "…" ], "total": 87, "page": 1, "totalPages": 5 } }
```

## 5. Gateway trong app chính — bảng ánh xạ (thuộc bước tích hợp)

Gateway là một **danh sách cho phép** (allowlist): method + đường dẫn phía app chính → đường dẫn phía service +
vai trò được gọi + scope cấp. Không có dòng thì không chuyển tiếp (404), nên không lộ `/v1/ops`, `/v1/events`,
`…/assessments/ai`.

| Vai trò app chính | Scope được cấp | `org` | `player` |
|---|---|---|---|
| Chưa đăng nhập (trang BXH và trang giải công khai) | `ranking:read public:read` | — | — (chỉ thấy hồ sơ `public`; tên theo mục 2.10) |
| `customer` | `rating:self ranking:read match:score public:read entry:self` (`match:score`: chỉ bấm điểm trận mình đang đánh — service kiểm người chơi có trong trận) | — | `bd:customer:<customer.id>` |
| `employee` | `rating:read rating:assess player:write ranking:read matchmaking:compute tournament:read tournament:operate session:read session:operate public:read` | chi nhánh của nhân viên | — |
| `branch_manager` | như `employee` + `rating:assess:any rating:adjust tournament:manage` | chi nhánh của mình | — |
| `admin` | như `branch_manager` | chi nhánh đang chọn (`X-Branch-Id`); chưa chọn → `*` | — |

- Ví dụ ánh xạ: `GET /api/v1/competition/me` → `GET /v1/me`; `PUT /api/v1/competition/matches/:id/result` →
  `PUT /v1/matches/:id/result`.
- `GET /api/v1/competition/public/*` (mục 2.10) → `GET /v1/public/*`: **chỉ GET**, không cần đăng nhập; POST / PUT / PATCH / DELETE vào `/public/*` → 404 ngay
  tại cổng.
- Envelope, status code, `ETag` giữ nguyên.
- Luồng SSE (`…/stream`, mục 2.9): chuyển tiếp nguyên trạng, **không đệm** (`X-Accel-Buffering: no`), ký token 5 phút
  cho đường này để trình duyệt không phải nối lại mỗi phút.
- Gateway tự sinh `Idempotency-Key` nếu frontend không gửi, nhưng frontend **nên** tự gửi để bấm hai lần vẫn chỉ
  một lần.

### Ghi chú p4 — danh sách đăng ký cho nhân viên biết "ai đăng ký online"

`GET /v1/tournaments/{id}/entries` (nhân viên) mỗi dòng có thêm: `via` (`staff` nhân viên nhập · `self` khách tự đăng ký trên trang công khai — **cả hai người của một cặp** đều `self`),
`source` (`online_guest` = hồ sơ khách tạo khi đăng ký online; còn lại `null`) và `contactPhone` (SĐT đồng đội khách, dạng `0xxxxxxxxx`; **chỉ nhân viên thấy**, không có ở bất kỳ API công khai nào).
Đổi đồng đội (`PUT …/partner`) tạo dòng mới `via = staff` — nhân viên là người thực hiện. Ba trường này bắt buộc trong schema `Entry` (test kiểm đủ khoá).
