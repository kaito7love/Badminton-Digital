# Kế hoạch: bước 4(a) — cổng nối app chính ↔ competition-service + sự kiện hai chiều

- **Ngày:** 05/10/2026.
- **Trạng thái:** chủ dự án duyệt 05/10/2026 ("theo đề xuất hết, code đi" — cả 6 câu ở mục 4 theo đề xuất) → **đã làm xong, đã chạy thật, kết quả ở mục 9; đã merge vào `main` 06/10/2026 cùng (b)(c).** Chưa push `main`.
- **Nhánh:** `feat/competition-integration`, tách từ `main` @ `379e634`.
- **Thuộc:** bước 4 của plan 18 (`18-ke-hoach-cham-trinh-xep-cap.md`, mục "Bước 4"). Chia ba phần, mỗi phần một plan
  riêng để duyệt từng cái:

  | Phần | Nội dung | Trạng thái |
  |---|---|---|
  | **(a)** | Cổng nối trong app chính + sự kiện hai chiều (plan này) | Xong 05/10/2026; đã merge vào `main` 06/10/2026 cùng (b)(c) |
  | (b) | Hạ tầng: compose, `render.yaml`, `app.Dockerfile`, `demo-reset.yml`, DeploymentGuide, Postman, RAM / DB thứ hai trên Aiven | Chưa lập plan |
  | (c) | Giao diện (`frontend/src/features/competition/`, menu, route) | Chưa lập plan |

- **Phạm vi (a):** `backend/` (code mới + 2 migration + sửa nhẹ `CustomerService`, `server.js`, `.env.example`) và
  tài liệu. **Không** sửa `services/competition-service` (hợp đồng đã đủ: ES256 token, `POST /v1/events`, webhook ký
  HMAC) trừ khi lúc chạy thật lộ lỗi — khi đó dừng lại hỏi.

## 0. Bối cảnh

Kiểm tra deploy 05/10/2026: service chạy độc lập tốt (23 suite / 285 test xanh; image Docker chạy production, migrate,
`/health/ready` xanh, 401 khi không token) nhưng **không ai gọi được** vì app chính chưa có cổng nối, và việc gộp /
xoá khách ở app chính không báo cho service. Bản demo công khai đã chạy trên Render (plan 22), nên phần (b) sau này
sẽ đưa service lên đó.

## 1. Hiện trạng đã đọc

- `authMiddleware` (JWT HS256 15 phút, nạp `req.user` kèm `role`, `employee`, `customer`), `sseAuthMiddleware` (nhận
  `?token=` cho EventSource), `branchContextMiddleware` (đặt `req.branchId`; admin đổi chi nhánh bằng `X-Branch-Id`;
  khách gửi header → 403) — dùng lại nguyên.
- `AuditService.record` ghi `ActivityLog` (`employeeId`/`userId` được phép null) — dùng cho sự kiện nhận về.
- `CustomerService.updateCustomer` / `mergeIntoAccount` / `deleteCustomer` đều chạy trong một transaction Sequelize — chỗ
  ghi outbox.
- Backend dùng Node 22 (có `fetch`, `AbortController`), `jsonwebtoken` (ký được ES256 bằng PEM), `express-rate-limit`.
  Chưa có `jose`; **không thêm thư viện mới**.
- Service: 97 endpoint qua cổng nối (100 trừ `POST /v1/events`, `GET /v1/ops/outbox`, `POST /v1/ops/outbox/:id/replay`);
  mỗi route đã tự kiểm scope (`requireScope`) và kiểm `org` theo chi nhánh. `POST /v1/events` xác thực bằng
  `X-Event-Source` + `X-Timestamp` + `X-Signature`, khử trùng theo `(source, id)`.

## 2. Thiết kế

### 2.1 Cổng nối `/api/v1/competition/*` → service `/v1/*`

`backend/src/integrations/competition/` (mới, **gỡ ra được**: thư mục này + một dòng `app.use` trong `server.js`):

| File | Việc |
|---|---|
| `config.js` | Đọc + kiểm env một lần (hàm thuần, có test như `paymentConfig`): `COMPETITION_SERVICE_URL`, `COMPETITION_SIGNING_KEY` (PEM ES256), `COMPETITION_KEY_ID`, `COMPETITION_ISSUER` (mặc định `badminton-digital-core`), `COMPETITION_TENANT` (mặc định `badminton-digital`), `COMPETITION_EVENT_SECRET` (≥ 32 ký tự, HMAC chiều đi), `COMPETITION_WEBHOOK_SECRET` (≥ 32 ký tự, chiều về; hai secret phải khác nhau). Thiếu bất kỳ cái nào → **tắt hẳn**, mọi route trả `503 COMPETITION_DISABLED`, phần còn lại của app chạy như cũ. Cấu hình dở dang (có URL mà thiếu khoá) → báo lỗi rõ lúc khởi động, không chạy nửa vời |
| `serviceToken.js` | Ký ES256, `iss/aud/iat/exp/kid/tenant/sub/scope/org/player/player_name` đúng 01 mục 6; sống 60 giây, đường SSE 300 giây |
| `roleScopes.js` | Bảng vai trò → scope (02 mục 5, giữ nguyên bảng đã duyệt): chưa đăng nhập `ranking:read`; `customer` `rating:self ranking:read match:score`; `employee` bộ vận hành; `branch_manager` + `rating:assess:any rating:adjust tournament:manage`; `admin` như `branch_manager`. **Không bao giờ cấp** `ops:admin`, `assessment:submit-ai` |
| `routeMap.js` | Danh sách cho phép theo **tiền tố tài nguyên + method**: `me`, `players`, `rubrics`, `assessments` (trừ `/ai`), `leaderboards`, `matchmaking`, `matches`, `tournaments`, `sessions`. Không có trong danh sách (`events`, `ops`, `assessments/ai`, mọi thứ lạ) → 404 ngay tại app chính, không chuyển tiếp |
| `client.js` | `fetch` có timeout (10 giây; SSE không timeout), **không tự thử lại** request ghi, ngắt mạch đơn giản (5 lỗi liên tiếp → 30 giây trả 503 `COMPETITION_UNAVAILABLE` mà không gọi), lỗi mạng / 5xx của service → 502 / 503 đúng envelope |
| `gateway.js` | Router: xác thực (`authMiddleware`; đường `…/stream` dùng `sseAuthMiddleware`; chỉ vài `GET` BXH công khai được vào không cần đăng nhập) → `branchContextMiddleware` cho nhân viên → đổi sang token service → chuyển tiếp thân + `If-Match` / `Idempotency-Key` / `Content-Type`; trả lại `ETag`, status, envelope nguyên trạng; SSE chuyển **từng mảnh, không đệm** (`X-Accel-Buffering: no`); tự sinh `Idempotency-Key` cho `POST` / `PUT` / `PATCH` nếu thiếu; giới hạn 256 KB (bằng service); rate limit cho đường công khai |

Cách xác định người gọi:
- `sub` = `bd:user:<user.id>`; `org` = `["bd:branch:<req.branchId>"]`; admin chưa chọn chi nhánh → `["*"]`.
- `player` = `bd:customer:<customer.id>` và `player_name` = tên khách, chỉ có khi vai trò `customer`.
- Phân quyền từng route (khách chốt giải, nhân viên chỉnh điểm…) vẫn do service kiểm bằng scope — cổng chỉ **cấp
  trần scope theo vai trò**, nên không phải duy trì thêm 97 dòng ánh xạ (xem câu 1 ở mục 4).

### 2.2 App chính → service: outbox (sự kiện `bd.customer.*`)

- **Migration mới** `integration_outbox` (id, `event_id` uuid duy nhất, `type`, `payload` JSON, `status`
  `pending|sent|dead`, `attempts`, `next_attempt_at`, `last_error`, `created_at`, `sent_at`); có khoá chính (Aiven).
- `CustomerService.updateCustomer` / `mergeIntoAccount` / `deleteCustomer` ghi dòng outbox **trong cùng transaction**:
  `bd.customer.updated` (`externalRef = bd:customer:<id>`, `fullName`, `version`), `bd.customer.merged`
  (`sourceRef`, `targetRef`), `bd.customer.deleted`. Chỉ ghi khi đổi tên / gộp / xoá thật (đổi số điện thoại, địa chỉ
  thì không). Dịch vụ tắt vẫn ghi (câu 2 ở mục 4).
- **Dispatcher** chạy trong process backend (khi có cấu hình): 5 giây quét một lần, lấy dòng `pending` đến hạn bằng
  `FOR UPDATE SKIP LOCKED`, `POST {URL}/v1/events` với `X-Event-Source`, `X-Timestamp`, `X-Signature =
  sha256=HMAC(secret, timestamp + "." + body)`, trả 2xx là xong; lỗi → lùi dần (5 s → 1 giờ), 12 lần thì `dead`.
  Thứ tự giữ theo từng khách (không gửi sự kiện sau khi sự kiện trước của cùng khách chưa xong). Dọn dòng `sent` cũ hơn
  30 ngày.

### 2.3 Service → app chính: webhook nhận sự kiện

- `POST /api/v1/integrations/competition/events` (`routes/competitionWebhookRoutes.js`), **fail-closed** như
  `paymentWebhookAuth`: chưa cấu hình → 503, sai chữ ký / lệch giờ quá 5 phút → 401 (`timingSafeEqual`); mọi từ chối ghi
  `ActivityLog` `competition.webhook_rejected`.
- Khử trùng theo `event.id` (migration mới `integration_inbox`, khoá duy nhất); xử lý trong cùng transaction với dòng
  inbox.
- Xử lý: `competition.tournament.finalized` / `unfinalized` / `cancelled`, `competition.session.closed` → một dòng
  `ActivityLog` ở chi nhánh `organizerRef` (người thực hiện: hệ thống, không gắn nhân viên). Các loại khác
  (`match.completed`, `player.rating_changed`, `tournament.drawn`, `assessment.submitted`) nhận 2xx và **bỏ qua có chủ ý**
  — TV / lịch của giải đã tự cập nhật qua luồng SSE của service, không cần đẩy lại qua app chính (câu 3).

### 2.4 Công cụ

- `npm run competition:keys` (script mới): sinh cặp khoá ES256, in **khoá bí mật** ra file `.keys/` (đã ignore) /
  biến `COMPETITION_SIGNING_KEY` và **khoá công khai dạng JWKS** để dán vào `TRUSTED_ISSUERS` của service; kèm hai
  secret HMAC ngẫu nhiên. Không in khoá bí mật ra log.
- `backend/.env.example`: các biến mới, mặc định để trống (= tắt).

## 3. Tệp dự kiến chạm

| Mới | Sửa |
|---|---|
| `backend/src/integrations/competition/{config,serviceToken,roleScopes,routeMap,client,gateway,outbox,dispatcher,webhookHandlers}.js` | `backend/src/server.js` (mount cổng + webhook, bật dispatcher) |
| `backend/src/routes/competitionWebhookRoutes.js` | `backend/src/services/CustomerService.js` (ghi outbox trong transaction có sẵn) |
| 2 migration (`integration_outbox`, `integration_inbox`) + 2 model | `backend/src/models/index.js` (đăng ký, theo CLAUDE.md đây là nơi duy nhất) |
| `backend/scripts/competition-keys.js` + script npm | `backend/.env.example`, `backend/package.json` |
| `backend/tests/competition*.test.js` | `CLAUDE.md` (mục kiến trúc), `docs/05-extra/02-remediation/00-tien-do.md`, README service (bảng trạng thái) |

## 4. Câu hỏi đã chốt (05/10/2026: chủ dự án chọn đúng đề xuất ở cả 6 câu)

1. **Kiểu danh sách cho phép của cổng.** (A) *Theo tiền tố tài nguyên + method, cấp trần scope theo vai trò, service
   tự kiểm từng route* — ít code, không lệch khi service thêm route, đã có test phía service cho từng scope. (B) *Liệt kê
   từng một trong 97 route* như bảng ban đầu ở 02 mục 5 — chặt hơn nhưng phải sửa hai nơi mỗi khi thêm endpoint.
   **Đề xuất A.**
2. **Khi chưa cấu hình service**, việc gộp / xoá / đổi tên khách có vẫn ghi outbox không? **Đề xuất: có** (bật service
   sau vẫn đồng bộ được; chi phí là vài dòng tồn đọng, có dọn định kỳ). Phương án khác: chỉ ghi khi đã cấu hình — đơn
   giản hơn nhưng khách gộp / xoá trước ngày bật sẽ lệch hồ sơ thi đấu.
3. **Sự kiện nhận về:** chỉ ghi `ActivityLog` cho chốt / huỷ chốt / huỷ giải / đóng buổi, bỏ qua loại còn lại?
   **Đề xuất: đúng như vậy.** (Thêm thông báo cho khách khi điểm trình đổi: để sau, ngoài phạm vi.)
4. **Trang BXH công khai (chưa đăng nhập):** cho phép khách vãng lai xem `GET /leaderboards/*` và hồ sơ công khai qua
   cổng, có rate limit? **Đề xuất: có** (02 mục 5 đã ghi; hồ sơ `members` / `hidden` do service lọc).
5. **Định danh người chơi của khách:** `bd:customer:<customer.id>`; nhân viên tạo hồ sơ cho khách vãng lai bằng đúng mã
   này (`PUT /players/by-ref/bd:customer:<id>`) để gộp về sau khớp. Có đồng ý không? (Đề xuất: đồng ý — đã là quy ước ở
   docs 02 / 05.)
6. **Admin chưa chọn chi nhánh** → `org = ["*"]` (xem mọi giải của chuỗi, đúng như 01 mục 6). Đồng ý không?
   (Đề xuất: đồng ý.)

## 5. Kiểm thử sẽ làm (thật, không chỉ đọc code)

**Jest (backend, không cần service):** cấu hình (thiếu / yếu / trùng secret → lỗi rõ; tắt → 503), claim và hạn token,
trần scope từng vai trò, danh sách cho phép (từ chối `events`, `ops`, `assessments/ai`, đường lạ, method lạ), ngắt mạch,
chữ ký HMAC hai chiều (đúng / sai / lệch giờ), khử trùng inbox, ghi outbox cùng transaction (rollback thì không còn dòng).

**Chạy thật** (backend + DB tạm; service thật + DB tạm; Chrome ngầm khi cần; dọn sạch sau):
- Từng vai trò: khách chốt giải → 403; `employee` chỉnh điểm trình → 403; `branch_manager` chi nhánh 2 xem giải chi nhánh 1
  → 404; admin chọn chi nhánh → chỉ thấy giải chi nhánh đó, chưa chọn → thấy hết.
- Khách bấm điểm đúng trận mình, trận người khác → bị từ chối; chưa đăng nhập xem BXH công khai được, gọi `tournaments` → 401.
- SSE qua cổng: nhận `score` / `ping` ngay (không bị đệm), token hết hạn → nối lại, service tắt rồi bật → nối lại.
- Tắt service: đặt sân / POS / thanh toán vẫn chạy, `/api/v1/competition/*` trả 503 sạch, bật lại thì chạy tiếp (ngắt mạch tự đóng).
- Sự kiện: đổi tên / gộp / xoá khách → hồ sơ người chơi đổi / gộp / ẩn danh; **tắt service lúc đó rồi bật lại** → sự kiện
  vẫn tới, không mất, không trùng; chốt giải → có dòng `ActivityLog` ở chi nhánh; gửi sai chữ ký → 401 và có nhật ký.
- Toàn bộ `npm test` backend + `npm test` service vẫn xanh; `check-boundaries` đạt (backend không require code service).

## 6. Không làm trong (a)

Hạ tầng / deploy (b), giao diện (c), Postman + docs OpenAPI của route cổng (đi cùng (b)), thông báo cho khách khi điểm
trình đổi, nhiều bản backend chạy song song (dispatcher đã an toàn nhờ `SKIP LOCKED`, còn event bus SSE sẵn có vẫn một
process như ghi chú hiện hữu), đổi bất kỳ hợp đồng nào của service.

## 7. Rủi ro

| Rủi ro | Giảm bằng |
|---|---|
| Lộ khoá ký → giả được mọi vai trò | Khoá chỉ ở env của app chính, service chỉ giữ khoá công khai (xoay theo `kid`); script không in khoá bí mật ra log |
| Service chậm kéo theo app chính | Timeout 10 giây + ngắt mạch; cổng nằm riêng, đường đặt sân / thanh toán không gọi service |
| Sự kiện khách đến sau khi hồ sơ đã bị xoá / gộp | Service đã khử trùng và xử lý theo thứ tự `subject`; outbox giữ thứ tự theo từng khách |
| Aiven free chỉ cho một DB | Hai bảng mới nằm DB của app chính (không đụng DB service); chuyện DB thứ hai thuộc (b) |

## 8. Theo dõi tiến độ

- [x] Đọc code app chính + hợp đồng service, chọn thiết kế (05/10/2026)
- [x] Plan này (05/10/2026)
- [x] Chủ dự án duyệt plan + trả lời 6 câu ở mục 4 (05/10/2026, theo đề xuất)
- [x] 2.1 Cổng nối (config, token, scope, danh sách cho phép, client, gateway) + test
- [x] 2.2 Outbox + dispatcher + sửa `CustomerService` + test
- [x] 2.3 Webhook nhận + inbox + `ActivityLog` + test
- [x] 2.4 Script khoá + `.env.example`
- [x] Chạy thật toàn bộ kịch bản mục 5, ghi kết quả vào mục 9 (có 1 lỗi thật bắt được và đã sửa)
- [ ] Báo cáo → **chủ dự án duyệt merge** → merge vào `main` (không tự push)

## 9. Kết quả

Môi trường chạy thật (không đụng DB dev của chủ dự án): backend :5002 + DB `bd_int_tmp` (migrate đủ + seed demo,
kể cả 2 migration mới), competition-service :5102 + DB `cs_int_tmp`, hai bên nối bằng bộ khoá sinh từ
`npm run competition:keys`; gọi qua HTTP thật bằng các tài khoản seed (admin, nhân viên chi nhánh 1, quản lý chi nhánh 2,
khách). Kịch bản ở scratchpad (không vào repo).

### 9.1 Jest

- backend **492 / 492** (40 suite; mới 9 suite `competition*` + sửa 2 test cũ vì `CustomerService` giờ ghi thêm một dòng outbox).
- services/competition-service không đổi dòng nào (đã chạy 285 / 285 hôm 05/10 trước khi làm).

### 9.2 Chạy thật — phần A: quyền, chi nhánh, khách bấm điểm, SSE (33 / 33)

| Kiểm | Kết quả |
|---|---|
| Chưa đăng nhập: xem BXH công khai | 200; xem `/tournaments` → 401 |
| `/events`, `/ops/outbox` | 404 ngay tại cổng, kể cả với admin (không lọt vào service) |
| Admin (chi nhánh 1) / quản lý chi nhánh 2 tạo giải | 201 / 201; quản lý chi nhánh 2 tạo giải cho chi nhánh 1 → bị từ chối |
| Nhân viên tạo giải; khách tạo giải, xem danh sách giải | 403 / 403 / 403 |
| Quản lý chi nhánh 2 xem giải chi nhánh 1; nhân viên chi nhánh 1 xem giải chi nhánh 2 | 404 / 404 (không lộ tồn tại) |
| Admin chọn chi nhánh 2 → chỉ thấy giải chi nhánh 2; không chọn → thấy cả hai | đúng |
| Nhân viên chỉnh điểm trình (`rating:adjust`); nhân viên chốt giải (`tournament:manage`); khách chốt giải | 403 / 403 / 403 |
| Khách bấm điểm trận **của mình** (xem tỉ số, chọn đội giao trước, +1 điểm) | 200 |
| Khách bấm điểm trận **người khác**; khách "không đánh tiếp được" | 403 / 404; 403 |
| SSE qua cổng, token trên query như EventSource | 200 `text/event-stream`, nhận `snapshot` ngay; nhân viên bấm điểm → luồng nhận `score` sau ~0,6 giây (không bị đệm); không token → 401 |

### 9.3 Chạy thật — phần B: sự kiện hai chiều, service tắt / bật (36 kiểm; chạy lại sau khi sửa lỗi ở 9.5)

| Kiểm | Kết quả |
|---|---|
| Đổi tên khách | hồ sơ thi đấu đổi theo trong ~1–2 giây; đúng 1 dòng outbox `bd.customer.updated`, gửi 1 lần; sửa email (không đổi tên) → không sinh sự kiện |
| Gộp hồ sơ tại quầy vào tài khoản | hồ sơ thi đấu chuyển sang `bd:customer:<tài khoản>` giữ nguyên tên; mã cũ → 404 |
| Xoá khách | hồ sơ thi đấu ẩn danh, không còn tên cũ |
| Service tắt | sân, đặt sân vẫn 200; `/competition` → 503 `COMPETITION_UNAVAILABLE`; vẫn đổi tên khách được, sự kiện nằm chờ + ghi lỗi + thử lại; ngắt mạch mở → trả 503 sau 7–13 ms (không treo) |
| Bật lại service | sự kiện tự được gửi, hồ sơ cập nhật **đúng một lần**; ngắt mạch tự đóng sau ~30 giây |
| Chốt giải (admin) | (lần chạy lại có 1 kiểm kịch bản hụt chỉ vì truy vấn inbox lấy 5 dòng mới nhất, đã đối chiếu bằng SQL: inbox có `finalized` × 2 và `unfinalized` × 2 đều `processed`) ActivityLog `competition.tournament_finalized` ở chi nhánh 1, không gắn nhân viên; inbox `processed`; huỷ chốt → `…unfinalized` |
| Webhook sai chữ ký / lệch giờ 10 phút / ký bằng secret của chiều ngược lại | 401 cả ba, mỗi lần một dòng `competition.webhook_rejected` |
| Sự kiện hợp lệ; gửi lại đúng sự kiện đó; loại không dùng | 200 `processed` (đúng 1 ActivityLog ở chi nhánh 2); `duplicate`; `ignored` |

### 9.4 Chạy thật — phần C: tắt hẳn tính năng (9 / 9)

Không đặt biến `COMPETITION_*`: `/competition` → 503 `COMPETITION_DISABLED` (kể cả BXH công khai), webhook → 503, phần còn lại của
app chạy bình thường; đổi tên khách vẫn 200 và **vẫn ghi outbox** (quyết định câu 2), dispatcher không chạy (dòng chờ, 0 lần
thử); bật tính năng sau đó → sự kiện tồn đọng được gửi bù. Đặt dở dang (chỉ có URL) → server từ chối khởi động, nêu đích danh
biến thiếu.

### 9.5 Lỗi bắt được khi chạy thật

- **Dispatcher gửi lại ngay thay vì lùi dần** (đã sửa, có test chặn lại): câu SQL thô lấy dòng đến hạn truyền `Date` thẳng
  làm tham số; driver định dạng theo múi giờ của tiến trình Node (+07 trên máy chủ Việt Nam) trong khi cột lưu UTC → mọi
  dòng lùi dần dưới 7 giờ bị coi là đã đến hạn: sự kiện chạm 12 lần thử trong 8 giây rồi thành `dead`. Jest với mock
  không thấy được; chỉ lộ khi tắt service thật. Sửa: tự định dạng chuỗi UTC (`toSqlUtc`). Chạy lại 2 lần phần B: pass.
- **Hai quyết định thiết kế ghi lại:** (1) service trả 401 cho token của cổng (lệch khoá / issuer) bị đổi thành 502
  `COMPETITION_AUTH_FAILED` — trả nguyên 401 thì `apiClient` của frontend tưởng hết phiên và đăng xuất người dùng; (2) khách
  không có hồ sơ khách hàng, nhân viên không xác định được chi nhánh → 403 tại cổng, không bao giờ cấp `org` rỗng hay `*`.

### 9.6 Chưa làm / để phần sau

- Postman + OpenAPI của route cổng, compose / `render.yaml` / `demo-reset.yml` / DeploymentGuide: phần (b).
- Giao diện, và việc frontend nối SSE qua cổng (`?token=` lấy từ `apiClient`, làm mới token trước mỗi lần nối): phần (c).
- Chưa đo RAM hai process trên Render, chưa kiểm Aiven free có tạo được DB thứ hai: phần (b).
- Dọn: DB tạm `bd_int_tmp`, `cs_int_tmp` và hai tiến trình :5002 / :5102 vẫn đang chạy theo yêu cầu "chưa tắt server thử cho tới khi chủ dự án nói".
