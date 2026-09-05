# 🏸 Badminton Digital Management

Hệ thống quản lý sân cầu lông full-stack — React, Node.js/Express, MySQL/Sequelize.

## Cấu trúc dự án
- `frontend/` — React SPA (giao diện quản trị/nhân viên + đặt sân khách hàng) — xem [`frontend/README.md`](frontend/README.md)
- `backend/` — Node.js/Express REST API (đa chi nhánh, kho hàng, đặt sân, thanh toán) — xem [`backend/README.md`](backend/README.md); migrations/seeders nằm ở `backend/src/migrations/` và `backend/src/seeders/`
- `docs/` — SRS, Use Case, Database Design, API Design, Architecture, Test Plan, Deployment Guide
- `postman/` — Postman collection kiểm thử API (112 endpoint) — xem [`postman/README.md`](postman/README.md)
- `k6/` — Kịch bản load testing (smoke / load / spike) — xem [`k6/README.md`](k6/README.md)
- `docker/` — Docker Compose & Dockerfile
- `.github/workflows/` — CI/CD pipeline

## Bắt đầu nhanh
Xem hướng dẫn chi tiết tại [`docs/DeploymentGuide.md`](docs/DeploymentGuide.md).

```bash
cd docker
docker compose up --build
```

## Tài liệu API tương tác

Chạy backend rồi mở **<http://localhost:5000/api-docs>** — Swagger UI cho cả 112 endpoint, bấm
**Authorize** dán token là thử được ngay trong trình duyệt. Spec thô ở `/api-docs.json`.

Trang này phơi toàn bộ bề mặt API nên **ở production mặc định tắt**; muốn bật thì đặt
`ENABLE_API_DOCS=true`.

## Kiểm thử

```bash
npm --prefix backend test     # Jest — unit test service layer
npm --prefix frontend test    # Vitest

# API — cần backend đang chạy ở localhost:5000
npx newman run postman/badminton_api_collection.json -e postman/badminton_local.postman_environment.json

# Sinh lại tài liệu OpenAPI từ Postman collection (kiêm luôn kiểm tra lệch pha với routes/)
npm --prefix backend run docs:build

# Chịu tải — cần k6 (winget install k6)
k6 run k6/smoke.js       # ~2 giây, kiểm tra môi trường
k6 run k6/load_test.js   # ~5 phút, 100 VU
k6 run k6/spike_test.js  # ~2 phút, 200 VU dội đột ngột
```

Newman mặc định **chỉ chạy request đọc**; k6 `load_test.js` mặc định **chỉ đọc**. Xem README của
từng thư mục để biết cách bật nhóm ghi và các cảnh báo khi đo (rate limit đăng nhập, cache CSDL lạnh).

## Tài liệu
| Tài liệu | Đường dẫn |
|---|---|
| Software Requirement Specification | `docs/SRS.md` |
| Use Case Specification | `docs/UseCase.md` |
| Database Design & ERD | `docs/DatabaseDesign.md` |
| API Design | `docs/APIDesign.md` |
| System Architecture | `docs/Architecture.md` |
| Test Plan | `docs/TestPlan.md` |
| Deployment Guide | `docs/DeploymentGuide.md` |
