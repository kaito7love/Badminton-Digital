# Phase 1 — Ghi Chú & Quyết Định Kỹ Thuật

## 📌 Quyết Định Thiết Kế Quan Trọng
- **Phạm vi KHÔNG bao gồm:** Cổng thanh toán online thực tế (VNPay/Momo), ứng dụng native mobile, multi-branch (dành cho phiên bản mở rộng).
- **Khách vãng lai:** Hệ thống hỗ trợ cả 2 loại khách — có tài khoản (`users`) và khách vãng lai không cần tài khoản (`customers.user_id = NULL`).
- **Ngôn ngữ giao diện:** Tiếng Việt toàn bộ.
- **Tính tiền theo giây:** `courtFee` tính chính xác theo `durationSeconds`, không làm tròn theo giờ.

## 📌 Phụ Thuộc Sang Phase Tiếp Theo
- SRS là cơ sở để xây dựng ERD trong Phase 2.
- 21 Use Cases là cơ sở để thiết kế danh sách API endpoints trong Phase 2 & Phase 4.
