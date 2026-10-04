# Kế hoạch: bước 4(a) — cổng nối app chính ↔ competition-service + sự kiện hai chiều

- **Ngày:** 05/10/2026.
- **Trạng thái:** **CHỜ CHỦ DỰ ÁN DUYỆT — chưa viết dòng code nào.** Cần chốt 6 câu ở mục 4 trước khi làm.
- **Nhánh:** `feat/competition-integration`, tách từ `main` @ `379e634`.
- **Thuộc:** bước 4 của plan 18 (`18-ke-hoach-cham-trinh-xep-cap.md`, mục "Bước 4"). Chia ba phần, mỗi phần một plan
  riêng để duyệt từng cái:

  | Phần | Nội dung | Trạng thái |
  |---|---|---|
  | **(a)** | Cổng nối trong app chính + sự kiện hai chiều (plan này) | Chờ duyệt |
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

## 4. Cần chủ dự án quyết (mỗi câu có đề xuất)

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
- [ ] **Chủ dự án duyệt plan + trả lời 6 câu ở mục 4**
- [ ] 2.1 Cổng nối (config, token, scope, danh sách cho phép, client, gateway) + test
- [ ] 2.2 Outbox + dispatcher + sửa `CustomerService` + test
- [ ] 2.3 Webhook nhận + inbox + `ActivityLog` + test
- [ ] 2.4 Script khoá + `.env.example`
- [ ] Chạy thật toàn bộ kịch bản mục 5, ghi kết quả vào mục 9
- [ ] Báo cáo → chủ dự án duyệt merge → merge vào `main` (không tự push)

## 9. Kết quả

_(điền sau khi làm)_
