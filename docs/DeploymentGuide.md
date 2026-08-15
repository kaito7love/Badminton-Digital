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

# JWT
JWT_ACCESS_SECRET=<random string dài>
JWT_REFRESH_SECRET=<random string dài khác>
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
```

> Danh sách trên khớp với `backend/.env.example` (nguồn tham chiếu chính thức). Đăng nhập/đăng ký bằng số điện thoại, chuyển đổi chi nhánh (admin), và hệ thống kho hàng (nhà cung cấp/phiếu nhập kho/tồn kho) không cần thêm biến môi trường mới — đã kiểm tra qua `backend/src/config/config.js` và các `process.env.*` trong service/controller liên quan.

### 3.2 Frontend `.env`
```env
VITE_API_BASE_URL=https://api.badmintondigitalmanagement.vn/api/v1
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
# → chỉnh sửa giá trị phù hợp

# 3. Khởi chạy toàn bộ hệ thống bằng Docker Compose
cd docker
docker compose up --build

# 4. Chạy migration & seed dữ liệu mẫu (trong container backend)
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
5. **Backup DB trước khi migrate** (`mysqldump` — xem mục 8), rồi chạy migration production: `docker compose exec backend npx sequelize-cli db:migrate` (chạy `npm run migrate` tương đương ở mục "Commands" của `CLAUDE.md`).
   > ⚠️ Một số migration gần đây thay đổi/xoá dữ liệu không thể hoàn tác qua `down`: `20260815300001-unify-customers-chain-wide.js` gộp các hồ sơ khách hàng trùng số điện thoại giữa các chi nhánh thành 1 hồ sơ duy nhất (ghi log quyết định gộp vào bảng mới `customer_merge_audit`, nhưng dữ liệu gốc bị gộp/xoá không phục hồi được từ `down`). Migration này chạy cùng đợt với `20260815000002-inventory-foundation.js` (khởi tạo lại tồn kho theo chi nhánh, xoá cột `extras.stock_quantity` cũ) và `20260815300002-add-branch-manager-role.js`. Bắt buộc backup đầy đủ trước khi chạy `db:migrate` trên dữ liệu production — không chỉ với 3 migration này mà với mọi migration M1–M3 nói chung (xem `CLAUDE.md`).
6. Cấu hình reverse proxy (Nginx) trỏ domain → container frontend (80) và `/api` → container backend (5000).

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
- [ ] Biến môi trường production đã cấu hình đúng, không dùng giá trị mặc định/dev.
- [ ] Swagger UI truy cập được, phản ánh đúng API hiện tại.
- [ ] Đã seed dữ liệu demo (vài sân, vài khách hàng, vài booking mẫu) để trình bày trực quan.
- [ ] README.md có hướng dẫn chạy dự án rõ ràng cho người xem portfolio.
- [ ] Đã quay demo video ngắn (theo Roadmap Phase 5) phòng khi môi trường live gặp sự cố lúc phỏng vấn.
