# Kế hoạch: competition-service — chấm trình, xếp hạng, xếp cặp, giải đấu, giao lưu (service độc lập)

- **Nhánh:** `feat/competition-service`, tách từ `main` @ `869f157`.
- **Ngày:** 26/09/2026 — **bản 3**.
  - Bản 1: module *bên trong* backend.
  - Bản 2: tách thành service độc lập theo hướng microservice.
  - Bản 3: bổ sung những phần chủ dự án hỏi mà chưa đủ:
    - hồ sơ / thông tin người chơi;
    - **bảng xếp hạng** và cách tính;
    - **cách tạo trận** (vòng bảng, loại trực tiếp tự sinh sơ đồ, giao lưu);
    - **wizard tạo giải**;
    - **form tự chấm** (luồng màn hình + bản chạy thử).
- **Trạng thái:** plan, chờ duyệt ("code đi"). Chưa có dòng code nào.

**Tài liệu thiết kế** (trong thư mục service):

| # | Tài liệu | Trả lời câu hỏi |
|---|---|---|
| 01 | [Kiến trúc](../../../services/competition-service/docs/01-kien-truc.md) | Service độc lập thế nào, 7 module, 19 bảng, bảo mật, chịu lỗi, triển khai |
| 02 | [Hợp đồng API và sự kiện](../../../services/competition-service/docs/02-hop-dong-api-va-su-kien.md) | Có những API nào, ai gọi được gì, sự kiện gì, ví dụ request / response |
| 03 | [Form tự chấm và điểm trình](../../../services/competition-service/docs/03-nghiep-vu-va-thuat-toan.md) | **Form tự chấm ở đâu, gồm gì, ra điểm thế nào; điểm lên / xuống sau thi đấu ra sao** |
| 05 | [Hồ sơ, thống kê, bảng xếp hạng](../../../services/competition-service/docs/05-ho-so-nguoi-choi-va-bang-xep-hang.md) | **Thông tin người chơi lưu gì, ai thấy gì; ranking tính thế nào** |
| 06 | [Trận đấu, giải đấu, giao lưu](../../../services/competition-service/docs/06-tran-dau-giai-dau-giao-luu.md) | **Tạo trận thế nào; tạo giải thế nào; bốc thăm, sơ đồ, chốt giải; buổi giao lưu** |
| 07 | [Giao diện](../../../services/competition-service/docs/07-giao-dien.md) | Có những màn hình nào, nằm ở đâu |
| 04 | [video-analysis-service](../../../services/competition-service/docs/04-video-analysis-service.md) | AI chấm qua video (giai đoạn sau) |

---

## 1. Mục tiêu

1. **Tự chấm trình** bằng form 12 tiêu chí (mô tả hành vi, không tự cho điểm) → điểm 1.0–7.0 kiểu pickleball /
   DUPR, hai điểm **Đơn** và **Đôi**.
2. Điểm **tăng / giảm sau mỗi giải** (và buổi giao lưu có tính điểm) theo kết quả thật.
3. **Hồ sơ người chơi** với thống kê (thắng / thua, phong độ, thành tích, đồng đội, đối đầu) và quyền riêng tư.
4. **Hai bảng xếp hạng:** *trình độ* (theo điểm trình) và *thành tích* (điểm theo thứ hạng giải, 6 kết quả tốt
   nhất / 52 tuần).
5. **Tạo giải** bằng wizard, 3 thể thức (vòng tròn / vòng bảng + loại trực tiếp / loại trực tiếp).
   - **Ghép đồng đội ngẫu nhiên nhưng cân bằng**, chia bảng, xếp lịch theo sân.
   - **Tự sinh sơ đồ loại trực tiếp.**
6. **Buổi giao lưu:** bấm một nút để xếp ai đánh sân nào với ai, công bằng và cân trình.
7. Tất cả trong **một service độc lập** (`competition-service`): DB riêng, API riêng, deploy riêng. Nối vào app
   chính qua hợp đồng; chừa sẵn chỗ cho **AI chấm qua video**.

## 2. Kiến trúc trong một trang

```
Trình duyệt ─▶ backend (app chính) ── Gateway: vai trò → scope, ký token ES256 60 giây ──▶ competition-service ─▶ DB competition_service
                    │                                                                          ▲
                    └── outbox: bd.customer.updated / merged / deleted ── webhook HMAC ────────┘
                    ◀── competition.* (rating_changed, match.completed, tournament.finalized…) ── webhook HMAC ──
(sau này) video-analysis-service (Python, GPU) ── REST, token riêng ──▶ competition-service
```

- **7 module trong 1 service:** `player` · `rating` · `ranking` · `matchmaking` (thuần) · `match` · `tournament`
  · `session`.
  - Chung service vì chốt giải phải ghi nguyên tử: kết quả, điểm trình, điểm thành tích, thống kê.
  - Ranh giới module kiểm tra tự động, để tách được khi cần.
- 8 luật ranh giới (01, mục 3): không import chéo, DB riêng, chỉ chia sẻ hợp đồng, app chính sống khi service
  chết…
- Hexagonal; contract-first; `Idempotency-Key`; optimistic lock; outbox / inbox; token ES256; circuit breaker.

## 3. Quyết định cần chốt

Mỗi mục đã có mặc định. Anh/chị bác mục nào không đồng ý. Các mục **in đậm** là quan trọng nhất.

### 3.1 Kiến trúc

| # | Quyết định | Mặc định đề xuất | Phương án khác |
|---|---|---|---|
| **A1** | Chia service | **Một service, 7 module** | Nhiều service: chốt giải phải thành saga, quá sức 1 người bảo trì |
| **A2** | Ngôn ngữ | **JavaScript (CommonJS), Node 22, Express, Sequelize, MySQL, Jest — giống app chính** | TypeScript: an toàn kiểu cho engine, đẹp cho portfolio |
| **A3** | Trình duyệt gọi service | **Qua gateway trong app chính** | Gọi thẳng bằng token ngắn hạn: hợp đồng đã hỗ trợ, bật sau |
| A4 | Tích hợp bất đồng bộ | Webhook ký HMAC + outbox / inbox | Message broker: thêm hạ tầng |
| A5 | Giao diện | Trong frontend chính, thư mục `features/competition/` tháo ra được | Micro-frontend |
| **A6** | Demo Render free | **Chung image, hai process**; DB thứ hai trong cùng Aiven | Web service Render thứ hai |
| **A7** | Chia nhánh | **Nhánh này = service chạy độc lập (bước 1–3), không sửa dòng nào của app chính.** Tích hợp + giao diện (bước 4) ở nhánh sau | Tất cả một nhánh |

### 3.2 Nghiệp vụ

| # | Quyết định | Mặc định đề xuất | Tài liệu |
|---|---|---|---|
| **P1** | Thang điểm | **1.0–7.0**, 9 nhãn (Mới chơi … Chuyên nghiệp); **2 điểm Đơn và Đôi** | 03 §1 |
| **P2** | Khi nào điểm đổi | **Khi chốt giải / đóng buổi giao lưu có tính điểm**; W.O. không tính | 03 §3 |
| P3 | Form tự chấm | 12 tiêu chí × 5 mô tả, 4 trang; điểm = trung bình có trọng số; trần 4.5; 3 tiêu chí then chốt; nộp lại được tới trận tính điểm đầu tiên | 03 §2 |
| P4 | Chống giấu trình | `pairingRating = max(điểm, đỉnh 12 tháng − 0.5)` | 03 §4 |
| **P5** | Bảng xếp hạng | **Hai bảng:** trình độ (≥ 5 trận hoặc đã xác nhận, có trận trong 12 tháng) và thành tích (thứ hạng × cấp giải × quy mô × sức mạnh; **6 kết quả tốt nhất / 52 tuần**) | 05 §3 |
| P6 | Điểm thứ hạng | Vô địch 100 · Á quân 70 · 3–4: 50 · 5–8: 32 · 9–16: 20 · còn lại 8 + 4 × số trận thắng; cấp giải CLB ×1 · mở rộng ×2 · toàn chuỗi ×3; giải ≥ 4 đội | 05 §3.2 |
| P7 | Quyền riêng tư | Mặc định `members` (chỉ người đăng nhập thấy); `public` hiện tên thi đấu / tên rút gọn; `hidden` không lên BXH. Không lưu SĐT / email; năm sinh chỉ hiện nhóm tuổi | 05 §1 |
| P8 | Giới tính | Tự khai trong form; sau trận tính điểm đầu tiên chỉ nhân viên sửa (có nhật ký) | 05 §1 |
| **P9** | Thể thức giải | **Vòng tròn / vòng bảng + loại trực tiếp (sơ đồ tự sinh, nhất – nhì cùng bảng ở hai nửa) / loại trực tiếp có hạt giống**; nhân viên đăng ký hộ (khách chưa tự đăng ký, chưa thu phí) | 06 §2–5 |
| P10 | Điều kiện trình của giải | Theo từng người hoặc **tổng cặp** (chỉ cặp cố định) | 06 §4.2 |
| **P11** | Buổi giao lưu | **Có trong nhánh này.** Xếp sân trống theo "chờ lâu nhất, đánh ít nhất"; 3 chế độ (cân bằng / cùng trình / ngẫu nhiên); **mặc định không tính điểm**, bật thì hệ số 0.5; không trao điểm thành tích | 06 §8 |
| P12 | Trận tự khai ngoài hệ thống | **Chưa làm** (dễ dựng trận ảo) | 06 §1.1 |
| P13 | Lẻ người / lệch nam–nữ | Người đăng ký sau cùng vào danh sách chờ; BTC đổi tay được | 06 §4.3 |
| P14 | Huỷ chốt | Chỉ khi chưa ai trong giải có thay đổi điểm sau giải | 06 §7.3 |
| P15 | Phân quyền | Khách: tự chấm, hồ sơ, BXH · `employee`: người chơi, chấm người mới / chấm nhanh, đăng ký, nhập tỉ số, buổi giao lưu · `branch_manager` / `admin`: thêm tạo giải, bốc thăm, sơ đồ, chốt, duyệt, chỉnh điểm; `chain` chỉ admin | 02 §5 |

## 4. Lộ trình — 4 bước, mỗi bước có báo cáo test thật rồi chờ duyệt

### Bước 1 — Khung service + `player` + `rating` + `matchmaking` + BXH trình độ

- **Khung:**
  - config kiểm tra env; Express + envelope lỗi;
  - xác thực token ES256 + scope;
  - `Idempotency-Key`, `X-Request-Id`, pino, health;
  - Sequelize + migration riêng; outbox / inbox + dispatcher webhook; `audit_log`;
  - Dockerfile, README;
  - script `keys:generate`, `token:dev`, `check-boundaries`.
- **Hợp đồng viết trước:** OpenAPI phần 2.1–2.4, 2.8; JSON Schema sự kiện.
- **Bảng:** `players`, `player_ratings`, `player_stats`, `assessments`, `rating_changes`, `leaderboard_snapshots`,
  `outbox_events`, `inbox_events`, `idempotency_keys`, `audit_log`.
- **Domain:**
  - `rubric v1`, `scoreAssessment`, `computePeriodRatings`, `pairingRating`;
  - toàn bộ thuật toán `matchmaking` (ghép cặp, chia bảng, vòng tròn, xếp lượt, sơ đồ, xếp sân giao lưu);
  - quyền riêng tư, nhóm tuổi.
- **Xong khi:** service chạy một mình trên DB riêng; tự chấm → điểm → BXH trình độ gọi được bằng token dev; test
  xanh.

### Bước 2 — `match` + `tournament` + BXH thành tích + thống kê

- **Bảng:** `matches`, `match_participants`, `tournaments`, `tournament_entries`, `tournament_teams`,
  `tournament_placements`, `ranking_results`.
- **Tính năng:**
  - wizard / `advice`, đăng ký + điều kiện;
  - bốc thăm (xem trước / đổi tay / xác nhận), lịch theo lượt;
  - nhập tỉ số + luật, sơ đồ loại trực tiếp tự đi tiếp;
  - thứ hạng chung cuộc;
  - chốt (điểm trình + điểm thành tích + thống kê), huỷ chốt;
  - sự kiện.
- **Seeder demo:** khoảng 24 người chơi (`externalRef` khớp khách hàng mẫu của app chính), 2 giải đã chốt (có lịch
  sử điểm, BXH có dữ liệu), 1 giải đang mở đủ người để khách xem demo bấm "Bốc thăm".
- CI: job `competition-service`.
- **Xong khi:** chạy trọn ví dụ 06 §9 (đôi nam nữ ghép cặp, 3 bảng + loại trực tiếp) bằng API thật; điểm trình,
  điểm thành tích, thống kê khớp tính tay.

### Bước 3 — `session` (buổi giao lưu)

- **Bảng:** `play_sessions`, `play_session_players`.
- **Tính năng:** điểm danh (kèm chấm nhanh), xếp sân trống (xem trước / đổi tay / xác nhận), rời buổi, dữ liệu màn
  hình lớn, đóng buổi (tính điểm hệ số 0.5 nếu bật).
- **Xong khi:** mô phỏng buổi 3 giờ, 20 người, 4 sân (có người đến muộn, về sớm) cho chênh lệch số trận ≤ 1, không
  lặp đồng đội quá mức. → **Báo cáo, chờ "merge vào main đi".** Merge an toàn vì app chính chưa gọi service.

### Bước 4 — Tích hợp app chính + giao diện (nhánh sau: `feat/competition-integration`)

| Chỗ | Thay đổi |
|---|---|
| `backend/src/integrations/competition/` (mới) | `client.js` (timeout, retry, circuit breaker), `serviceToken.js` (ES256), `routeMap.js` (allowlist + vai trò → scope), `gateway.js` |
| `backend/src/server.js` | Mount `/api/v1/competition`; không cấu hình → 503 `COMPETITION_DISABLED`, còn lại như cũ |
| Outbox app chính (migration + dispatcher) | `bd.customer.updated` / `merged` / `deleted` trong cùng transaction với `CustomerService` |
| `routes/competitionWebhookRoutes.js` (mới) | Nhận sự kiện: `ActivityLog` khi chốt giải / đóng buổi; `match.completed` → SSE sẵn có |
| `frontend/src/features/competition/` (mới) | Mọi màn hình ở tài liệu 07 |
| `AppRoutes.jsx`, `SidebarLayout.jsx`, header khách, `CustomersPage.jsx` | Vài dòng: route, menu "Thi đấu" / "Trình độ" / "Xếp hạng", nút "Trình độ" |
| `docker/`, `render.yaml`, `app.Dockerfile`, `demo-reset.yml`, `DeploymentGuide.md`; Postman + `docs:build` | Process / container thứ hai, DB thứ hai, khoá ký, reset hai DB; các route gateway |

## 5. Kiểm thử thật

### Bước 1–3 (service một mình)

- **Unit (Jest, hàm thuần) — mọi ví dụ số trong tài liệu phải ra đúng:**
  - form: 2.96 / 3.15; trần then chốt 3.49; mức 5 hết → 4.5 + cờ;
  - engine: +0.151 / +0.044 / −0.074; bảng "lên / xuống bao nhiêu" ở 03 §3.1;
  - điểm thành tích: 183 và 42 ở 05 §3.2; 170 ở 06 §9;
  - luật tỉ số; bảng xếp hạng trong bảng (2 và 3 đội bằng nhau);
  - sơ đồ: bye cho hạt giống, nhất – nhì cùng bảng ở hai nửa, người thắng tự đi tiếp;
  - ghép cặp: nam nữ luôn 1+1, cùng seed → cùng kết quả, 128 người < 200 ms;
  - xếp sân giao lưu: mô phỏng công bằng.
- **Integration (API + MySQL 8 thật):**
  - xác thực 401 / 403 / 404 theo tenant / organizer / `hidden`;
  - idempotency; `If-Match` → 409;
  - **chốt giải song song** → đúng một lần (đếm dòng sổ điểm và `ranking_results` trong DB);
  - huỷ chốt được / bị chặn;
  - gộp / ẩn danh;
  - BXH đúng điều kiện và quyền riêng tư (người xem chưa đăng nhập không thấy `members`).
- **Contract:** mọi response kiểm theo OpenAPI; mọi payload outbox kiểm theo JSON Schema.
- **Outbox:** receiver webhook tắt / bật lại → không mất, không trùng; chữ ký HMAC đúng.
- **Ranh giới:** `check-boundaries` đạt; thêm import sai → CI đỏ.
- **Chạy tay:** `npm run dev` + token dev chạy kịch bản 06 §9 và một buổi giao lưu bằng curl; đối chiếu DB; dọn
  dữ liệu.
- **Docker:** image service + MySQL; `/health/ready` xanh sau migrate.

### Bước 4 (nhánh tích hợp)

- **Gateway:** vai trò → scope (khách chốt giải → 403, `employee` chỉnh điểm → 403, admin đổi chi nhánh chỉ thấy
  giải chi nhánh đó).
- **Tắt service:** đặt sân / POS / thanh toán vẫn chạy.
- **Sự kiện:** gộp / xoá khách → service gộp / ẩn danh, kể cả khi service tắt lúc đó.
- **Trình duyệt:** mọi màn hình ở 07; điện thoại 375 px.
- **Deploy:** compose; image hai process kiểu Render với MySQL TLS kiểu Aiven, RAM < 512 MB; demo-reset; newman.

## 6. Rủi ro và cách giảm

| Rủi ro | Cách giảm |
|---|---|
| Phạm vi lớn (19 bảng, khoảng 85 endpoint) cho một người bảo trì | Chia 4 bước, mỗi bước có tiêu chí "xong khi" + báo cáo. `matchmaking` thuần nên test rẻ. Cùng stack với app chính |
| Hai process vượt 512 MB trên Render free | Heap service 160 MB; đo ở bước 4; không đủ thì web service thứ hai |
| Aiven free không cho tạo DB / user thứ hai | Kiểm tra đầu bước 4; không được thì một DB + user riêng + tiền tố bảng `cs_`, ghi rõ là ngoại lệ tạm |
| Hằng số (D, K, điểm thứ hạng) chưa sát thực tế | Tất cả ở file cấu hình; sổ điểm đủ dữ liệu cho `calibrate.js` khi có ≥ 200 trận |
| Tự chấm cao / cố ý chấm thấp | Mô tả hành vi; trần 4.5; tiêu chí then chốt; cờ xác nhận; `pairingRating`; K lớn cho người mới |
| Buổi giao lưu ảnh hưởng điểm (đánh cho vui) | Mặc định không tính điểm; bật thì hệ số 0.5; không trao điểm thành tích |

## 7. Ngoài phạm vi — để các nhánh sau

- Khách tự đăng ký giải online + lệ phí (nối module thanh toán của app chính qua sự kiện).
- Giải nhiều nội dung trong một sự kiện; trận tự khai có đối thủ xác nhận.
- Xếp sân tự động cho lịch giải: sự kiện `tournament.drawn` → app chính giữ sân.
- Huy hiệu / thành tựu; ảnh đại diện; thông báo đẩy khi điểm đổi.
- **video-analysis-service** (tài liệu 04). Message broker; `/metrics`; TypeScript (nếu A2 đổi ý).

---

## 8. Kết quả

### 8.1 Bước 1 — xong trên nhánh `feat/competition-service` (26/09/2026), chờ duyệt để làm bước 2

**Đã làm** (`services/competition-service/`, không sửa dòng nào của `backend/` / `frontend/`):

- **Khung service:**
  - config kiểm tra env (sai là không khởi động);
  - xác thực token ES256 + scope + cô lập tenant / organizer;
  - `Idempotency-Key`, `X-Request-Id`, log pino (không log token / body);
  - health live / ready (kiểm cả migration);
  - kiểm request theo OpenAPI;
  - handler lỗi (envelope + `code`);
  - outbox → webhook ký HMAC (thuê dòng `SKIP LOCKED`, lùi dần, dead + gửi lại);
  - inbox `POST /v1/events` (chữ ký HMAC, khử trùng lặp);
  - `audit_log`;
  - lịch việc (ảnh chụp BXH 03:00, dọn khoá idempotency).
- **Dữ liệu:** 4 migration, 10 bảng (`players`, `player_stats`, `player_ratings`, `assessments`, `rating_changes`,
  `leaderboard_snapshots`, `outbox_events`, `inbox_events`, `idempotency_keys`, `audit_log`) — khoá chính UUIDv7.
- **Module:**
  - `player`: hồ sơ, JIT, quyền riêng tư, gộp, ẩn danh, 3 sự kiện `bd.customer.*`;
  - `rating`: rubric v1, tự chấm, nhân viên chấm, chấm nhanh, bài AI, duyệt, xác nhận, chỉnh tay, sổ điểm, engine Elo
    `computePeriodRatings`, chống giấu trình;
  - `ranking`: BXH trình độ, vị trí dự kiến, ảnh chụp + ↑↓;
  - `matchmaking`: ghép cặp cân bằng, chia bảng, vòng tròn, xếp lượt, sơ đồ loại trực tiếp, xếp sân giao lưu.
- **API:** 34 endpoint `/v1` + health + `/docs`.
  - Hợp đồng `openapi/competition-service.v1.yaml` (khoảng 1.460 dòng).
  - 5 JSON Schema sự kiện.
- **Công cụ:**
  - `check-boundaries` (luật B1 / B7, kèm bảng chiều phụ thuộc giữa module);
  - `keys:generate`, `token:dev`, `snapshot`, `bench-pairing`;
  - Dockerfile (entrypoint chờ DB → migrate → chạy), README;
  - job CI `competition-service` (MySQL 8.4 bật `sql_require_primary_key`).
- **Quy mô:** 66 file nguồn (khoảng 4.600 dòng), 12 file test (khoảng 1.600 dòng).

**Kiểm thử thật:**

| Kiểm | Kết quả |
|---|---|
| `npm test` trên MySQL 9.5 local | **123 / 123** (73 unit + 50 integration) |
| `npm test` trên MySQL 8.4 Docker, `--sql-require-primary-key=ON` (giống Aiven) | **123 / 123**; xác nhận test chạy đúng DB đó: 11 bảng, 42 người chơi, 74 dòng outbox trong DB test |
| Response mọi test integration được kiểm theo OpenAPI; mọi sự kiện kiểm theo JSON Schema | Không có vi phạm hợp đồng |
| Ví dụ số trong tài liệu | Ra đúng: 2.96 / 3.15; trần 3.49; +0.151 / +0.044 / −0.074 / −0.044; bảng lên / xuống; 8 người → 4 đội 3.40; 18 trận → 5 lượt, 75 phút |
| Chạy song song | Hai bài tự chấm cùng lúc → đúng 1 bài `applied`, 4 dòng sổ điểm |
| Ghép cặp 128 người (node thường) | Khoảng 50 ms (< 200 ms) |
| Mô phỏng buổi giao lưu 3 giờ, 20 người, 4 sân, có người đến muộn / về sớm | Chênh lệch số trận ≤ 1, không cặp đồng đội nào lặp quá 2 lần — **bước 3 phát hiện mô phỏng này chưa thực tế** (mọi sân xong cùng lúc), xem 8.8 |
| `db:migrate:undo:all` → `db:migrate` trên MySQL 8.4 | Hoàn tác sạch (còn 1 bảng `SequelizeMeta`), migrate lại được |
| Image Docker production nối MySQL 8.4 | Healthy; `/docs` tắt (404) |
| Kịch bản curl thật vào container (không qua test), receiver webhook trên máy host đóng vai app chính | Xem dưới |

Kịch bản curl thật vào container:

- tự chấm → 2.96 / 3.15;
- gửi lại cùng key → `201` + `Idempotent-Replayed`;
- nhân viên chấm → trần 3.49 `gate:backhand`, đã xác thực;
- chấm nhanh → 3.25 + cờ `quick`;
- nhân viên thường chỉnh điểm → 403; quản lý chỉnh → sổ điểm `[assessment → 3.49, adjustment 3.49 → 3.6]`;
- sự kiện đổi tên + gộp hồ sơ từ "app chính" → xử lý đúng; chữ ký sai → 401;
- **13 / 13 sự kiện tới receiver, chữ ký hợp lệ, outbox toàn `delivered`**.

### 8.2 Khác với kế hoạch — đều do test thật phát hiện

1. **Idempotency (lỗi thật):** response được gửi trước khi lưu khoá, nên client gửi lại ngay sẽ gặp 409 "đang xử lý".
   Đã sửa: lưu xong mới gửi.
2. **Outbox (lỗi thật):** điều kiện "chờ sự kiện trước cùng aggregate" chặn cả sự kiện đã tới hạn, nên mỗi lượt quét
   chỉ giao được 1 sự kiện / người chơi (3 sự kiện mất 3 lượt × 5 giây). Đã sửa: chỉ chặn khi sự kiện trước đang chờ
   thử lại; trong lô thì tuần tự, lỗi thì chặn phần sau.
3. **Gộp hồ sơ (thiếu):** điểm của đích đổi mà không phát `rating_changed`. Đã bổ sung.
4. **Ngưỡng ghép cặp 0.05 → 0.03:** với danh sách lệch hai đầu (tốt nhất ≈ 0.115, simulated annealing cũng chỉ ra
   0.1155), 0.05 cho phép chọn phương án kém hơn tới khoảng 40%.
5. **Số trong tài liệu:** B1 là −0.0735 → làm tròn **−0.074**, không phải −0.073.
6. **Luật bổ sung:**
   - tự chấm bị khoá cả khi trình đã được nhân viên chấm / xác nhận (không cho đè);
   - bài nhân viên chấm cho người đã có trận có trạng thái riêng `recorded`;
   - BXH: người `hidden` không có hạng, người `members` có hạng nhưng bị che tên với khách chưa đăng nhập, để số hạng
     giống nhau với mọi người xem.
7. **Kỹ thuật:**
   - `organizerRef` chứa dấu `:` phải khai `allowReserved` trong OpenAPI;
   - schema `nullable` + `$ref` phải viết thành bản `...OrNull` có `type`;
   - trong vm của Jest thuật toán chậm khoảng 10 lần, nên đo hiệu năng bằng node thường qua child process.

### 8.3 Còn lại / cần biết

- **Để bước 2** (cần bảng `matches`):
  - `GET /v1/players/{id}/stats`, `/matches`, `/partners`, `/head-to-head/{other}`;
  - `GET /v1/me/tournaments`, `/v1/me/matches`;
  - BXH thành tích `/v1/leaderboards/points`.

  Bảng `player_stats` đã tạo, chưa ghi.
- **Windows:** curl trong Git Bash không gửi chữ Việt trong tham số dòng lệnh dưới dạng UTF-8 (thành `EF BF BD` / `?`).
  Gửi bằng file (`--data-binary @file.json`) thì đúng. Đây là lỗi của công cụ gửi, không phải của service (đã kiểm
  byte trong DB).
- **Chưa kiểm được:**
  - job CI mới chưa chạy trên GitHub (chưa push);
  - image khoảng 320 MB (node:22-alpine + deps).

### 8.4 Bước 2 — xong trên nhánh `feat/competition-service` (26/09/2026)

**Đã làm** (vẫn chỉ trong `services/competition-service/`, không sửa app chính):

- **Dữ liệu:** 3 migration, 7 bảng (`matches`, `match_participants`, `tournaments`, `tournament_entries`,
  `tournament_teams`, `tournament_placements`, `ranking_results`). Tổng cộng 17 bảng.
- **Module `match`** (chỉ phụ thuộc `player`):
  - mô hình trận chung cho giải và giao lưu;
  - kiểm tỉ số theo luật BWF (3×21 trần 30, 1×21, 3×15 trần 21, 1×31, tuỳ chỉnh), W.O., bỏ cuộc giữa trận;
  - người thắng tự vào ô trận sau, người thua bán kết vào trận tranh hạng 3;
  - gọi ra sân, huỷ trận;
  - thống kê dựng lại từ trận (nguồn sự thật);
  - lịch sử trận, đồng đội hay đánh, đối đầu.

  Ngữ cảnh (giải / buổi giao lưu) gắn vào qua hook, nên `match` không biết `tournament`.
- **Module `tournament`:**
  - tạo / sửa (khoá sau khi có người đăng ký) / mở / huỷ;
  - đăng ký: kiểm giới, trình theo `pairingRating`, tổng trình cặp, giới hạn số người + danh sách chờ; rút lui;
  - bốc thăm: xem trước → xác nhận bản đổi tay (kiểm hợp lệ), mở lại;
  - ba thể thức: vòng tròn, vòng bảng + loại trực tiếp (sơ đồ tự sinh, nhất – nhì cùng bảng ở hai nửa), loại trực tiếp
    có hạt giống + tranh hạng 3;
  - xếp lượt theo số sân, gợi ý thể thức + ước tính thời gian;
  - bảng xếp hạng trong bảng (đối đầu, hiệu số game / điểm, bốc thăm bằng seed), thứ hạng chung cuộc;
  - xem trước khi chốt → chốt / huỷ chốt.
- **Chốt giải** ghi **một transaction** qua 4 module:
  - điểm trình (`rating.applyPeriod`, khoá theo thứ tự id);
  - điểm BXH thành tích (`ranking`);
  - thống kê (`match` + `player`);
  - thứ hạng + sự kiện.
- **Huỷ chốt** hoàn tác bằng dòng `rollback` (không xoá sổ điểm); bị chặn nếu có ai đổi điểm sau giải.
- **BXH thành tích:** tổng 6 kết quả tốt nhất trong 52 tuần, bỏ kết quả hết hạn / bị thu hồi. Vị trí trên bảng này có
  trong hồ sơ người chơi.
- **API:** 35 thao tác mới (hợp đồng có tổng 69 thao tác, bước 1 là 34), hợp đồng OpenAPI khoảng 2.700 dòng, thêm 5 JSON Schema sự kiện
  (`match.completed`, `tournament.drawn` / `finalized` / `unfinalized` / `cancelled`).
- **Dữ liệu demo** (`npm run seed:demo`) tạo bằng chính các service:
  - 25 người chơi;
  - giải đôi nam nữ ghép cặp 12 đội và giải đơn nam loại trực tiếp 8 người, đã chốt, lùi ngày để có lịch sử;
  - ảnh chụp BXH;
  - 1 giải đang mở với 21 người đủ điều kiện;
  - `bd:customer:1` chưa chấm trình để khách xem demo tự làm form.

**Kiểm thử thật:**

| Kiểm | Kết quả |
|---|---|
| `npm test` trên MySQL 9.5 local | **170 / 170** (103 unit + 67 integration) |
| `npm test` trên MySQL 8.4 Docker `--sql-require-primary-key=ON` | **170 / 170**; DB test có 18 bảng, 7 giải, 47 trận — đúng là chạy trên DB đó |
| Ví dụ 06 §9 bằng API thật (test integration) | Xem dưới |
| Cặp cố định, giới hạn số người, khoá sửa, mở lại, huỷ, quyền | Cặp cố định: bắt buộc đồng đội, tổng trình cặp 7.1 > 7.0 → 422, bốc thăm không được đổi cặp. Hết chỗ → chờ, người chờ sớm nhất được lên khi có người rút. Có người đăng ký thì không đổi luật điểm (409), `If-Match` lệch → 409. Mở lại → bốc lại → huỷ giải. Khách hàng nhập tỉ số → 403; chi nhánh khác → 404 |
| Giải đơn loại trực tiếp 6 người + tranh hạng 3 | Sơ đồ 8, 2 bye cho hạt giống 1–2; thứ hạng 1 / 2 / 3 / 4 / 5–8 / 5–8 |
| BXH thành tích với 9 kết quả của một người (7 còn hiệu lực, 1 hết hạn, 1 thu hồi) | Tính đúng 6 kết quả tốt nhất: 450 điểm |
| `db:migrate:undo:all` → `db:migrate` trên 8.4 | Hoàn tác 7 bước sạch (còn `SequelizeMeta`), chạy lại 7 bước |
| Image Docker production + MySQL 8.4 | Healthy; seed demo trong container cho cùng kết quả như local (cùng seed); thiếu `ALLOW_DEMO_SEED` thì seed bị chặn |
| Chạy trọn giải demo đang mở bằng HTTP thật vào container (22 request: ghi 23 trận, sơ đồ, chốt) | Chốt thành công; 20 người đổi điểm; BXH Đôi nam nữ cộng dồn qua 2 giải. DB: 3 giải `finalized`, 52 dòng sổ điểm theo giải, 54 sự kiện `match.completed` = 23 + 8 + 23 trận |

Ví dụ 06 §9 bằng API thật (test integration):

- 14 nam + 12 nữ đăng ký: 1 nam trình 4.3 bị từ chối; 2 người chưa có điểm → 422 `NEEDS_ASSESSMENT` → chấm nhanh →
  đăng ký được; đăng ký trùng → 409.
- Xem trước: 12 đội nam nữ, 1 nam chờ, 3 bảng × 4, 18 trận / 5 lượt / 75 phút; cùng seed → cùng đề xuất.
- Bản đổi tay sai → 422; đổi hai bạn nữ → xác nhận (sự kiện ghi `manualEdits: true`).
- Nhập kết quả: thiếu `If-Match` → 412; lệch → 409; `21-20` → 422; kết quả đầu tiên → `in_progress`.
- Sơ đồ 8 với 2 bye, nhất – nhì cùng bảng ở hai nửa; người thắng tự đi tiếp; đổi người thắng khi trận sau đã gọi
  ra sân → 409.
- Chốt **hai request song song → đúng 1 thành công**.
- **Điểm trình của 24 người trong DB khớp tính độc lập bằng engine** từ điểm trước giải và các trận lấy qua API.
- Điểm vô địch = `100 × 2 × 0.875 × sức mạnh`; 24 dòng BXH; thống kê vô địch đúng số trận, `titles = 1`.
- Huỷ chốt → điểm về đúng như trước giải, `rated_matches = 0`, BXH trống, thống kê về 0.
- Chốt lại; chỉnh điểm một người → huỷ chốt bị chặn `ROLLBACK_BLOCKED`.
- Rút lui giải đơn: trận chưa đánh thành W.O., không tính điểm trình, không vào thống kê.

### 8.5 Khác với kế hoạch / test thật phát hiện (bước 2)

1. **Hợp đồng OpenAPI (3 lỗi thật):**
   - `TournamentInput` viết bằng `allOf` + `additionalProperties: false` → từ chối luôn `organizerRef`; đã viết lại
     bằng YAML anchor;
   - `multipleOf: 0.001` cho điểm → ajv từ chối nhầm số thực (3.9); đã bỏ, server tự làm tròn;
   - `bracket` không cho `null` nên client gửi lại đúng bản xem trước (vòng tròn → `bracket: null`) bị 400; đã cho
     phép `null`.
2. **`rankingPoints`** ở "xem trước khi chốt" và "chốt" từng khác dạng; đã thống nhất: mảng `rankingPoints` +
   `rankingEligible` + `rankingReason`.
3. **Thêm cột `tournament_entries.waitlist_reason`** (`capacity` / `draw`) để bốc lại / mở lại chỉ trả về đúng những
   người chờ do bốc thăm.
4. **Quyết định chốt khi code:** ghi ở tài liệu 06 mục 11 (giới hạn số người tính theo người; W.O. không vào thống kê;
   tiêu chí phụ khi bằng điểm BXH; thứ tự khoá).
5. **Kỹ thuật (bài học cho các bước sau):**
   - script ghép YAML dùng `String.replace` với chuỗi thay thế có chứa `$` + dấu nháy đơn làm hỏng file (JavaScript
     hiểu là "phần sau chỗ khớp"). Đã khôi phục từ commit bước 1, ghép lại bằng hàm thay thế và kiểm cú pháp trước khi
     ghi;
   - supertest mở server tạm ngay lúc `.post()`, nên `post(url).send({ id: await taoNguoiChoi() })` gây ECONNREFUSED.
     Tạo dữ liệu trước rồi mới dựng request.

### 8.6 Còn lại (sau bước 2)

- **Bước 3:** module `session` (buổi giao lưu) — xong, xem 8.7.
- **Bước 4 (nhánh riêng):** tích hợp app chính + giao diện.
- **DB dev** `competition_service` trên MySQL local đang chứa dữ liệu demo (cố ý, để xem qua Swagger `/docs`). Muốn
  sạch thì drop DB rồi `npm run migrate`.

### 8.7 Bước 3 — xong trên nhánh `feat/competition-service` (26/09/2026), chờ duyệt

**Đã làm** (vẫn chỉ trong `services/competition-service/`, không sửa app chính):

- **Dữ liệu:** 1 migration, 2 bảng (`play_sessions`, `play_session_players`), thêm `stage = session` và trạng thái trận
  `ended` cho `matches`. Tổng cộng 19 bảng. Hoàn tác được cả khi đã có dữ liệu giao lưu.
- **Module `session`** (phụ thuộc `player`, `rating`, `matchmaking`, `match`):
  - tạo / sửa (khoá Đơn–Đôi khi đã có trận, không bỏ được sân đang có trận) / huỷ buổi;
  - điểm danh kèm chấm nhanh trong cùng transaction, người đến muộn / quay lại được bù số trận, rời buổi;
  - "Xếp sân trống": xem trước (cảnh báo cặp đồng đội lặp) → đổi tay → xác nhận bản gửi lại nguyên văn, hoặc để hệ
    thống tự xếp theo seed; bản cũ → 409 `FILL_STALE`;
  - màn hình lớn: sân – ai với ai – từ lúc nào, hàng chờ theo ưu tiên (đánh dấu lượt tới), kết quả gần nhất;
  - xem trước khi đóng → đóng buổi: trận chưa tỉ số bị huỷ, điểm trình hệ số 0.5 nếu bật, thống kê "giao lưu", sự kiện
    `competition.session.closed`.
- **Module `match`:** trận giao lưu (không có đội của giải), `POST /v1/matches/{id}/end` ("xong, không tỉ số"), hook
  `afterStatusChange` để buổi giao lưu trả người về hàng chờ.
- **API:** 15 thao tác mới (hợp đồng có tổng 84), 1 JSON Schema sự kiện mới.
- **Dữ liệu demo:** thêm 1 buổi giao lưu đã đóng (có tính điểm) và 1 buổi đang diễn ra (3 sân đang đánh).

**Kiểm thử thật:**

| Kiểm | Kết quả |
|---|---|
| `npm test` trên MySQL 9.5 local | **224 / 224** (139 unit + 85 integration) |
| `npm test` trên MySQL 8.4.11 Docker `--sql-require-primary-key=ON` | **224 / 224** |
| Luồng buổi giao lưu bằng API (13 test) | Xem trước cùng seed → cùng đề xuất; đổi tay → ghi `manualEdits`; gửi lại cùng key → không tạo thêm; sân xong thì chỉ sân đó được xếp, người chờ từ đầu ra trước; bản cũ → 409; "xong không tỉ số" rồi nhập tỉ số sau vẫn được; trận giải bấm "xong" → 409; đến muộn được bù; đang ở sân không rời được; huỷ trận → trừ số trận; `PATCH` thiếu `If-Match` → 412 |
| Đóng buổi có tính điểm | **Điểm trình trong DB khớp tính độc lập bằng engine với hệ số 0.5**, và mức đổi nhỏ hơn hệ số 1.0; 2 trận chưa tỉ số bị huỷ; thống kê "giao lưu" đúng số trận; sự kiện đúng JSON Schema; sau khi đóng ghi tỉ số / điểm danh / đóng lại → 409 |
| **Mô phỏng 3 giờ, 20 người, 4 sân qua API thật** (có người đến muộn / về sớm, mỗi trận 12–18 phút, 1/8 trận "xong không tỉ số") | 49 trận; mỗi người cả buổi 10–11 trận; đồng đội lặp ≤ 2; nhóm 4 người chung sân ≤ 4; số trận trong bảng điểm danh khớp DB; đóng buổi khớp tính độc lập |
| Mô phỏng hàm thuần (test unit: 10 seed × 2 kịch bản; đo thêm 200 seed ngoài test) | Xem 8.8 |
| Gộp hồ sơ có lịch sử thi đấu (4 test) | Xem 8.8 |
| `db:migrate:undo` bước 3 trên 8.4 khi đã có dữ liệu demo | 21 trận giao lưu bị xoá, 31 trận giải còn nguyên, ENUM về như cũ; `undo:all` sạch; migrate lại đủ 19 bảng |
| Image Docker production + MySQL 8.4 | Healthy (8 migration), `/docs` 404; thiếu `ALLOW_DEMO_SEED` → seed bị chặn; seed trong container cho cùng kết quả như local |
| Kịch bản HTTP thật (không qua Jest), chạy cả vào server dev lẫn container | 24 / 24 bước đạt, gồm đối chiếu DB: sự kiện `session.closed`, trạng thái trận sau khi đóng, tổng số trận trong bảng điểm danh = số lượt ra sân; log container không có lỗi |

### 8.8 Khác với kế hoạch / test thật phát hiện (bước 3)

1. **Thuật toán xếp sân của bước 1 chưa đạt.** Mô phỏng ở bước 1 cho mọi sân xếp cùng lượt **chung một thời lượng**
   → các sân luôn xong cùng lúc → người luôn được trộn lại. Mô phỏng qua API (mỗi sân xong một giờ) lộ ra:
   - 4 người vừa chờ luôn ra cùng một sân → **nhóm 4 người dính nhau cả buổi**;
   - với thời lượng trận thực tế (12–18 phút, mỗi sân một thời lượng), bản bước 1 cho: chênh số trận tới **3**, đồng
     đội lặp tới **5** lần (22–40 / 40 lần chạy có lặp > 2), một nhóm 4 người chung sân tới **11** trận.

   Đã sửa `fillCourts` (tài liệu 06 mục 8.3):
   - ưu tiên **ít trận nhất trước**, rồi mới chờ lâu nhất;
   - trộn người "bằng trận" đứng sau hàng vào sân (kéo lên sớm bị phạt 0.10); chỉ một sân trống thì duyệt hết;
   - phạt đồng đội lặp **0.50 × n²** (trước: 0.30 × n);
   - không bao giờ để người rảnh ít trận hơn ngồi chờ thay người nhiều trận hơn.

   Kết quả (20 người, 4 sân, 3 giờ; bản bước 3 chạy 200 seed, bản bước 1 chạy 40 seed; hai dòng cuối: 40 seed mỗi
   bản):

   | | Bản bước 1 | Bản bước 3 |
   |---|---|---|
   | Chênh số trận lúc cắt buổi | tới 3 | ≤ 1 ở 198 / 200 (có người đến muộn / về sớm: 197 / 200); các lần còn lại 2 — **chỉ** khi mọi người ít trận nhất đang đánh dở trận cuối |
   | Đồng đội lặp > 2 lần | 40 / 40 lần chạy (thử 40) | 4 / 200 (có người đến muộn / về sớm: 0 / 200) |
   | Một nhóm 4 người chung sân | tới 11 trận | tối đa 4 |
   | Chênh trình hai đội trong sân (trung bình) | 0.34 | 0.14 |
   | Đánh liền (vừa xong lại ra sân ngay), cả buổi 20 người | khoảng 20 lượt | khoảng 68 lượt — cái giá của việc trộn người |

   Chưa đạt tuyệt đối: 18 người / 4 sân (chỉ 2 người chờ) có lần chênh 2 và lặp 3; hệ thống không để sân trống chờ
   người, nên khi trận dài ngắn lệch nhau vẫn có thể chênh tạm thời 2 trận ở cuối buổi.
2. **Gộp hồ sơ ở bước 2 chưa đủ** (tài liệu 05 mục 4 yêu cầu): chỉ chuyển điểm, bài chấm, sổ điểm; **trận, đăng ký giải,
   đội, điểm BXH thành tích vẫn nằm ở hồ sơ nguồn** và chưa có `MERGE_CONFLICT`. Đã sửa: mỗi module tự chuyển dữ liệu
   của mình qua `mergeHandler` trong cùng transaction; hai hồ sơ cùng một giải / trận / đang cùng có mặt ở một buổi →
   409; một bên đã rút trước bốc thăm → bỏ dòng đăng ký đó rồi gộp. Test: khách vãng lai đã đánh giải đã chốt gộp vào
   tài khoản → 3 trận, đăng ký, đội, điểm BXH, thống kê chuyển đúng; sự kiện `bd.customer.merged` bị chặn → 409,
   không ghi inbox; gửi lại cùng id sau khi rút → thành công.
3. **Hợp đồng:** bản xem trước "Xếp sân trống" trả thêm `teamRatings`, `repeatPartners` nên client gửi lại nguyên văn bị
   400; đã cho phép gửi lại nguyên văn (server bỏ qua hai trường đó).
4. **`fillCourts`:** có người rảnh nhưng chưa đủ một sân thì lỗi (chỉ lộ ra với bản mới) — đã sửa, có test.
5. **Quyết định chốt khi code:** tài liệu 06 mục 12 (trạng thái `ended`, trận giao lưu không có đội, bù trận khi đến
   muộn, chấm nhanh cần `rating:assess`, rời buổi khi đang ở sân, `FILL_STALE` / `NOTHING_TO_FILL`, sửa / huỷ buổi,
   thêm `GET …/close-preview`, `GET …/players`, `GET …/matches` ngoài danh sách ở tài liệu 02).
6. **Ngày ghi ở bước 2** là "27/09/2026" — sai, đúng là 26/09/2026 (cả ba bước cùng ngày); đã sửa.
7. **Dữ liệu demo buổi giao lưu** không giống hệt nhau giữa các lần seed (hàng chờ dùng giờ thật lúc điểm danh / nhập
   tỉ số, tính tới giây); số trận, số người đổi điểm thì như nhau. Các giải demo vẫn giống hệt.

### 8.9 Còn lại

- **Bước 4 (nhánh riêng `feat/competition-integration`):** tích hợp app chính + giao diện (tài liệu 07).
- **Chưa có "huỷ đóng buổi"** (giải có "huỷ chốt"). Đóng nhầm buổi có tính điểm thì quản lý chỉnh điểm tay có lý do.
- **DB dev** `competition_service` đang chứa dữ liệu demo mới (có buổi giao lưu đang diễn ra để xem màn hình lớn).

## 9. Sửa sau khi chủ dự án bấm thử bước 3 — "lượt tới" và dữ liệu demo

- **Nhánh:** tiếp tục `feat/competition-service`. Bước 1–3 chưa merge và phần sửa nằm trong phạm vi bước 3 → một
  commit riêng trên cùng nhánh.
- **Ngày:** 27/09/2026. **Trạng thái:** đã làm, kết quả ở 9.7–9.8; chờ duyệt merge.

### 9.1 Hiện tượng và nguyên nhân

Khi bấm thử trên bàn thử:
- màn hình buổi giao lưu đánh dấu **"lượt tới"** cho 2 người đã chờ hơn 2 phút;
- nhưng "Xếp sân trống" lại đưa **2 người vừa đến** vào sân (được bù 1 trận nên bằng trận với người chờ).

Có 3 nguyên nhân chồng nhau:

1. **Thứ tự hàng chờ trên màn hình khác thứ tự của thuật toán.** Đây là sót của bước 3: `fillCourts` đã đổi sang
   "ít trận nhất trước, rồi chờ lâu nhất", nhưng `sessionRules.queueOrder` (màn hình dùng) vẫn là "chờ lâu nhất trước".
2. **"Lượt tới" chỉ là N người đầu hàng**, trong khi thuật toán được kéo người "bằng trận" đứng sau lên để trộn nhóm.
   Đo trên 200 lần chạy: hiện tại 51–66% số lượt xếp có kéo người lên (riêng 18 người / 4 sân: 23%); kể cả phương
   án đề xuất ở 9.2 vẫn 42–53%. Vì vậy **không thể đoán "lượt tới" bằng thứ tự hàng**, dù chỉnh tham số thế nào.
3. **Ngưỡng kéo lên quá dễ** (phạt 0.10 / người). Chỉ cần hai đội cân hơn một chút, hoặc tránh gặp lại đối thủ 1–2
   lần, là kéo, kể cả người vừa đến. Trung bình 80 lần "chen hàng" / buổi (20 người, 4 sân).

Dữ liệu demo:

4. **Sổ điểm lệch thứ tự:** bài chấm trình mang ngày seed, còn các giải bị lùi về tháng 8–9, nên sổ điểm hiện "chấm
   trình" sau các giải.
5. **Buổi giao lưu demo dùng giờ thật lúc seed**, nên:
   - mỗi lần seed ra khác nhau (giải demo lần này 22 người đủ điều kiện, lần trước 21);
   - giờ đánh không thực tế (sân "đang đánh 45 phút").

### 9.2 Đã đo trước khi lập plan

Đo bằng bản thử ngoài repo, 200 lần chạy mỗi kịch bản, mỗi trận 12–18 phút, người đến muộn được bù trận như service
thật. Các chỉ số:
- **Chen hàng:** số lần một người bằng trận nhưng chờ lâu hơn ít nhất 1 phút bị để lại.
- **Lượt có kéo:** tỉ lệ lượt xếp có ít nhất một lần như vậy.

| 20 người / 4 sân, 3 giờ | Hiện tại | **Đề xuất (L)** | Chặt hơn (J) | Không trộn ⁽¹⁾ |
|---|---|---|---|---|
| Chen hàng / buổi | 80 | **56** | 42 | 0 |
| Lượt có kéo người lên | 65% | 53% | 53% | 0% |
| Đồng đội lặp > 2 lần | 1 / 200 | 4 / 200 | 4 / 200 | 39 / 40 |
| Như trên, kịch bản tài liệu (đến muộn / về sớm) | 0 / 200 | 0 / 200 | 0 / 200 | 21 / 40 |
| Một nhóm 4 người chung sân, tối đa | 4 trận | 5 trận | 4 trận | 10 trận |
| Lệch trình hai đội, trung bình | 0.128 | 0.147 | 0.153 | 0.41 |
| Đánh liền (vừa xong lại ra sân) / buổi | 67 | 59 | 55 | 29 |
| Người chưa đánh trận nào bị kéo lên trước | có | **không** | không | không |

⁽¹⁾ 40 lần chạy. Mọi phương án đều giữ chênh số trận ≤ 1 (trừ lúc cắt buổi khi người ít trận nhất đang đánh dở).

**Đề xuất L:**
- người **chưa đánh trận nào trong buổi** (vừa đến, đến muộn) không bao giờ bị kéo lên trước người chờ lâu hơn;
- kéo người lên để **tránh lặp đồng đội** vẫn dễ (phạt 0.10 / người), giữ mục tiêu "đồng đội thay đổi liên tục";
- kéo người lên **chỉ để cân trình hoặc tránh gặp lại đối thủ** thì khó hơn (phạt 0.30 / người).

Kết quả: chen hàng giảm khoảng 30%, không còn cảnh người mới đến chen lên. Đổi lại:
- hai đội lệch trình thêm khoảng 0.02;
- số buổi có cặp đồng đội lặp 3 lần tăng từ 0.5% lên 2% (kịch bản 20 / 4 không ai đến muộn). Kịch bản của tài liệu vẫn
  0 / 200.

Nếu anh/chị muốn giữ độ cân trình như hiện tại: chỉ làm quy tắc "người mới không bị kéo lên" và sửa màn hình (mục
9.3 B).

### 9.3 Việc sẽ làm

**A. Thuật toán `fillCourts` (module `matchmaking`):**
- input thêm `newcomer`: chưa đánh trận nào trong buổi → không bị kéo lên trước;
- tách phạt lặp đồng đội khỏi phần còn lại, để áp hai mức phạt kéo lên: hằng số mới
  `SESSION_SKIP_PENALTY_PARTNER` = 0.10, còn `SESSION_SKIP_PENALTY` từ 0.10 lên 0.30;
- output thêm `order`: thứ tự ưu tiên đầy đủ của mọi người rảnh;
- hợp đồng `POST /v1/matchmaking/session-round`: thêm `newcomer` (vào) và `order` (ra).

**B. Màn hình lớn và hàng chờ (module `session`):**
- một hàm dùng chung cho màn hình, "xem trước" và "Xếp sân trống" tự xếp: cùng dữ liệu, cùng seed → cùng kết quả;
- thứ tự hàng chờ lấy từ `order` của thuật toán; bỏ `sessionRules.queueOrder`;
- **có sân trống:** `next` đánh dấu đúng những người sẽ vào sân nếu bấm "Xếp sân trống" ngay. Thêm `upcoming`
  [{ courtRef, players }] để TV hiện "Sân 2 — chuẩn bị: A, B, C, D";
- **không có sân trống:** không đánh dấu `next`. TV ghi "thứ tự ưu tiên", không hứa "lượt tới";
- hợp đồng `SessionBoard`: thêm `upcoming`, sửa mô tả `next`.

**C. Dữ liệu demo (`scripts/seed-demo.js`):**
- lùi ngày bài chấm ban đầu và dòng sổ điểm "chấm trình" về 60 ngày trước, tức trước giải đầu tiên;
- hai buổi giao lưu demo chạy theo **đồng hồ giả lập** (giờ điểm danh, giờ vào sân, giờ xong định sẵn; mỗi trận 12–18
  phút), nên:
  - seed lần nào cũng ra giống hệt;
  - giờ trận hợp lý;
  - buổi đang diễn ra có các sân vừa vào 3–10 phút trước lúc seed.

**D. `scripts/sim-session.js` (mới):** chạy lại được phép đo ở mục 9.2 (200 lần chạy × 7 kịch bản), để số liệu trong
tài liệu kiểm chứng được. Số trong tài liệu 06 hiện tại đo bằng bộ đo cũ → sẽ đo lại toàn bộ bằng script này.

**E. Tài liệu:**
- 06: mục 8.2 (màn hình lớn), 8.3 (bước 5 + bảng đo), 10 (hằng số), 12;
- 02: màn hình lớn, `session-round`;
- plan 18 (kết quả); `00-tien-do.md`.

**F. Bàn thử** (ngoài repo, không commit): hiện "Chuẩn bị vào sân" theo `upcoming`.

### 9.4 Kiểm thử thật

- **Unit `fillCourts`:**
  - tái hiện đúng ca trên bàn thử: 2 người chờ lâu + 2 người mới đến bằng trận, 1 sân trống → 2 người chờ lâu vào sân;
  - người mới không bao giờ bị kéo lên;
  - không có lịch sử lặp → giữ đúng thứ tự hàng;
  - nhóm 4 người dính nhau vẫn bị phá khi sắp lặp đồng đội;
  - `order` đúng thứ tự ưu tiên;
  - mô phỏng giữ tiêu chí cũ cho 10 seed × 2 kịch bản: bất biến công bằng, đồng đội lặp ≤ 2, nhóm 4 người ≤ 4 trận.
    Đã thử trước: phương án L đạt 50 / 50 seed ở kịch bản tài liệu và 49 / 50 ở kịch bản 20 / 4 không ai đến muộn; 10
    seed đang có trong test đều đạt.
- **Integration (API + MySQL):**
  - có 1 và 2 sân trống: `next` / `upcoming` trùng khớp kết quả bấm "Xếp sân trống" ngay sau đó;
  - không có sân trống → không ai được đánh dấu `next`;
  - thứ tự hàng chờ khớp thuật toán;
  - mô phỏng 3 giờ qua API như cũ, thêm kiểm: mỗi lần có sân trống, màn hình báo đúng người vào sân.
- **Seed demo:**
  - seed 2 lần trên 2 DB trống → toàn bộ trận, tỉ số, sổ điểm, đăng ký giải demo giống hệt;
  - sổ điểm của một người demo đúng thứ tự thời gian: chấm trình → giải tháng 8 → giải tháng 9 → giao lưu.
- **Chạy lại toàn bộ:**
  - `npm test` trên MySQL 9.5 và MySQL 8.4 kiểu Aiven;
  - kịch bản HTTP (thêm bước kiểm màn hình);
  - bàn thử trên trình duyệt: TV hiện đúng người sắp vào sân.

### 9.5 Không làm

- Không đổi luật bù trận cho người đến muộn.
- Không làm "huỷ đóng buổi".
- Chế độ "cùng trình" giữ nguyên (không trộn người).

### 9.6 Cần anh/chị chốt

1. **Thuật toán:** phương án L (khuyến nghị), hay chỉ chặn người mới và giữ độ cân trình như hiện tại?
2. **Buổi giao lưu demo theo đồng hồ giả lập:** khuyến nghị **có**.

Trả lời "code đi" nghĩa là làm theo các khuyến nghị trên.

### 9.7 Kết quả — xong trên nhánh `feat/competition-service` (27/09/2026), chờ duyệt

Chủ dự án duyệt "code đi" với cả hai khuyến nghị: phương án L và buổi giao lưu demo theo đồng hồ giả lập.

**Đã làm:**

- **`fillCourts`:**
  - người chưa đánh trận nào trong buổi (`newcomer`) không bao giờ bị kéo lên;
  - thêm khi code (xem 9.8): người mới ra sân thì mọi người "bằng trận" đứng trước họ cũng phải ra sân;
  - hai mức phạt kéo lên: 0.10 nếu bớt được lặp đồng đội, 0.30 nếu chỉ để cân trình hoặc bớt gặp lại đối thủ. Tìm cục
    bộ dùng cùng thang đo cho cả chiều kéo lên lẫn trả về;
  - trả thêm `order`: thứ tự ưu tiên đầy đủ.
- **Màn hình lớn:**
  - `upcoming` và `next` tính bằng chính hàm "Xếp sân trống", với seed của lượt tới;
  - hàng chờ theo `order`;
  - buổi đã đóng hoặc huỷ không còn hàng chờ;
  - bỏ `sessionRules.queueOrder`.
- **Hợp đồng:** `SessionBoard.upcoming` và schema `PlayerName`; `session-round` thêm `newcomer` (vào) và `order` (ra).
- **Seed demo:**
  - bài chấm trình lùi về 60 ngày trước;
  - hai buổi giao lưu chạy theo đồng hồ giả lập. Buổi đã đóng vào tối thứ Sáu 19:00, 16 người (2 người đến muộn, 1 người
    về sớm), 24 trận trong khoảng 2 giờ. Buổi đang diễn ra bắt đầu 26 phút trước lúc seed.
- **`npm run sim:session`** (mới): chạy lại được phép đo 200 lần chạy × 7 kịch bản.
- **Tài liệu:** 06 (mục 8.2, 8.3, 10, 12), 02, README.

**Kiểm thử thật:**

| Kiểm | Kết quả |
|---|---|
| `npm test` trên MySQL 9.5 local | **231 / 231** (143 unit + 88 integration) |
| `npm test` trên MySQL 8.4.11 Docker `--sql-require-primary-key=ON` | **231 / 231** (DB test: 20 bảng, 12 buổi giao lưu, 70 trận giao lưu) |
| Test mới bắt được lỗi cũ | 3 ca unit chạy trên thuật toán bước 3 cho đúng kết quả sai mà chủ dự án thấy. Ví dụ ca bấm thử: bước 3 chọn 2 người vừa đến, bản mới chọn 2 người chờ lâu. Test integration "người vừa đến không chen": tạm tắt cờ `newcomer` trong service thì test **fail** |
| Màn hình khớp "Xếp sân trống" | Integration: lần lượt 2 sân, 1 sân, 2 sân trống đều khớp. Mô phỏng 3 giờ qua API: **39 / 39 lượt khớp** |
| `npm run sim:session` (200 lần chạy × 7 kịch bản) | Xem bảng dưới |
| Seed demo | 2 lần seed trên 2 DB trống cho dữ liệu **giống hệt** (so từng byte của dấu vân tay). Seed trong container production (MySQL 8.4) cũng giống hệt seed ở máy (MySQL 9.5). Sổ điểm đúng thứ tự: chấm trình → giải → giao lưu |
| Image Docker production + MySQL 8.4 | Healthy; seed demo; kịch bản HTTP thật **26 / 26 bước** (thêm: màn hình không hứa khi đủ sân; "chuẩn bị vào sân" trùng bản xem trước; trận tạo ra đúng người màn hình đã báo); log container không có lỗi |
| Bàn thử trên trình duyệt (trỏ vào container) | Ghi tỉ số Sân 1 → ô "Chuẩn bị vào sân" hiện 4 người. TV hiện đúng 4 người đó. Bấm "Xếp sân trống" → trận tạo ra trùng khớp |

Số đo cuối cùng (`npm run sim:session`, 200 lần chạy, 20 người / 4 sân; cột bước 3 đo cùng script trên code commit
`7fb2f0f`):

| | Bước 3 | Hiện tại |
|---|---|---|
| Chen hàng / buổi | 80 | 56 |
| Người vừa đến chen trước (kịch bản đến rải rác) | 1.8 | **0** |
| Lượt xếp có kéo người lên | 65% | 53% |
| Đồng đội lặp > 2 lần | 1 / 200 | 4 / 200 |
| Như trên, kịch bản tài liệu (đến muộn / về sớm) | 0 / 200 | 0 / 200 |
| Chênh số trận ≤ 1 lúc cắt buổi | 199 / 200 | 199 / 200 |
| Lệch trình hai đội | 0.128 | 0.147 |
| Đánh liền / buổi | 67 | 59 |

### 9.8 Khác plan / phát hiện khi code

1. **"Người mới chen" chưa về 0 chỉ với quy tắc không kéo người mới** (còn 0.3–0.5 lần / buổi ở kịch bản đến rải rác).
   Khi kéo một người khác lên, thuật toán có thể gạt người chờ lâu ra mà vẫn giữ người mới. Người chờ lâu vẫn thấy
   "người mới được vào trước mình". Đã thêm ràng buộc: người mới ra sân thì mọi người "bằng trận" đứng trước họ cũng ra
   sân → còn 0.
2. **Test cũ `sessionRules.queueOrder` khẳng định thứ tự sai** ("chờ lâu nhất trước", xếp người đã 3 trận trước người
   0 trận). Đã bỏ cả hàm lẫn test; thứ tự do `fillCourts` quyết và có test riêng.
3. **Token trong test integration chỉ sống 60 giây.** File test chạy quá 90 giây (tính cả 30 giây dung sai) thì bị 401
   giữa chừng. Đã tăng lên 300 giây, bằng mức tối đa service chấp nhận.
4. **Buổi đã đóng vẫn trả hàng chờ** cho màn hình → đã bỏ.
5. **Không seed lại DB dev**, vì chủ dự án đã tạo một buổi thử trên đó (điểm danh 4 người, xếp sân 1 lần). Seed mới
   đã kiểm trên DB tạm và trong container. Muốn dữ liệu demo mới trên DB dev thì nói "seed lại".
