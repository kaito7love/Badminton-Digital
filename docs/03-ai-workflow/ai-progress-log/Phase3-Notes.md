# Phase 3 — Ghi Chú & Quyết Định Kỹ Thuật

## 📌 Vấn Đề Phát Sinh & Giải Pháp
- **Vite báo lỗi "Could not auto-determine entry point":** Nguyên nhân thiếu file `index.html` tại root `frontend/`. Giải pháp: tạo `index.html` với `<script type="module" src="/src/main.jsx">`.
- **Vite Proxy vs Absolute URL:** Đã chọn Cách 1 (Vite Proxy với `VITE_API_BASE_URL=/api/v1`) để tránh CORS và đồng nhất môi trường dev/production.

## 📌 Quyết Định Kỹ Thuật
- **Refresh Token lưu ở DB (`users.refresh_token`):** Lưu token trong DB để có thể revoke từ phía server. Nếu cần multi-device, tách thành bảng riêng.
- **Sequelize `underscored: true`:** Áp dụng toàn bộ — Sequelize tự map camelCase (JS) sang snake_case (DB), nhờ đó code JS dùng `passwordHash` nhưng DB lưu `password_hash`.
- **Model `field` mapping:** Tất cả cột snake_case đều khai báo `field: 'snake_case_name'` trong Model definition để đảm bảo Sequelize ánh xạ đúng.

## 📌 Lệnh Quan Trọng Cần Nhớ
```bash
# Tại backend/
npm run migrate    # sequelize-cli db:migrate
npm run seed       # sequelize-cli db:seed:all
npm run dev        # nodemon src/server.js

# Tại frontend/
npm run dev        # vite
```

## 📌 Cần Kiểm Tra Trước Khi Sang Phase 4
- [ ] Chạy `npm run migrate && npm run seed` thành công (MySQL đang bật).
- [ ] `npm run dev` tại backend → thấy log `✅ Database connection to MySQL has been established successfully.`
- [ ] `npm run dev` tại frontend → truy cập `http://localhost:5173`, thấy Backend ONLINE ✅.
- [ ] Nhấn "Thử đăng nhập" với `admin@badminton.com` / `Admin@123` → thấy thông tin User trả về.
