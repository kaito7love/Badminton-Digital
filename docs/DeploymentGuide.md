# Deployment Guide
## Dự án: Badminton Digital Management – Hệ thống quản lý sân cầu lông

**Phiên bản:** 2.0
**Ngày:** 25/09/2026 (viết lại theo nhóm sửa 4/6 — `docs/05-extra/02-remediation/16-ke-hoach-ha-tang-deploy.md`)
**Tài liệu tham chiếu:** `Architecture.md`, `TestPlan.md`

---

## 1. Mục tiêu tài liệu
Hướng dẫn triển khai Badminton Digital Management theo hai đường:

| Đường | Dùng cho | Thành phần |
|---|---|---|
| **A. Render + Aiven** (khuyên dùng) | Bản demo công khai cho portfolio, miễn phí, không cần thẻ | 1 web service Render (`docker/app.Dockerfile`: backend phục vụ luôn frontend) + MySQL free của Aiven + GitHub Actions reset dữ liệu mỗi đêm |
| **B. docker compose** | Chạy cả hệ thống trên một máy (dev, test, hoặc tự host trên VPS) | MySQL + backend + nginx (`docker/docker-compose.yml`) |

---

## 2. Yêu cầu hệ thống
- Node.js ≥ 22 (`engines` trong cả hai `package.json`; Node 18 đã hết hỗ trợ)
- MySQL ≥ 8.0
- Docker + Docker Compose v2 (đường B, hoặc để test image trước khi đẩy lên Render)
- Tài khoản GitHub (repo + Actions), Render và Aiven cho đường A

---

## 3. Biến môi trường

### 3.1 Backend
Nguồn tham chiếu chính thức là `backend/.env.example` — đọc comment trong file đó. Các biến quan trọng khi deploy:

| Biến | Ý nghĩa |
|---|---|
| `NODE_ENV` | Image Docker luôn đặt `production`, không phụ thuộc `.env` |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Kết nối MySQL |
| `DB_SSL`, `DB_SSL_CA` | TLS tới MySQL — bắt buộc với Aiven. CA là PEM hoặc base64 của PEM; luôn kiểm chứng chứng chỉ |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Hai chuỗi ngẫu nhiên khác nhau, ≥ 32 ký tự; server từ chối khởi động nếu sai |
| `TRUST_PROXY_HOPS` | Số reverse proxy trước Express. Mặc định 0; compose và `render.yaml` đặt 1. Sai thì rate limit đăng nhập đếm sai người |
| `CORS_ORIGIN` | Chỉ cần khi frontend ở origin khác. Cả hai đường ở đây đều cùng origin → để trống (production khi đó không cho origin nào khác) |
| `FRONTEND_URL` | Dựng link đặt lại mật khẩu; trên Render tự lấy `RENDER_EXTERNAL_URL` |
| `MAIL_*` | SMTP cho "Quên mật khẩu" (bỏ trống thì tính năng này không gửi được mail) |
| `PAYMENT_*` | Chuyển khoản chỉ bật khi đủ cả 4 biến — xem mục 10 |
| `DEMO_MODE` | `true` ở bản demo công khai: các tài khoản in trên trang đăng nhập không đổi được mật khẩu/SĐT, không bị xoá |
| `ALLOW_DEMO_SEED`, `DEMO_ADMIN_PASSWORD` | Chỉ cho lúc seed dữ liệu demo ở production (script reset). Admin của bản demo dùng mật khẩu bí mật này, không dùng `Admin@123` công khai trong repo |

### 3.2 Frontend (lúc build)
- `VITE_SHOW_DEMO_ACCOUNTS=true` — hiện khối "Tài khoản thử nghiệm" trên trang đăng nhập (không bao giờ có admin). Build thường không chứa chuỗi mật khẩu demo nào.
- Không cần `VITE_API_BASE_URL`: bỏ trống thì frontend gọi `/api/v1` cùng origin — đúng cho cả hai đường.

### 3.3 `docker/.env` (đường B)
Chép từ `docker/.env.example`: `DB_PASSWORD`, `DB_ROOT_PASSWORD`, `DEMO_MODE`, `VITE_SHOW_DEMO_ACCOUNTS`, cổng host. Compose dừng ngay với thông báo rõ nếu thiếu mật khẩu.

> **Lưu ý bảo mật:** Không commit file `.env` thật. Repo này công khai trên GitHub.

---

## 4. Đường A — bản demo công khai trên Render + Aiven

### 4.1 Aiven — MySQL
1. Đăng ký [aiven.io](https://aiven.io) (không cần thẻ) → **Create service** → **MySQL** → gói **Free**. Chọn khu vực gần Singapore nếu có.
2. Trang service → **Connection information**: ghi lại `Host`, `Port`, `User` (thường `avnadmin`), `Password`, `Database name` (thường `defaultdb`).
3. Tải **CA certificate** (file `ca.pem`). Để dán vào ô biến môi trường một dòng, đổi sang base64:
   ```bash
   base64 -w0 ca.pem
   ```
4. Làm luôn bước 4.2 ngay sau khi tạo: Aiven có thể tắt dịch vụ free không được dùng trong vài giờ đầu.

### 4.2 GitHub — secrets và seed lần đầu
1. Repo → **Settings → Secrets and variables → Actions → New repository secret**, tạo: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSL_CA` (chuỗi base64 ở 4.1), `DEMO_ADMIN_PASSWORD` (≥ 12 ký tự, chỉ bạn biết — đây là mật khẩu admin của bản demo).
2. Tab **Actions → Demo reset → Run workflow**. Job xoá mọi bảng → chạy 40 migration → 7 seeder (đo thử trên MySQL bật TLS: ~30–40 giây). Từ đó job tự chạy lúc 03:00 giờ Việt Nam mỗi đêm.
3. Lưu ý: GitHub tự tắt workflow theo lịch nếu repo công khai không có commit nào trong 60 ngày — khi đó vào tab Actions bật lại.

### 4.3 Render — web service
1. Đăng ký [render.com](https://render.com) bằng GitHub. (Theo Render, gói free không cần thẻ; nếu bị hỏi thẻ thì dừng lại cân nhắc.)
2. **New → Blueprint** → chọn repo này. Render đọc `render.yaml` ở gốc repo và tạo service `badminton-digital-demo`.
3. Render hỏi các biến để `sync: false`: điền `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSL_CA` giống 4.2. Hai JWT secret do Render tự sinh.
4. Nếu Aiven free không có khu vực châu Á: sửa `region` trong `render.yaml` cho gần DB (độ trễ app ↔ DB quan trọng hơn người dùng ↔ app) rồi mới tạo Blueprint.
5. Deploy. Log phải có theo thứ tự: `[wait-for-db] DB sẵn sàng` → `[entrypoint] Migration xong` → `API running`.

### 4.4 Kiểm tra sau khi deploy
- `https://<tên>.onrender.com` mở được trang chủ; F5 ở một trang con không ra 404.
- Đăng nhập bằng từng tài khoản trong khối "Tài khoản thử nghiệm"; đăng nhập admin bằng `admin@badminton.com` + `DEMO_ADMIN_PASSWORD`.
- Mở `https://<tên>.onrender.com/api/v1/health`: trường `ip` phải là IP của bạn. Nếu ra IP nội bộ của Render (10.x, 172.x…) thì đổi `TRUST_PROXY_HOPS` thành 2 trong dashboard.
- Trang Sân: mở/đóng sân ở tab khác thấy cập nhật realtime.

### 4.5 Giới hạn của gói miễn phí (đã biết, chấp nhận cho demo)
- **Render ngủ sau 15 phút không có request**, lần vào tiếp theo chờ ~1 phút. 750 giờ/tháng cho cả workspace.
- **Aiven tắt dịch vụ free khi lâu không dùng** (có email báo trước) và **phải tự vào dashboard bấm bật lại** — không tự dậy. Job reset mỗi đêm chạm DB hằng ngày nên giảm khả năng này.
- **Sơ đồ mặt bằng sân** sửa qua giao diện lưu trên ổ đĩa của container — mất khi Render cho service ngủ hoặc deploy lại, quay về 3 file mặc định.
- Dữ liệu demo tự về trạng thái seed lúc 03:00 mỗi đêm.

### 4.6 Tuỳ chọn: giữ service không ngủ
Một dịch vụ ping miễn phí (vd cron-job.org) gọi `https://<tên>.onrender.com/health` mỗi 14 phút giữ service luôn thức (~744 giờ/tháng, vừa đủ hạn mức 750 giờ nếu workspace chỉ có một service free). Không làm trong code — tuỳ bạn quyết.

### 4.7 Reset tay
Tab Actions → **Demo reset → Run workflow**. Hoặc từ máy mình (cần đủ biến như workflow):
```bash
cd backend
NODE_ENV=production ALLOW_DEMO_SEED=true DEMO_RESET_CONFIRM=<tên DB> DEMO_ADMIN_PASSWORD='...' \
  DB_HOST=... DB_PORT=... DB_NAME=... DB_USER=... DB_PASSWORD=... DB_SSL=true DB_SSL_CA=... \
  node scripts/demo-reset.js
```
Script từ chối chạy nếu `DEMO_RESET_CONFIRM` không bằng đúng tên DB sắp bị xoá.

---

## 5. Đường B — docker compose

### 5.1 Thành phần
- `docker/docker-compose.yml`: `mysql` (không mở ra mạng ngoài, chỉ `127.0.0.1:${MYSQL_HOST_PORT:-3307}`), `backend` (không publish cổng), `frontend` (nginx, `127.0.0.1:${FRONTEND_HOST_PORT:-8080}`).
- `docker/backend.Dockerfile`: Node 22, `NODE_ENV=production`, chạy bằng user `node`; `docker-entrypoint.sh` chờ DB (`scripts/wait-for-db.js`) → `db:migrate` → start. Migrate lỗi thì container dừng.
- `docker/frontend.Dockerfile` + `docker/nginx.conf`: proxy `/api`, `/static`, `/api-docs` sang backend, SSE không đệm, SPA fallback, cache `/assets/` dài hạn.
- Volume `layouts_data` giữ sơ đồ sân qua các lần `up --build`.

### 5.2 Chạy
```bash
cp backend/.env.example backend/.env      # sinh 2 JWT secret — xem comment trong file
cp docker/.env.example docker/.env        # điền DB_PASSWORD, DB_ROOT_PASSWORD
cd docker
docker compose up -d --build
```
Lần đầu (DB trống) backend chạy đủ migration trước khi nhận request — vài phút. Mở `http://127.0.0.1:8080`.

### 5.3 Dữ liệu
- **Demo:** trong `docker/.env` đặt `DEMO_MODE=true`, `VITE_SHOW_DEMO_ACCOUNTS=true`, rồi seed:
  ```bash
  docker compose exec -e ALLOW_DEMO_SEED=true -e DEMO_RESET_CONFIRM=badminton_digital_management \
    -e DEMO_ADMIN_PASSWORD='...' backend node scripts/demo-reset.js
  ```
- **Vận hành thật:** không seed. Tạo admin đầu tiên:
  ```bash
  docker compose exec -e ADMIN_EMAIL=chu.san@example.com -e ADMIN_PASSWORD='<mật khẩu mạnh>' \
    -e ADMIN_FULL_NAME='Nguyễn Văn A' backend npm run create-admin
  ```
  Mật khẩu ≥ 12 ký tự, không trùng mật khẩu demo. Tuỳ chọn `ADMIN_PHONE`, `ADMIN_BRANCH_CODE`. Script từ chối nếu đã có admin đang hoạt động.

### 5.4 Mở ra internet (tự host trên VPS)
Compose chỉ bind `127.0.0.1`. Đặt reverse proxy có TLS trên host (Caddy, hoặc nginx + Certbot) trỏ vào `127.0.0.1:8080`, và đổi `TRUST_PROXY_HOPS` của backend trong compose thành `"2"` (thêm một hop). **Backup DB trước mọi lần migrate trên dữ liệu thật** — xem mục 7 và cảnh báo migration ở mục 8.

---

## 6. CI (GitHub Actions)
- `.github/workflows/ci.yml`: trên `push`/`pull_request` vào `main`, `develop` — backend `npm test` (Jest), frontend Vitest + `npm run build`, đều Node 22.
- `.github/workflows/demo-reset.yml`: reset dữ liệu bản demo (mục 4.2).
- Chưa có: lint, integration test với MySQL, Newman, build/push image, deploy tự động (Render tự deploy khi `main` có commit mới).

---

## 7. Sao lưu (Backup)
- **Bản demo (đường A):** dữ liệu là seed, tái tạo được bất cứ lúc nào bằng Demo reset — không cần backup.
- **Vận hành thật:** backup MySQL định kỳ (cron hằng ngày), lưu ra ngoài máy chủ, và thử restore ít nhất một lần trước khi coi là "đã có backup". Không để mật khẩu trên dòng lệnh:
  ```bash
  mysqldump --defaults-extra-file=/root/.my.cnf --single-transaction badminton_digital_management > backup_$(date +%F).sql
  ```
  Backup tự động + thử restore là việc của nhóm sửa 6.

---

## 8. Rollback và cảnh báo migration
- Code: Render giữ các bản deploy cũ (nút **Rollback** trên dashboard); compose thì `git checkout` bản trước rồi `up --build`.
- DB: **rollback = restore backup**. `db:migrate:undo:all` dừng giữa chừng ở `20260814100004-relax-customer-phone` và nhiều `down()` không đảo được khi đã có dữ liệu.
- ⚠️ Một số migration gộp/xoá dữ liệu không hoàn tác được qua `down` (`20260815300001-unify-customers-chain-wide.js`, `20260815000002-inventory-foundation.js`…). Backup đầy đủ trước khi chạy `db:migrate` trên dữ liệu thật.

---

## 9. Giám sát
- `GET /health`: liveness (process còn sống) — Render và compose dùng làm health check.
- `GET /api/v1/health`: kèm `ip` để kiểm `TRUST_PROXY_HOPS`.
- Chưa có readiness chạm DB, log có rotation, cảnh báo — nhóm sửa 6.

---

## 10. Checklist trước khi release
- [ ] CI xanh (Jest, Vitest, build).
- [ ] Biến môi trường production đúng; không dùng giá trị mặc định/dev. Hai JWT secret ngẫu nhiên khác nhau.
- [ ] Chọn đúng **một** chế độ:
  - **Demo công khai:** `DEMO_MODE=true`, `VITE_SHOW_DEMO_ACCOUNTS=true`, seed bằng Demo reset với `DEMO_ADMIN_PASSWORD` bí mật.
  - **Vận hành thật:** không seed, `npm run create-admin`, `DEMO_MODE=false`, `VITE_SHOW_DEMO_ACCOUNTS=false`.
- [ ] `GET /api/v1/health` trả `ip` là IP của bạn.
- [ ] Thanh toán chuyển khoản — chọn một:
  - **Tắt** (bản demo): để trống 4 biến `PAYMENT_*`. `GET /api/v1/public/branches` trả `transferEnabled: false`, `POST /api/v1/payments/webhook` trả 503.
  - **Bật:** đủ `PAYMENT_BANK_ID`, `PAYMENT_BANK_ACCOUNT_NO`, `PAYMENT_BANK_ACCOUNT_NAME` (tài khoản thật của quán) và `PAYMENT_WEBHOOK_SECRET`; khai cùng secret ở dịch vụ báo có. Thử một đơn nhỏ.
- [ ] Trần giảm giá tay của nhân viên (Cài đặt → "Nhân viên giảm giá tay tối đa", mặc định 10%) đúng chính sách.
- [ ] README có hướng dẫn chạy cho người xem portfolio; có video demo ngắn phòng khi bản live đang ngủ/tắt lúc phỏng vấn.
