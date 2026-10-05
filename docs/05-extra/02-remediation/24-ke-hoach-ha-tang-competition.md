# Kế hoạch: bước 4(b) — hạ tầng cho competition-service (compose, Render + Aiven, reset demo, CI, Postman, tài liệu)

- **Ngày:** 05/10/2026.
- **Trạng thái:** chủ dự án duyệt 05/10/2026 ("theo đề xuất hết, code đi" — cả 6 câu ở mục 4 theo đề xuất; câu 1 chưa kiểm được vì cần tài khoản Aiven) → **đã làm xong, đã chạy thật, kết quả ở mục 9.** Nhánh đã push, chưa merge `main` (chờ xong (c)).
- **Nhánh:** `feat/competition-integration` (tiếp tục nhánh của plan 23; **chưa merge vào `main` cho tới khi (a), (b), (c) xong hết** —
  chủ dự án quyết 05/10/2026). Render deploy từ `main` nên bản demo đang chạy **không bị đổi** cho tới lúc merge.
- **Thuộc:** bước 4 của plan 18; (a) = plan 23 (xong, đã push), **(b) = plan này**, (c) giao diện (chưa lập plan).
- **Phạm vi:** `docker/`, `render.yaml`, `.dockerignore`, `.github/workflows/`, `backend/scripts/`, `postman/`, `docs/DeploymentGuide.md` và vài dòng
  ở `services/competition-service` (chỉ script / tài liệu, không đổi nghiệp vụ). Giao diện không thuộc phần này.

## 0. Bối cảnh

Bản demo công khai chạy **một web service Render** (docker/app.Dockerfile: backend + frontend build, một process, 512 MB RAM, 0,1 CPU) và **một DB
Aiven free**; reset mỗi đêm bằng `.github/workflows/demo-reset.yml`. Đường B là docker compose (mysql + backend + nginx). Plan 23 đã cho
app chính nói chuyện với service, nhưng chưa nơi nào chạy service: image app không chứa service, compose không có, `demo-reset` không biết DB thứ hai.

## 1. Hiện trạng đã đọc

- `render.yaml`: 1 service, biến DB + `DB_SSL_CA` (sync: false), `TRUST_PROXY_HOPS=3`, `DEMO_MODE`.
- `docker/app.Dockerfile`: context gốc repo; **`.dockerignore` gốc chỉ cho `backend`, `frontend`, `docker/nginx.conf` vào image** → `services/` hiện không vào được.
- `backend/docker-entrypoint.sh`: chờ DB → migrate → `exec` process. Service có entrypoint tương tự (`wait-for-db` → migrate → chạy) và `Dockerfile` riêng.
- `docker/docker-compose.yml`: `mysql` chỉ tạo **một** DB; `nginx.conf` chỉ có chỗ không đệm cho `/api/v1/realtime/` — đường SSE của cổng
  (`/api/v1/competition/…/stream`) chưa có (cổng đã gửi `X-Accel-Buffering: no` nên không đệm, nhưng `proxy_read_timeout` mặc định 60 giây và access log
  sẽ ghi token trên query).
- `demo-reset.js` + workflow: xoá bảng → migrate → seed **một** DB; chỉ `npm ci` backend.
- Service: DB riêng, `npm run migrate`, `seed:demo` (39 người chơi, 3 giải hôm nay, 2 buổi giao lưu, tạo bằng chính các service),
  cấu hình auth bằng `TRUSTED_ISSUERS` / `INBOUND_SOURCES` / `WEBHOOK_TARGETS`.
- Postman: 1 collection 138 mục (nguồn sinh OpenAPI qua `npm run docs:build`); CI chưa chạy newman.

## 2. Thiết kế

### 2.1 Bản demo Render: một container, hai process

- **Image:** `docker/app.Dockerfile` thêm stage cài `services/competition-service` (`npm ci --omit=dev`), chép vào `/app/competition-service`.
  `.dockerignore` gốc thêm `!services/competition-service` (vẫn loại `tests`, `docs`, `.env`, `.keys`, `node_modules`).
- **Khởi động:** entrypoint mới `docker/demo-entrypoint.sh`:
  1. `wait-for-db` + migrate backend (như cũ);
  2. nếu bật tích hợp: `wait-for-db` + migrate DB của service, rồi chạy service ở nền, nghe **127.0.0.1:5100** (không mở ra ngoài), tự khởi động lại
     sau 5 giây nếu chết (service chết thì cổng nối chỉ trả 503, app chính vẫn chạy);
  3. `exec node src/server.js` — backend vẫn là process chính (PID 1) và `/health` vẫn là health check của Render.
- **Cấu hình tự dựng cho demo:** script `docker/competition-boot.js` (chạy lúc khởi động) **sinh một cặp khoá ES256 mới mỗi lần container dậy**, rồi suy ra
  mọi biến cho cả hai process: backend nhận `COMPETITION_SIGNING_KEY`, `COMPETITION_KEY_ID`, `COMPETITION_SERVICE_URL=http://127.0.0.1:5100`; service nhận
  `TRUSTED_ISSUERS` (khoá công khai), `INBOUND_SOURCES`, `WEBHOOK_TARGETS` (về `http://127.0.0.1:5000/...`). Hai secret HMAC do Render tự sinh
  (`generateValue: true`). **Chủ dự án không phải dán khoá hay JSON nào lên Render.** (Khoá nằm trong RAM của container, không ghi đĩa, không có
  bản sao nào; container dậy lại thì khoá mới — token chỉ sống 60 giây nên không mất gì.)
- **DB của service:** một **database thứ hai trong cùng service Aiven** (`COMPETITION_DB_NAME`, cùng host / user / password / CA với DB chính;
  entrypoint đặt `DB_NAME` riêng cho process service). Cần chủ dự án tạo database này một lần (mục 5, bước 1).
- **Tắt được:** không đặt `COMPETITION_DB_NAME` → entrypoint bỏ qua hết phần service, image chạy y như hôm nay.
- **RAM:** service chạy với `--max-old-space-size=160` (như plan 18 đã tính); **đo thật** với `docker run --memory 512m` (mục 3).

### 2.2 Reset demo hằng đêm

- Thứ tự mới: reset DB chính (như cũ) → **reset DB của service** (xoá mọi bảng → migrate → `seed:demo`), vì hồ sơ thi đấu trỏ `bd:customer:<id>`.
  Dùng chung một hàm xoá bảng; thêm `services/competition-service/scripts/demo-reset.js` cùng khuôn rào chắn `DEMO_RESET_CONFIRM` (phải bằng đúng tên DB sắp xoá).
- Workflow thêm bước cài dependency service và bước reset thứ hai; **thiếu secret `COMPETITION_DB_NAME` thì bỏ qua bước này** (fork / chưa bật).
- Vì reset hai DB không cùng transaction, job reset DB chính **trước**, DB service **sau**; nếu bước hai lỗi thì job đỏ để thấy ngay (không để demo lệch im lặng).

### 2.3 docker compose (đường B)

- `docker/mysql-init/01-competition.sql`: tạo database `competition_service` và cấp quyền cho `bp_user`.
  **Lưu ý:** script init chỉ chạy khi volume MySQL còn trống; máy đã có volume phải tạo DB tay một lần (ghi vào DeploymentGuide kèm lệnh).
- Service mới `competition` (build `services/competition-service`), mạng nội bộ, không publish cổng, `depends_on` mysql healthy.
- Khoá: người vận hành chạy `npm run competition:keys` rồi chép hai khối vào `backend/.env` và `docker/.env` (script đã sinh sẵn). Compose truyền sang
  hai container; **đặt trống = compose vẫn chạy được, tính năng tắt** (service `competition` có `profiles: ["competition"]`, bật bằng `--profile competition`).
- `nginx.conf`: thêm `location ~ ^/api/v1/competition/.*/stream$` không đệm, `proxy_read_timeout 1h`, `access_log off` (token EventSource nằm trong query).

### 2.4 CI

- Job mới `docker-build`: build hai image (`docker/app.Dockerfile`, service) và `docker compose config -q` với biến giả — bắt lỗi Dockerfile / compose
  / `.dockerignore` (vd quên cho `services/` vào image) ngay trong PR thay vì lúc deploy.
- Không chạy newman trong CI (cần DB + hai server); newman chạy tay như các plan trước.

### 2.5 Postman + OpenAPI

- Thêm thư mục **"Competition (cổng nối)"** vào collection hiện có, khoảng 14 request đại diện, mỗi request có test: BXH công khai, `me`, danh sách giải,
  tạo giải, bấm điểm, đường bị chặn (`/events`, `/ops`, `…/ai` → 404), vai trò thiếu quyền → 403, service tắt → 503. Chạy `npm run docs:build` để Swagger
  của app chính có các route cổng. (Không đưa cả 97 route vào — chúng đã có OpenAPI + Swagger riêng ở service.)

### 2.6 Tài liệu

- `DeploymentGuide.md`: mục 3 (biến mới), **4.1 (tạo database thứ hai trên Aiven)**, 4.2 (secret mới), 4.3 (biến Render mới), 4.4 (kiểm tra: gọi cổng,
  hồ sơ thi đấu), 4.5 (giới hạn: RAM, khởi động chậm hơn), 5 (compose + profile), 7 (sao lưu DB thứ hai), 8 (rollback hai DB), 10 (checklist).
- `render.yaml`, `docker/.env.example`, `backend/.env.example` (nhắc đường compose), `CLAUDE.md`, `00-tien-do.md`.

## 3. Kiểm thử sẽ làm (thật)

- **Build:** `docker build` image app mới + image service; `docker compose config`.
- **Giả lập Render + Aiven ở máy này:** MySQL 8 container **bật TLS** (như Aiven, `DB_SSL=true` + CA thật của container), hai database; image app chạy
  `--memory 512m --cpus 0.5`; chạy `demo-reset` hai DB bằng chính script; kiểm: log khởi động đúng thứ tự, `/health` xanh, đăng nhập, gọi cổng bằng từng vai
  trò, hồ sơ thi đấu có dữ liệu demo, SSE qua cổng.
- **RAM:** `docker stats` trong khi (1) vừa khởi động, (2) sau seed, (3) 200 request đồng thời qua cổng + 20 luồng SSE; ghi đỉnh RSS từng process và
  `OOMKilled` — **mục tiêu < 450 MB**, vượt thì dừng lại hỏi (phương án: bỏ phần service khỏi container demo, hoặc web service Render thứ hai).
- **Chịu lỗi:** `kill` process service trong container → tự dậy sau 5 giây, app chính không rớt request; migrate service lỗi → container dừng (không chạy trên schema thiếu).
- **Compose thật:** `docker compose --profile competition up` — nginx → backend → service, SSE qua nginx không đệm, `docker compose up` (không profile) vẫn chạy như cũ.
- **Cold start:** đo thời gian từ `docker run` đến `/health` xanh, trước và sau khi thêm service (Render free chỉ 0,1 CPU nên số này quan trọng).
- **Postman:** newman chạy folder mới trên stack thật; toàn bộ test cũ vẫn xanh. `npm test` backend, `check-boundaries` service vẫn xanh.
- Dọn sạch container, volume, DB tạm sau khi xong.

## 4. Câu hỏi đã chốt (05/10/2026: chủ dự án chọn đúng đề xuất ở cả 6 câu)

1. **Aiven free có cho tạo database thứ hai trong cùng service không?** Mình **không có thông tin đăng nhập Aiven** nên không tự kiểm được. Cần bạn
   vào console → service MySQL → tab *Databases* → *Create database* `competition_service` (hoặc `CREATE DATABASE` bằng tài khoản `avnadmin`). Nếu Aiven không
   cho: demo sẽ **không** có tính năng thi đấu (image vẫn build được, tính năng tắt) — mình không đổi service sang tiền tố bảng vì phải sửa 20 bảng + migration.
   **Đề xuất: bạn thử trước khi mình làm, hoặc mình làm phần không phụ thuộc Aiven rồi bạn thử sau.**
2. **Khoá ES256 của bản demo:** sinh mới mỗi lần container khởi động (không phải dán gì lên Render) — hay bạn tự giữ khoá cố định (`npm run competition:keys` rồi dán lên
   Render)? **Đề xuất: sinh mỗi lần khởi động** (đơn giản, không có bí mật nào để lộ). Đường compose / VPS thật vẫn dùng khoá cố định.
3. **Service chết trong container demo:** tự khởi động lại sau 5 giây (đề xuất) — hay để container dừng (Render tự dựng lại cả container, nhưng demo gián đoạn)?
4. **Postman:** thêm khoảng 14 request đại diện cho cổng (đề xuất) hay cả 97 route?
5. **CI:** thêm job `docker-build` (đề xuất; thêm khoảng 3–4 phút mỗi lần chạy CI) hay không?
6. **Compose:** service `competition` đặt sau `profiles` (mặc định không chạy, bật bằng `--profile competition` — đề xuất) hay chạy luôn như mysql / backend?

## 5. Việc chủ dự án phải làm khi deploy thật (sau khi mọi phần xong và merge — mình sẽ nhắc lại lúc đó)

1. Aiven console: tạo database `competition_service` (hoặc tên bạn chọn).
2. GitHub → Settings → Secrets: thêm `COMPETITION_DB_NAME`.
3. Render → service → Environment: thêm `COMPETITION_DB_NAME` (hai secret HMAC do Blueprint tự sinh).
4. Actions → Demo reset → Run workflow (reset cả hai DB), rồi kiểm theo DeploymentGuide mục 4.4.

## 6. Không làm trong (b)

Giao diện (c); đổi nghiệp vụ của service; nhiều bản backend song song; giám sát / cảnh báo; backup tự động DB thứ hai (chỉ ghi vào hướng dẫn);
chuyển service sang web service Render riêng (chỉ làm nếu đo RAM vượt ngưỡng và bạn đồng ý).

## 7. Rủi ro

| Rủi ro | Giảm bằng |
|---|---|
| Hai process vượt 512 MB trên Render free | Đo thật (mục 3); heap service 160 MB; vượt ngưỡng → dừng, hỏi |
| Khởi động chậm hơn (0,1 CPU, thêm 10 migration + một process) | Đo cold start; migrate chỉ kiểm bảng đã có khi dậy lại; service chạy nền, backend nhận request ngay khi sẵn sàng |
| Aiven không cho DB thứ hai | Tính năng tắt, image / demo vẫn như cũ; quyết định tiếp theo thuộc chủ dự án |
| Reset hai DB lệch nhau nếu bước hai lỗi | Reset DB chính trước, DB service sau; bước hai lỗi → job đỏ |
| `.dockerignore` làm lọt `.env` / `.keys` của service vào image | Giữ `**/.env`, thêm `**/.keys`, test kiểm nội dung image (`docker run … ls`) |
| Đổi `render.yaml` làm đứt demo đang chạy | Chỉ có tác dụng sau khi merge vào `main` (merge sau cùng) |

## 8. Theo dõi tiến độ

- [x] Đọc hạ tầng hiện có, viết plan (05/10/2026)
- [x] Chủ dự án duyệt plan + trả lời 6 câu mục 4 (05/10/2026, theo đề xuất). **Còn lại cho chủ dự án: tạo database thứ hai trên Aiven (mục 5)**
- [x] 2.1 Image + entrypoint + `competition-boot.js` (đặt ở `backend/scripts/`) + `render.yaml` + `.dockerignore`
- [x] 2.2 Reset demo hai DB (script + workflow)
- [x] 2.3 Compose (mysql-init, service `competition`, nginx)
- [x] 2.4 CI `docker-build`
- [x] 2.5 Postman + `docs:build`
- [x] 2.6 Tài liệu (DeploymentGuide, CLAUDE.md, tiến độ)
- [x] Chạy thật toàn bộ mục 3, ghi kết quả vào mục 9 (có 3 điểm cần sửa, đã sửa)
- [ ] Báo cáo (b) → lập plan (c) → khi (a)(b)(c) xong mới xin merge vào `main`

## 9. Kết quả

Môi trường: Docker trên máy này. **Giả lập Aiven:** MySQL 8 container bật TLS, `require_secure_transport=ON`, chứng chỉ do CA
tự dựng có SAN, CA dán dạng **base64**, hai database (`bd_demo`, `cs_demo`). **Giả lập Render:** image `docker/app.Dockerfile`
chạy `--memory 512m --memory-swap 512m --cpus 0.5` (kịch bản chức năng, tải) và `--cpus 0.1` (đo khởi động nguội).

### 9.1 Chạy thật — reset hai DB bằng chính script (production, TLS bắt buộc)

| Việc | Kết quả |
|---|---|
| `backend/scripts/demo-reset.js` (NODE_ENV=production, base64 CA) | xoá 0 bảng (DB trống) → migrate 29,7 s → seed, tổng 34,9 s |
| `services/competition-service/scripts/demo-reset.js` | migrate 8,3 s → seed 39 người chơi, 3 giải, 2 buổi, tổng 32,2 s |
| Chạy lần hai (đã có bảng) | xoá 21 bảng đúng, chạy lại sạch, tổng 31,0 s |

> **Bổ sung 06/10/2026 (plan 26):** các số trên đo trên MySQL cùng máy (độ trễ ~0). Trên GitHub Actions → Aiven thật, seed thi đấu (~5.400 câu lệnh nối tiếp, ~0,15 s mỗi câu) mất **~15 phút**, cả job Demo reset ~19 phút; `timeout-minutes` nới 30 → 60.

### 9.2 Chạy thật — container demo (một container, hai process)

| Kiểm | Kết quả |
|---|---|
| Log khởi động | `wait-for-db` → migration → `competition-service chuẩn bị chạy nền` → `Khởi động server` → `Tích hợp competition-service đã bật` → `competition-service: migration xong, khởi động` |
| Cổng thi đấu trong container | BXH công khai 200 có dữ liệu demo; nhân viên thấy giải demo; khách xem giải vận hành 403; `/ops/outbox` 404 |
| Đổi tên khách (backend → service qua 127.0.0.1, cùng TLS) | hồ sơ thi đấu đổi theo |
| Huỷ giải → ActivityLog `competition.tournament_cancelled` (service → backend qua webhook nội bộ, secret do Render sinh) | có |
| `kill` process service | cổng trả 503 ngay, `/health` và đặt sân / danh sách sân vẫn 200; service tự dựng lại (PID mới), cổng chạy lại |
| Không đặt `COMPETITION_DB_NAME` | chỉ 1 process node; cổng trả 503 `COMPETITION_DISABLED`; log "tắt tích hợp thi đấu" |
| Image | 482 MB; trong image có đủ service, **không có** `.env`, `.keys`, `tests`, file `.pem` nào |

**RAM** (`--memory 512m`, 20 luồng SSE + 200 request đồng thời qua cổng = 200 × 200, 0 × 429, 0 lỗi 5xx):

| Thời điểm | docker stats | RSS backend | RSS service |
|---|---|---|---|
| Sau khởi động + vài request | 108–114 MiB | 117 MB | 101 MB |
| Ngay sau tải | **153 MiB (đỉnh)** | 139 MB | 116 MB |
| 8 giây sau | 128 MiB | 116 MB | 116 MB |

Đỉnh tổng RSS ~255 MB, đỉnh docker stats 153 MiB — thấp hơn nhiều mục tiêu < 450 MB; `OOMKilled=false`, 0 lần restart.

**Khởi động nguội ở 0,1 CPU** (giống Render free):

| Cấu hình | `/health` xanh | Cổng thi đấu 200 |
|---|---|---|
| Không bật thi đấu | 37 s | — |
| Bật, bản đầu (migrate DB thứ hai **trước** backend) | 73 s | 121 s |
| Bật, service chạy song song với backend | 62 s | 111 s |
| **Bật, service đợi backend lên rồi mới migrate (bản chốt)** | **38 s** | **91 s** |

### 9.3 Chạy thật — docker compose

- `docker compose --profile competition up -d --build`: mysql / backend / competition healthy; script init tạo `competition_service` (21 bảng) và
  `badminton_digital_management` riêng; `env_file` của compose đọc đúng các biến JSON của service.
- Qua nginx :8080: đăng nhập, danh sách / tạo giải, SSE (snapshot tới sau **69 ms**, không đệm), đổi tên khách → hồ sơ thi đấu đổi theo giữa hai
  container, huỷ giải → ActivityLog, `/ops/outbox` 404 — **7/7**; log service không có cảnh báo / lỗi.
- `docker compose up` **không** profile, `backend/.env` thường: chạy như cũ, `/api/v1/competition/*` trả 503 `COMPETITION_DISABLED`.
- `.env` của chủ dự án đã chép bản sao trước khi thử và đã khôi phục (so sánh `cmp`: giống hệt); `docker/.env` tạm đã xoá; mọi container / volume của compose đã gỡ.

### 9.4 Postman, OpenAPI, test

- Nhóm `24 · Competition (cổng nối)` — 14 request (3 ghi / SSE tách cờ): newman với `runCompetition=true runWrites=true` trên stack thật **16 request, 40 assertion, 0 lỗi**
  (tạo giải → huỷ giải dọn sạch); chạy mặc định (cờ tắt): cả collection **47 request, 141 assertion, 0 lỗi**.
- `npm run docs:build`: vẫn khớp 1-1 114 route (script bỏ qua nhóm 24 vì cổng không có route khai báo trong `src/routes/`; thêm đoạn "Thi đấu" vào mô tả spec).
- Jest backend **498 / 498** (41 suite); Jest service unit **183 / 183** (suite mới: giải mã `DB_SSL_CA` + rào chắn reset); `check-boundaries` đạt.

### 9.5 Điểm bắt được khi làm và đã sửa

1. **`DB_SSL_CA` dạng base64 làm service không nối được DB:** service chỉ nhận PEM hoặc đường dẫn file, trong khi cả demo (Render, GitHub Secrets)
   dán base64 như backend. Đã sửa `sequelize.js` + `wait-for-db.js` của service nhận cả PEM, PEM có `\\n`, base64 và đường dẫn (có test).
2. **Khởi động chậm khi migrate DB thứ hai trước backend** (73 s so với 37 s): đổi sang vòng lặp nền đợi backend lên rồi mới migrate / chạy service (bảng 9.2).
3. **Backend từ chối khởi động nếu cấu hình tích hợp dở dang** — Blueprint luôn sinh hai secret, nên khi `COMPETITION_DB_NAME` trống entrypoint phải gỡ hai secret
   đó (đã làm, đã kiểm: chạy không thi đấu thì 1 process, cổng 503 `COMPETITION_DISABLED`).

### 9.6 Khác kế hoạch

- `competition-boot.js` đặt ở `backend/scripts/` (không phải `docker/`) để Jest backend kiểm được và dùng chung `generateKeyset`.
- Postman: không đưa vào OpenAPI sinh tự động (cổng không có route khai báo; endpoint thi đấu đã có OpenAPI của service) — chỉ ghi chú trong mô tả spec.
- Compose: biến JSON của service nằm ở `services/competition-service/.env` (`env_file` `required: false`), không nhồi vào `docker/.env`.
- **Chưa kiểm được trên Aiven thật** (không có tài khoản): việc tạo database thứ hai trong gói free. Mọi thứ khác đã chạy trên giả lập TLS.

### 9.7 Dọn dẹp / để lại

Container thử `bd-app` (:5303) và `bd-mysql-tls` (:3399), network `bdnet` vẫn đang chạy để chủ dự án xem nếu muốn (theo quy ước chưa tắt server thử); gỡ khi chủ dự án nói.
