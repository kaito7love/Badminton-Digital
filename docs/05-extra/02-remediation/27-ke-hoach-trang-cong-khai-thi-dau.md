# Kế hoạch: trang công khai "Thi đấu" — khách xem giải / buổi giao lưu và đăng ký online

- **Ngày:** 07/10/2026.
- **Trạng thái:** chủ dự án duyệt "code đi" (07/10/2026) → **đang làm, từng slice báo cáo ở mục 9**. Giả định ở mục 8 giữ như đã đề xuất (chưa có phản đối).
- **Nhánh:** `feat/competition-public-hub`, tách từ `main` @ `d89cbfd`.
- **Phạm vi:** `services/competition-service` (API công khai, tự đăng ký, đăng ký buổi giao lưu, 2 migration),
  `backend/src/integrations/competition` (cổng nối cho khách / người chưa đăng nhập), `frontend/src/features/competition`
  (khu công khai `/thi-dau`). Có migration (DB service), có thêm API; không đụng DB chính.

## 0. Yêu cầu (chủ dự án, 07/10/2026)

Làm một trang riêng, giống bản service chạy độc lập trước khi nối vào app chính, dùng cho **portfolio**, để **khách theo
dõi các giải đấu / buổi giao lưu của sân tổ chức và đăng ký online**. Đã chọn:

1. Trang nằm **trong cùng web app**, đường dẫn riêng, giao diện riêng (không menu bán hàng / nhân viên).
2. Xem **không cần đăng nhập**; đăng ký **phải đăng nhập tài khoản khách**, **tự động** (không cần nhân viên duyệt).
3. Giải đôi cặp cố định: người đăng ký **tự đăng ký mình + thêm 1 đồng đội, nhận cả 2 người cùng lúc**; đồng đội **có thể
   chưa có tài khoản** (nhập tên + SĐT).
4. Bản đầu gồm: đăng ký giải online, đăng ký buổi giao lưu online, cập nhật trực tiếp (SSE) cho trang xem.
5. **Lệ phí:** chưa làm phần thu / ghi nhận; "tạm cố định 200k/người" cho cả giải và buổi giao lưu (xem giả định 8.1).

## 1. Hiện trạng (đã đọc code)

| Việc | Hiện tại |
|---|---|
| Người chưa đăng nhập | Scope duy nhất `ranking:read` (BXH, hồ sơ công khai). Không xem được giải / buổi |
| Khách | `rating:self`, `ranking:read`, `match:score`. Không có `tournament:read` / `session:read` nên không xem được danh sách giải, sơ đồ, bảng điểm |
| Đăng ký giải | `POST /tournaments/:id/entries` cần `tournament:operate` (nhân viên). `register()` đã làm sẵn: nhận cả cặp trong một lần, kiểm điều kiện (`NEEDS_ASSESSMENT`, `NOT_ELIGIBLE`, giới tính, trình), `ALREADY_REGISTERED`, hết chỗ → danh sách chờ (`maxEntries`), có khoá giao dịch |
| Buổi giao lưu | Không có khái niệm **đăng ký trước**: chỉ có điểm danh trong ngày (`play_session_players.status = present/left`); không có sức chứa |
| Hồ sơ người chơi | Bảng `players` **không có SĐT**; `externalRef` (`bd:customer:<id>`) cho phép rỗng; có `visibility` (public / members / hidden) và chức năng gộp hồ sơ |
| Chấm trình | Có "chấm nhanh một nhãn" cho khách vãng lai (`beginner … kha`, cần `rating:assess` của nhân viên), và hàng chờ duyệt điểm tự chấm |
| Cổng nối | Allowlist theo tiền tố tài nguyên + method; `isPublic` chỉ cho `leaderboards` và `players/:id/public`, đã có `rateLimit` cho route công khai |
| Giao diện | `CustomerShell`, `BracketView`, `ScoreBoard`, `TvShell`, `useLiveResource`, `FeatureGate`, `PersonPicker` dùng lại được; `/rankings` và `/players/:id` đã là trang công khai |

Chốt: **không chỉ là giao diện** — phải thêm API công khai, API tự đăng ký, khái niệm đăng ký buổi giao lưu và hồ sơ đồng
đội chưa có tài khoản.

## 2. Thiết kế

### 2.1 API công khai (service) — tiền tố `/v1/public/*`, scope mới `public:read`

Tách tiền tố riêng thay vì mở các route nhân viên: bộ chuyển (serializer) liệt kê **đúng từng trường** được lộ, nên thêm
cột nội bộ sau này không tự rò ra ngoài.

- `GET /public/tournaments` (lọc `organizerRef`, `status`, `q`, phân trang), `GET /public/tournaments/:id`,
  `…/entries`, `…/matches`, `…/standings`, `…/bracket`, `…/placements`, `…/stream` (SSE).
- `GET /public/sessions`, `GET /public/sessions/:id`, `…/board`, `…/stream`.
- Chỉ trạng thái xem được: giải `open`, `drawn`, `in_progress`, `finalized` (không `draft`, không `cancelled`); buổi
  `open` (sắp / đang diễn ra) và `closed` gần đây.
- Không lộ: `courtRefs` nội bộ, `createdByRef`, điểm trình của người chơi, SĐT, ghi chú nhân viên. Tên người chơi áp dụng
  đúng `visibility` như `players/:id/public`: `public` hiện tên; `members` chỉ khi đã đăng nhập; `hidden` → "Người chơi ẩn danh".

### 2.2 Tự đăng ký giải (service) — scope mới `entry:self` (khách)

- `POST /me/tournaments/:id/entries`: `{ partner?: { playerId } | { guest: { name, phone, gender, level } } }`.
  Tạo người chơi của chính khách (nếu chưa có — dùng cơ chế `upsert-by-ref` hiện có) rồi gọi `register()` có sẵn →
  **đủ điều kiện thì vào danh sách ngay, hết chỗ thì vào danh sách chờ** (đã làm sẵn).
- `DELETE /me/tournaments/:id/entries/:entryId`: rút. Trước bốc thăm: người trong cặp tự rút (cả cặp rút). Sau bốc thăm:
  khách không tự rút được (đã có W.O. và sơ đồ) — liên hệ nhân viên.
- Giải đôi cặp cố định: đăng ký đúng 1 lần cho **cả hai** (đồng đội nhận luôn, theo yêu cầu). Đồng đội là người **đã có hồ sơ** thì thấy
  mình trong "Giải của tôi" và có thể tự rút.
- **Đồng đội chưa có tài khoản:** service tạo hồ sơ khách (`players`: `externalRef` rỗng, `source = online_guest`,
  `visibility = hidden`, thêm cột `contact_phone` chỉ nhân viên xem). Vì `register()` đòi có điểm, người đăng ký chọn
  **một nhãn trình** cho đồng đội (cùng 6 nhãn của "chấm nhanh") → điểm tạm **chưa xác nhận**, tự vào **hàng chờ duyệt**
  hiện có để nhân viên xác nhận / chỉnh khi gặp ở sân. Khi đồng đội sau này có tài khoản: gộp bằng chức năng gộp hồ sơ có sẵn.
- Chống lạm dụng: chỉ khách đăng nhập; tối đa N hồ sơ khách mới / khách / ngày (đề xuất 5); trùng SĐT trong cùng
  chi nhánh thì dùng lại hồ sơ cũ; kiểm độ dài / ký tự tên, định dạng SĐT; `Idempotency-Key` (đã có).

### 2.3 Đăng ký buổi giao lưu (service)

- Bảng mới `session_signups` (`session_id`, `player_id`, `status registered | cancelled | attended`, `created_at`, unique
  `(session_id, player_id)`), cột mới `play_sessions.max_players` (rỗng = không giới hạn). Hết chỗ → danh sách chờ.
- `POST /me/sessions/:id/signup`, `DELETE /me/sessions/:id/signup`. Điểm danh tại quầy (`checkIn`) tự đánh `attended`.
- Màn nhân viên (chi tiết buổi) hiện thêm danh sách "Đã đăng ký online" và nút điểm danh nhanh.

### 2.4 Cổng nối (backend)

- Người chưa đăng nhập: thêm `public:read` vào scope ẩn danh; khách: thêm `public:read`, `entry:self`.
- `routeMap`: `public` thành tài nguyên cho phép; `GET /public/**` là `isPublic` (qua `rateLimit` công khai sẵn có); SSE
  `public/**/stream` cho phép **không đăng nhập** với token ngắn hạn (scope chỉ `public:read`), giới hạn số luồng /IP để
  giữ RAM của gói free Render. `me/*` giữ nguyên quy tắc hiện tại (cần đăng nhập khách).
- Vẫn: service tự kiểm scope từng route; `events`, `ops`, `…/ai` không bao giờ tới được service.

### 2.5 Giao diện (khu công khai `/thi-dau`)

Layout riêng `PublicShell` (logo, "Thi đấu", bộ lọc chi nhánh, Đăng nhập / Đăng ký hoặc "Giải của tôi", chân trang); chạy được
ở sáng / tối và điện thoại 390 px; `FeatureGate` khi tính năng tắt.

- `/thi-dau` — trang chủ: bộ lọc chi nhánh; "Đang mở đăng ký", "Đang diễn ra", "Buổi giao lưu sắp tới", "Đã kết thúc"; BXH nổi bật.
- `/thi-dau/giai/:id` — chi tiết giải: thể thức, ngày / giờ, điều kiện trình, giới tính, số đội / chỗ còn, **lệ phí cố định
  200.000đ/người** (chỉ hiển thị); tab Đăng ký · Lịch & kết quả · Bảng đấu · Sơ đồ (dùng `BracketView`); cập nhật trực tiếp qua SSE.
- Nút **Đăng ký**: chưa đăng nhập → đăng nhập rồi quay lại; chưa có điểm → dẫn tới `/my-rating/assess`; giải đôi cặp cố
  định → biểu mẫu đồng đội (tìm người đã có hồ sơ hoặc nhập tên + SĐT + giới tính + nhãn trình) → xác nhận → "Đã đăng ký" hoặc "Danh sách chờ #n".
- `/thi-dau/giao-luu/:id` — chi tiết buổi: giờ, sân, thể thức, số người đã đăng ký, nút **Tham gia / Rút**; khi đang diễn
  ra hiện bảng sân.
- Lối vào từ menu khách (CustomerLayout, mục đã có "Thi đấu") và trang chủ; "Giải của tôi" hiện thêm đơn đăng ký online và
  cảnh báo "đồng đội chờ nhân viên xác nhận trình".
- Màn nhân viên: đăng ký online có dấu riêng; cờ "đồng đội chưa xác nhận trình" ở danh sách đăng ký giải.
- Seed demo: thêm 1 giải đang mở đăng ký (có chỗ, có danh sách chờ) và 1 buổi giao lưu sắp tới để portfolio có gì xem ngay.

## 3. Chia slice (làm liền, báo cáo ngắn sau mỗi slice, commit + push nhánh sau mỗi slice)

| Slice | Nội dung |
|---|---|
| p0 | Service: API công khai + serializer + scope `public:read`; cổng nối: ẩn danh / SSE / rate limit; Jest (service + cổng) |
| p1 | Service: tự đăng ký + rút giải, hồ sơ đồng đội khách (migration `players`), chống lạm dụng; Jest |
| p2 | Service: đăng ký buổi giao lưu (migration `session_signups`, `max_players`), điểm danh nối `attended`; Jest |
| p3 | Giao diện: `PublicShell`, trang chủ, chi tiết giải + chi tiết buổi (xem, SSE) |
| p4 | Giao diện: đăng ký giải (kể cả đồng đội), đăng ký buổi, "Giải của tôi", màn nhân viên (đăng ký online, cờ chưa xác nhận) |
| p5 | Hoàn thiện: seed demo, rà mọi màn hình (sáng / tối, 390 px / 1440 px, tắt tính năng), tài liệu, báo cáo |

## 4. Cách kiểm

- Jest service (quyền từng route theo vai trò, serializer không lộ trường nội bộ, `visibility`, hết chỗ → danh sách chờ,
  đăng ký đồng thời, giới hạn hồ sơ khách, trùng SĐT, `session_signups`), Jest cổng nối (ẩn danh vào `public`, không vào
  `events` / `ops`), Vitest (logic `lib/`), `react-dom/server` cho các thẻ.
- **Chạy thật trên Chrome** như plan 25, đủ vai: chưa đăng nhập (chỉ xem; thử bấm Đăng ký → bị dẫn đăng nhập), khách chưa có
  điểm (dẫn tới chấm trình), khách đủ điều kiện (đăng ký giải đơn, đôi cặp cố định có đồng đội mới và đồng đội có sẵn, đăng ký
  hết chỗ → danh sách chờ, rút), buổi giao lưu (tham gia, rút, nhân viên điểm danh), nhân viên (thấy cờ chưa xác nhận, xác nhận
  trình). SSE: kết quả nhập ở máy nhân viên hiện trên trang công khai không cần tải lại. Điện thoại 390 px, sáng / tối.
- Chạy lại toàn bộ Jest / Vitest / build, rà route cũ (c1–c6) không hỏng.

## 5. Rủi ro và cách giữ

- **Riêng tư:** chỉ hiện tên theo `visibility`; SĐT đồng đội chỉ nhân viên xem; API công khai chỉ trả trường liệt kê.
- **Spam:** đăng nhập bắt buộc, giới hạn hồ sơ khách mới, rate limit công khai (sẵn có), kiểm đầu vào.
- **RAM Render free (512 MB):** SSE công khai có thể nhiều người xem; giới hạn số luồng / IP và tổng số luồng, đo lại đỉnh RAM.
- **Đồng thời:** `register()` đã khoá giải khi ghi; thêm khoá tương tự cho đăng ký buổi giao lưu.
- **Tên người chưa kiểm chứng** (đồng đội khách): hiển thị cùng dấu "chờ xác nhận" tới khi nhân viên xác nhận.

## 6. Không làm ở bản đầu

Thu / ghi nhận lệ phí, đăng ký khách vãng lai không tài khoản, lời mời đồng đội có xác nhận, thông báo (email / tin nhắn),
quản trị nhiều bậc giá theo sự kiện, trang portfolio giới thiệu riêng ngoài khu `/thi-dau`.

## 7. Theo dõi

- [x] p0 · [ ] p1 · [ ] p2 · [ ] p3 · [ ] p4 · [ ] p5
- [ ] Báo cáo → xin duyệt merge `main` (không tự push main)

## 8. Giả định cần chủ dự án xác nhận (khi duyệt)

1. **Lệ phí:** chỉ **hiển thị** "200.000đ/người" (hằng số trong code, đổi sau được); không thu, không ghi "đã / chưa thanh toán". Bạn đã
   chọn "chưa đụng đến lệ phí" nhưng cũng nói "tạm cố định 200k/người" — mình hiểu là hiển thị. Sai thì nói, mình đổi.
2. **Đồng đội chưa có tài khoản** dùng điểm tạm theo nhãn do người đăng ký chọn, nhân viên xác nhận sau. Chưa xác nhận thì vẫn vào danh sách.
3. **Rút giải** sau bốc thăm: khách không tự rút, liên hệ nhân viên.
4. **Ai thấy gì:** danh sách đăng ký hiện tên theo `visibility`; giải `draft` / `cancelled` không hiển thị công khai.
5. **Chi nhánh:** trang chủ hiện sự kiện của **mọi chi nhánh** với bộ lọc chi nhánh (mặc định tất cả).
6. **Đường dẫn:** `/thi-dau`, `/thi-dau/giai/:id`, `/thi-dau/giao-luu/:id` (đổi được trước khi làm).
7. **Sức chứa buổi giao lưu:** thêm `max_players` (rỗng = không giới hạn); nhân viên nhập khi tạo buổi.

## 9. Kết quả từng slice

### 9.p0 — API công khai + cổng nối (07/10/2026)

**Đã làm**
- `services/competition-service`: scope `public:read`; route `GET /v1/public/tournaments[/{id}[/entries|matches|standings|bracket|placements|stream]]` và
  `GET /v1/public/sessions[/{id}[/board|stream]]` — nằm **trong** module `tournament` / `session` (không thêm module mới nên luật ranh giới
  `check-boundaries` giữ nguyên). Bộ gọt `publicQueries` liệt kê từng trường được lộ; trận dùng chung `match/domain/publicView`
  (`publicMatchView`); tên người chơi qua `player/domain/profile.publicRef` (mã che "Thành viên A3F2" suy từ SHA-1 id, ổn định).
- Luật tên: chưa đăng nhập chỉ thấy hồ sơ `public` (tên thi đấu / "An N."); đã đăng nhập thấy đủ trừ `hidden`; nhân viên và **người cùng
  tham gia giải / buổi đó** thấy đầy đủ (đúng nguyên tắc "đối thủ / đồng đội luôn thấy tên nhau" của docs/05 mục 1.1).
- OpenAPI: 12 path + 10 response + 12 schema `Public*`, mọi schema đóng (`additionalProperties: false`) — response lệch hợp đồng là test đỏ.
- Cổng nối (`backend/src/integrations/competition`): `public` thêm vào allowlist, **chỉ GET** (POST / PUT / PATCH / DELETE → 404 tại cổng);
  `public:read` cấp cho người chưa đăng nhập và mọi vai trò; `streamGuard.js` — tối đa **8 luồng SSE công khai / IP và 300 cả hệ thống**
  (429 `TOO_MANY_STREAMS`) để giữ RAM của gói free Render; route công khai không đăng nhập vẫn qua bộ giới hạn tần suất sẵn có.
- Tài liệu: `services/competition-service/docs/02-hop-dong-api-va-su-kien.md` mục 2.10 (bảng endpoint, luật tên, giới hạn) và bảng scope mục 5.
- Sửa kèm: test `liveScoring` chạy ~5 phút nên token test (300 s) hết hạn giữa chừng khi máy bận (401, đã ghi từ trước) →
  `createTestContext({ tokenTtl })` + `MAX_TOKEN_LIFETIME_SECONDS` theo context; mặc định giữ 300 nên test "token quá dài" của `auth` không đổi.

**Kiểm**
| Kiểm | Kết quả |
|---|---|
| Jest service (unit + integration) | 25 file đạt; file mới `publicApi.test.js` **30/30** (quyền, nháp / huỷ → 404 ở mọi route con, so tập khoá để bắt rò trường, tên theo 4 loại người xem + người đã rút, danh sách chờ có thứ tự, bảng / sơ đồ / thứ hạng, buổi trong 30 ngày, SSE) |
| Jest backend | 530/530 (+27: định tuyến, scope, cổng `/public/*`, bộ giới hạn luồng) |
| Chạy thật qua cổng nối (backend :5000 → service :5102, dữ liệu demo) | 27/27: người chưa đăng nhập xem 8 giải của mọi chi nhánh + 8 buổi, 19 / 24 người bị che, không rò `courtRefs` / `createdByRef` / `drawSeed`, ghi vào `/public/*` → 404, SSE nhận `snapshot`, luồng thứ 9 → 429, đóng bớt thì mở lại được |

**Ghi chú cho p5:** hồ sơ mặc định là `members` nên người chưa đăng nhập thấy phần lớn người chơi bị che — seed demo của portfolio nên đặt
người trong các giải / buổi công khai ở `public`.
