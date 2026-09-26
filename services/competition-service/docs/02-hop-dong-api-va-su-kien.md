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
| 403 | Đủ token nhưng thiếu scope | `FORBIDDEN_SCOPE` |
| 404 | Không có, **hoặc** thuộc tenant / organizer khác, **hoặc** hồ sơ `hidden` với người xem không phải nhân viên | `NOT_FOUND` |
| 409 | Sai trạng thái nghiệp vụ, lệch version | `INVALID_STATE`, `VERSION_CONFLICT`, `SELF_ASSESSMENT_LOCKED`, `ROLLBACK_BLOCKED`, `MERGE_CONFLICT`, `NEXT_MATCH_STARTED` |
| 412 | Thiếu `If-Match` ở endpoint bắt buộc | `PRECONDITION_REQUIRED` |
| 422 | Đúng định dạng nhưng sai luật nghiệp vụ | `SCORE_INVALID`, `NOT_ELIGIBLE`, `NEEDS_ASSESSMENT`, `DRAW_INVALID`, `BRACKET_INVALID`, `NICKNAME_TAKEN`, `IDEMPOTENCY_KEY_REUSED` |
| 503 | DB chưa sẵn sàng | `NOT_READY` |

### 1.3 Idempotency, đồng thời, phân trang, thời gian

- **Idempotency:**
  - `Idempotency-Key` (UUID) **bắt buộc** với mọi POST / PUT có tác dụng phụ: nộp bài chấm, chỉnh điểm, đăng ký,
    xác nhận bốc thăm / sơ đồ, xếp sân, ghi kết quả, chốt / huỷ chốt, gộp hồ sơ, đóng buổi. Thiếu → 400.
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
| `mm` | `matchmaking:compute` |
| `pw` | `player:write` |

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
| `GET /v1/matches/{id}` | `t:read` hoặc `s:read` (theo ngữ cảnh) | Chi tiết trận |
| `POST /v1/matches/{id}/call` | `t:operate` / `s:operate` | Gọi ra sân `{ courtRef }` → `in_play` |
| `PUT /v1/matches/{id}/result` | `t:operate` / `s:operate` | `{ games }` \| `{ outcome: "walkover", winnerSide }` \| `{ games, outcome: "retired", winnerSide }`. `If-Match` bắt buộc. Trận loại trực tiếp: người thắng tự vào ô sau; đổi người thắng khi trận sau đã bắt đầu → 409 `NEXT_MATCH_STARTED` |
| `POST /v1/matches/{id}/cancel` | `t:manage` / `s:operate` | Huỷ trận chưa có kết quả. Trận trong sơ đồ loại trực tiếp không huỷ được (xử W.O.). Trận giao lưu bị huỷ không tính là đã đánh |
| `POST /v1/matches/{id}/end` | `s:operate` | Trận giao lưu "xong, không nhập tỉ số" → `ended`, sân được nhả; nhập tỉ số sau vẫn được. Trận giải → 409 `RESULT_REQUIRED` |

### 2.6 Giải đấu (module `tournament`, tài liệu 06)

| Method + đường dẫn | Scope | Trạng thái | Việc |
|---|---|---|---|
| `POST /v1/tournaments/advice` | `t:read` | — | Gợi ý thể thức / số bảng / ước tính thời gian theo số đội dự kiến (wizard bước 3–4) |
| `POST /v1/tournaments` | `t:manage` | — | Tạo (`draft`). `organizerRef` ∈ `org`; `tier = chain` cần `org = *` |
| `GET /v1/tournaments` · `GET /v1/tournaments/{id}` | `t:read` | — | Danh sách (lọc trạng thái, ngày, nội dung) · chi tiết + tiến độ |
| `PATCH /v1/tournaments/{id}` | `t:manage` | `draft`, `open` | Sửa (`If-Match` bắt buộc); đã có người đăng ký thì không đổi nội dung / giới / cách ghép / luật điểm / điều kiện trình → 409 `LOCKED_AFTER_ENTRIES` |
| `POST /v1/tournaments/{id}/open` | `t:manage` | `draft` | Mở đăng ký |
| `GET/POST /v1/tournaments/{id}/entries` · `DELETE …/entries/{entryId}` | `t:operate` | `open` (thêm) · mọi lúc trước chốt (rút) | Đăng ký / rút (06, mục 4.2, 7.4) |
| `POST /v1/tournaments/{id}/draw/preview` | `t:manage` | `open`, `drawn` chưa có kết quả | `{ seed? }` → đội + chờ + bảng + lịch theo lượt + thống kê cân bằng |
| `POST /v1/tournaments/{id}/draw` | `t:manage` | như trên | `{ seed, teams, groups }` đã chỉnh tay → kiểm tra → sinh trận → `drawn` |
| `POST /v1/tournaments/{id}/reopen` | `t:manage` | `drawn` chưa có kết quả | Huỷ bốc thăm, về `open` |
| `GET /v1/tournaments/{id}/teams` · `…/matches` · `…/standings` · `…/bracket` | `t:read` | — | Các đội · lịch theo lượt / bảng · xếp hạng từng bảng · sơ đồ |
| `POST /v1/tournaments/{id}/matches` | `t:manage` | `in_progress` | Thêm trận tay `{ teamAId, teamBId, label }` |
| `POST /v1/tournaments/{id}/knockout/preview` · `POST …/knockout` | `t:manage` | vòng bảng xong | Xem trước / khoá sơ đồ (kèm đổi ô) → `stage = knockout` |
| `GET /v1/tournaments/{id}/finalize-preview` | `t:read` | mọi trận xong | Thứ hạng + điểm trình trước / sau + điểm thành tích |
| `POST /v1/tournaments/{id}/finalize` · `…/unfinalize` | `t:manage` | `in_progress` / `finalized` | Chốt / huỷ chốt (06, mục 7) |
| `GET /v1/tournaments/{id}/placements` | `t:read` | `finalized` | Thứ hạng chung cuộc |
| `POST /v1/tournaments/{id}/cancel` | `t:manage` | trừ `finalized` | Huỷ, không áp điểm |

### 2.7 Buổi giao lưu (module `session`, tài liệu 06 mục 8)

| Method + đường dẫn | Scope | Việc |
|---|---|---|
| `POST /v1/sessions` · `GET /v1/sessions` · `GET/PATCH /v1/sessions/{id}` | `s:operate` / `s:read` | Tạo (mở ngay) / xem (kèm tiến độ) / sửa buổi (`PATCH` bắt buộc `If-Match`; có trận thì khoá Đơn / Đôi; không bỏ được sân đang có trận) |
| `GET /v1/sessions/{id}/players` · `POST …/players` · `DELETE …/players/{playerId}` | `s:read` / `s:operate` | Danh sách điểm danh / điểm danh (kèm `quickLevel` nếu chưa có điểm — cần thêm `rating:assess`) / rời buổi (đang ở sân → 409 `PLAYER_ON_COURT`) |
| `POST /v1/sessions/{id}/fill-courts/preview` · `POST …/fill-courts` | `s:operate` | Xếp sân trống: xem trước (đổi tay được, có `repeatPartners`) / xác nhận bản gửi lại nguyên văn hoặc để hệ thống tự xếp → sinh trận đang đánh. Bản cũ → 409 `FILL_STALE`; không có gì để xếp → 422 `NOTHING_TO_FILL` |
| `GET /v1/sessions/{id}/matches` | `s:read` | Các trận của buổi theo lượt |
| `GET /v1/sessions/{id}/board` | `s:read` | Dữ liệu màn hình lớn: sân – ai với ai – từ lúc nào (kèm `serverTime`); `upcoming` = ai sẽ vào các sân đang trống nếu bấm "Xếp sân trống" ngay (cùng hàm, cùng seed — rỗng khi không có sân trống); hàng chờ theo thứ tự ưu tiên của thuật toán, `next` = nằm trong `upcoming`; kết quả gần nhất |
| `GET /v1/sessions/{id}/close-preview` · `POST …/close` · `POST …/cancel` | `s:read` / `s:operate` | Xem trước khi đóng / đóng (trận chưa tỉ số bị huỷ, áp điểm hệ số 0.5 nếu bật, cộng thống kê "giao lưu") / huỷ buổi |

### 2.8 Tích hợp & vận hành

| Method + đường dẫn | Xác thực | Việc |
|---|---|---|
| `POST /v1/events` | Chữ ký HMAC của hệ thống gửi | Nhận sự kiện từ app chính (mục 3.3) |
| `GET /v1/ops/outbox?status=dead` · `POST /v1/ops/outbox/{id}/replay` | `ops:admin` | Xem / gửi lại sự kiện kẹt |
| `GET /health/live` · `GET /health/ready` | không | Health check |
| `GET /openapi.json` · `GET /docs` | không (tắt `/docs` ở production) | Hợp đồng + Swagger UI |

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
| Chưa đăng nhập (trang BXH công khai) | `ranking:read` | — | — (chỉ thấy hồ sơ `public`) |
| `customer` | `rating:self ranking:read` | — | `bd:customer:<customer.id>` |
| `employee` | `rating:read rating:assess player:write ranking:read matchmaking:compute tournament:read tournament:operate session:read session:operate` | chi nhánh của nhân viên | — |
| `branch_manager` | như `employee` + `rating:assess:any rating:adjust tournament:manage` | chi nhánh của mình | — |
| `admin` | như `branch_manager` | chi nhánh đang chọn (`X-Branch-Id`); chưa chọn → `*` | — |

- Ví dụ ánh xạ: `GET /api/v1/competition/me` → `GET /v1/me`; `PUT /api/v1/competition/matches/:id/result` →
  `PUT /v1/matches/:id/result`.
- Envelope, status code, `ETag` giữ nguyên.
- Gateway tự sinh `Idempotency-Key` nếu frontend không gửi, nhưng frontend **nên** tự gửi để bấm hai lần vẫn chỉ
  một lần.
