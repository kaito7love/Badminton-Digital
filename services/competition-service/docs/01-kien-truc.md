# competition-service — Kiến trúc

> Thiết kế, chưa có code. Plan và các quyết định cần chốt nằm ở
> `docs/05-extra/02-remediation/18-ke-hoach-cham-trinh-xep-cap.md`.
>
> Tài liệu cùng bộ:
> - `02-hop-dong-api-va-su-kien.md` — hợp đồng API và sự kiện
> - `03-nghiep-vu-va-thuat-toan.md` — form tự chấm, điểm trình
> - `04-video-analysis-service.md` — service AI video
> - `05-ho-so-nguoi-choi-va-bang-xep-hang.md` — hồ sơ, thống kê, bảng xếp hạng
> - `06-tran-dau-giai-dau-giao-luu.md` — trận đấu, giải đấu, giao lưu
> - `07-giao-dien.md` — màn hình

## 1. Service này là gì

**competition-service** ("Dịch vụ Thi đấu") là một service độc lập, gồm 7 module:

| Module | Sở hữu | Tài liệu |
|---|---|---|
| `player` | Hồ sơ người chơi, quyền riêng tư, thống kê, gộp / ẩn danh | 05 |
| `rating` | Bộ tiêu chí, bài chấm (tự chấm / nhân viên / chấm nhanh / AI), điểm trình Đơn và Đôi, sổ điểm | 03 |
| `ranking` | BXH trình độ, BXH thành tích (điểm theo thứ hạng giải), ảnh chụp hằng ngày | 05 |
| `matchmaking` | Thuật toán **không trạng thái**: ghép đồng đội cân bằng, chia bảng, lịch vòng tròn, xếp lượt, sơ đồ loại trực tiếp, xếp sân giao lưu. Hệ thống khác gọi được mà không cần tạo giải | 06 |
| `match` | Mô hình trận chung: tạo, gọi ra sân, nhập / kiểm tra tỉ số, lịch sử, đối đầu | 06 |
| `tournament` | Giải: wizard, thể thức, đăng ký, bốc thăm, sơ đồ, thứ hạng chung cuộc, chốt / huỷ chốt | 06 |
| `session` | Buổi giao lưu: điểm danh, xếp sân trống, đóng buổi | 06 |

Nó **không biết** gì về sân, đặt sân, hoá đơn, nhân viên, chi nhánh hay mật khẩu. Những thứ đó thuộc app chính
(`backend/`). Hai bên chỉ biết nhau qua **hợp đồng API và sự kiện**, không qua code hay DB.

Trước mắt service nằm chung repo (monorepo) cho tiện phát triển, nhưng phải thoả mọi điều kiện để một ngày nào
đó chuyển sang repo riêng / server riêng mà **không sửa một dòng code nào của app chính**.

## 2. Bức tranh hệ thống

```
┌──────────────────────────── Trình duyệt (React SPA, frontend/) ─────────────────────────────┐
│  các trang cũ (sân, đặt sân, POS, khách hàng…)        features/competition (trình độ, giải) │
└──────────────┬───────────────────────────────────────────────────┬──────────────────────────┘
               │ /api/v1/*  (JWT người dùng như hiện nay)           │ /api/v1/competition/*
               ▼                                                   ▼
┌──────────────────────────── backend/ (app chính) ───────────────────────────────────────────┐
│  auth, khách hàng, chi nhánh, sân, POS…            Gateway competition (integrations/)      │
│  outbox: bd.customer.updated / merged / deleted    • đổi vai trò → scope                    │
│                                                    • ký service token ES256 (sống 60 giây)  │
│                                                    • timeout, retry GET, circuit breaker    │
└───────┬────────────────────────────────────────────────────┬────────────────────────────────┘
        │                                                    │ HTTP nội bộ (REST /v1)
        ▼                                                    │ + webhook ký HMAC, hai chiều
 [MySQL: badminton_digital_management]                       ▼
                                   ┌──────────────── competition-service ───────────────────┐
                                   │  modules: rating · matchmaking · tournament            │
                                   │  platform: auth, idempotency, outbox/inbox, health     │
                                   └────────────────────────┬───────────────────────────────┘
                                                            ▼
                                             [MySQL: competition_service]
                                                            ▲
             (giai đoạn sau)                                │ REST /v1 với token riêng
             video-analysis-service (Python, GPU) ──────────┘ (scope assessment:submit-ai)
```

**Trình duyệt không gọi thẳng competition-service.** Mọi request đi qua gateway trong app chính, vì 4 lý do:

- giữ một origin duy nhất (bản demo Render chạy same-origin, không cần CORS);
- dùng lại đăng nhập, vai trò, chi nhánh sẵn có;
- service không phải hiểu mô hình người dùng của app chính;
- service không cần mở ra Internet.

Hợp đồng vẫn cho phép sau này frontend gọi thẳng, nếu app chính cấp token ngắn hạn cho trình duyệt (mục 6).

## 3. Luật ranh giới — "độc lập" nghĩa là gì, kiểm tra được

| # | Luật | Cách kiểm tra |
|---|---|---|
| B1 | Service không `require` bất cứ thứ gì ngoài thư mục `services/competition-service/`; `backend/` không `require` gì từ service | `scripts/check-boundaries.js` chạy trong CI |
| B2 | **DB riêng** (`competition_service`), user DB riêng; không JOIN / không đọc chéo DB | User DB của mỗi bên chỉ có quyền trên DB của mình |
| B3 | Chỉ chia sẻ **hợp đồng** (OpenAPI + JSON Schema sự kiện), không chia sẻ code. Mỗi bên tự viết adapter của mình và test theo hợp đồng | Test contract hai phía |
| B4 | Tham chiếu sang hệ thống khác bằng **chuỗi mờ** (`externalRef`, `organizerRef`, `courtRef`), không bằng khoá ngoại | Schema |
| B5 | App chính sống bình thường khi service chết: đặt sân, POS, thanh toán không bao giờ gọi đồng bộ sang service | Test tắt service (plan, mục 5) |
| B6 | Service chạy được, test được một mình: không cần app chính, có script tạo token dev, có Swagger UI | CI của service chạy riêng |
| B7 | Trong service, module chỉ gọi nhau qua `modules/<tên>/index.js` | `check-boundaries.js` |
| B8 | Deploy, migrate, seed, version độc lập (`package.json` riêng, `SequelizeMeta` riêng, Dockerfile riêng) | Cấu trúc thư mục |

## 4. Cấu trúc bên trong (hexagonal — ports & adapters)

```
services/competition-service/
├── package.json · package-lock.json · Dockerfile · .env.example · .sequelizerc · README.md
├── openapi/competition-service.v1.yaml     ← hợp đồng REST (nguồn sự thật, viết trước code)
├── contracts/events/*.schema.json          ← JSON Schema cho từng sự kiện phát ra / nhận vào
├── docs/                                   ← bộ tài liệu này
├── scripts/  keys-generate.js · token-dev.js · check-boundaries.js · outbox-replay.js
├── src/
│   ├── main.js                             ← composition root: đọc config, lắp các module, mở HTTP
│   ├── modules/                            (mỗi module: domain/ · application/ · infrastructure/ · index.js)
│   │   ├── player/       domain: visibility, ageGroup, statsAccumulator
│   │   │                 application: upsertByRef · updateProfile · merge · anonymize · getStats · headToHead
│   │   ├── rating/       domain: rubric/v1 · scoreAssessment · ratingEngine (computePeriodRatings) · pairingRating
│   │   │                 application: submitAssessment · quickAssess · review · verify · adjust · applyPeriod
│   │   ├── ranking/      domain: rankingPoints · leaderboardRules
│   │   │                 application: awardTournament · revokeTournament · leaderboards · dailySnapshot
│   │   ├── matchmaking/  domain (thuần, không DB): formBalancedTeams · drawGroups · roundRobin · scheduleSlots
│   │   │                 buildBracket · fillCourts · seededRandom — chỉ có http/, không có DB
│   │   ├── match/        domain: badmintonScore · matchStateMachine · bracketAdvance
│   │   │                 application: call · recordResult · correctResult · cancel
│   │   ├── tournament/   domain: stateMachine · eligibility · standings · placements · formatAdvisor
│   │   │                 application: create · open · register · withdraw · previewDraw · confirmDraw · reopen
│   │   │                 previewKnockout · confirmKnockout · finalizePreview · finalize · unfinalize · cancel
│   │   └── session/      domain: sessionRules
│   │                     application: create · checkIn · leave · previewFill · confirmFill · close
│   └── platform/                           ← kỹ thuật dùng chung, không chứa nghiệp vụ
│       ├── config/     đọc + kiểm tra env, sai là không khởi động (như app chính)
│       ├── http/       app Express · xác thực service token · kiểm scope · envelope lỗi
│       │               · Idempotency-Key · X-Request-Id · kiểm request theo OpenAPI
│       ├── db/         Sequelize · migrations/ · seeders/ · helper transaction · uuidv7
│       ├── events/     outbox (ghi trong cùng transaction) · dispatcher webhook · inbox (khử trùng lặp)
│       ├── logging/    pino JSON, kèm requestId
│       └── health/     /health/live · /health/ready
└── tests/  unit/ (domain thuần) · integration/ (API + MySQL thật) · contract/ (OpenAPI + JSON Schema)
```

Các tầng:

- **`domain/`** là hàm thuần, không I/O, không Sequelize. Công thức và thuật toán nằm ở đây, test bằng Jest không
  cần DB.
- **`application/`** là từng use case: mở transaction, khoá dòng, gọi domain, ghi repo, ghi outbox.
- **`infrastructure/`** là adapter: DB, HTTP.

Đổi Express sang Fastify, hay MySQL sang Postgres, chỉ đụng `infrastructure/` và `platform/`.

**Phụ thuộc giữa các module** (một chiều, không vòng):

```
tournament ─┬─▶ match ─▶ player
session ────┤
            ├─▶ matchmaking (thuần)
            ├─▶ rating ─▶ player
            └─▶ ranking ─▶ player
```

**Vì sao 7 module chung một service thay vì 7 service:** chốt giải phải ghi **nguyên tử** (một transaction):

- kết quả;
- điểm trình;
- điểm thành tích;
- thống kê của mọi người chơi.

Tách service thì phải dùng saga + bù trừ, quá phức tạp cho quy mô này. Ranh giới module (B7) giữ sẵn đường tách.
Ví dụ khi tách `rating` + `ranking` thành service riêng: `tournament` phát `competition.tournament.finalized` kèm
kết quả, bên kia nhận và áp điểm (xem 02, mục 3).

**Stack:** Node 22, Express 4, Sequelize 6 + mysql2, Jest, CommonJS — giống app chính để một người bảo trì cả
hai. Thêm các thư viện:

- `jose` — kiểm token ES256;
- `pino` — log;
- `uuid` — v7;
- `express-openapi-validator` — kiểm request theo spec;
- `swagger-ui-express` — chỉ bật ngoài production.

## 5. Dữ liệu (DB `competition_service`)

Quy ước chung:

- Mọi bảng có khoá chính `id` **UUIDv7** (`CHAR(36)`): sinh theo thời gian nên index tốt, không lộ số lượng, không
  đụng ID giữa các service. Aiven bắt buộc có khoá chính (`sql_require_primary_key`).
- Mọi bảng nghiệp vụ có `tenant_id`.
- `created_at`/`updated_at` lưu UTC (như app chính).
- Bảng có sửa đồng thời có `version` (optimistic lock).

| Bảng | Cột chính | Ghi chú |
|---|---|---|
| `players` | `tenant_id`, `external_ref` (null được — người chơi tạo thẳng trong service khi chạy độc lập), `display_name`, `nickname`, `gender`, `birth_year`, `dominant_hand`, `playing_since_year`, `sessions_per_week`, `preferred_play`, `doubles_position`, `home_organizer_ref`, `visibility` (`public`/`members`/`hidden`), `status` (`active`/`merged`/`anonymized`), `merged_into_player_id`, `version` | unique (`tenant_id`, `external_ref`), unique (`tenant_id`, `nickname`). **Không lưu SĐT/email**: dữ liệu cá nhân tối thiểu (05, mục 1) |
| `player_stats` | `player_id`, `discipline`, `context` (`tournament`/`session`), `matches`, `wins`, `losses`, `games_won`, `games_lost`, `points_won`, `points_lost`, `tournaments`, `titles`, `runner_ups`, `semis`, `streak`, `last5` JSON, `best_rating`, `best_rating_at` | Bảng tổng hợp đọc nhanh; nguồn sự thật là `matches`. Dựng lại được bằng script |
| `player_ratings` | `player_id`, `discipline` (`singles`/`doubles`), `rating` DECIMAL(5,3), `rated_matches`, `last_match_at`, `verified`, `verified_by_ref`, `version` | unique (`player_id`, `discipline`). Chưa chấm lần nào thì chưa có dòng |
| `assessments` | `player_id`, `source` (`self`/`staff`/`staff_quick`/`video_ai`), `rubric_version`, `answers` JSON, `confidence` JSON, `result` JSON, `status` (`applied`/`recorded`/`pending_review`/`rejected`/`superseded`), `needs_verification`, `submitted_by_ref`, `reviewed_by_ref`, `evidence_ref`, `match_id` | `result` = điểm Đơn/Đôi tính ra + tiêu chí nào chặn trần; `evidence_ref` = id phân tích video (giai đoạn sau) |
| `rating_changes` | `player_id`, `discipline`, `rating_before`, `rating_after`, `delta`, `reason` (`assessment`/`tournament`/`session`/`adjustment`/`rollback`/`merge`), `assessment_id`, `context_type`, `context_id`, `actor_ref`, `note`, `calc` JSON | **Sổ điểm chỉ thêm, không sửa/xoá.** Index (`player_id`, `discipline`, `created_at`). `calc` lưu E, K, m, w của từng trận để kiểm toán |
| `matches` | `tenant_id`, `context_type` (`tournament`/`session`), `context_id`, `discipline`, `stage` (`group`/`knockout`/`extra`), `label`, `group_no`, `round_no`, `slot_no`, `bracket_pos`, `next_match_id`, `next_slot`, `loser_next_match_id`, `loser_next_slot`, `team_a_id`, `team_b_id`, `scoring` JSON, `games` JSON, `outcome`, `winner_side`, `status` (`scheduled`/`in_play`/`completed`/`cancelled`), `rating_weight`, `counted`, `court_ref`, `called_at`, `completed_at`, `recorded_by_ref`, `version` | Mô hình trận chung cho giải và giao lưu (06, mục 1). `loser_next_*` = ô trận tranh hạng 3; `counted` = trận thuộc kỳ đã chốt → vào thống kê. `court_ref` vd `bd:court:7` |
| `match_participants` | `match_id`, `side` (`A`/`B`), `player_id` | Index (`player_id`, `match_id`) → lịch sử, đối đầu, đồng đội |
| `tournaments` | `tenant_id`, `organizer_ref`, `name`, `description`, `starts_on`, `tier` (`club`/`open`/`chain`), `discipline`, `gender_rule`, `pairing_mode`, `max_partner_gap`, `max_entries`, `rating_rule` JSON, `format` (`round_robin`/`groups_knockout`/`knockout`), `group_count`, `group_mode`, `advance_per_group`, `third_place_match`, `scoring` JSON, `court_count`, `match_minutes`, `rated`, `ranked`, `draw_seed`, `status`, `stage` (`group`/`knockout`), `finalized_at`, `created_by_ref`, `version` | `organizer_ref` vd `bd:branch:1`: chuỗi mờ, service không biết "chi nhánh" là gì. `max_entries` tính theo **số người** |
| `tournament_entries` | `tournament_id`, `player_id`, `partner_player_id`, `status` (`registered`/`waitlisted`/`withdrawn`), `waitlist_reason` (`capacity`/`draw`), `rating_snapshot`, `pairing_rating_snapshot`, `registered_at`, `registered_by_ref` | unique (`tournament_id`, `player_id`). Cặp cố định = 2 dòng trỏ chéo `partner_player_id`. `waitlist_reason = draw` (lẻ người / lệch nam–nữ) được trả về `registered` khi bốc lại / mở lại |
| `tournament_teams` | `tournament_id`, `player1_id`, `player2_id`, `team_rating`, `group_no`, `pot_no`, `seed`, `withdrawn_at` | `player2_id` null khi đánh đơn |
| `tournament_placements` | `tournament_id`, `team_id`, `position_from`, `position_to`, `label` (vd "Vô địch", "Tứ kết"), `reached_knockout`, `wins` | Tính khi chốt (06, mục 6), xoá khi huỷ chốt |
| `ranking_results` | `player_id`, `category` (`MS`/`WS`/`MD`/`WD`/`XD`), `tournament_id` (chuỗi mờ, không khoá ngoại), `tournament_name`, `placement_from`, `placement_to`, `placement_label`, `base_points`, `tier_factor`, `size_factor`, `strength_factor`, `points`, `awarded_at`, `expires_at`, `revoked_at` | Điểm BXH thành tích (05, mục 3.2). Lưu sẵn tên giải / nhãn thứ hạng để module ranking không phải đọc bảng của tournament |
| `leaderboard_snapshots` | `kind` (`rating`/`points`), `category`, `scope`, `snapshot_date`, `player_id`, `rank`, `value` | Ảnh chụp hằng ngày để tính ↑↓; giữ 90 ngày |
| `play_sessions` | `tenant_id`, `organizer_ref`, `name`, `starts_at`, `court_refs` JSON, `format` (`doubles`/`singles`), `mode` (`balanced`/`level`/`random`), `scoring` JSON, `rated`, `seed`, `status` (`open`/`closed`/`cancelled`), `closed_at`, `version` | Buổi giao lưu (06, mục 8) |
| `play_session_players` | `session_id`, `player_id`, `status` (`present`/`left`), `joined_at`, `left_at`, `games_played`, `waiting_since` | unique (`session_id`, `player_id`) |
| `audit_log` | `actor_ref`, `action`, `target_type`, `target_id`, `before` JSON, `after` JSON, `request_id`, `created_at` | Nhật ký thao tác của service: sửa tỉ số, chỉnh điểm, đổi tay bốc thăm… (tương tự `ActivityLog` của app chính nhưng thuộc service) |
| `outbox_events` | `id` (dòng), `event_id` (id sự kiện — một sự kiện có một dòng cho mỗi bên nhận), `target`, `type`, `aggregate_type`, `aggregate_id`, `payload` JSON, `status` (`pending`/`delivered`/`dead`), `attempts`, `next_attempt_at`, `last_error` | Ghi **cùng transaction** với thay đổi nghiệp vụ |
| `inbox_events` | `id`, `source`, `event_id` (unique theo nguồn), `type`, `received_at`, `processed_at`, `result` | Nhận trùng thì bỏ qua |
| `idempotency_keys` | `client_id`, `key`, `request_hash`, `response_status`, `response_body` JSON, `expires_at` | unique (`client_id`, `key`), giữ 24 giờ |

Quan hệ giữa các bảng khai báo trong một file (`platform/db/associations.js`), theo tinh thần `models/index.js`
của app chính.

## 6. Danh tính, tenant, bảo mật

**Service token** (app chính ký, service kiểm):

```json
{
  "iss": "badminton-digital-core",       "aud": "competition-service",
  "iat": 1790000000, "exp": 1790000060,  "kid": "core-2026-09",
  "tenant": "badminton-digital",
  "sub": "bd:user:42",                   // ai đang thao tác, ghi vào *_by_ref / actor_ref
  "scope": "rating:read tournament:read tournament:operate",
  "org": ["bd:branch:1"],                 // organizer được phép; "*" = mọi chi nhánh (admin chưa chọn chi nhánh)
  "player": "bd:customer:123",            // chỉ có khi người thao tác chính là người chơi (khách hàng)
  "player_name": "Nguyễn Văn A"           // dùng để tự tạo hồ sơ lần đầu (JIT)
}
```

- **Ký bất đối xứng ES256.** App chính giữ khoá bí mật; service chỉ có khoá công khai (`TRUSTED_ISSUERS`, xoay
  khoá theo `kid`). Service bị lộ cũng không giả được token. Không dùng lại `JWT_ACCESS_SECRET` (HS256) của app
  chính: khoá đối xứng đưa cho bên nào thì bên đó ký giả được.
- Token sống 60 giây, ký lại cho mỗi request (rẻ).
- `aud` phải đúng. Lệch đồng hồ cho phép tối đa 30 giây.
- Thiếu token / sai chữ ký / hết hạn → 401. Thiếu scope → 403.
- Tài nguyên thuộc tenant hay organizer khác → **404**, không phải 403, để không lộ là tài nguyên đó có tồn tại.
- **Scope** (danh sách đầy đủ và từng endpoint cần scope nào: xem 02, mục 2):
  - `rating:read`, `rating:self`, `rating:assess`, `rating:assess:any`, `rating:adjust`;
  - `player:write`;
  - `matchmaking:compute`;
  - `tournament:read`, `tournament:operate`, `tournament:manage`;
  - `session:read`, `session:operate`;
  - `ranking:read` (cấp cả cho người chưa đăng nhập, khi đó chỉ thấy hồ sơ `public`);
  - `assessment:submit-ai` (chỉ cấp cho video-analysis-service);
  - `ops:admin` (xem / gửi lại outbox; gateway không cấp scope này cho vai trò nào).

  Service chỉ biết scope, **không biết** `admin`/`employee`. Bảng đổi vai trò → scope nằm ở gateway của app chính.
- **Chi nhánh:** gateway đặt `org` theo `branchContextMiddleware` sẵn có. Service kiểm tra thêm lần nữa: giải nào
  có `organizer_ref` không nằm trong `org` thì coi như không tồn tại.
- **Webhook hai chiều:**
  - chữ ký `X-Signature: sha256=HMAC(secret, X-Timestamp + "." + body)`;
  - lệch quá 5 phút là từ chối;
  - mỗi chiều một secret ≥ 32 ký tự;
  - so sánh bằng `timingSafeEqual` (như `paymentWebhookAuth` của app chính).
- **Mạng:** service không mở cổng ra ngoài. Compose dùng mạng nội bộ, bản demo Render chỉ nghe `127.0.0.1`. Có
  token rồi vẫn giữ lớp này (phòng thủ nhiều lớp).
- **Dữ liệu cá nhân:** chỉ tên hiển thị, giới tính, năm sinh (tuỳ chọn). Xoá khách ở app chính → service ẩn danh
  hoá hồ sơ (02, mục 3.2).

## 7. Độ bền khi lỗi

| Tình huống | Cách xử lý |
|---|---|
| Service chết / chậm | Gateway: timeout 3 giây, GET thử lại 1 lần. Hỏng 5 lần liên tiếp thì mở circuit breaker 30 giây, trả nhanh 503 `COMPETITION_UNAVAILABLE`, UI báo "Tính năng thi đấu tạm gián đoạn". **Phần còn lại của app không bị ảnh hưởng** (B5) |
| Gửi lại request (retry, bấm hai lần) | `Idempotency-Key` bắt buộc với mọi POST có tác dụng phụ; cùng key cùng body thì trả lại đúng response cũ; cùng key khác body → 422 |
| Hai người sửa cùng lúc | `version` + header `If-Match` → 409 `VERSION_CONFLICT`. Chốt giải: khoá dòng giải + các dòng `player_ratings` theo thứ tự id (tránh deadlock) |
| Bên nhận webhook chết | Outbox giữ sự kiện, gửi lại lùi dần: 10 giây → 1 phút → 5 phút → 30 phút → 2 giờ → mỗi 6 giờ. Quá 24 giờ thì `dead`, xem và gửi lại qua `GET/POST /v1/ops/outbox` |
| Nhận sự kiện trùng | `inbox_events` khử trùng lặp theo `id` — xử lý đúng một lần về mặt hiệu ứng |
| Sự kiện đến sai thứ tự | Sự kiện mang `occurred_at` + phiên bản tài nguyên; handler bỏ qua bản cũ hơn cái đã áp (vd `customer.updated` cũ đến sau) |

## 8. Quan sát (observability)

- Gateway chuyển tiếp `X-Request-Id` (app chính đã sinh sẵn ở `requestContextMiddleware`). Service ghi log JSON
  với cùng id, nên tra được một thao tác xuyên hai service.
- Service ghi log truy cập (method, route, status, thời gian, `sub`, `client`). **Không** log body, không log
  token.
- `/health/live` (process sống), `/health/ready` (DB trả lời + migration đã chạy xong).
- Header `X-Service-Version` = version trong `package.json`.
- Sau này thêm `/metrics` (Prometheus): số request, độ trễ, outbox tồn đọng, số sự kiện `dead`.

## 9. Triển khai

| Môi trường | Cách chạy |
|---|---|
| **Dev một mình** | `cd services/competition-service && npm run dev` (cổng 5100, DB `competition_service` trên MySQL local). `npm run keys:generate` tạo cặp khoá dev; `npm run token:dev -- --scope "…" --org bd:branch:1` in token để gọi bằng curl / Swagger UI `/docs` |
| **Dev cả hệ thống** | Như trên + app chính đặt `COMPETITION_SERVICE_URL=http://localhost:5100` và khoá ký. Không đặt → tính năng tắt, app chính chạy như cũ |
| **Docker compose** | Thêm container `competition` (Dockerfile riêng), không publish cổng (hoặc chỉ `127.0.0.1` để debug). MySQL có thêm DB + user riêng (script init; volume cũ phải tạo tay một lần, có hướng dẫn). Entrypoint riêng: chờ DB → migrate → chạy. `backend` gọi `http://competition:5100` |
| **Demo Render free** | Một web service chỉ được một container, và free chỉ có 512 MB RAM. **Chung một image, hai process:** entrypoint chạy competition-service ở `127.0.0.1:5100` (`--max-old-space-size=160`), rồi `exec` app chính. Competition chết thì app chính vẫn phục vụ, chỉ tính năng thi đấu báo gián đoạn. DB: tạo thêm database `competition_service` trong cùng Aiven MySQL free. `demo-reset.yml` reset cả hai DB |
| **Production thật (sau này)** | Container / máy riêng, DB server riêng, token xoay khoá định kỳ; muốn thì thay webhook bằng message broker (chỉ đổi adapter `platform/events`) |

**CI** (`.github/workflows/ci.yml`) thêm job `competition-service`:

- chạy khi thư mục service đổi;
- các bước: `npm ci` → `check-boundaries` → test unit → test integration + contract với MySQL 8 service
  container của GitHub Actions.

## 10. Phiên bản và thay đổi hợp đồng

- API theo đường dẫn `/v1`. Trong v1 chỉ **thêm** (trường mới, endpoint mới); client phải bỏ qua trường lạ. Đổi
  nghĩa hay xoá thì lên `/v2`, chạy song song một thời gian.
- Sự kiện có `dataschema` kèm version (`competition.player.rating_changed/v1`). Thay đổi phá vỡ thì phát type mới.
- Bộ tiêu chí có version riêng (`rubric v1`). Lần chấm nào cũng lưu version đã dùng.
