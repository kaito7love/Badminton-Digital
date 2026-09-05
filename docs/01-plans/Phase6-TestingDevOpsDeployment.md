# Phase 6: Testing, DevOps & Deployment

- **Trạng thái:** 🔄 ĐANG LÀM — mục 2 (Postman + Swagger) và mục 3 (Load testing) đã xong; còn integration test Supertest và CI
- **Thư mục liên quan:** `docker/`, `postman/`, `k6/`, `.github/workflows/`

---

## 🎯 Mục Tiêu
Đóng gói containerization với Docker Compose, xây dựng kịch bản kiểm thử tự động, Postman API collections, k6 load testing và CI/CD pipeline.

## 📋 Danh Sách Hạng Mục Triển Khai
1. **Kiểm Thử Tự Động (Automated Testing):**
   - Unit Tests cho Services (AuthService, CourtService, PaymentService).
   - Integration Tests cho Express Endpoints bằng Jest & Supertest.

2. **API Documentation & Postman Collection:**
   - ✅ Postman Collection (`postman/badminton_api_collection.json`) — **112 request / 23 nhóm**, đủ toàn bộ endpoint, có body mẫu, test script và biến id tự điền. Kèm environment `postman/badminton_local.postman_environment.json`. Chạy thật bằng newman: 50 request đọc / 150 assertion / 0 lỗi; bật `runWrites=true` thành 74 request / 222 assertion / 0 lỗi.
   - ✅ Swagger / OpenAPI documentation UI tại `/api-docs` — spec `backend/src/docs/openapi.yaml` (OpenAPI 3.0.3, **112 operation / 23 tag**) **sinh tự động** từ Postman collection bằng `npm run docs:build`, không gõ tay. Bộ sinh bắt buộc collection khớp 1-1 với `src/routes/` nên kiêm luôn việc canh lệch pha. Trang bị tắt ở production trừ khi đặt `ENABLE_API_DOCS=true`. Spec thô ở `/api-docs.json`. Không thêm dependency mới (`swagger-ui-express` + `yamljs` đã có sẵn).

3. **Load Testing (Kiểm thử chịu tải):** ✅
   - `k6/smoke.js` — 1 VU quét 31 endpoint đọc, dùng để xác minh môi trường trước khi đo.
   - `k6/load_test.js` — 100 VU trong 5 phút, chia 4 scenario theo hành vi thật (40% khách duyệt catalog / 30% nhân viên xem sân / 20% tra cứu booking / 10% báo cáo). Có luồng ghi tuỳ chọn `--env WRITE=1` tự huỷ booking nó tạo ra.
   - `k6/spike_test.js` — 200 VU dội đột ngột vào nhóm `/public`.
   - Kết quả đo 05/09/2026: hơn 180.000 request qua 5 lần chạy, `http_req_failed` = **0** ở mọi mức tải; p95 = 164ms ở 100 VU (CSDL đã ấm), 731ms ở 200 VU. Chi tiết và cảnh báo khi đo: [`k6/README.md`](../../k6/README.md).

4. **DevOps & Containerization:**
   - Multi-stage Dockerfile cho Frontend (Nginx build) & Backend (Node.js).
   - `docker-compose.yml` khởi chạy trọn bộ: Frontend + Backend + MySQL 8.
   - GitHub Actions (`.github/workflows/ci-cd.yml`): Tự động lint, run test, build Docker image khi push/PR.
