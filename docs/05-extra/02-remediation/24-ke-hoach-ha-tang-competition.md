# Kế hoạch: bước 4(b) — hạ tầng cho competition-service (compose, Render + Aiven, reset demo, CI, Postman, tài liệu)

- **Ngày:** 05/10/2026.
- **Trạng thái:** **CHỜ CHỦ DỰ ÁN DUYỆT — chưa viết dòng code / cấu hình nào.** Cần chốt 6 câu ở mục 4.
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

## 4. Cần chủ dự án quyết (mỗi câu có đề xuất)

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
- [ ] **Chủ dự án duyệt plan + trả lời 6 câu mục 4 (và thử tạo database thứ hai trên Aiven nếu muốn demo có thi đấu)**
- [ ] 2.1 Image + entrypoint + `competition-boot.js` + `render.yaml` + `.dockerignore`
- [ ] 2.2 Reset demo hai DB (script + workflow)
- [ ] 2.3 Compose (mysql-init, service `competition`, nginx)
- [ ] 2.4 CI `docker-build`
- [ ] 2.5 Postman + `docs:build`
- [ ] 2.6 Tài liệu (DeploymentGuide, CLAUDE.md, tiến độ)
- [ ] Chạy thật toàn bộ mục 3, ghi kết quả vào mục 9
- [ ] Báo cáo (b) → tiếp (c) → khi (a)(b)(c) xong mới xin merge vào `main`

## 9. Kết quả

_(điền sau khi làm)_
