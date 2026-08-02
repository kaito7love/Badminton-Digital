# Phase 6: Testing, DevOps & Deployment

- **Trạng thái:** ⏳ PLANNED
- **Thư mục liên quan:** `docker/`, `postman/`, `k6/`, `.github/workflows/`

---

## 🎯 Mục Tiêu
Đóng gói containerization với Docker Compose, xây dựng kịch bản kiểm thử tự động, Postman API collections, k6 load testing và CI/CD pipeline.

## 📋 Danh Sách Hạng Mục Triển Khai
1. **Kiểm Thử Tự Động (Automated Testing):**
   - Unit Tests cho Services (AuthService, CourtService, PaymentService).
   - Integration Tests cho Express Endpoints bằng Jest & Supertest.

2. **API Documentation & Postman Collection:**
   - Postman Collection (`postman/badminton_api_collection.json`) chứa sẵn mẫu request/response cho toàn bộ API.
   - Swagger / OpenAPI documentation UI tại `/api-docs`.

3. **Load Testing (Kiểm thử chịu tải):**
   - Kịch bản k6 (`k6/load_test.js`) giả lập 100+ người dùng đồng thời mở sân/đóng sân.

4. **DevOps & Containerization:**
   - Multi-stage Dockerfile cho Frontend (Nginx build) & Backend (Node.js).
   - `docker-compose.yml` khởi chạy trọn bộ: Frontend + Backend + MySQL 8.
   - GitHub Actions (`.github/workflows/ci-cd.yml`): Tự động lint, run test, build Docker image khi push/PR.
