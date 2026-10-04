# Kế hoạch: sửa số proxy của Render + hiện tài khoản admin (không mật khẩu) trên trang đăng nhập demo

- **Ngày:** 05/10/2026.
- **Trạng thái:** đã duyệt ("code đi") → đã làm, kết quả ở mục 3; **đã merge vào `main` 05/10/2026** (fast-forward tới `9da0c0a`) và push.
- **Nhánh:** `fix/render-proxy-hops-admin-hint`, tách từ `main` @ `5631d4b`.
- **Phạm vi:** `render.yaml`, khối "Tài khoản thử nghiệm" ở `LoginPage.jsx`, một test, tài liệu. Không có migration,
  không đổi API.

## 0. Bối cảnh

Bản demo công khai lên Render ngày 05/10/2026: https://badminton-digital-demo.onrender.com (Blueprint, gói free,
Singapore; DB Aiven free MySQL 8.4 — host nằm ở DigitalOcean Singapore). Kiểm từ bên ngoài sau deploy phát hiện:

- **Server không thấy IP thật của người xem.** `GET /api/v1/health` với `TRUST_PROXY_HOPS=1` (giá trị trong
  `render.yaml`) trả IP nội bộ của Render (`10.25.98.2`, `10.28.29.130`, `10.30.119.5` xoay vòng). Giới hạn đăng nhập
  10 lần/15 phút mỗi IP vì vậy bị mọi người xem dùng chung — vài chục lượt đăng nhập là cả site bị 429 (đúng lỗi
  `AUTH-02` mà nhóm sửa 4 đã sửa cho compose).

Chủ dự án thêm một yêu cầu: hiện tài khoản admin trong khối "Tài khoản thử nghiệm" nhưng không in mật khẩu. Mật khẩu
admin của bản demo (`DEMO_ADMIN_PASSWORD`) chủ dự án giữ nguyên.

## 1. Đo số proxy trên Render thật

Đổi `TRUST_PROXY_HOPS` trong dashboard Render, mỗi lần gọi `/api/v1/health` 10 lần + các ca tự đặt header:

| Giá trị | Server thấy | Kết luận |
|---|---|---|
| 1 | `10.x` (load balancer nội bộ của Render) | thiếu |
| 2 | `104.22.x`, `162.158.x`, `172.68–71.x`, `108.162.x` (dải IP của Cloudflare) | thiếu |
| 3 | `171.240.208.175` — đúng IP của máy kiểm, 10/10 lần | **đúng** |

Chuỗi proxy: Cloudflare → lớp vào của Render → load balancer nội bộ. Với 3: tự đặt `X-Forwarded-For: 6.6.6.6` (5 lần)
hay chuỗi `6.6.6.6, 7.7.7.7, 8.8.8.8` vẫn ra IP thật — IP do khách tự đặt luôn nằm bên trái IP mà Cloudflare ghi nên
không bao giờ được chọn. Người dùng Render khác cũng đo ra 3 cho Express (diễn đàn Render).

## 2. Thay đổi

- `render.yaml`: `TRUST_PROXY_HOPS` `"1"` → `"3"`, comment ghi chuỗi proxy và số đo. Phải sửa trong repo vì Render
  đồng bộ Blueprint từ file này — để `"1"` thì lần đồng bộ sau đặt lại giá trị sai trong dashboard.
- `backend/tests/serverConfig.test.js`: test đọc file cấu hình đổi kỳ vọng — compose vẫn 1 (nginx), `render.yaml` 3.
- `frontend/src/pages/Login/LoginPage.jsx`: dòng `Admin (toàn chuỗi): admin@badminton.com / mật khẩu không công khai`
  đứng đầu khối ở bản demo (chữ nghiêng, màu xám); máy dev vẫn in `Admin@123`. `password: null` → hiện câu
  "không công khai". Build production thường (không bật `VITE_SHOW_DEMO_ACCOUNTS`) vẫn không có khối này.
- Tài liệu: `docs/DeploymentGuide.md` (bảng biến môi trường, mục 4.4 ghi số đo thay cho "ra IP nội bộ thì đặt 2"),
  `CLAUDE.md`, comment trong `backend/src/utils/serverConfig.js`.

## 3. Kết quả kiểm thử

- Jest 338/338 (gồm test cấu hình mới), Vitest 61/61.
- Bundle build như Render (`VITE_SHOW_DEMO_ACCOUNTS=true`): có `admin@badminton.com` và "mật khẩu không công khai",
  **không có `Admin@123`** ở file nào. Bundle production thường: không có `Manager@123`/`Admin@123` (email admin chỉ
  còn ở placeholder có sẵn của trang Quên mật khẩu).
- Trình duyệt, bản build demo (`vite preview`): dòng admin hiện đúng ở cỡ laptop 1280×800 và điện thoại 375×812, không
  tràn ngang; bản dev (`npm run dev`) hiện `admin@badminton.com / Admin@123`; không lỗi console.
- Bản demo thật, sau khi chủ dự án đặt `TRUST_PROXY_HOPS=3` trong dashboard: bộ kiểm tra từ bên ngoài (chỉ request
  không cần đăng nhập) 20/20 — IP đúng, không giả được IP, https, SPA fallback, khối tài khoản thử nghiệm, không lộ
  `Admin@123`, đọc được 3 chi nhánh / 4 sân / 7 sản phẩm từ DB Aiven, API vận hành và realtime 401 khi không token,
  Swagger tắt, CORS đóng.
- Dòng admin chỉ lên bản demo thật sau khi merge + push (Render tự build lại từ `main`).
