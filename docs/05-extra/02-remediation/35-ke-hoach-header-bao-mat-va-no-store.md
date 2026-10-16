# Kế hoạch 35 — Sửa R9 + R10: header bảo mật và `Cache-Control: no-store` cho API

**Ngày:** 2026-10-15 · **Nhánh:** `fix/r9-r10-header-bao-mat-va-no-store`
**Tách từ:** `test/ke-hoach-kiem-thu-bao-mat` (45b7a9f, đã có R1). Theo quy tắc của đợt bảo mật: merge vào nhánh
test, **không** vào `main`.
**Trạng thái:** ĐÃ DUYỆT 2026-10-15 và đã code; kết quả ở §9. Merge vào `test/ke-hoach-kiem-thu-bao-mat` theo lệnh của bạn.
**Nguồn:** `33-ket-qua-kiem-thu-bao-mat.md` — R9 (F1, ZAP baseline) và R10 (F5).

## 1. Vấn đề đã đo được

- **R9:** cả trang SPA, API JSON và lỗi 401 (cả server tạm lẫn bản live Render) đều thiếu
  `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`,
  `Referrer-Policy`, `Permissions-Policy`. Hệ quả cụ thể: trang đăng nhập nhúng được vào iframe của trang lạ
  (clickjacking); trình duyệt tự đoán kiểu nội dung; không có lớp chặn thứ hai nếu sau này lọt XSS.
- **R10:** `/auth/me`, `/bookings`, `/customers`… trả không kèm `Cache-Control`. Proxy hay trình duyệt dùng
  chung có thể lưu response cá nhân.

## 2. Cái gì đang chạy trên trang (khảo sát để dựng CSP)

| Nguồn | Chỗ dùng | Ghi chú CSP |
|---|---|---|
| Script | một `<script type="module">` do Vite build, không inline, không `eval` | `script-src 'self'` đủ |
| Style | Tailwind build + **thuộc tính `style=` của React** (inline) | cần `style-src … 'unsafe-inline'` (không bỏ được nếu không sửa UI) |
| Google Fonts | `index.html` (Inter) + `@import` trong `styles/kinetic.css` | `style-src https://fonts.googleapis.com`, `font-src https://fonts.gstatic.com` |
| Ảnh | `/assets/images/*` cùng origin; **mã QR VietQR** từ `https://img.vietqr.io` (`utils/vietqr.js`) | `img-src 'self' data: https://img.vietqr.io` |
| API + SSE | cùng origin (`/api/v1/*`, `EventSource`) | `connect-src 'self'` |
| iframe, `blob:`, `dangerouslySetInnerHTML` | không dùng | `frame-ancestors 'none'`, `object-src 'none'` |
| Camera/GPS/thanh toán trình duyệt | không dùng | `Permissions-Policy` tắt hết |

## 3. Thay đổi đề xuất

### 3.1 Backend — phục vụ API **và** bản build (đường Render/demo): 1 file mới + 1 dòng đăng ký

**Mới** `backend/src/utils/securityHeaders.js` (hàm thuần + middleware, không thêm dependency):

| Header | Giá trị |
|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://img.vietqr.io; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'` |
| `X-Frame-Options` | `DENY` (cho trình duyệt cũ chưa hiểu `frame-ancestors`) |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` (link đặt lại mật khẩu chứa `?token=` không bị gửi sang Google Fonts) |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=()` |
| `Strict-Transport-Security` | `max-age=15552000` (180 ngày) — **chỉ khi `req.secure`**, tức request thật sự đi HTTPS qua proxy tin cậy; HTTP/localhost không bao giờ nhận. Không `includeSubDomains`, không `preload` |

**`backend/src/server.js`:** đăng ký ngay sau `app.disable('x-powered-by')`, trước `cors()`, để mọi response —
JSON, file tĩnh, 404, lỗi — đều mang header.

**R10 trong cùng middleware:** mọi request dưới `/api/v1` nhận `Cache-Control: no-store`, **trừ** `/api/v1/public/*`
(danh mục công khai; riêng `availability/day` đã tự đặt `no-store`). Handler nào đặt `Cache-Control` riêng sau đó
(SSE `no-cache`, cổng competition `no-store`) vẫn ghi đè được. File tĩnh giữ nguyên chính sách cache hiện có
(`immutable` cho `/assets`, `no-cache` cho `index.html`).

### 3.2 nginx — đường docker compose (nginx phục vụ SPA)

`docker/nginx.conf`: thêm cùng bộ header (trừ HSTS — compose chỉ bind `127.0.0.1:8080` bằng HTTP; TLS do reverse
proxy phía trước, nơi đó bật HSTS) vào hai `location` phục vụ file tĩnh (`/assets/`, `/`). Lặp lại trong từng
`location` vì nginx không kế thừa `add_header` cấp server khi location có `add_header` riêng (đã có
`Cache-Control`). Các `location` proxy API không đụng: backend đã tự gắn header.

### 3.3 Không nằm trong phạm vi (cố ý)

- `Cross-Origin-Embedder-Policy`/`Cross-Origin-Opener-Policy` (ZAP gợi ý): COEP làm hỏng Google Fonts nếu không
  có CORP từ phía Google; ghi nhận, không làm.
- Subresource Integrity cho Google Fonts CSS (không áp dụng được — CSS đổi theo trình duyệt).
- Bỏ `'unsafe-inline'` ở `style-src` (cần viết lại mọi `style=` thành class).
- Cập nhật CSP khi sau này thêm domain ảnh/CDN mới — cần sửa tay một chỗ.

## 4. Test

| File | Nội dung |
|---|---|
| `backend/tests/securityHeaders.test.js` (mới, không cần DB) | Hàm thuần: có đủ 6 header; CSP không chứa `unsafe-eval`, `script-src` không có `unsafe-inline`, có `frame-ancestors 'none'`; HSTS chỉ khi HTTPS. Middleware qua `supertest` trên app giả: header có trên JSON / 404 / lỗi 500; HSTS chỉ khi `X-Forwarded-Proto: https` **và** `trust proxy` bật; `/api/v1/*` có `no-store`, `/api/v1/public/*` không bị ép; một handler tự đặt `Cache-Control` vẫn ghi đè được |
| `backend/tests-security/security-headers.security.test.js` (mới, cần DB) | Trên app thật: `/api/v1/public/branches`, `/api/v1/auth/me` (401) và `/` có đủ header; `/auth/me`, `/bookings`, `/customers` có `no-store`. Tên test mang mã F1/F5 |
| `backend/tests/frontendStatic.test.js` (có sẵn) | Chạy lại để chắc header không phá logic tĩnh |

## 5. Kiểm tra thật (đúng quy trình)

1. `npm test` backend, Vitest frontend, `npm run test:security` — đều xanh; số test cũ không giảm.
2. **Chạy thật:** backend tạm mới :5052 từ nhánh này, phục vụ bản build frontend của nhánh (production-mode,
   giống Render). Server :5050/:5051/:5150 và server của bạn (:5000/:5102/:5173) **không bị đụng**.
3. **Chrome headless đi hết các trang chính** — Trang chủ, Đăng nhập, Đặt sân, Cửa hàng, Tài khoản, Thi đấu
   (`/thi-dau`), Bảng xếp hạng, và khu nhân viên (Dashboard, Sân, Báo cáo) — ở 1366×768 và 390×844, đọc **mọi
   vi phạm CSP** qua `securitypolicyviolation` + console. Mục tiêu: 0 vi phạm, font và mã QR hiển thị.
   Có vi phạm → bổ sung nguồn vào CSP rồi chạy lại, không nới bừa.
4. **Clickjacking thật:** một trang cùng máy khác origin nhúng `/login` bằng `<iframe>` → bị chặn.
5. **ZAP baseline** (image đã có sẵn) chạy lại lên :5052: kỳ vọng hết các cảnh báo CSP / X-Frame /
   X-Content-Type / Permissions-Policy; còn lại chỉ COEP, SRI, "Storable and Cacheable Content" của file tĩnh.
6. **nginx:** `nginx -t` + chạy container `nginx:alpine` (đã có sẵn trên máy) với `docker/nginx.conf` mới và bản
   build, `curl -I` `/` và `/assets/…` kiểm header. Container xoá ngay sau đó.
7. Dọn dữ liệu thử (tài khoản khách tạo cho lần kiểm) sau khi xong.

## 6. Rủi ro

| Rủi ro | Mức | Cách xử lý |
|---|---|---|
| CSP chặn nhầm tài nguyên hợp lệ → trang vỡ (font, QR, ảnh) | Trung bình | Bước 5.3 đọc vi phạm thật trên mọi trang chính trước khi báo xong. Nếu bạn muốn an toàn hơn: xem Q2 |
| Trang nào đó nhúng nguồn ngoài mà mình chưa gặp (đường ít đi) | Thấp | Khảo sát §2 dựa trên grep toàn bộ `frontend/src`; sẽ thêm nguồn nếu bước 5.3 phát hiện |
| HSTS "dính" 180 ngày trên trình duyệt người dùng nếu sau này bỏ HTTPS | Thấp | Chỉ gửi khi request đã là HTTPS; `max-age` vừa phải, không `includeSubDomains`/`preload` |
| `no-store` làm trình duyệt gọi lại API thay vì dùng cache | Thấp | Các API này vốn động; không có `ETag`/cache nào đang được dựa vào (đã grep) |
| `X-Frame-Options: DENY` chặn trang bạn tự nhúng ở nơi khác | Thấp | Hiện không có nơi nhúng nào; báo trước nếu có |

## 7. Phạm vi file

Mới: `backend/src/utils/securityHeaders.js`, `backend/tests/securityHeaders.test.js`,
`backend/tests-security/security-headers.security.test.js`.
Sửa: `backend/src/server.js` (một lần `app.use`), `docker/nginx.conf`.
Không đụng: frontend (`index.html`, CSS, component), route, validator, migration, `package.json`,
`render.yaml`, Postman/OpenAPI (header không nằm trong spec).

## 8. Câu hỏi cần bạn trả lời trước khi code

Chưa trả lời thì chưa làm; mặc định bên cạnh chỉ là đề xuất.

- **Q1.** Tự viết middleware không thêm dependency (đề xuất; CSP của mình khá riêng) — hay cài `helmet`?
- **Q2.** Bật CSP ngay ở chế độ chặn (đề xuất, sau khi bước 5.3 đạt 0 vi phạm) — hay trước mắt chỉ gửi
  `Content-Security-Policy-Report-Only` (không chặn gì, chỉ ghi vi phạm vào console) rồi bật chặn ở nhánh sau?
- **Q3.** `style-src 'unsafe-inline'` chấp nhận được cho đợt này (đề xuất — bỏ nó cần viết lại UI)?
- **Q4.** HSTS 180 ngày chỉ khi HTTPS, không `includeSubDomains`/`preload` — đồng ý?
- **Q5.** Tài liệu: sau khi code xong có cập nhật `CLAUDE.md` (mục "HTTP/deploy config") + `00-tien-do.md` +
  đánh dấu R9/R10 đã sửa trong báo cáo 33 không? (Đề xuất: chỉ khi bạn nói.)

## 9. Quyết định đã chốt và kết quả thực hiện

**Trả lời (2026-10-15):** Q1 tự viết middleware · Q2 bật CSP chặn sau khi 0 vi phạm · Q3 chấp nhận
`style-src 'unsafe-inline'` · Q4 HSTS 180 ngày chỉ khi HTTPS · Q5 chưa cập nhật tài liệu (`CLAUDE.md`,
`00-tien-do.md`, báo cáo 33 **không** đụng).

**Đã làm:** `backend/src/utils/securityHeaders.js` (mới), một lần đăng ký trong `server.js`, hai `location` tĩnh
trong `docker/nginx.conf`. Khác kế hoạch một điểm: `/api-docs` (Swagger UI, chỉ dev hoặc khi
`ENABLE_API_DOCS=true`) được **miễn CSP** vì nó dựng trang bằng script inline; các header còn lại vẫn áp dụng.

**Kết quả kiểm tra:**

| Hạng mục | Kết quả |
|---|---|
| `npm test` backend | 51 suite, 683 test pass (trước 665; +18 của `securityHeaders.test.js`) |
| `npm run test:security` (DB tạm) | 3 suite, 48 test pass (+9 của `security-headers.security.test.js`) |
| Vitest frontend | 35 file, 482 test pass (không đổi — frontend không bị sửa) |
| Chrome headless, backend tạm :5052 (production-mode) | **30 trang × 2 cỡ màn hình (1366×768, 390×844), 0 vi phạm CSP**: 8 trang công khai, 6 trang khách, 16 trang nhân viên (Dashboard, Sân, Sơ đồ, Đặt sân, Khách, Nhân viên, Phụ kiện, Bán lẻ, Báo cáo, Cài đặt, Nhật ký, Lịch sử, Thi đấu ×4) |
| CSP có tác dụng thật | ảnh từ `example.com` bị chặn, `img.vietqr.io` được phép, script inline bị chặn; CSS Google Fonts nạp được |
| Clickjacking | nhúng `/login` bản mới từ origin khác → bị chặn; bản cũ (:5050) nhúng được → test đủ nhạy |
| HSTS | HTTP thường: không có; qua `X-Forwarded-Proto: https` với trust proxy: `max-age=15552000`; chưa bật trust proxy thì client tự gửi header không kích hoạt được |
| `no-store` (R10) | `/auth/me` (kể cả 401), `/bookings`, `/customers`, `/employees` đều `no-store`; `/public/*` giữ nguyên |
| nginx | `nginx -t` OK; container `nginx:alpine` thật: `/`, `/login`, `/assets/*.js` đều mang đủ 5 header, `Cache-Control` cũ giữ nguyên; container đã xoá |
| ZAP baseline lên :5052 | các luật Anti-clickjacking, X-Content-Type-Options, CSP, Permissions-Policy, HSTS, Referrer đều **PASS** (trước: 8 cảnh báo). Còn 5 cảnh báo: `style-src unsafe-inline` (đã chấp nhận ở Q3), COEP, SRI, "Storable and Cacheable" của file tĩnh, "Modern Web Application" (thông tin) |

**Còn lại, cố ý không làm:** COEP/COOP, SRI, bỏ `'unsafe-inline'` của style (xem §3.3). Nginx không có HSTS —
TLS do reverse proxy phía trước, nơi đó bật HSTS.
