# Phase 2 — Architecture & Database Design: Kế Hoạch Triển Khai

- **Trạng thái:** ✅ COMPLETED
- **Thời gian:** 19/07/2026
- **Tài liệu gốc:** [Architecture.md](../../Architecture.md), [DatabaseDesign.md](../../DatabaseDesign.md), [APIDesign.md](../../APIDesign.md)

---

## 🎯 Mục Tiêu
Thiết kế kiến trúc 3-tier toàn hệ thống, xây dựng ERD chuẩn hóa 13 bảng, quy định chuẩn RESTful API và cấu trúc thư mục dự án.

## 📦 Phạm Vi Phase 2
- Thiết kế kiến trúc Client-Server 3 lớp (React SPA → Node/Express → MySQL).
- Thiết kế 13 bảng Database chuẩn hóa và quan hệ ERD đầy đủ.
- Quy định chuẩn API: Base URL, Request/Response Envelope, JWT auth header.
- Thiết kế Deployment Architecture (Docker Compose).

## 📋 Kết Quả Đầu Ra (Deliverables)
| File | Mô Tả |
|---|---|
| `docs/Architecture.md` | Kiến trúc 3-tier, luồng xử lý E2E, kiến trúc bảo mật |
| `docs/DatabaseDesign.md` | ERD 13 bảng với ràng buộc FK, Index khuyến nghị |
| `docs/APIDesign.md` | Quy ước API, danh sách 40+ endpoints phân quyền theo Role |
