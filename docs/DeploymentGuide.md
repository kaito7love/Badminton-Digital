# Deployment Guide
## Dự án: Badminton Digital Management – Hệ thống quản lý sân cầu lông

**Phiên bản:** 1.0
**Ngày:** 19/07/2026
**Tài liệu tham chiếu:** `Architecture.md`, `TestPlan.md`

---

## 1. Mục tiêu tài liệu
Hướng dẫn triển khai Badminton Digital Management từ môi trường phát triển (local) đến môi trường production, bao gồm containerization (Docker), CI/CD (GitHub Actions), và cấu hình môi trường.

---

## 2. Yêu cầu hệ thống (Prerequisites)
- Node.js ≥ 18.x
- Docker & Docker Compose
- MySQL 8.x (nếu không dùng container)
- Git
- Tài khoản GitHub (cho CI/CD)
- (Tùy chọn) VPS/Cloud hosting: DigitalOcean, Render, Railway, AWS EC2...

---

## 3. Biến môi trường (Environment Variables)

### 3.1 Backend `.env`
```env
# App
NODE_ENV=production
PORT=5000

# Database
DB_HOST=mysql
DB_PORT=3306
DB_NAME=badminton_digital_management
DB_USER=bp_user
DB_PASSWORD=<đặt mật khẩu mạnh>

# JWT — hai chuỗi ngẫu nhiên KHÁC NHAU, tối thiểu 32 ký tự. Sinh mỗi chuỗi bằng:
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
# Server từ chối khởi động nếu thiếu, quá ngắn, trùng nhau hoặc còn là chuỗi mẫu trong repo.
JWT_ACCESS_SECRET=<chuỗi ngẫu nhiên thứ nhất>
JWT_REFRESH_SECRET=<chuỗi ngẫu nhiên thứ hai>
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d
JWT_RESET_EXPIRES=15m

# URL frontend, dùng để dựng link đặt lại mật khẩu gửi qua email
FRONTEND_URL=https://badmintondigitalmanagement.vn

# Email (quên mật khẩu)
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USER=<email gửi>
MAIL_PASSWORD=<app password>
MAIL_FROM=Badminton Digital <no-reply@badminton.com>

# Upload
UPLOAD_DIR=/app/uploads

# Seeder dữ liệu demo (tài khoản mật khẩu công khai) bị chặn khi NODE_ENV=production.
# Chỉ đặt true cho bản demo công khai — xem mục 10.
ALLOW_DEMO_SEED=false

# Thanh toán chuyển khoản — chỉ bật khi đặt ĐỦ cả 4 biến (xem mục 10).
# Thiếu biến nào: chuyển khoản tắt (backend từ chối, giao diện ẩn), webhook trả 503.
PAYMENT_BANK_ID=<mã ngân hàng VietQR, VD MB hoặc BIN 970422>
PAYMENT_BANK_ACCOUNT_NO=<số tài khoản nhận tiền của quán>
PAYMENT_BANK_ACCOUNT_NAME=<tên chủ tài khoản, không dấu>
PAYMENT_WEBHOOK_SECRET=<chuỗi ngẫu nhiên >= 32 ký tự, khai báo y hệt ở dịch vụ báo có>
```

> Danh sách trên khớp với `backend/.env.example` (nguồn tham chiếu chính thức). Đăng nhập/đăng ký bằng số điện thoại, chuyển đổi chi nhánh (admin), và hệ thống kho hàng (nhà cung cấp/phiếu nhập kho/tồn kho) không cần thêm biến môi trường mới — đã kiểm tra qua `backend/src/config/config.js` và các `process.env.*` trong service/controller liên quan. Các biến `ADMIN_*` của `npm run create-admin` (mục 7.2) truyền thẳng khi chạy lệnh, không ghi vào `.env`.

### 3.2 Frontend `.env`
```env
VITE_API_BASE_URL=https://api.badmintondigitalmanagement.vn/api/v1

# Hiện khối "Tài khoản thử nghiệm" trên trang đăng nhập. Chỉ bật cho bản demo công khai;
# tài khoản admin không bao giờ hiện ở bản build.
VITE_SHOW_DEMO_ACCOUNTS=false
```

> **Lưu ý bảo mật:** Không commit file `.env` thật lên Git. Chỉ commit `.env.example` với giá trị mẫu.

---

## 4. Cấu trúc Docker

### 4.1 `docker/docker-compose.yml` (mô tả tổng quan)
```yaml
services:
  mysql:
    image: mysql:8
    environment:
      MYSQL_DATABASE: badminton_digital_management
      MYSQL_USER: bp_user
      MYSQL_PASSWORD: ${DB_PASSWORD}
      MYSQL_ROOT_PASSWORD: ${DB_ROOT_PASSWORD}
    volumes:
      - mysql_data:/var/lib/mysql
    ports:
      - "3306:3306"

  backend:
    build: ../backend
    env_file: ../backend/.env
    depends_on:
      - mysql
    ports:
      - "5000:5000"

  frontend:
    build: ../frontend
    depends_on:
      - backend
    ports:
      - "80:80"

volumes:
  mysql_data:
```

### 4.2 Backend `Dockerfile` (mô tả các bước)
1. Base image `node:18-alpine`.
2. Copy `package.json`, chạy `npm ci --production`.
3. Copy source code.
4. Expose port 5000.
5. Lệnh khởi động: `node src/server.js` (sau khi chạy migration).

### 4.3 Frontend `Dockerfile` (multi-stage build)
1. **Stage 1 (build):** image `node:18-alpine`, chạy `npm ci && npm run build`.
2. **Stage 2 (serve):** image `nginx:alpine`, copy thư mục `build/dist` vào `/usr/share/nginx/html`.
3. Expose port 80.

---

## 5. Quy trình triển khai Local (Development)

```bash
# 1. Clone repository
git clone <repo-url>
cd Badminton Digital Management

# 2. Cấu hình biến môi trường
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# → chỉnh sửa giá trị phù hợp (bắt buộc sinh 2 JWT secret — xem mục 3.1)

# 3. Khởi chạy toàn bộ hệ thống bằng Docker Compose
cd docker
docker compose up --build

# 4. Chạy migration & seed dữ liệu mẫu (trong container backend)
#    Seed chỉ dành cho máy dev/bản demo: tài khoản mẫu dùng mật khẩu công khai,
#    seeder tự dừng khi NODE_ENV=production (xem mục 7.2).
docker compose exec backend npx sequelize-cli db:migrate
docker compose exec backend npx sequelize-cli db:seed:all

# 5. Truy cập
# Frontend: http://localhost
# Backend API: http://localhost:5000/api/v1
# Swagger UI: http://localhost:5000/api-docs
```

---

## 6. Quy trình CI/CD (GitHub Actions)

### 6.1 Pipeline hiện tại (`.github/workflows/ci.yml`)
Chạy trên `push`/`pull_request` vào `main` và `develop`. Gồm đúng 2 job độc lập
(không có `needs` giữa chúng, không có job build/push image hay deploy):

```
on:
  push: [main, develop]
  pull_request: [main, develop]

jobs:
  backend-test:
    working-directory: backend
    - actions/checkout@v4
    - actions/setup-node@v4 (node 18)
    - npm ci
    - npm test        # jest — chỉ unit test, không có service MySQL/migration

  frontend-build:
    working-directory: frontend
    - actions/checkout@v4
    - actions/setup-node@v4 (node 18)
    - npm ci
    - npm run build   # vite build — chỉ kiểm tra build thành công, KHÔNG chạy vitest
```

CI hiện **không** có: bước lint (ESLint), Postman/Newman, K6, build/push Docker
image, hay job deploy. Việc build Docker image và deploy (mục 7) hiện là thao
tác thủ công ngoài CI.

### 6.2 Kế hoạch (chưa triển khai)
Các bước sau được đề xuất bổ sung vào pipeline nhưng **chưa có** trong
`ci.yml` hiện tại — xem thêm `docs/TestPlan.md` mục 3/9:
- Lint (ESLint) cho cả backend và frontend.
- Chạy `vitest` cho frontend trong CI (hiện chỉ `vite build`).
- Integration test (Jest + Supertest) với service MySQL trong CI.
- Chạy Postman collection qua Newman.
- Job `build`: build & push Docker image (Docker Hub/GHCR).
- Job `deploy`: tự động deploy khi push vào `main`.

### 6.3 Điều kiện Merge
- 2 job hiện tại (`backend-test`, `frontend-build`) phải pass trước khi cho phép merge vào `main`.
- Áp dụng branch protection rule trên GitHub.

---

## 7. Triển khai Production

### 7.1 Lựa chọn hạ tầng (tùy ngân sách/portfolio)
| Thành phần | Gợi ý miễn phí/giá rẻ | Gợi ý production thật |
|---|---|---|
| Backend + MySQL | Railway, Render | VPS (DigitalOcean/AWS EC2) + Docker Compose |
| Frontend | Vercel, Netlify (build static) hoặc cùng Nginx container | CDN + Nginx |
| Database backup | Snapshot theo lịch của platform | `mysqldump` định kỳ qua cron job |

### 7.2 Các bước triển khai lên VPS (tổng quan)
1. Cài Docker & Docker Compose trên VPS.
2. Clone repo, cấu hình `.env` production.
3. Cấu hình domain + SSL (Let's Encrypt qua Certbot hoặc Nginx Proxy Manager).
4. `docker compose -f docker-compose.prod.yml up -d --build`.
5. **Backup DB trước khi migrate** (`mysqldump` — xem mục 8), rồi chạy migration production: `docker compose exec backend npx sequelize-cli db:migrate` (chạy `npm run migrate` tương đương ở mục "Commands" của `CLAUDE.md`). Migration tự tạo đủ 4 vai trò (`admin`, `employee`, `customer`, `branch_manager`), không cần seed.
   > ⚠️ Một số migration gần đây thay đổi/xoá dữ liệu không thể hoàn tác qua `down`: `20260815300001-unify-customers-chain-wide.js` gộp các hồ sơ khách hàng trùng số điện thoại giữa các chi nhánh thành 1 hồ sơ duy nhất (ghi log quyết định gộp vào bảng mới `customer_merge_audit`, nhưng dữ liệu gốc bị gộp/xoá không phục hồi được từ `down`). Migration này chạy cùng đợt với `20260815000002-inventory-foundation.js` (khởi tạo lại tồn kho theo chi nhánh, xoá cột `extras.stock_quantity` cũ) và `20260815300002-add-branch-manager-role.js`. Bắt buộc backup đầy đủ trước khi chạy `db:migrate` trên dữ liệu production — không chỉ với 3 migration này mà với mọi migration M1–M3 nói chung (xem `CLAUDE.md`).
6. **Tạo admin đầu tiên — không seed dữ liệu demo lên production.** Seeder demo tạo tài khoản mật khẩu công khai và tự dừng khi `NODE_ENV=production`. Thay vào đó:
   ```bash
   docker compose exec -e ADMIN_EMAIL=chu.san@example.com -e ADMIN_PASSWORD='<mật khẩu mạnh>' \
     -e ADMIN_FULL_NAME='Nguyễn Văn A' backend npm run create-admin
   ```
   Mật khẩu tối thiểu 12 ký tự và không trùng mật khẩu demo. Tuỳ chọn `ADMIN_PHONE`, `ADMIN_BRANCH_CODE` (mặc định chi nhánh đang hoạt động có id nhỏ nhất). Script từ chối chạy nếu đã có admin đang hoạt động và không in mật khẩu ra màn hình.
7. Cấu hình reverse proxy (Nginx) trỏ domain → container frontend (80) và `/api` → container backend (5000).

### 7.3 Giám sát & Log
- Log ứng dụng: thư mục `backend/src/logs/` (mount volume để không mất log khi container restart).
- Khuyến nghị bổ sung sau: healthcheck endpoint (`GET /health`), giám sát uptime (UptimeRobot).

---

## 8. Chiến lược sao lưu (Backup)
- Backup MySQL định kỳ (cron job hàng ngày): `mysqldump -u root -p badminton_digital_management > backup_$(date +%F).sql`.
- Lưu backup ra ngoài server (cloud storage) để tránh mất dữ liệu khi server gặp sự cố.
- Kiểm tra định kỳ khả năng restore từ file backup (thử nghiệm ít nhất 1 lần trước khi coi là "đã có backup đáng tin cậy").

---

## 9. Rollback Plan
- Giữ lại ít nhất 2–3 phiên bản Docker image gần nhất (tag theo commit SHA hoặc version).
- Khi phát hiện lỗi nghiêm trọng sau deploy: `docker compose down` → đổi tag image về bản trước → `docker compose up -d`.
- Nếu lỗi liên quan migration DB, cần có sẵn migration "down" tương ứng để revert schema an toàn.

---

## 10. Checklist trước khi Demo/Release
- [ ] 2 job CI hiện tại (`backend-test`, `frontend-build`) pass — xem mục 6.1. Integration test/Postman chưa có trong CI (mục 6.2), nên phần đó (nếu chạy) là thủ công ngoài CI.
- [ ] Biến môi trường production đã cấu hình đúng, không dùng giá trị mặc định/dev. Hai JWT secret là chuỗi ngẫu nhiên khác nhau (server tự từ chối chuỗi mẫu hoặc hai secret trùng nhau).
- [ ] Swagger UI truy cập được, phản ánh đúng API hiện tại.
- [ ] Thanh toán chuyển khoản — chọn một:
  - **Tắt** (chưa có dịch vụ báo có): để trống 4 biến `PAYMENT_*`. Kiểm `GET /api/v1/public/branches` trả `transferEnabled: false` và `POST /api/v1/payments/webhook` trả 503.
  - **Bật:** đặt đủ `PAYMENT_BANK_ID`, `PAYMENT_BANK_ACCOUNT_NO`, `PAYMENT_BANK_ACCOUNT_NAME` (tài khoản thật của quán) và `PAYMENT_WEBHOOK_SECRET`; khai báo cùng secret ở dịch vụ báo có, gửi header `X-Webhook-Secret` và `amount`. Thử một đơn chuyển khoản nhỏ: QR mang đúng số tài khoản, tiền về thì đơn thành "đã thanh toán".
- [ ] Trần giảm giá tay của nhân viên (Cài đặt → "Nhân viên giảm giá tay tối đa", mặc định 10%) đúng chính sách của quán.
- [ ] Chọn đúng **một** chế độ và cấu hình khớp:
  - **Vận hành thật:** tạo admin bằng `npm run create-admin`, **không** seed, `VITE_SHOW_DEMO_ACCOUNTS=false`.
  - **Demo công khai cho người xem portfolio:** `ALLOW_DEMO_SEED=true` rồi seed dữ liệu demo (vài sân, vài khách hàng, vài booking mẫu), build frontend với `VITE_SHOW_DEMO_ACCOUNTS=true`. Trang đăng nhập không hiện tài khoản admin — người xem trước có quyền admin sẽ phá dữ liệu demo của người xem sau.
- [ ] README.md có hướng dẫn chạy dự án rõ ràng cho người xem portfolio.
- [ ] Đã quay demo video ngắn (theo Roadmap Phase 5) phòng khi môi trường live gặp sự cố lúc phỏng vấn.
