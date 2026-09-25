# Kế hoạch: hạ tầng deploy + bản demo công khai (nhóm sửa 4/6)

- **Nhánh:** `fix/docker-deploy-readiness`, tách từ `main` @ `eeafeda` (đã có nhóm 1–3).
- **Ngày:** 14/09/2026 (bản đầu), chốt lại 25/09/2026.
- **Bối cảnh:** nhóm thứ tư trong thứ tự sửa của đợt kiểm tra trước deploy 12/09/2026 — `DEP-01` đến
  `DEP-06`, `DEP-08`, `DEP-09`, `AUTH-02`, cộng `DEP-07` (không HTTPS, cổng mở thẳng ra ngoài): phát
  hiện high này có trong báo cáo 12/09 nhưng không được gán vào nhóm nào, gộp vào đây vì cùng chỗ sửa.
  Chủ dự án chốt mục tiêu là **deploy một bản demo công khai cho portfolio, miễn phí, không gắn thẻ**,
  nên nhánh này làm thêm phần bảo vệ bản demo (mục 2.13–2.14). Nhóm 5 (lỗi thao tác tại quầy) đi nhánh
  riêng, plan `17-ke-hoach-loi-thao-tac-tai-quay.md`.

---

## 0. Lỗi và đường khai thác (đọc lại code `main` ngày 14/09, xác nhận lại 25/09)

| Mã | Lỗi | Hậu quả | Vị trí |
|---|---|---|---|
| DEP-01 | Không có `docker/nginx.conf`, image dùng `default.conf` của `nginx:alpine`: không proxy `/api`, `/static`, không `try_files` cho SPA | `docker compose up --build` xong: đăng nhập 404, trang chủ không tải sân, sơ đồ sân 404, SSE chết, F5 ở `/courts` ra 404, link đặt lại mật khẩu trong email ra 404 | `docker/frontend.Dockerfile:10-13` |
| DEP-02 | `sequelize-cli` ở `devDependencies`; `npm ci --production` loại nó; CMD chỉ `node src/server.js`, không migrate | DB mới → 0 bảng, log báo "connected" nhưng mọi API 500 `Table doesn't exist` | `docker/backend.Dockerfile:4,10`, `backend/package.json` |
| DEP-03 | `CourtLayoutService` ghi vào `backend/public/layouts`; `COPY . .` chạy bằng root rồi mới `USER node`; compose không mount volume | Lưu sơ đồ sân → `EACCES` → 500; sửa quyền tạm thời thì `up --build` lần sau vẫn mất | `services/CourtLayoutService.js:5,74-78`, `docker/backend.Dockerfile`, `docker/docker-compose.yml` |
| DEP-04 | Compose dùng thẳng `backend/.env` (`NODE_ENV=development`), không ghi đè | Production chạy cấu hình dev: log nguyên câu SQL kèm `refresh_token`/`password_hash`, lỗi 500 lộ message nội bộ, Swagger bật, pool DB tối đa 5 | `docker/docker-compose.yml:23-33`, `backend/.env.example:1` |
| DEP-05 | `${DB_PASSWORD}`/`${DB_ROOT_PASSWORD}` không có nguồn (`docker/.env` không tồn tại, không mẫu); mysql tạo user `bp_user`, còn `backend/.env.example` mặc định `DB_USER=root` mật khẩu rỗng | MySQL entrypoint từ chối khởi tạo (restart loop) hoặc `Access denied` do lệch user | `docker/docker-compose.yml:7-9,18,28`, `backend/.env.example:9-10` |
| DEP-06 | `backend/.dockerignore` không loại `backups/`; `COPY . .` đưa 2 file dump thật (~660 KB, có `password_hash`) cùng `tests/`, `docs/` vào image | Image bị đẩy lên registry → lộ dữ liệu khách và hash mật khẩu | `backend/.dockerignore`, `backend/backups/*.sql` |
| DEP-07 | Compose bind `0.0.0.0:80` (frontend) và `0.0.0.0:5000` (backend) thẳng ra ngoài, không TLS | Mật khẩu, JWT đi qua HTTP thường; gọi thẳng cổng 5000 bỏ qua nginx | `docker/docker-compose.yml:37-38,47-48` |
| DEP-08 | `node:18-alpine` ở cả 2 Dockerfile, CI `node-version: 18` — Node 18 hết hỗ trợ từ 30/04/2025 | Runtime không còn bản vá bảo mật; máy dev/test chạy Node 22, image lại khác | `docker/backend.Dockerfile:1`, `docker/frontend.Dockerfile:2`, `.github/workflows/ci.yml:19,32` |
| DEP-09 | `CORS_ORIGIN` không có trong `.env.example` lẫn tài liệu, mặc định âm thầm về `http://localhost:5173` | Production quên đặt → cấu hình CORS trỏ vào localhost mà không ai biết | `backend/src/server.js:14-19` |
| AUTH-02 | Không có `app.set('trust proxy', …)`; `req.ip` sau proxy luôn là IP của proxy | Giới hạn đăng nhập (10 lần/15 phút dùng chung `login`/`forgot`/`reset`) tính theo IP proxy — một người bị 429 là cả site bị 429 | `backend/src/server.js`, `backend/src/routes/authRoutes.js:31-48` |

---

## 1. Các quyết định đã chốt

**Q1 — Deploy ở đâu → Render (1 Web Service) + Aiven (MySQL).** Yêu cầu: miễn phí, không gắn thẻ vì
chỉ là demo. Đã tra lại thông tin thật (các gói free đổi liên tục):
- **Oracle Cloud Always Free** (VPS luôn chạy, không cold start) — **loại** vì đăng ký bắt buộc thẻ
  Visa/Master thật để xác minh, và VM "rảnh" (CPU/mạng/RAM < 20% trong 7 ngày) có thể bị thu hồi trừ
  khi nâng Pay As You Go (cũng cần thẻ).
- **Supabase** — loại vì chỉ có Postgres; đổi sang là migrate cả engine DB, việc lớn ngang một đợt riêng.
- **Aiven MySQL free:** MySQL thật, code/migration chạy thẳng, không cần thẻ, kết nối bắt buộc TLS.
  **Giới hạn đã biết:** Aiven tắt dịch vụ free khi "không có hoạt động liên tục" (không công bố bao
  lâu), có email báo trước, và **phải tự vào dashboard bấm bật lại** — không tự dậy khi có request.
  Job reset hằng đêm (mục 2.14) chạm DB mỗi ngày nên giảm hẳn khả năng bị coi là không hoạt động,
  nhưng không có gì bảo đảm.
- **Render Web Service free:** không cần thẻ theo Render (vài người báo bị hỏi thẻ khi đăng ký — nếu
  gặp thì dừng lại báo). Ngủ sau 15 phút không có request, thức dậy mất ~1 phút; 750 giờ/tháng.
- **Đổi so với bản plan 14/09: bỏ Render Static Site, backend phục vụ luôn bản build frontend** (mục
  2.11). Frontend và API chung một origin nên không cần rewrite rule, không cần CORS, SSE đi thẳng tới
  Express — hết rủi ro "rewrite của Static Site có giữ được SSE không" mà bản cũ chưa kiểm chứng được.
  Chỉ còn 1 service phải cấu hình. Đổi lại frontend cũng ngủ theo backend — nhưng khi backend ngủ thì
  frontend có tải trước cũng không gọi được API gì, nên người xem không mất gì thêm.
- Cụm `docker compose` (MySQL + backend + nginx) vẫn được sửa cho chạy đúng: đó là cách chạy cả hệ
  thống trên một máy (dev, hoặc tự host sau này), và dùng để test thật toàn bộ nhánh này.

**Q2 — Chế độ → demo công khai cho portfolio.** Seed dữ liệu mẫu, hiện khối tài khoản thử nghiệm
trên trang đăng nhập (không bao giờ có admin — có từ nhóm 1).

**Q3 — Phạm vi → nhóm 4 + nhóm 5.** Nhóm 6 (backup/log) để sau: dữ liệu demo seed lại được bất cứ lúc nào.

**Q4 — Bảo vệ bản demo → khoá tài khoản demo + tự reset hằng đêm.** Kèm bắt buộc: admin của bản demo
dùng mật khẩu bí mật (repo công khai trên GitHub — `admin@badminton.com / Admin@123` ai cũng đọc được).

**Q5 — Sơ đồ sân → sửa nhanh (volume).** Trên Render free không có ổ đĩa bền: sơ đồ sửa qua giao diện
mất khi service ngủ dậy hoặc deploy lại, quay về 3 file mặc định trong image. Với bản demo đây gần như
là "tự reset" — chấp nhận, ghi rõ trong tài liệu.

**Q6 — Node → 22.** **Q7 — Tên miền → subdomain miễn phí** (`<tên-service>.onrender.com`, Render tự cấp HTTPS).

---

## 2. Thiết kế

### 2.1 nginx proxy + SPA fallback cho cụm compose — DEP-01

`docker/nginx.conf`, copy đè `default.conf` trong `frontend.Dockerfile`:
- `/api/`, `/static/`, `/api-docs` → `proxy_pass http://backend:5000`, kèm `Host`, `X-Real-IP`,
  `X-Forwarded-For`, `X-Forwarded-Proto` (cần cho `trust proxy`, mục 2.10).
- `/api/v1/realtime/` khai riêng: `proxy_buffering off`, `proxy_read_timeout 1h`, không cache — SSE.
- `/` → `try_files $uri /index.html` (F5 ở route con không 404).
- `/assets/` cache dài hạn `immutable` (Vite đặt tên file theo hash), `index.html` `no-cache`.
- Frontend không cần build-arg `VITE_API_BASE_URL`: `apiClient.js:5` tự dùng `/api/v1` tương đối.

### 2.2 Migration tự chạy trước khi server nhận request — DEP-02

- `sequelize-cli` chuyển sang `dependencies` (cần ở runtime), giữ `npm ci --omit=dev`.
- `backend/docker-entrypoint.sh`: `sequelize-cli db:migrate` rồi `exec node src/server.js`; `set -e`
  nên migrate lỗi thì container dừng, không có server chạy với schema thiếu. Idempotent (bảng
  `SequelizeMeta`). Dùng chung cho image compose lẫn image Render.
- Không seed trong container: seed chỉ chạy qua script reset (mục 2.14).

### 2.3 Sơ đồ sân ghi được — DEP-03

- Dockerfile: `COPY --chown=node:node`, tạo sẵn `public/layouts` thuộc `node` trước `USER node`.
- Compose: named volume `layouts_data:/app/public/layouts` — lần đầu Docker chép 3 file mặc định từ
  image vào volume, các lần sau sống qua `--build`.
- Render: không có volume (xem Q5). Quyền ghi vẫn cần — thiếu `chown` là lưu sơ đồ trả 500.

### 2.4 Luôn chạy production trong container — DEP-04

`ENV NODE_ENV=production` trong image, và `NODE_ENV: production` trong `environment:` của compose (đè
`env_file`). Người deploy không phải nhớ sửa `.env`.

### 2.5 `docker/.env.example` + khớp user DB — DEP-05

- `docker/.env.example`: `DB_PASSWORD`, `DB_ROOT_PASSWORD`, `DEMO_ADMIN_PASSWORD` (xem 2.13).
- Compose ghi đè cho backend: `DB_HOST: mysql`, `DB_USER: bp_user`, `DB_PASSWORD: ${DB_PASSWORD}` — luôn
  khớp user mà service mysql tạo, không phụ thuộc `backend/.env`.

### 2.6 Không đưa dữ liệu nhạy cảm vào image — DEP-06

- `backend/.dockerignore` thêm `backups`, `*.sql`, `tests`, `docs` (`backend/docs/`, khác
  `backend/src/docs/openapi.yaml`), `coverage`.
- **Khác báo cáo 12/09:** không loại `scripts/` — `scripts/create-admin.js` và script reset demo cần ở runtime.
- `.dockerignore` mới ở gốc repo cho image Render (context = cả repo): chỉ cho vào `backend/` và
  `frontend/`, loại `node_modules`, `.env*`, `backups`, `*.sql`, `portfolio/`, `docs/`, `postman/`, `k6/`, `.git`.

### 2.7 Không mở cổng thẳng ra ngoài trong compose — DEP-07

- frontend bind `127.0.0.1:8080:80`; backend bỏ `ports:` (nginx gọi qua mạng nội bộ compose). Muốn mở
  ra internet thì đặt reverse proxy có TLS phía trước (ghi trong `DeploymentGuide.md`).
- Trên Render: Render tự cấp HTTPS, container không mở cổng nào khác ngoài `PORT` của Render.

### 2.8 Node 22 — DEP-08

`FROM node:22-alpine` ở mọi Dockerfile, CI `node-version: 22`, `"engines": { "node": ">=22" }` ở cả hai
`package.json`. Build thật để xác nhận `bcrypt` cài được trên alpine; thiếu toolchain thì thêm
`apk add python3 make g++` ở stage build.

### 2.9 CORS mặc định đóng ở production — DEP-09

**Khác bản plan 14/09** (bản cũ: thiếu `CORS_ORIGIN` thì từ chối khởi động). Vì bản deploy thật là
same-origin, không có request cross-origin nào cần cho phép — bắt đặt `CORS_ORIGIN` chỉ thêm một bước
cấu hình vô nghĩa. Thay vào đó:
- production + không có `CORS_ORIGIN` → **không cho origin nào khác** (không gửi header CORS);
- có `CORS_ORIGIN` → chỉ cho đúng các origin đó (nhận danh sách phân tách bằng dấu phẩy);
- dev/test giữ mặc định `http://localhost:5173` như cũ.
Vẫn là fail-closed: quên cấu hình thì chặn, không mở. Hàm thuần `resolveCorsOrigin(env)` có test.

### 2.10 `trust proxy` — AUTH-02

`app.set('trust proxy', TRUST_PROXY_HOPS)`. Không dùng `true` — tin mọi hop thì client tự đặt
`X-Forwarded-For` để né rate limit. `req.ip` chỉ được dùng qua `express-rate-limit`, không nơi nào khác
trong `backend/src`. `GET /api/v1/health` trả thêm `ip` (IP của chính người gọi) để kiểm trên môi trường thật.
**Mặc định 0; compose và `render.yaml` khai rõ 1** — xem mục 7.1 vì sao đổi so với bản đầu của plan
(mặc định "production = 1").

### 2.11 Backend phục vụ bản build frontend (image cho Render)

- `server.js`: khi có `FRONTEND_DIST_DIR`, sau các route API và trước 404 JSON:
  - `express.static(dir)`; `/assets/*` cache 1 năm `immutable`, còn lại `no-cache`;
  - `GET` không bắt đầu bằng `/api/`, `/static/`, `/api-docs`, `/health` → trả `index.html` (SPA fallback);
  - request `/api/...` không khớp route vẫn nhận 404 JSON như cũ.
- `docker/app.Dockerfile` (context = gốc repo), 2 stage: build frontend (nhận build-arg
  `VITE_SHOW_DEMO_ACCOUNTS` — Render tự truyền biến môi trường thành build-arg), rồi image backend chép
  `dist/` vào `public/app`, `FRONTEND_DIST_DIR=/app/public/app`, dùng chung entrypoint mục 2.2.
- Không có `FRONTEND_DIST_DIR` (dev, compose) thì server hoạt động y như cũ.

### 2.12 Kết nối DB qua TLS (Aiven bắt buộc)

`config/config.js`, khối production (dùng chung cho server, `sequelize-cli`, các script):
- `DB_SSL=true` → `dialectOptions.ssl`;
- `DB_SSL_CA` = nội dung chứng chỉ CA (PEM, hoặc base64 của PEM — tiện dán vào ô env một dòng);
- mặc định kiểm chứng chứng chỉ (`rejectUnauthorized: true`); chỉ tắt khi đặt rõ
  `DB_SSL_REJECT_UNAUTHORIZED=false`. Hàm thuần `buildSslOptions(env)` có test.

### 2.13 Bảo vệ bản demo

- **Admin dùng mật khẩu bí mật:** seeder `20260723000001` khi `NODE_ENV=production` lấy mật khẩu admin từ
  `DEMO_ADMIN_PASSWORD` (≥ 12 ký tự, không trùng mật khẩu demo đã công khai — cùng luật với
  `create-admin`); thiếu hoặc yếu thì seeder dừng. Máy dev giữ `Admin@123`.
- **`DEMO_MODE=true` khoá 6 tài khoản demo hiện trên trang đăng nhập** (`employee@`, `employee.q3@`,
  `employee.q7@`, `manager.q3@`, `manager.q7@`, `customer@` — không gồm admin), trả 403 "Tài khoản demo
  dùng chung…" khi:
  - tự đổi mật khẩu, hoặc đặt lại mật khẩu qua link;
  - sửa số điện thoại / xoá tài khoản nhân viên demo (`PUT`/`DELETE /employees/:id`);
  - sửa số điện thoại / email của hồ sơ khách gắn với tài khoản demo (`PUT /customers/:id` — số điện
    thoại là danh tính đăng nhập của khách).
  Việc khác (đặt sân, bán hàng, sửa giá…) vẫn làm được bình thường — đó chính là thứ người xem cần thử;
  dữ liệu đó được reset hằng đêm.
- Trang đăng nhập (khi hiện khối tài khoản thử nghiệm): thêm một dòng "Dữ liệu demo tự khôi phục mỗi
  đêm; tài khoản demo không đổi được mật khẩu."
- Hàm thuần `utils/demoMode.js` (`isLockedDemoAccount`, `assertNotLockedDemoAccount`) có test; danh
  sách email có test đối chiếu với seeder để không lệch.

### 2.14 Reset dữ liệu demo hằng đêm

- `backend/scripts/demo-reset.js`: **xoá toàn bộ bảng** của DB đang cấu hình, chạy `db:migrate` rồi
  `db:seed:all` — tức đúng trạng thái một bản cài mới. Không dùng `db:migrate:undo:all` (hỏng giữa chừng,
  `DATA-02`). Chặn nhầm DB: chỉ chạy khi `ALLOW_DEMO_SEED=true` **và** `DEMO_RESET_CONFIRM` bằng đúng
  `DB_NAME`. Dùng được cả bằng tay (chủ dự án reset khi cần).
- `.github/workflows/demo-reset.yml`: chạy 03:00 giờ Việt Nam (20:00 UTC) + nút chạy tay; runner GitHub
  kết nối thẳng Aiven, không đi qua app — **app không có thêm endpoint nào để reset**. Thiếu secrets thì
  bỏ qua (fork/CI không lỗi). Lần đầu deploy cũng dùng nút chạy tay này để seed.
- Trong lúc reset (vài phút lúc 3h sáng) API trên Render trả lỗi — chấp nhận.

### 2.15 `render.yaml` (Blueprint)

1 web service `runtime: docker`, `plan: free`, `dockerfilePath: ./docker/app.Dockerfile`,
`dockerContext: .`, `healthCheckPath: /health`. Biến môi trường: `NODE_ENV`, `DEMO_MODE=true`,
`VITE_SHOW_DEMO_ACCOUNTS=true`, `DB_SSL=true`, hai JWT secret `generateValue: true` (Render tự sinh
chuỗi ngẫu nhiên đủ dài), `DB_*`/`DB_SSL_CA` để `sync: false` (Render hỏi khi tạo). Không có
`DEMO_ADMIN_PASSWORD` hay `ALLOW_DEMO_SEED` trên Render — seed không bao giờ chạy trong web service.
`FRONTEND_URL` mặc định lấy `RENDER_EXTERNAL_URL` (Render tự đặt) cho link email.

---

## 3. File dự kiến thay đổi

| File | Thay đổi |
|---|---|
| `docker/nginx.conf` | **Mới** — mục 2.1 |
| `docker/frontend.Dockerfile` | Node 22, dùng `nginx.conf` |
| `docker/backend.Dockerfile` | Node 22, `NODE_ENV`, `--chown`, `public/layouts`, entrypoint |
| `docker/app.Dockerfile` | **Mới** — image 1 container cho Render (mục 2.11) |
| `docker/docker-compose.yml` | `NODE_ENV`, `DB_USER`/`DB_PASSWORD`, volume sơ đồ, cổng `127.0.0.1:8080`, bỏ cổng backend, healthcheck backend (liveness `/health` — readiness chạm DB là `DEP-10`, nhóm 6) |
| `docker/.env.example` | **Mới** |
| `.dockerignore` | **Mới** (gốc repo) |
| `backend/.dockerignore` | Thêm `backups`, `*.sql`, `tests`, `docs`, `coverage` |
| `backend/docker-entrypoint.sh` | **Mới** |
| `backend/scripts/wait-for-db.js` | **Mới** — chờ DB nhận kết nối trước khi migrate (mục 7.1) |
| `.gitattributes` | `*.sh` luôn LF (CRLF làm hỏng `#!/bin/sh` trong container) |
| `frontend/.dockerignore` | **Xoá** — build frontend giờ dùng context gốc repo và `.dockerignore` ở gốc |
| `backend/package.json`, `frontend/package.json` | `sequelize-cli` sang `dependencies`; `engines` |
| `backend/src/server.js` | `trust proxy`, CORS mới, phục vụ frontend build |
| `backend/src/utils/serverConfig.js` | **Mới** — `resolveCorsOrigin`, `resolveTrustProxy` (hàm thuần) |
| `backend/src/config/config.js` | TLS cho production (`buildSslOptions`) |
| `backend/src/utils/demoMode.js` | **Mới** — khoá tài khoản demo |
| `backend/src/utils/demoSeedGuard.js` | `resolveDemoAdminPassword` |
| `backend/src/seeders/20260723000001-seed-initial-data.js` | Mật khẩu admin từ env ở production |
| `backend/src/services/AuthService.js`, `EmployeeService.js`, `CustomerService.js` | Gọi `assertNotLockedDemoAccount` |
| `backend/scripts/demo-reset.js` | **Mới** |
| `backend/tests/` | **Mới:** `serverConfig.test.js`, `dbSsl.test.js`, `demoMode.test.js`, `demoSeedGuard` (thêm ca) |
| `backend/.env.example` | `CORS_ORIGIN`, `TRUST_PROXY_HOPS`, `DB_SSL*`, `DEMO_MODE`, `DEMO_ADMIN_PASSWORD` |
| `frontend/src/pages/Login/LoginPage.jsx` | Dòng nhắc reset hằng đêm |
| `.github/workflows/ci.yml` | Node 22; thêm bước Vitest |
| `.github/workflows/demo-reset.yml` | **Mới** |
| `render.yaml` | **Mới** |
| `docs/DeploymentGuide.md` | Viết lại mục deploy: Render + Aiven từng bước; compose; bỏ `docker-compose.prod.yml` (không tồn tại) |
| `CLAUDE.md`, `docs/05-extra/02-remediation/00-tien-do.md` | Cập nhật khi xong |

Không có migration mới.

---

## 4. Kiểm thử thật

Docker Desktop có trên máy (CLI 29.1.3, Compose v5.0.1) — audit 12/09 không có, nên lần này test
container thật. Tạo tài khoản Render/Aiven/GitHub secrets là việc của chủ dự án (mục 6); phần đó được
mô phỏng tại chỗ như sau.

### 4.1 Tái hiện lỗi trên code `main`

| # | Việc | Kỳ vọng trên code cũ |
|---|---|---|
| R1 | `docker compose up --build` bằng compose cũ | Đăng nhập 404/405; `/static/layouts/*.json` 404 |
| R2 | Gọi API sau R1 | 500 `Table doesn't exist` |
| R3 | `NODE_ENV` trong container backend | `development` |
| R4 | Tìm `backups/*.sql` trong image backend | Có |

### 4.2 Cụm compose sau khi sửa (MySQL 8 — cùng họ phiên bản với Aiven)

| # | Kịch bản | Kỳ vọng |
|---|---|---|
| 1 | Build 3 image trên Node 22 | Thành công, `bcrypt` cài được |
| 2 | `docker compose up` với `docker/.env` mới | 3 container healthy; log backend: migrate trước "API running" |
| 3 | Chạy `demo-reset.js` vào MySQL của compose | Xoá bảng → 40 migration → 7 seeder; ghi lại thời gian chạy |
| 4 | Mở `http://127.0.0.1:8080`, đăng nhập bằng tài khoản demo; admin bằng `DEMO_ADMIN_PASSWORD` | Được; `Admin@123` bị từ chối |
| 5 | F5 ở `/courts`; mở trang Sân và mở/đóng sân ở tab khác | Không 404; realtime cập nhật |
| 6 | Lưu sơ đồ sân; `down` + `up` lại (giữ volume) | 200; sơ đồ còn |
| 7 | `NODE_ENV` trong container, `backups`/`*.sql`/`tests` trong image, cổng publish của backend | `production`; không có; không có |
| 8 | 11 lần đăng nhập sai qua nginx với `X-Forwarded-For` khác nhau | Lần 11 bị 429 theo IP thật của client, không theo IP nginx; client tự đặt `X-Forwarded-For` không né được |
| 9 | `create-admin` qua `docker compose exec` trên DB chưa seed | Tạo được |

### 4.3 Image Render (1 container) nối vào MySQL bật TLS bắt buộc

MySQL 8 tự sinh chứng chỉ; bật `require_secure_transport=ON` và `sql_require_primary_key=ON` (Aiven
bật sẵn cái sau) để mô phỏng Aiven.

| # | Kịch bản | Kỳ vọng |
|---|---|---|
| 10 | `DB_SSL=true` + `DB_SSL_CA` (PEM và base64) | Migrate + server chạy; bỏ `DB_SSL` → bị MySQL từ chối |
| 11 | CA sai | Từ chối kết nối (không âm thầm bỏ kiểm chứng) |
| 12 | Mở trang chủ, F5 route con, `/assets/*`, `/api/v1/khong-co` | Trang chạy; `index.html` cho route con; header cache đúng; 404 JSON |
| 13 | Đăng nhập, trang Sân + realtime (không có nginx ở giữa) | Chạy, cùng origin, không cần header CORS |
| 14 | Request có `Origin` lạ | Không nhận header `Access-Control-Allow-Origin` |
| 15 | Build với `VITE_SHOW_DEMO_ACCOUNTS=true` / `false` | Khối tài khoản thử nghiệm hiện / không có trong bundle |

### 4.4 Khoá tài khoản demo (`DEMO_MODE=true`)

| # | Kịch bản | Kỳ vọng |
|---|---|---|
| 16 | 6 tài khoản demo đổi mật khẩu | 403, mật khẩu không đổi |
| 17 | `manager.q3` sửa SĐT / xoá `employee.q3`; nhân viên sửa SĐT hồ sơ khách demo | 403, dữ liệu không đổi |
| 18 | Cùng thao tác với tài khoản không phải demo (tạo mới trong test); admin đổi mật khẩu | Làm được như cũ |
| 19 | `DEMO_MODE` tắt | Không khoá gì (máy dev như cũ) |

### 4.5 Tự động

| # | Việc | Kỳ vọng |
|---|---|---|
| 20 | Jest, Vitest, build frontend, `docs:build` | Pass; không giảm số test so với `main` (275 + 49) |
| 21 | Kiểm cú pháp `render.yaml`, 2 workflow | Hợp lệ |
| 22 | Smoke chỉ đọc trên server dev + DB dev (không Docker) | Như cũ — dev không bị ảnh hưởng |

**Dọn dẹp:** `docker compose down -v`, xoá image test; `docker/.env` test không commit; không đụng
`backend/.env` và DB dev. MySQL dev đang chiếm cổng 3306 — compose không publish cổng MySQL ra ngoài khi test.

---

## 5. Ngoài phạm vi

- `DEP-10` (readiness chạm DB) và phần còn lại của nhóm 6 — sau.
- Nhóm 5 — nhánh và plan riêng (`17-...`).
- Giữ Render không ngủ (ping định kỳ): tuỳ chủ dự án, ghi trong hướng dẫn như một lựa chọn, không làm
  trong code.
- Các `SEC-*`/`PAY-*` chưa thuộc nhóm nào — như `00-tien-do.md`.

---

## 6. Các bước chủ dự án tự làm khi deploy (sau khi merge + push)

Viết đầy đủ trong `docs/DeploymentGuide.md`. Tóm tắt:
1. **Aiven:** tạo service MySQL gói free → lấy host, port, user, password, tên DB và tải CA certificate.
2. **GitHub → Settings → Secrets → Actions:** `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`,
   `DB_SSL_CA`, `DEMO_ADMIN_PASSWORD` → tab Actions → "Demo reset" → **Run workflow** (seed lần đầu).
3. **Render:** New → Blueprint → chọn repo → điền các biến Render hỏi (`DB_*`, `DB_SSL_CA`) → Deploy.
4. Mở `https://<tên>.onrender.com`, thử các tài khoản demo; đăng nhập admin bằng `DEMO_ADMIN_PASSWORD`.

---

## 7. Kết quả (25/09/2026)

Chủ dự án chốt Q1–Q7 ở mục 1 rồi nói "hoàn thiện dự án để deploy lên làm demo". Code trên nhánh
`fix/docker-deploy-readiness`, chưa commit/merge (theo quy trình: plan + code vào một commit khi được
duyệt). Docker Desktop 4.92 (engine 29.8 — tự cập nhật giữa đợt test), MySQL 8.4.11 trong container.

### 7.1 Khác với kế hoạch

- **`TRUST_PROXY_HOPS` mặc định 0, không phải "production = 1".** Test image Render gọi thẳng vào cổng
  container (không proxy nào phía trước) cho thấy: với mặc định 1, client tự đặt
  `X-Forwarded-For: 6.6.6.6` là `req.ip` thành `6.6.6.6` — né được giới hạn đăng nhập. Đổi thành mặc
  định 0 ở mọi môi trường, compose và `render.yaml` khai rõ `"1"`. Cấu hình sai thì hậu quả chỉ là
  chung bucket (kém tiện), không thành lỗ hổng. Có test đối chiếu hai file cấu hình.
- **Healthcheck MySQL của compose dùng `-h localhost` (lỗi có sẵn từ trước).** Lần `up` đầu: ping qua
  socket báo khoẻ trong lúc image mysql còn chạy server tạm (chỉ socket) → backend nối TCP bị
  `ECONNREFUSED`, restart 5 lần, frontend không lên ("dependency failed to start"). Sửa: ping qua
  `127.0.0.1` (TCP), thêm `scripts/wait-for-db.js` (chỉ thử lại KẾT NỐI, tối đa 30 lần × 2 s; lỗi của
  migration thì không retry). Chạy lại từ đầu: 0 restart.
- **CORS:** không từ chối khởi động khi thiếu `CORS_ORIGIN` như bản 14/09 — production mặc định đóng (mục 2.9).
- **Frontend Render Static Site → backend phục vụ bản build** (mục 1), vì vậy không có rewrite rule nào
  phải kiểm chứng.

### 7.2 Tái hiện trên code `main` — 4/4

`git archive main`, build image cũ (thêm một file `.sql` giả vào `backups/` để mô phỏng build từ máy dev —
thư mục thật bị `.gitignore` nên không có trong archive).

| # | Kết quả trên code cũ |
|---|---|
| R1 | Qua nginx cũ: `POST /api/v1/auth/login` → 404, `GET /courts` (F5) → 404, `GET /static/layouts/branch-1.json` → 404 |
| R2 | DB trống: `GET /api/v1/public/branches` → 500 `ER_NO_SUCH_TABLE: Table 'bd.branches' doesn't exist`; log vẫn báo "connection established" |
| R3 | Image không đặt `NODE_ENV`; compose cũ chỉ đọc `backend/.env` → container chạy `development` |
| R4 | Trong image: `backups/fake_dump.sql`, `docs/`, `tests/`; Node 18.20.8; không có `sequelize-cli` |

### 7.3 Cụm compose sau khi sửa — đạt

| # | Kết quả |
|---|---|
| 1 | Build 3 image 70 s; `bcrypt` cài được trên `node:22-alpine` (không cần thêm toolchain) |
| 2 | `up` từ volume trống: `[wait-for-db] DB sẵn sàng (lần thử 1)` → 40 migration → server; 0 restart |
| 3 | `demo-reset.js` trong container: xoá 32 bảng (3,1 s) → migrate (37,8 s) → 7 seeder, tổng 40 s. DB: 40 dòng `SequelizeMeta`, 7 user, 14 hoá đơn, 3 chi nhánh |
| 4–5, 16–18 | Script API qua nginx **31/31**: admin vào bằng `DEMO_ADMIN_PASSWORD`, `Admin@123` → 401; 4 tài khoản demo đăng nhập được; F5 `/courts` và link `/reset-password` trả `index.html`; `/assets/*` `immutable`; API sai đường → 404 JSON; bundle có khối tài khoản thử nghiệm + dòng nhắc reset, không có `Admin@123`; khoá demo: quản lý/khách tự đổi mật khẩu → 403 (mật khẩu không đổi), quản lý xoá / sửa SĐT nhân viên demo → 403, sửa vị trí → 200, nhân viên sửa SĐT khách demo → 403, sửa tên → 200; tài khoản không phải demo tạo/xoá được, admin tự đổi mật khẩu được; lưu sơ đồ sân 200 (không `EACCES`) và đọc lại được; SSE qua nginx 200 `text/event-stream` nhận `:ok`; origin lạ không nhận `Access-Control-Allow-Origin`; không còn `X-Powered-By` |
| 6 | Sơ đồ sân còn nguyên sau `down` + `up` (giữ volume) |
| 7 | Container: `NODE_ENV=production`, user `node`, Node 22.23.3; không có `backups`/`tests`/`docs`/file `.sql` nào; có đủ `scripts/`; backend không publish cổng; frontend `127.0.0.1:18081`, mysql `127.0.0.1:13307` |
| 8 | Rate limit A/B: 10 lần đăng nhập sai từ máy host, mỗi lần tự đặt `X-Forwarded-For` khác → lần 11 bị 429 (không né được); một nguồn khác (container backend gọi nginx) vẫn nhận 401. Cùng kịch bản với `TRUST_PROXY_HOPS=0` (= code cũ): nguồn khác cũng nhận **429** — cả site chung bucket |

### 7.4 Image Render (1 container) nối MySQL bắt TLS — đạt

MySQL 8.4.11 với `require_secure_transport=ON`, `sql_require_primary_key=ON` (Aiven bật sẵn), chứng chỉ
server ký bởi CA tự tạo, SAN đúng hostname.

| # | Kết quả |
|---|---|
| 10 | Không bật `DB_SSL` → `Connections using insecure transport are prohibited`; CA đúng (base64) → migrate + server chạy ở `PORT=10000` như Render, 28 s |
| 11 | CA sai, hoặc bật TLS mà thiếu CA → `self-signed certificate in certificate chain` — từ chối, không âm thầm bỏ kiểm chứng |
| 3′ | `demo-reset.js` qua TLS: 26 s; 40 migration + 7 seeder chạy được với `sql_require_primary_key=ON` |
| 12–14 | Cùng script API trên image này: 30/31 → ca trượt là `X-Forwarded-For` giả được khi không có proxy (mục 7.1); sau khi đổi mặc định: `ip` là IP thật |
| 9 | Xoá bảng → chỉ migrate → `npm run create-admin` trong image → đăng nhập admin mới 200 |
| 15 | Build không bật cờ: 0 file trong `public/app/assets` chứa `Manager@123`/`manager.q3@`; bật cờ: có |

### 7.5 Tự động và máy dev

| # | Kết quả |
|---|---|
| 20 | Jest 322/322 (275 + 47 mới: `serverConfig`, `frontendStatic`, `dbSsl`, `demoMode` gồm test gọi service thật với model giả, `demoSeedGuard` thêm admin/reset); Vitest 49/49; build frontend; `docs:build` khớp 1-1 113 route, `openapi.yaml` không đổi |
| 21 | `render.yaml`, `demo-reset.yml`, `ci.yml` parse được; `docker compose config` với `.env.example` chưa điền → dừng với "Đặt DB_PASSWORD trong docker/.env" |
| 22 | Server dev (cổng 5099) + DB dev, chỉ đọc: health, `/public/branches` 200; CORS vẫn cho `http://localhost:5173`; `GET /` → 404 JSON (dev không phục vụ frontend); đăng nhập `Admin@123` 200; 0 lỗi 500 |

**Không test được tại chỗ:** tài khoản Render/Aiven/GitHub secrets thật (chủ dự án tạo), số hop proxy
thật của Render (kiểm bằng `GET /api/v1/health` sau deploy — `DeploymentGuide.md` §4.4), thời gian
migrate qua mạng tới Aiven.

**Dọn dẹp:** `docker compose down -v`, xoá mọi container/network/image test (giữ 3 base image
`node:22-alpine`, `nginx:alpine`, `mysql:8`); không sửa `backend/.env`; DB dev chỉ bị cập nhật hash
refresh token do lần đăng nhập smoke.
