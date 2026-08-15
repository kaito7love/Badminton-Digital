# 🏸 Badminton Digital Management

Hệ thống quản lý sân cầu lông full-stack — React, Node.js/Express, MySQL/Sequelize.

## Cấu trúc dự án
- `frontend/` — React SPA (giao diện quản trị/nhân viên + đặt sân khách hàng) — xem [`frontend/README.md`](frontend/README.md)
- `backend/` — Node.js/Express REST API (đa chi nhánh, kho hàng, đặt sân, thanh toán) — xem [`backend/README.md`](backend/README.md); migrations/seeders nằm ở `backend/src/migrations/` và `backend/src/seeders/`
- `docs/` — SRS, Use Case, Database Design, API Design, Architecture, Test Plan, Deployment Guide
- `postman/` — Postman collection kiểm thử API
- `k6/` — Kịch bản load testing
- `docker/` — Docker Compose & Dockerfile
- `.github/workflows/` — CI/CD pipeline

## Bắt đầu nhanh
Xem hướng dẫn chi tiết tại [`docs/DeploymentGuide.md`](docs/DeploymentGuide.md).

```bash
cd docker
docker compose up --build
```

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
