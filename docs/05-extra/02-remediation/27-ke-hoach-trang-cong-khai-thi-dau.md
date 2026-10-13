# Kế hoạch: trang công khai "Thi đấu" — khách xem giải / buổi giao lưu và đăng ký online

- **Ngày:** 07/10/2026.
- **Trạng thái:** chủ dự án duyệt "code đi" (07/10/2026) → **p0–p5 đều xong, kết quả ở mục 9; chờ chủ dự án duyệt gộp vào `main`** (chưa gộp, chưa đẩy `main`). Giả định ở mục 8 giữ như đã đề xuất (chưa có phản đối).
- **Nhánh:** `feat/competition-public-hub`, tách từ `main` @ `d89cbfd`.
- **Phạm vi:** `services/competition-service` (API công khai, tự đăng ký, đăng ký buổi giao lưu, 3 migration),
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

- [x] p0 · [x] p1 · [x] p2 · [x] p3 · [x] p4 · [x] p5
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
  `public:read` cấp cho người chưa đăng nhập và mọi vai trò; `streamGuard.js` — tối đa **40 luồng SSE công khai / IP và 300 cả hệ thống**
  (429 `TOO_MANY_STREAMS`) để giữ RAM của gói free Render; `/public/*` có bộ giới hạn tần suất riêng 900 lần / phút / IP (BXH vẫn 120). *Ban đầu đặt 8 luồng và 120 lần / phút;
  khi bấm thử p3 trên Chrome thật thấy mức đó làm cả một sân xem chung Wi-Fi (một IP) chặn lẫn nhau nên đã nới — xem 9.p3.*
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

### 9.p1 — tự đăng ký + rút giải, đồng đội chưa có tài khoản (07/10/2026)

**Đã làm**
- `POST /v1/me/tournaments/{id}/entries` · `DELETE …/entries` · `GET /v1/me/partners` (scope mới `entry:self`, gateway chỉ cấp cho `customer`). Dùng lại đúng
  `register` / `withdraw` của nhân viên (thêm cờ `self`): cùng kiểm điều kiện, cùng khoá giải, cùng hết chỗ → danh sách chờ, nên khách và nhân viên chung một
  danh sách, một hàng chờ. Người đăng ký luôn là chính mình (claim `player`).
- **Đôi cặp cố định — nhận cả hai người cùng lúc:** `partner.playerId` (người đã có hồ sơ; chỉ chọn được người mà thành viên thấy, `hidden` = 404) hoặc
  `partner.guest` { tên, SĐT, giới tính, mức trình }. Đồng đội được thêm thấy đơn trong "Giải của tôi" và tự rút được (rút một người = cả cặp).
- **Hồ sơ khách (đồng đội chưa có tài khoản):** migration `20261007100001-player-guest-contact` (cột `contact_phone`, `source`, `created_by_ref`);
  `player/domain/guest.js` (chuẩn hoá SĐT `0xxxxxxxxx`, kiểm tên); `playerService.createGuest` — **một SĐT = một hồ sơ**, `visibility = hidden`, điểm tạm theo nhãn
  bằng đúng `quickAssess` (nhân viên thấy cờ **Chấm nhanh + Chưa xác thực**, xác nhận qua luồng hiện có); tối đa **5 hồ sơ khách mới / người / 24 giờ**.
  Điều kiện được kiểm trên dữ liệu "ảo" TRƯỚC khi tạo gì → đăng ký hỏng không để lại hồ sơ rác.
- `GET /v1/public/tournaments/{id}` thêm `me` ({ entry, canWithdraw }) cho khách đăng nhập. SĐT / nguồn chỉ ở view nhân viên (`PlayerView`), không lộ ở API công khai.
- Cổng nối: `entry:self` cho khách. Tài liệu: `docs/02` mục 2.11, `docs/06` mục 15, `docs/05` bảng trường hồ sơ.
- Sửa kèm: dựng dữ liệu test tuần tự + kiểm từng lệnh chấm điểm (một lần chạy toàn bộ khi máy bận có 1 đăng ký đồng thời trả 422 vì khách dựng song song thiếu điểm).

**Kiểm**
| Kiểm | Kết quả |
|---|---|
| Jest service | 27 file / 399 test đạt (mới: `guestRules` 37 test đơn vị, `selfRegistration` **36** test tích hợp: quyền, giải đơn, hết chỗ → chờ → rút nhường chỗ, đăng ký đồng thời, giải nháp / huỷ / bốc thăm, Idempotency-Key, đôi cặp cố định, đồng đội có sẵn, đồng đội khách, SĐT không lộ, giới hạn 5 hồ sơ / ngày, tìm đồng đội theo quyền riêng tư) |
| Jest backend | 538/538 |
| Chạy thật qua cổng nối với JWT thật (khách `customer@badminton.com`, admin) | 20/20: đăng ký thiếu đồng đội → 422, chưa đăng nhập → 401, đăng ký + đồng đội khách → 201 nhận 2 người, nhân viên thấy cờ + SĐT chuẩn hoá + điểm tạm 3.25, người ngoài không thấy tên / SĐT đồng đội, đăng ký lại → 409, tìm đồng đội, rút → cả cặp rút |

### 9.p2 — đăng ký buổi giao lưu online (07/10/2026)

**Đã làm**
- Migration `20261007100002-session-signups`: `play_sessions.max_players` + bảng `session_signups` (unique `session_id + player_id`, `signed_up_at` làm khoá xếp hàng chờ).
- `signupService`: đăng ký / huỷ / nhân viên gỡ; **chỗ = đã đăng ký giữ chỗ ∪ đang có mặt**; hết chỗ → danh sách chờ; có chỗ trống (huỷ, **rời buổi**, tăng / bỏ sức chứa) → người chờ đầu tiên lên;
  nhân viên điểm danh → đăng ký thành `attended`. Khoá buổi trước khi ghi nên đăng ký đồng thời không vượt chỗ. Gộp hồ sơ chuyển đăng ký sang hồ sơ đích.
- Khách (scope `entry:self`, dùng chung với đăng ký giải): `POST` / `DELETE /v1/me/sessions/{id}/signup`, `GET /v1/me/sessions` ("Buổi của tôi"). Công khai: `signup` (chỗ) ở danh sách và chi tiết buổi,
  `me` ở chi tiết, `GET /v1/public/sessions/{id}/signups` (ai đã đăng ký, tên theo quyền riêng tư). Nhân viên: `GET /v1/sessions/{id}/signups`, gỡ đăng ký, `maxPlayers` khi tạo / sửa buổi, `progress.signups`.
- Tài liệu: `docs/02` mục 2.7, 2.10, 2.11; `docs/06` mục 16; cổng nối không cần đổi (tài nguyên `me` và `sessions` đã trong danh sách cho phép, scope `entry:self` có từ p1).

**Kiểm**
| Kiểm | Kết quả |
|---|---|
| Jest service | toàn bộ **28 file / 423 test** đạt; `sessionSignup.test.js` mới **24/24** (quyền, sức chứa, danh sách chờ, huỷ / rời buổi / tăng sức chứa nhường chỗ, điểm danh → đã đến, khách vãng lai chiếm chỗ, người chưa có điểm, nhân viên gỡ + chi nhánh khác, "Buổi của tôi", đăng ký đồng thời, Idempotency-Key, quyền riêng tư của danh sách, gộp hồ sơ) |
| Jest backend | 544/544 |
| Chạy thật qua cổng nối (JWT thật: khách + admin) | 17/17: tạo buổi sức chứa 2, đăng ký → giữ chỗ, trùng → 409, "Buổi của tôi", người ngoài thấy "Thành viên …", nhân viên điểm danh → khách thấy "đã đến" không huỷ được, đăng ký khi đang có mặt → 409, đóng buổi → 409 `SESSION_CLOSED` |

### 9.p3 — giao diện khu công khai: xem giải / buổi giao lưu (07/10/2026)

**Đã làm** (`frontend/src/features/competition/`)
- Khu `/thi-dau` với khung riêng `PublicShell` (sáng / tối, menu cuộn ngang trên điện thoại): `HubPage` (hero, lọc chi nhánh, giải đang mở / đang diễn ra, buổi giao lưu, kết quả gần đây),
  `PublicTournamentPage` (thông tin, khung đăng ký, tab đăng ký / lịch & kết quả / bảng & sơ đồ / kết quả chung cuộc), `PublicSessionPage` (bảng sân trực tiếp, ai đã đăng ký). Route nằm trong `competitionPublicRoutes`
  (AppRoutes không phải đổi); `FeatureGate hub` khi tính năng tắt; thêm mục "Giải đấu" ở menu khách (`CustomerLayout`).
- `api/publicApi.js`, `lib/publicHub.js` (nhãn, ngày giờ "Hôm nay / Ngày mai", chỗ còn, lệ phí tạm 200.000đ, nhóm lịch, ghép tỉ số trực tiếp) — **thuần, có test**; `components/public/*` (thẻ giải / buổi, danh sách đăng ký, lịch, bảng, thứ hạng, bảng sân, khung đăng ký).
- SSE công khai: `buildStreamUrl({ publicView })` và `useLiveResource({ stream: { public: true } })` — nối **không token**; tỉ số trực tiếp ghép vào trang ngay, không tải lại.
- Dùng lại `BracketView` (sơ đồ dạng hình), `Card` / `Badge` / `Notice` của khu nhân viên.

**Phát hiện khi bấm thử và đã sửa:** giới hạn công khai ở cổng (120 request / phút / IP, 8 luồng SSE / IP) làm trang đột nhiên báo "thao tác quá nhanh" khi chạy nhiều lượt liên tiếp — và
với thực tế **cả sân xem giải bằng điện thoại trên cùng một Wi-Fi (một IP)** thì sẽ chặn lẫn nhau. Đã tách bộ giới hạn riêng cho `/public/*` (900 / phút / IP; BXH vẫn 120), luồng SSE công khai 40 / IP (tổng 300 vẫn là chốt giữ RAM);
thêm test cổng. Ảnh: `p3-*.png` trong scratchpad (không nằm trong repo).

**Kiểm**
| Kiểm | Kết quả |
|---|---|
| Vitest | **280/280** (+42: `publicHub.test.js` 24 test logic thuần, `public-ui.test.jsx` 18 test vẽ thành phần với dữ liệu hình dạng API công khai: che tên, huy hiệu, chỗ, lệ phí, danh sách chờ, lịch + tỉ số trực tiếp, khung đăng ký theo người xem) |
| Jest backend | cổng nối: thêm test giới hạn tần suất riêng cho `/public/*` |
| `npm run build` | xanh |
| Chrome thật (stack thử, dữ liệu mẫu: giải đôi hết chỗ + 2 người chờ, giải loại trực tiếp đang đấu có trận đang bấm điểm, buổi giao lưu đang diễn ra) | **38/38**: 1440 px tối + 390 px sáng; trang chủ, lọc chi nhánh, trang giải, lịch, sơ đồ, bảng sân, **tỉ số đổi trực tiếp khi nhân viên bấm (không tải lại)**, đăng nhập rồi quay lại đúng giải, không tràn ngang, giải không có thật báo rõ, không lỗi console |

### 9.p4 — đăng ký online + màn hình nhân viên (07/10/2026)

**Đã làm**
- **Hộp thoại "Đăng ký giải"** (`components/public/RegisterDialog.jsx`, logic thuần `lib/registerFlow.js`): mở ra là kiểm hồ sơ khách — chưa có điểm trình thì **không hiện form**, chỉ báo và dẫn sang
  "Tự chấm trình"; giải đơn xác nhận một bấm; giải đôi cặp cố định chọn đồng đội ở tab **Đã có trong hệ thống** (ô tìm ≥ 2 chữ, `/me/partners`) hoặc **Chưa có tài khoản** (họ tên, SĐT, giới tính,
  mức trình — kiểm sớm cùng luật service, lỗi từng ô, 422 `INVALID_GUEST` gắn lại đúng ô). Lệ phí "2 × 200.000đ = 400.000đ" chỉ hiển thị.
- **Rút / huỷ:** hỏi xác nhận (giải đôi nói rõ cả cặp rút); buổi giao lưu: "Tham gia buổi này" / "Vào danh sách chờ" / "Huỷ đăng ký". Trang tự cập nhật khi người chờ được lên.
- **Giải của tôi:** thêm trạng thái "Trong danh sách chờ", link "Xem trang giải / rút đăng ký", mục "Buổi giao lưu đã đăng ký" (từ `/me/sessions`).
- **Nhân viên:** tab Đăng ký của giải có đếm + huy hiệu "đăng ký online" và dòng "đồng đội khách · SĐT …" (cùng cờ chấm nhanh); trang buổi có thẻ "Đăng ký online" (Điểm danh nhanh, Gỡ) và form buổi có ô
  **Sức chứa đăng ký online** (2–200, trống = không giới hạn).
- **Service:** cột `tournament_entries.registered_via` (`staff` | `self`) — migration `20261007100003-entry-registered-via`; danh sách đăng ký của nhân viên trả thêm `via`, `source`, `contactPhone` (bắt buộc trong schema `Entry`).
  Đổi đồng đội tạo dòng `staff` (nhân viên là người làm).

**Phát hiện khi bấm thử và đã xử lý**
- Họ tên đồng đội có chữ số (vd "P4") bị chặn cả ở form lẫn ở service — đúng luật (chỉ chữ, khoảng trắng, `. ' ’ -`), không phải lỗi; lỗi hiện đúng ô.
- Buổi đủ chỗ sau khi một người huỷ mà người chờ được lên ngay → người vừa huỷ thấy "Vào danh sách chờ" (không phải "Tham gia") — đúng thiết kế.
- Backend giới hạn 10 lần đăng nhập / 15 phút / IP làm các lượt chạy thử lặp lại bị 429 ở form đăng nhập — chỉ ảnh hưởng chạy thử (dùng phiên đã lưu), không phải lỗi sản phẩm.

**Kiểm**
| Kiểm | Kết quả |
|---|---|
| Jest service | **423/423** (28 file; lần chạy chung với Chrome + Vite một test `liveScoring` trễ chờ SSE 5 giây do máy quá tải — chạy lại riêng xanh 13/13) (thêm khẳng định `via` / `source` / `contactPhone` vào `selfRegistration.test.js`; khoá `Entry` mới được kiểm theo OpenAPI) |
| Vitest | **302/302** (+22: `registerFlow.test.js` 17 — SĐT / họ tên / form đồng đội / body gửi / lệ phí / lỗi / câu thông báo; `public-ui.test.jsx` +4 — hộp thoại, form đồng đội, huy hiệu nhân viên, dòng đăng ký buổi; `sessionModel` +1 — sức chứa) |
| `check-boundaries`, `npm run build` | xanh |
| Chrome thật (stack thử: backend :5000, service :5102, Vite :5173; 3 tài khoản khách — 1 đã có điểm, 1 chưa có điểm, 1 để lấp chỗ) | **57/57**: chưa có điểm → hộp thoại dẫn sang tự chấm trình, không có form; giải đôi: tìm đồng đội → chọn → đăng ký cả cặp (nhân viên thấy 2 dòng `via: self`), rút cả cặp, đồng đội chưa có tài khoản (4 lỗi theo ô khi để trống → nhập đủ → đăng ký; SĐT chuẩn hoá, `online_guest`), nhân viên thấy huy hiệu + SĐT + cờ chấm nhanh; giải đơn một bấm; Giải của tôi + link; buổi: tham gia → đủ chỗ → khách khác vào danh sách chờ (thứ 1) → khách đầu huỷ → người chờ lên (trang cập nhật); nhân viên: điểm danh nhanh, gỡ, sức chứa 1 báo lỗi / 6 lưu; điện thoại 390 px sáng không tràn ngang, hộp thoại nằm gọn; không lỗi console |

### 9.p5 — dữ liệu mẫu cho portfolio, rà toàn bộ màn hình, tài liệu (07/10/2026)

**Đã làm**
- **Seed demo** (`services/competition-service/scripts/seed-demo.js`, thêm SAU mọi phần cũ nên dữ liệu cũ không đổi): đa số hồ sơ chuyển `public` để khách chưa đăng nhập có tên để xem (vẫn giữ vài hồ sơ `members` và 1 `hidden` để thấy cách che
  tên "Thành viên A3F2"); **giải đôi cặp cố định mở đăng ký online** (10 chỗ theo người, 4 cặp đã vào — còn 2 chỗ; hai cặp đăng ký qua đúng cửa vào của khách, một cặp có đồng đội chưa có tài khoản để nhân viên thấy huy hiệu + SĐT);
  **giải đơn mở đăng ký online** (8 chỗ, 5 người — còn 3 chỗ); **buổi giao lưu sắp tới** sức chứa 12 với 8 người đã đăng ký (còn 4 chỗ). Tổng: 39 người chơi, 8 giải, 3 buổi giao lưu; 5.694 câu lệnh SQL (trước p5 ~5.400) → thêm khoảng 1 phút
  cho job reset hằng đêm trên Aiven (chưa đo lại ở đó; còn dư nhiều so với giới hạn 60 phút).
- Tài khoản khách demo (`0903333333`) **vẫn chưa có điểm trình** như thiết kế cũ: bấm "Đăng ký" ở giải thì hộp thoại dẫn sang "Tự chấm trình" — đúng luồng một khách thật sẽ gặp.
- **Tài liệu:** đoạn "Public competition hub" trong `CLAUDE.md`; README service (seed, 21 bảng); `DeploymentGuide.md` (13 migration, dữ liệu mới, số câu lệnh); docs service 02 / 06 / 07.
- Nhân viên: tab Đăng ký của giải đôi cặp cố định đếm theo **cặp** ("2 cặp đăng ký online"), giải khác đếm theo người (sửa khi rà dữ liệu seed — trước đó đếm theo dòng nên một cặp tính là 2).

**Kiểm**
| Kiểm | Kết quả |
|---|---|
| Reset + seed thật (drop → 13 migration → seed) trên DB trống | chạy hết, không lỗi; số liệu in ra khớp (còn 2/10, còn 3/8, 8/12) |
| Chrome thật trên dữ liệu seed | **34/34** (29 kịch bản rà + 5 nhân viên xem dữ liệu seed): nội dung (giải mở còn chỗ, buổi sắp tới, tên rút gọn cho người công khai, "Thành viên …" cho người đặt riêng tư, **không lộ tên / SĐT đồng đội khách cho khách ngoài**, nhân viên thấy đủ tên + SĐT); **12 lượt quét** (3 loại người xem × 390 tối / 390 sáng / 1440 tối / 1440 sáng) × 19 trang (trang chủ, lọc chi nhánh, chi nhánh trống, giải mở / đang đấu / đã chốt với mọi tab, buổi sắp tới / đang diễn ra / đã đóng, giải và buổi không có thật) — không tràn ngang, không trang trắng / "sự cố hiển thị", không chữ lạ (`undefined`, `NaN`, `[object`), không lỗi console; **tính năng tắt** → báo "chưa được bật", 0 lời gọi API thi đấu; **service tắt** → báo "tạm ngưng" + nút thử lại, bật lại thì tải được |
| Chrome thật, luồng đăng ký (chạy lại sau khi sửa cách đếm) | **57/57** (xem 9.p4) |
| Vitest | **303/303** (+1: đếm đăng ký online theo cặp / người) |
| Jest backend | **545/545** (42 file) (không đổi mã backend từ p3) |
| Jest service | 423/423 ở p4; p5 chỉ đổi script seed + tài liệu |

**Còn lại:** chờ chủ dự án duyệt gộp vào `main` (chưa gộp, chưa đẩy `main`). Khi gộp: demo trên Render tự chạy migration `registered_via` của DB thi đấu lúc khởi động; job reset hằng đêm dựng lại dữ liệu có phần trang công khai.

