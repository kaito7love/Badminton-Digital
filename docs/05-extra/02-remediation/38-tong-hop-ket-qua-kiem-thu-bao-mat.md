# Báo cáo kiểm thử bảo mật — Badminton Digital Management

**Bản tổng hợp duy nhất · 2026-10-16 · nhánh `test/ke-hoach-kiem-thu-bao-mat` · commit được kiểm `3823ef8`**
(`main` vẫn `83e8f8b` — chưa merge, chưa push)

File này **tự đầy đủ**: đọc một mình là đủ. Các file `32`–`37` và `33` trong cùng thư mục là hồ sơ làm việc từng bước
(kế hoạch, quyết định, kết quả từng nhóm) — chỉ cần mở khi muốn xem chi tiết lịch sử.

---

## Mục lục

1. [Tóm tắt một trang](#1-tóm-tắt-một-trang)
2. [Đã kiểm những gì và bằng cách nào](#2-đã-kiểm-những-gì-và-bằng-cách-nào)
3. [17 phát hiện và cách xử lý](#3-17-phát-hiện-và-cách-xử-lý)
4. [Những điều đã kiểm và ổn](#4-những-điều-đã-kiểm-và-ổn)
5. [Bộ test tự động — số liệu chạy lại ngày 16/10](#5-bộ-test-tự-động--số-liệu-chạy-lại-ngày-1610)
6. [Kiểm thật bằng HTTP/trình duyệt và công cụ quét](#6-kiểm-thật-bằng-httptrình-duyệt-và-công-cụ-quét)
7. [Bảng từng mã kiểm tra A1–H13](#7-bảng-từng-mã-kiểm-tra-a1h13)
8. [Rủi ro chấp nhận và những gì chưa kiểm](#8-rủi-ro-chấp-nhận-và-những-gì-chưa-kiểm)
9. [Việc cần bạn làm](#9-việc-cần-bạn-làm)
10. [Cách tự chạy lại](#10-cách-tự-chạy-lại)
11. [Các nhánh và commit](#11-các-nhánh-và-commit)
- [Phụ lục A — danh sách 316 test mới](#phụ-lục-a--danh-sách-316-test-mới)

---

## 1. Tóm tắt một trang

| Câu hỏi | Trả lời |
|---|---|
| Có lỗ hổng nghiêm trọng (🔴) không? | **Không.** |
| Tìm được bao nhiêu vấn đề? | **17** (R1–R17), mức 🟠 "nên sửa" 4 cái, còn lại 🟡 "ghi nhận". |
| Đã xử lý chưa? | **13 đã sửa · 1 sửa một phần (R14) · 1 chấp nhận có chủ đích (R7) · 2 còn mở (R16, R17).** |
| Phân quyền có kín không? | **Có.** 344 lần gọi thử trên 115 route: vai trò không được phép luôn bị chặn; khách không đọc/huỷ được dữ liệu của khách khác; chi nhánh này không đọc/sửa được chi nhánh kia. |
| Có mất tiền / sai tiền không? | Không thấy. Race condition (8 request cùng 1 sân, 5 checkout cùng 1 phiên, 3 void cùng 1 hoá đơn) đều chỉ 1 bên thành công; giá/giảm giá do client gửi bị bỏ qua. |
| Có secret nào bị lộ trong code/git không? | Không: gitleaks quét 204 commit, 0 secret thật. |
| Test tự động | **316 test mới, 316/316 pass.** Cả bộ: backend 837 · test bảo mật cần DB 86/86 · giao diện 493/493. |
| Có test nào đỏ? | **Có 2–3 ca đỏ trong 1 file** (`competitionGateway.test.js`) — là flake có từ trước, cũng đỏ y hệt trên bản `main` chưa sửa; chạy riêng thì 41/41 pass (xem [§5.2](#52-vì-sao-vẫn-có-vài-ca-đỏ)). |
| Cần bạn làm gì? | `npm ci` · `npm run migrate` · quyết định merge `main`/push · quyết R16, R17 (xem [§9](#9-việc-cần-bạn-làm)). |

**Thay đổi lớn nhất đã đưa vào code** (để biết trước khi merge):
1. Đăng nhập: phiên được xoay vòng và thu hồi ngay khi đổi mật khẩu/đăng xuất (**cần 1 migration**).
2. Mật khẩu mới phải 8–72 byte, không phổ biến, không trùng SĐT/email/tên.
3. Mọi phản hồi có header bảo mật (CSP, chống nhúng iframe, HSTS khi HTTPS); API là `no-store`.
4. Nâng thư viện: `bcrypt` 6, `nodemailer` 10, `express` 4.22.3, `axios` 1.20; xoá `multer`.
5. Khách đặt tối đa 3 giờ/lượt ở phía server; GitHub Actions ghim theo commit SHA.

---

## 2. Đã kiểm những gì và bằng cách nào

**Chuẩn tham chiếu:** OWASP ASVS 4.0 mức 2 và OWASP API Security Top 10 (2023).

**Môi trường:** toàn bộ chạy trên **DB và server tạm riêng** (chạy `NODE_ENV=production` giống Render, `DEMO_MODE=true`),
không đụng DB dev hay server dev của bạn. Môi trường tạm đã được dọn theo yêu cầu.

**Tám nhóm kiểm tra:**

| Nhóm | Mã | Nội dung |
|---|---|---|
| A | A1–A12 | Đăng nhập, phiên, refresh token, link đặt lại mật khẩu, giới hạn tần suất, tài khoản demo |
| B | B1–B11 | Quyền theo chức năng, xem/sửa dữ liệu người khác (IDOR), chéo chi nhánh, gửi trường cấm, cổng thi đấu, hub công khai, luật đặt sân |
| C | C1–C8 | Tiêm SQL, kiểu dữ liệu lạ, XSS, công thức trong Excel, `__proto__`, body quá lớn, đọc file ngoài thư mục |
| D | D1–D8 | Webhook thanh toán/thi đấu, tranh chấp (race), giảm giá, voucher, giá do client gửi, phí sân, huỷ hoá đơn |
| E | E1–E6 | Rò dữ liệu nhạy cảm, nội dung lỗi, log, `/api-docs`, `/health` |
| F | F1–F6 | Header bảo mật, CORS, token ở `localStorage`, nhúng iframe, cache, vào thẳng URL nhân viên |
| G | G1–G6 | Giới hạn kết nối SSE, tải nhỏ, phân trang, báo cáo dài, k6 |
| H | H1–H13 | Lỗ hổng thư viện, secret trong git, Docker/compose/Render, TLS DB, chặn seed, quyền workflow, bản live, quét công cụ |

**Công cụ:** Jest + Supertest, Vitest, script Node tự viết, Chrome headless (2 cỡ màn hình 1366×768 và 390×844), k6,
`npm audit`, và 4 công cụ quét chạy trong Docker: semgrep, gitleaks, trivy, OWASP ZAP.

**Hai đợt:** đợt 1 làm nhóm A, B rồi dừng theo yêu cầu (152 kiểm tra có kết luận: 136 đạt, 16 chưa đạt); đợt 2 làm
phần còn lại, sửa lỗi theo kế hoạch 34–37 và kiểm thật từng bản sửa.

---

## 3. 17 phát hiện và cách xử lý

Mức độ: 🟠 nên sửa · 🟡 ghi nhận · ℹ️ thông tin. Trạng thái: ✅ đã sửa · ◐ một phần · ⏸ chấp nhận · 🔓 còn mở.

| # | Mức | Vấn đề (nói dễ hiểu) | Trạng thái |
|---|---|---|---|
| R1 | 🟠 | Đổi mật khẩu xong, các máy khác đang đăng nhập vẫn dùng tiếp được tới 7 ngày | ✅ |
| R2 | 🟠 | Mật khẩu chỉ cần 6 ký tự; `123456` được nhận | ✅ |
| R3 | 🟡 | Mã gia hạn phiên (refresh token) dùng đi dùng lại không đổi | ✅ |
| R4 | 🟡 | Sau khi đăng xuất/đổi mật khẩu, mã truy cập cũ vẫn sống tới 15 phút | ✅ |
| R5 | 🟡 | Đăng nhập nhanh hơn rõ khi SĐT/email chưa đăng ký → dò được ai có tài khoản | ✅ |
| R6 | 🟡 | Hệ thống nói "tài khoản bị khoá" ngay cả khi người hỏi nhập sai mật khẩu | ✅ |
| R7 | 🟡 | Đăng ký báo "SĐT/email này đã có tài khoản" | ⏸ |
| R8 | 🟡 | Nhân viên chi nhánh khác xem được phụ kiện đang cho thuê của một phiên chơi | ✅ |
| R9 | 🟠 | Không có header bảo mật nào (CSP, chống nhúng iframe, nosniff, HSTS…) | ✅ |
| R10 | 🟡 | Phản hồi chứa dữ liệu cá nhân không cấm lưu cache | ✅ |
| R11 | 🟡 | Một số đầu vào sai gây lỗi 500 thay vì 400; tranh chấp dữ liệu gây 500 | ✅ |
| R12 | 🟡 | Trang Cài đặt lưu được giá trị bất kỳ (kể cả `"peakPrice":"abc"`) | ✅ |
| R13 | 🟠 | Thư viện có lỗ hổng mức Cao/Nghiêm trọng | ✅ (còn rủi ro chấp nhận) |
| R14 | 🟡 | Cấu hình hạ tầng: Actions tag di động, `$host` nginx, nginx chạy root, token SSE trong URL | ◐ |
| R15 | 🟡 | Giới hạn "tối đa 3 giờ/lượt" chỉ nằm ở giao diện | ✅ |
| R16 | 🟡 | `ci.yml` không khai `permissions:` | 🔓 |
| R17 | ℹ️ | npm CLI đóng kèm image gốc `node:22-alpine` có 11 lỗ hổng mức Cao | 🔓 |

### Chi tiết từng phát hiện

#### R1 🟠 Đổi mật khẩu không đăng xuất các máy khác — ✅
- **Rủi ro thật:** nghi bị lộ tài khoản, đổi mật khẩu, nhưng kẻ kia vẫn giữ phiên và gia hạn tiếp được tới 7 ngày.
- **Đã sửa:** `AuthService.changePassword` ghi refresh token mới (chỉ lưu sha256), trả cặp token mới cho **chính thiết bị đang đổi**
  để họ giữ phiên (giao diện hứa "vẫn giữ nguyên phiên này"); các thiết bị khác mất phiên. Ghi bằng một lệnh `User.update`
  (tránh lỗi khoá lạc quan khi đăng nhập đồng thời).
- **Kiểm chứng:** 7 test HTTP trong `tests-security` — 5 đỏ trên code cũ (đã thử), xanh sau; API thật 9/9; Chrome 2 thiết bị 8/8.

#### R2 🟠 Chính sách mật khẩu yếu — ✅
- **Rủi ro thật:** dễ bị đoán/brute force; tồn đọng từ audit tháng 8.
- **Đã sửa:** `utils/passwordPolicy.js` — 8–72 **byte** (72 là giới hạn thật của bcrypt; dài hơn bị cắt im lặng), chặn ~220 mật khẩu
  phổ biến/dãy bàn phím/từ Việt và ngành cầu lông (không phân biệt hoa thường, bỏ đuôi số/ký hiệu), chặn ký tự lặp/dãy liên tiếp,
  chặn trùng hoặc chứa SĐT, phần trước `@` của email, họ tên. Áp ở đăng ký, đổi, đặt lại mật khẩu, tạo nhân viên, tạo tài khoản khách.
  Giao diện đổi chữ "6 → 8 ký tự" ở 5 trang và hiện **thông điệp cụ thể** của server.
- **Hai điều cần biết:** (1) đổi sang *chính mật khẩu hiện tại* chỉ kiểm độ dài (để Postman chạy lặp được; không thêm rủi ro);
  (2) mật khẩu demo công khai (`Admin@123`…) nằm trong danh sách chặn nên không đặt lại được qua API — seeder không bị ảnh hưởng.
- **Kiểm chứng:** 59 test đơn vị + 11 test HTTP; Chrome 10/10.

#### R3 🟡 Refresh token không xoay vòng — ✅
- **Rủi ro thật:** token bị đánh cắp dùng được suốt 7 ngày mà không có dấu hiệu gì.
- **Đã sửa:** mỗi lần gia hạn cấp token **mới**; token cũ còn được nhận **30 giây** (ân hạn) để hai tab/luồng SSE gia hạn cùng lúc
  không đá nhau ra khỏi phiên; ghi bằng so-và-đổi nên chỉ một bên xoay. Token có thêm `jti` (trước đây hai token ký cùng giây trùng nhau).
  **Có migration** (3 cột trên `users`).
- **Kiểm chứng:** 15 test đơn vị + 12 test HTTP; Chrome: hai tab cùng gia hạn đều ở lại trong hệ thống.

#### R4 🟡 Access token sống sau logout/đổi mật khẩu — ✅
- **Đã sửa:** access token mang `tv` = `users.token_version`; `authMiddleware` và `sseAuthMiddleware` (hai nơi duy nhất xác thực token —
  cổng thi đấu cũng đi qua chúng) so khớp, lệch thì 401. Logout/đổi/đặt lại mật khẩu tăng version. Token phát trước migration không có
  `tv` = 0 nên triển khai **không đăng xuất ai**.
- **Kiểm chứng:** Chrome: thiết bị A (token còn hạn) bị đưa về `/login` **ngay** khi thiết bị B đổi mật khẩu; SSE và cổng thi đấu cũng 401.

#### R5 🟡 Dò tài khoản qua thời gian — ✅
- **Đo thật:** trước sửa 5,7 ms (không có TK) so với 70,3 ms (sai mật khẩu); sau sửa **68,1 ms vs 67,5 ms**.
- **Đã sửa:** không có tài khoản vẫn `bcrypt.compare` với hash giả (cùng chi phí).

#### R6 🟡 Lộ trạng thái "bị khoá" — ✅
- **Đã sửa:** so mật khẩu trước; chỉ khi mật khẩu đúng mới báo "vô hiệu hóa" (403). Sai mật khẩu luôn 401. Mật khẩu không phải chuỗi → 401 thay vì 500.

#### R7 🟡 Đăng ký báo trùng SĐT/email — ⏸ chấp nhận
- Đánh đổi trải nghiệm (giúp khách biết đi "Quên mật khẩu"); giới hạn 5 lần đăng ký/giờ/IP làm chậm việc dò hàng loạt. **Bạn đã chọn giữ nguyên.**

#### R8 🟡 Phụ kiện phiên chơi chéo chi nhánh — ✅
- **Đã sửa:** `getSessionExtras` kiểm phiên thuộc chi nhánh đang chọn (404 nếu khác). Thêm/trả phụ kiện chéo chi nhánh vốn đã bị chặn.

#### R9 🟠 Không có header bảo mật — ✅
- **Rủi ro thật:** trang đăng nhập nhúng được vào iframe của trang lạ (clickjacking); không có lớp chặn thứ hai nếu sau này lọt XSS.
- **Đã sửa:** `utils/securityHeaders.js` (tự viết, không thêm thư viện), gắn đầu tiên trong `server.js`:
  CSP (`script-src 'self'`; chỉ cho Google Fonts và `img.vietqr.io`; `style-src 'unsafe-inline'` được chấp nhận vì React ghi `style=`),
  `X-Frame-Options: DENY`, nosniff, Referrer-Policy, Permissions-Policy, HSTS 180 ngày **chỉ khi request thật sự là HTTPS**.
  `docker/nginx.conf` có cùng bộ (trừ HSTS). `/api-docs` miễn CSP (Swagger UI cần script inline).
- **Kiểm chứng:** Chrome 30 trang × 2 cỡ màn hình: **0 vi phạm CSP**, font và QR vẫn hiển thị; nhúng `/login` vào iframe ở origin lạ bị chặn
  (đối chứng: bản cũ nhúng được); ZAP các luật header PASS; `nginx -t` + `curl -I` trong container thật.
- **Cần nhớ:** thêm domain ngoài mới (font/CDN/ảnh) ở frontend thì **phải thêm vào CSP**, nếu không trình duyệt chặn.

#### R10 🟡 Cache dữ liệu cá nhân — ✅
- **Đã sửa:** mọi phản hồi dưới `/api/v1` là `Cache-Control: no-store`, trừ `/public/*` (danh mục công khai).

#### R11 🟡 Lỗi 500 do đầu vào/tranh chấp — ✅
- **Đã sửa:** validator cho `period`/`from`/`to` của báo cáo (ngày có thật, `from ≤ to`); độ dài chuỗi khớp cột DB; mọi trường `id` là
  số nguyên 1…2147483647 (có test bắt `.isInt()` trần); `errorHandler`: deadlock/lock timeout của MySQL → **409**, dữ liệu vượt cột → 400.
- **Đo thật:** 6 checkout song song cùng một phiên: trước **1×201 + 4×500**, sau **1×201 + 5×409** (dữ liệu luôn nhất quán).

#### R12 🟡 Cài đặt không validate — ✅
- **Đã sửa:** `settingValidation.js` chỉ kiểm **kiểu** (giao diện Cài đặt còn nhiều hình dạng): object/mảng ≤ 20 phần tử, ≤ 4 KB, giờ dạng `HH:mm`,
  giờ cao điểm 0–24, trường mang nghĩa tiền phải là số ≥ 0, cấm `__proto__`/`constructor`; `PUT /settings` chỉ nhận 5 khoá đã dùng trong code.
- **Kiểm chứng:** nút "Lưu cài đặt" của giao diện thật vẫn chạy ("Đã lưu cài đặt thành công!").

#### R13 🟠 Thư viện có lỗ hổng — ✅ (còn rủi ro chấp nhận)

| Gói | Vấn đề | Xử lý |
|---|---|---|
| `proxy-addr` 2.0.7 (qua `express`) | giả IP qua subnet IPv4-mapped IPv6 | `express` 4.22.3 → `proxy-addr` 2.0.8 |
| `nodemailer` 9.0.5 | 7 lỗi cao (3 chỉ sửa ở ≥ 10) | nâng **10.1.1** |
| `tar` qua `bcrypt` → `node-pre-gyp` | ghi đè file khi giải nén | `bcrypt` **6.0.0** (bỏ hẳn chuỗi này) |
| `brace-expansion`, `qs`, `ip-address` | DoS/moderate | cập nhật trong cùng major |
| `axios` (frontend) | 12 lỗi cao | 1.20.0 |
| `multer` | khai báo nhưng không dùng | **xoá** |

- **Kết quả `npm audit --omit=dev`:** backend 17 → 6 moderate (0 cao/nghiêm trọng); frontend 3 → 2 moderate (0 cao); trivy lockfile 32+7 → **0**.
- **Kiểm chứng:** trên `node:22-alpine` **không có compiler** `npm ci --omit=dev` chạy được, bcrypt 6 hash/compare đúng, hash do bản 5.1.1 sinh vẫn so
  khớp; luồng thật 16/16 (đăng nhập bằng hash cũ, đăng ký, đổi mật khẩu, quên mật khẩu → SMTP giả → link đặt lại, xuất Excel, PDF, rate limit).

#### R14 🟡 Hạ tầng — ◐
- **a) Ghim `actions/checkout`, `actions/setup-node` theo commit SHA — ✅** (có test bắt mọi `uses:` không ghim).
- **b) `$host` trong nginx, c) nginx chạy root trong image frontend, d) token SSE trong URL — ⏸ chấp nhận** (theo quyết định của bạn): backend
  không dùng `Host` của request để dựng link; đổi sang image không root làm đổi cổng 80→8080 và compose; token SSE cần thiết kế lại bằng vé một lần.

#### R15 🟡 Giới hạn 3 giờ chỉ ở giao diện — ✅
- **Đã sửa:** `BookingService.durationViolation` + `CUSTOMER_MAX_BOOKING_HOURS = 3`; khách quá 3 giờ → 400. Nhân viên không giới hạn.
- **Kiểm chứng:** khách 6 giờ → 400; 3 giờ → 201; nhân viên 6 giờ → 201; test khớp hằng số với frontend.

#### R16 🟡 `ci.yml` thiếu `permissions:` — 🔓 (phát hiện ở nhóm E)
- Quyền của `GITHUB_TOKEN` phụ thuộc cài đặt mặc định của repo. **Sửa:** thêm `permissions: contents: read` ở đầu file (1 dòng). `demo-reset.yml` đã có.

#### R17 ℹ️ npm CLI trong image gốc — 🔓 (thông tin)
- 11 lỗ hổng mức Cao nằm toàn bộ trong `/usr/local/lib/node_modules/npm/` của image `node:22-alpine` (không phải thư viện của ứng dụng; container
  chạy `node src/server.js`, không gọi npm). Gói hệ điều hành Alpine 3.24: **0** Cao/Nghiêm trọng, 0 secret. **Nếu muốn:** nâng image gốc khi có bản mới
  hoặc gỡ npm khỏi image chạy.

---

## 4. Những điều đã kiểm và ổn

- **Phân quyền kín:** ma trận 344 lần gọi / 115 route / các vai trò (khách vãng lai, khách A, khách B, nhân viên CN2, quản lý CN2, admin…): 0 lệch.
  Đã có test giữ lại (`securityRouteMatrix`): chỉ 12 route công khai, 11 route "chỉ cần đăng nhập" (đều có kiểm quyền sở hữu ở service), 16 route nhạy cảm đúng vai trò.
- **Không xem/huỷ được dữ liệu người khác:** booking, hồ sơ, lịch sử, hoá đơn, đơn online; không đọc/sửa/xoá chéo chi nhánh (đã đối chiếu DB).
- **Gửi trường cấm bị bỏ qua:** `role`, `roleId`, `branchId`, `status`, `userId`, `totalSpent`, `loyaltyTier`… ở đăng ký, nhân viên, booking, khách.
- **Tiền:** webhook thanh toán chưa cấu hình → 503 dù gửi secret bất kỳ; giảm tay vượt trần/thiếu lý do/âm bị chặn; giá do client gửi bị bỏ qua;
  tồn kho không âm; voucher giới hạn lượt được kiểm lại lúc thanh toán.
- **Tranh chấp:** 8 request cùng 1 slot → 1 booking; 5 checkout cùng 1 phiên → 1 hoá đơn + 1 thanh toán; 3 void cùng 1 hoá đơn → 1 thành công.
- **Secret:** 204 commit không có secret thật (3 chuỗi là hằng số trong file test); không có `.env`, khoá hay `.keys/` từng bị commit.
- **Dữ liệu công khai:** hub thi đấu che tên đúng, không `phone`/`email`/`userId`; `/public/availability/day` `no-store`, không dữ liệu khách.
- **Thi đấu:** gọi thẳng competition-service bằng token giả (ES256 khoá lạ, HS256, `alg: none`) → 401; webhook chữ ký sai/replay/sửa 1 byte → 401, gửi
  lại cùng id → dedup; SSE công khai đúng 40 kết nối/IP.
- **Đầu vào:** `__proto__`, body 300 KB (413), JSON lồng 2000 tầng, path traversal, `Content-Disposition`; 6 payload công thức Excel không thành công thức.
- **Cấu hình:** CORS đóng với origin lạ; `/api-docs` tắt ở production; `/health` chỉ `status/time/version/ip`; Docker chạy non-root, `.dockerignore` loại `.env`/`.keys`,
  MySQL chỉ bind 127.0.0.1.

---

## 5. Bộ test tự động — số liệu chạy lại ngày 16/10

Chạy trên **worktree sạch** tại commit `3823ef8`, `npm ci` đúng lockfile, DB tạm riêng (đã xoá).

| Bộ | Lệnh | Kết quả |
|---|---|---|
| Backend (không cần DB) | `cd backend && npm test` | **58 suite · 837 test · 834–835 pass · 2–3 đỏ** (xem §5.2) |
| Backend bỏ file flake | `npx jest --testPathIgnorePatterns competitionGateway tests-security` | **57 suite · 796/796 pass** |
| `competitionGateway` chạy riêng | `npx jest competitionGateway` | **41/41 pass** (3 lần liên tiếp) |
| Backend (cần DB) | `DB_NAME_TEST=<db> npm run test:security` | **6 suite · 86/86 pass** (~30 giây) |
| Frontend | `cd frontend && npx vitest run` | **36 file · 493/493 pass** |
| Build frontend | `npm run build` | thành công |

### 5.1 Test mới thêm trong đợt: 316, tất cả pass

| File | Test | Bảo vệ điều gì |
|---|---|---|
| `securityRouteMatrix.test.js` | 22 | quyền thật đọc từ 24 file route; thêm route mới thiếu quyền là đỏ |
| `securityTokensAndSecrets.test.js` | 11 | token sai loại/chữ ký/`none`/hết hạn; không lộ mật khẩu/refresh/`previous_*`/`instance`/SQL |
| `changePassword.test.js` | 5 | R1: đổi mật khẩu thu hồi phiên, cấp cặp token mới |
| `mailer.test.js` | 5 | SMTP giả: đăng nhập, người nhận, tiêu đề, link đặt lại (lưới an toàn cho nodemailer 10) |
| `bcryptCompat.test.js` | 5 | hash do bcrypt 5.1.1 sinh vẫn so khớp ở bcrypt 6 |
| `securityHeaders.test.js` | 18 | CSP, XFO, nosniff, HSTS chỉ khi HTTPS, `no-store` |
| `groupAValidation.test.js` | 49 | R5, R6, báo cáo, độ dài, id trong INT, deadlock → 409, cài đặt |
| `passwordPolicy.test.js` | 59 | chính sách mật khẩu và các validator |
| `groupDRules.test.js` | 13 | khách tối đa 3 giờ; mọi `uses:` ghim SHA |
| `sessionRotation.test.js` | 15 | xoay vòng, ân hạn, so-và-đổi, `tv` lệch, token cũ không có `tv` |
| `reportExporterFormula.test.js` | 8 | 6 payload công thức Excel |
| `tests-security/*.security.test.js` (6 file) | 86 | IDOR, chéo chi nhánh, phiên, mật khẩu, header, rotation, R15 — app thật + DB thật |
| `sessionTokens.test.js`, `passwordRules.test.js` (frontend) | 9 + 11 | lưu cặp token mới; quy tắc mật khẩu phía giao diện |

Chi tiết **từng test** (tên + kết quả) ở [Phụ lục A](#phụ-lục-a--danh-sách-316-test-mới).

### 5.2 Vì sao vẫn có vài ca đỏ

Tất cả nằm trong **một file** `competitionGateway.test.js`:
1. Ca "giới hạn tần suất mặc định `/public/*`" gửi ~120 request liên tiếp và **quá timeout 5 giây mặc định** của Jest khi cả bộ test chạy song song.
2. Các request còn dở của ca đó làm service giả ghi "request cuối cùng" sai → hai ca SSE kế tiếp **đỏ dây chuyền**.

Bằng chứng không phải do các thay đổi bảo mật: chạy 2 lần trên `main` chưa sửa (83e8f8b, 627 test, `npm ci` riêng, cùng điều kiện máy):
**3 rồi 4 ca đỏ — đúng cùng cụm**. Chạy riêng file thì 41/41; bỏ file khỏi bộ thì 796/796.
*Cách khắc phục nếu muốn (chưa làm, ngoài phạm vi): tăng timeout ca đó hoặc cô lập service giả cho từng ca.*

### 5.3 Test có sẵn từ trước liên quan bảo mật/tiền (cùng lần chạy): 459/462

`webhookAuth` 6 · `jwtSecrets` 10 · `errorHandler` 6 · `demoMode` 11 · `demoSeedGuard` 16 · `createAdmin` 5 · `discountPolicy` 24 · `paymentConfig` 12 ·
`paymentValidation` 10 · `voucherService` 21 · `voucherValidation` 15 · `onlineOrderValidation` 19 · `employeePermissions` 12 · `customerMerge` 17 ·
`branchContext` 18 · `dbSsl` 6 · `serverConfig` 12 · `frontendStatic` 16 · `competitionToken` 25 · `competitionSignature` 12 · `competitionWebhook` 21 ·
`competitionRouteMap` 51 · `competitionStreamGuard` 5 · `competitionConfig` 14 · `competitionOutbox` 6 · `bookingAdvanceWindow` 8 · `bookingPastSlot` 15 ·
`bookingUpdateFields` 9 · `courtFeeSegments` 8 · `priceCalculator` 11 · `competitionGateway` 38/41 (3 ca flake ở §5.2).

---

## 6. Kiểm thật bằng HTTP/trình duyệt và công cụ quét

> **Nguồn số liệu:** các kết quả dưới đây được ghi lại **lúc chạy** (ngày 15/10) trong báo cáo từng nhóm. Log thô và script đã bị xoá khi dọn
> môi trường theo yêu cầu của bạn, nên phần này **không** chạy lại hôm nay. Muốn có log mới thì cần chạy lại (có thể làm khi bạn yêu cầu).

### 6.1 Kiểm thật theo từng bản sửa

| Bản sửa | Cách kiểm | Kết quả |
|---|---|---|
| R1 | API thật + Chrome 2 thiết bị (390×844, 1366×768) | 9/9 và 8/8 |
| R9/R10 | Chrome 30 trang × 2 cỡ, đọc `securitypolicyviolation`; thử script inline, ảnh lạ, iframe; HSTS bằng `curl`; nginx container thật | 0 vi phạm CSP; chặn đúng; HSTS đúng điều kiện; `nginx -t` OK |
| R13 | backend tạm với DB seed bằng bcrypt cũ + SMTP giả + Excel/PDF; Alpine không compiler | 16/16; chạy được |
| Nhóm A (R5, R6, R8, R11, R12) | HTTP + Chrome (nút Lưu cài đặt) | 14/14; checkout song song 201 + 5×409 |
| Nhóm B (R2) | Chrome 2 thiết bị: đăng ký/đổi mật khẩu yếu và mạnh | 10/10 |
| Nhóm C (R3, R4) | Chrome: 2 tab đua refresh; 2 thiết bị thu hồi | 11/11 |
| Nhóm E | B9 6/6 · D2 9/9 · D8 7/7 · F4 4/4 · E4 2/2 · G1 2/2 · F6 3/3 · k6 60/60 | tất cả đạt |

### 6.2 Công cụ quét

| Công cụ | Phạm vi | Kết quả |
|---|---|---|
| OWASP ZAP baseline (thụ động) | SPA | trước sửa: 8 cảnh báo (phần lớn header); sau R9 các luật header PASS, còn 5 đã chấp nhận (`unsafe-inline` style, COEP, SRI, cache file tĩnh, thông tin) |
| OWASP ZAP API scan (chủ động) | 101 URL từ `openapi.yaml`, token khách | 119 luật PASS, 0 cảnh báo, 4 mục thông tin |
| semgrep | 115 luật, 649 file | 13 mức WARNING, không lỗi thật (9 Actions tag di động — đã sửa; 3 `$host` nginx — chấp nhận; 1 ghi proxy từ service tin cậy) |
| gitleaks | 204 commit | 3 chuỗi, đều là hằng số trong file test |
| trivy lockfile | backend + frontend | 0 HIGH/CRITICAL sau R13 (trước: 32 + 7) |
| trivy image `docker/app.Dockerfile` | image build ~100 MB | OS Alpine 3.24: 0 HIGH/CRITICAL, 0 secret; 11 HIGH trong npm CLI của image gốc (R17) |
| `npm audit --omit=dev` | 3 dự án | backend 0 cao/nghiêm trọng (6 moderate chấp nhận); frontend 0 cao (2 moderate); competition-service 2 moderate (`uuid`/`sequelize`) |
| k6 `smoke.js` | 31 endpoint đọc | 60/60 check, 0% lỗi |

### 6.3 Bản live Render

Chỉ đọc bằng 7 request GET/OPTIONS (không đăng nhập, không ghi, không quét chủ động): chưa có header bảo mật (đúng như bản code cũ), CORS đóng với origin lạ,
`/api-docs` 404, `/api/v1/health` chỉ `status/time/version/ip`. **Các bản sửa chưa deploy** nên live vẫn như vậy cho tới khi bạn merge + deploy.

---

## 7. Bảng từng mã kiểm tra A1–H13

*(trạng thái sau xử lý; "R…" là phát hiện đã sửa tương ứng)*

| Mã | Kiểm gì | Ban đầu | Hiện tại |
|---|---|---|---|
| A1 | đăng nhập: thông điệp / thời gian / trạng thái khoá | ❌ R5, R6 | ✅ |
| A2 | giới hạn tần suất login/forgot/refresh; `X-Forwarded-For` không lách được | ✅ | ✅ |
| A3 | chính sách mật khẩu | ❌ R2 | ✅ |
| A4 | token sai chữ ký / `alg:none` / hết hạn / sai khoá / claim `role` bị bỏ qua | ✅ | ✅ |
| A5 | refresh token: lưu hash, thu hồi, xoay vòng | ❌ R3 | ✅ |
| A6 | token sau logout / đổi mật khẩu / khoá tài khoản | ❌ R1, R4 | ✅ |
| A7 | link đặt lại: 1 lần, hết hạn, của người khác, access token thay link | ✅ | ✅ |
| A8 | quên mật khẩu không lộ email | ✅ | ✅ |
| A9 | đăng ký trùng SĐT/email; gửi kèm `role` | ❌ R7 | ⏸ chấp nhận |
| A10 | khoá tài khoản demo dùng chung | ✅ | ✅ |
| A11 | token SSE trong URL | ⚠️ | ⏸ chấp nhận (R14d) |
| A12 | khởi động với secret yếu/dở dang | ✅ | ✅ |
| B1 | ma trận quyền chức năng (344 lần gọi) | ✅ | ✅ |
| B2 | khách ↔ khách (IDOR) | ✅ | ✅ |
| B3 | chéo chi nhánh | ❌ R8 | ✅ |
| B4 | `X-Branch-Id` | ✅ | ✅ |
| B5 | quản lý nhân sự | ✅ | ✅ |
| B6 | gửi trường cấm (mass assignment) | ✅ | ✅ |
| B7–B8 | cổng thi đấu: vai trò × route, scope | ✅ | ✅ |
| B9 | gọi thẳng competition-service | ⏸ | ✅ |
| B10 | hub công khai không lộ dữ liệu cá nhân | ✅ | ✅ |
| B11 | luật đặt sân (14 ngày, qua giờ, ngoài giờ, độ dài) | ✅ + R15 | ✅ |
| C1 | tiêm SQL / tham số lọc / ngày báo cáo | ❌ R11 | ✅ |
| C2 | kiểu dữ liệu lạ, độ dài, id ngoài INT | ❌ R11 | ✅ |
| C3 | XSS lưu (0 sink trong frontend) | ✅ | ✅ |
| C4 | công thức trong Excel | ⏸ | ✅ |
| C5–C8 | `__proto__`, body lớn, JSON sâu, path traversal, `Content-Disposition` | ✅ | ✅ |
| D1 | webhook thanh toán fail-closed | ✅ | ✅ |
| D2 | webhook thi đấu: chữ ký, replay, dedup | ⏸ | ✅ |
| D3 | race: slot, checkout, voucher | ✅ (500 do deadlock) | ✅ |
| D4–D6 | giảm giá, voucher, giá client | ✅ | ✅ |
| D7 | phí sân khi chuyển sân | ⏸ | ✅ (test đơn vị) |
| D8 | huỷ hoá đơn | ⏸ | ✅ |
| E1, E3, E5, E6 | rò hash/token, dữ liệu công khai, `/api-docs`, `/health` | ✅ | ✅ |
| E2 | nội dung lỗi, không 500 | ❌ R11 | ✅ |
| E4 | log và `ActivityLog` sạch bí mật | ⏸ | ✅ |
| F1 | header bảo mật | ❌ R9 | ✅ |
| F2 | CORS | ✅ | ✅ |
| F3 | token ở `localStorage` | ⏸ | ⏸ chấp nhận |
| F4 | nhúng iframe trang nhân viên | ⏸ | ✅ |
| F5 | cache dữ liệu cá nhân | ❌ R10 | ✅ |
| F6 | vào URL nhân viên bằng khách / ẩn danh | ⏸ | ✅ |
| G1 | giới hạn SSE 40/IP | ⏸ | ✅ |
| G2–G5 | hub 900/phút, tải `availability/day`, phân trang, báo cáo 100 năm | ✅ | ✅ |
| G6 | k6 smoke | ⏸ | ✅ |
| H1, H12 | thư viện, trivy image | ❌ R13 | ✅ |
| H2, H11 | secret trong git | ✅ | ✅ |
| H3–H5 | Dockerfile, compose, Render | ✅ (R14) | ✅ / ⏸ |
| H6–H7 | TLS DB, chặn seed production | ⏸ | ✅ |
| H8 | quyền token của workflow | ⏸ | 🔓 R16 |
| H9 | bản live Render | ✅ | ✅ (chưa deploy bản sửa) |
| H10, H13 | semgrep, ZAP | ✅ | ✅ |

---

## 8. Rủi ro chấp nhận và những gì chưa kiểm

### 8.1 Rủi ro đã chấp nhận (có chủ đích)

| Mục | Vì sao chấp nhận |
|---|---|
| R7 đăng ký báo trùng SĐT/email | giúp khách biết đi "Quên mật khẩu"; có limiter 5/giờ/IP |
| R14b `$host` nginx | backend không dùng `Host` để dựng link (dùng `FRONTEND_URL`/`RENDER_EXTERNAL_URL`) |
| R14c nginx chạy root trong image frontend | đổi sang image không root làm đổi cổng, compose, healthcheck |
| R14d/A11 token SSE trong `?token=` | `EventSource` không gắn được header; nginx tắt access log luồng SSE; cần thiết kế lại bằng vé một lần |
| F3 token ở `localStorage` | kiến trúc hiện tại; giảm nhẹ bằng CSP `script-src 'self'` và 0 sink XSS |
| `uuid` (qua `sequelize`, `exceljs`) | chỉ lỗi khi truyền `buf` cho v3/v5/v6 — code không làm vậy; "sửa" bằng `--force` là hạ bản phá vỡ |
| `yamljs → sprintf-js` | chỉ đọc file `openapi.yaml` của repo cho Swagger UI, không có đầu vào người dùng |
| `react-router` 6.x (moderate) | bản sửa là major 7; đã rà: không có đích điều hướng lấy từ đầu vào người dùng, không dùng SSR |
| `style-src 'unsafe-inline'` | React ghi `style=`; bỏ được khi viết lại style thành class |

### 8.2 Chưa kiểm hoặc kiểm chưa đủ

- **Bản live Render:** chỉ đọc 7 request; không kiểm tấn công/ghi. Bản sửa chưa deploy.
- **Thiết bị/trình duyệt:** chưa thử điện thoại thật, Safari, Firefox, trình đọc màn hình ("điện thoại" ở trên là Chrome emulation 390×844).
- **ZAP chủ động:** chỉ bằng token khách (không dùng admin để khỏi sửa/xoá dữ liệu); quyền nhân viên/quản lý được phủ bằng ma trận B1.
- **D7:** phí sân khi chuyển sân dựa vào test đơn vị, chưa dựng lại luồng chuyển sân trên server.
- **Email thật:** luồng quên mật khẩu chỉ thử với SMTP giả; chưa thử nhà cung cấp mail thật.
- **Migration:** `20261015100001-add-session-revocation-columns-to-users` chỉ chạy trên DB tạm (up → down → up); **chưa** chạy trên DB dev hay bản thật.
- **Test cần DB** (`tests-security`) **không** nằm trong `npm test`; cần DB thử đã migrate + seed.
- **COEP/COOP, SRI cho Google Fonts:** cố ý không làm (COEP làm hỏng Google Fonts).

---

## 9. Việc cần bạn làm

1. **`npm ci`** ở `backend/` và `frontend/` — `node_modules` của bạn đang là bản cũ (lệch `package-lock.json`: bcrypt, nodemailer, axios…).
2. **`npm run migrate`** ở `backend/` khi muốn dùng nhánh này trên DB dev (1 migration, 3 cột trên `users`). Render tự migrate ở lần reset đêm kế tiếp.
3. **Quyết merge:** nhánh `test/ke-hoach-kiem-thu-bao-mat` → `main` rồi push (Render tự deploy). Mình **chưa làm**.
4. **R16** (`permissions: contents: read` cho `ci.yml`) và **R17** (image gốc/npm CLI): sửa hay chấp nhận.
5. **Khi lên bản thật:** phiên đang mở **không bị ảnh hưởng** (refresh token cũ vẫn đổi được sang cặp xoay vòng; access token cũ không có `tv` vẫn dùng được
   tới lần thu hồi đầu tiên). Sau này thêm domain ngoài ở frontend phải thêm vào CSP (`backend/src/utils/securityHeaders.js` và `docker/nginx.conf`).

---

## 10. Cách tự chạy lại

```bash
# 1) Cập nhật thư viện theo lockfile mới (bắt buộc)
cd backend  && npm ci
cd ../frontend && npm ci

# 2) Test không cần DB
cd ../backend && npm test
npx jest --testPathIgnorePatterns competitionGateway tests-security   # bỏ file flake: kỳ vọng 57 suite, 796/796
npx jest competitionGateway                                           # chạy riêng: kỳ vọng 41/41

# 3) Frontend
cd ../frontend && npx vitest run && npm run build

# 4) Test bảo mật cần DB — dùng DB RIÊNG (tên phải có chữ "test"), KHÔNG dùng DB dev.
#    Tạo DB rỗng, ví dụ bd_sectest_check, rồi:
cd ../backend
DB_NAME=bd_sectest_check npx sequelize-cli db:migrate
DB_NAME=bd_sectest_check npx sequelize-cli db:seed:all
DB_NAME_TEST=bd_sectest_check npm run test:security                   # kỳ vọng 6 suite, 86/86
```

`tests-security` tự **từ chối chạy** nếu tên DB không chứa "test".

---

## 11. Các nhánh và commit

Mọi nhánh sửa lỗi được merge (`--no-ff`) vào `test/ke-hoach-kiem-thu-bao-mat`; `main` chưa nhận gì.

| Nội dung | Nhánh | Commit merge | Kế hoạch |
|---|---|---|---|
| Kế hoạch & báo cáo kiểm thử | `test/ke-hoach-kiem-thu-bao-mat` | `9b8c082` … `98d3db1` | 32, 33 |
| R1 đổi mật khẩu thu hồi phiên | `fix/r1-doi-mat-khau-thu-hoi-phien` | `45b7a9f` | 34 |
| R9 + R10 header bảo mật, `no-store` | `fix/r9-r10-header-bao-mat-va-no-store` | `f9e8083` | 35 |
| R13 nâng thư viện | `fix/r13-cap-nhat-thu-vien` | `bae38c7` | 36 |
| Nhóm A: R5, R6, R8, R11, R12 | `fix/r5-r6-r8-r11-r12-va-nho` | `4699022` | 37 |
| Nhóm B: R2 mật khẩu | `fix/r2-chinh-sach-mat-khau` | `9925410` | 37 |
| Nhóm D: R15, R14a | `fix/r14-r15-quy-tac-va-ha-tang` | `b295f91` | 37 |
| Nhóm C: R3 + R4 (có migration) | `fix/r3-r4-phien-dang-nhap` | `98c23f7` | 37 |
| Nhóm E: kiểm thử còn thiếu | `test/e-kiem-thu-con-thieu` | `936c88a` | 37 |
| Cập nhật `CLAUDE.md`, `00-tien-do.md`, báo cáo 33 | `docs/cap-nhat-tai-lieu-bao-mat` | `3823ef8` | — |
| Bản tổng hợp này | (commit thẳng trên nhánh test) | xem `git log` | 38 |

---

## Phụ lục A — danh sách 316 test mới

Sinh tự động từ báo cáo JSON của lần chạy ngày 2026-10-16 trên commit `3823ef8`. Chỉ liệt kê test **thêm mới** trong đợt này (✅ pass · ❌ fail · ⏭ bỏ qua). Cuối mục có tổng.

### Backend — test đơn vị / tích hợp không cần DB (backend/tests)

#### `bcryptCompat.test.js` — 5/5

| # | Kết quả | Test |
|---|---|---|
| 1 | ✅ | bcrypt — tương thích với mật khẩu đã lưu hash do bản cũ sinh vẫn so khớp đúng mật khẩu |
| 2 | ✅ | bcrypt — tương thích với mật khẩu đã lưu sai mật khẩu, thiếu ký tự hoặc hoa/thường khác đều bị từ chối |
| 3 | ✅ | bcrypt — tương thích với mật khẩu đã lưu hash mới có đúng định dạng $2b$10$ (cost 10 như AuthService) và so khớp hai chiều |
| 4 | ✅ | bcrypt — tương thích với mật khẩu đã lưu cùng mật khẩu hai lần ra hai hash khác nhau (có salt) nhưng cùng so khớp |
| 5 | ✅ | bcrypt — tương thích với mật khẩu đã lưu không còn phụ thuộc chuỗi tar/node-pre-gyp (nguyên nhân R13) |

#### `changePassword.test.js` — 5/5

| # | Kết quả | Test |
|---|---|---|
| 1 | ✅ | AuthService.changePassword — thu hồi phiên cũ (R1) ghi mật khẩu mới và refresh token mới (dạng sha256) trong MỘT lệnh update |
| 2 | ✅ | AuthService.changePassword — thu hồi phiên cũ (R1) trả cặp token mới hợp lệ, mang đúng id và vai trò |
| 3 | ✅ | AuthService.changePassword — thu hồi phiên cũ (R1) mật khẩu cũ sai → 400 và KHÔNG đụng tới refresh token hay mật khẩu |
| 4 | ✅ | AuthService.changePassword — thu hồi phiên cũ (R1) tài khoản demo dùng chung → 403 và không update |
| 5 | ✅ | AuthService.changePassword — thu hồi phiên cũ (R1) người dùng không tồn tại → 404 |

#### `groupAValidation.test.js` — 49/49

| # | Kết quả | Test |
|---|---|---|
| 1 | ✅ | R5 + R6 — AuthService.login R5: không có tài khoản vẫn tốn đúng một lần bcrypt.compare (cùng chi phí với sai mật khẩu) |
| 2 | ✅ | R5 + R6 — AuthService.login sai mật khẩu cũng đúng một lần compare và cùng thông điệp với "không có tài khoản" |
| 3 | ✅ | R5 + R6 — AuthService.login R6: tài khoản bị khoá + mật khẩu SAI → 401, không lộ trạng thái khoá |
| 4 | ✅ | R5 + R6 — AuthService.login R6: tài khoản bị khoá + mật khẩu ĐÚNG → 403 "vô hiệu hóa" và không cấp token |
| 5 | ✅ | R5 + R6 — AuthService.login mật khẩu không phải chuỗi ({"x":1}) → 401, không 500 |
| 6 | ✅ | R5 + R6 — AuthService.login mật khẩu không phải chuỗi (["a"]) → 401, không 500 |
| 7 | ✅ | R5 + R6 — AuthService.login mật khẩu không phải chuỗi (123) → 401, không 500 |
| 8 | ✅ | R5 + R6 — AuthService.login mật khẩu không phải chuỗi (null) → 401, không 500 |
| 9 | ✅ | R11 — validator báo cáo hợp lệ: không tham số |
| 10 | ✅ | R11 — validator báo cáo hợp lệ: khoảng hợp lệ |
| 11 | ✅ | R11 — validator báo cáo hợp lệ: chỉ from |
| 12 | ✅ | R11 — validator báo cáo hợp lệ: from = to |
| 13 | ✅ | R11 — validator báo cáo 400: ngày không có thật |
| 14 | ✅ | R11 — validator báo cáo 400: chữ |
| 15 | ✅ | R11 — validator báo cáo 400: năm 5 chữ số |
| 16 | ✅ | R11 — validator báo cáo 400: 30/2 |
| 17 | ✅ | R11 — validator báo cáo 400: from sau to |
| 18 | ✅ | R11 — validator báo cáo 400: period lạ |
| 19 | ✅ | R11 — validator báo cáo 400: mảng |
| 20 | ✅ | R11 — validator báo cáo isRealDate bắt ngày không tồn tại |
| 21 | ✅ | R11 — errorHandler với mã lỗi MySQL ER_LOCK_DEADLOCK → 409 thử lại |
| 22 | ✅ | R11 — errorHandler với mã lỗi MySQL ER_LOCK_WAIT_TIMEOUT → 409 thử lại |
| 23 | ✅ | R11 — errorHandler với mã lỗi MySQL ER_DATA_TOO_LONG → 400 |
| 24 | ✅ | R11 — errorHandler với mã lỗi MySQL ER_WARN_DATA_OUT_OF_RANGE → 400 |
| 25 | ✅ | R11 — errorHandler với mã lỗi MySQL ER_DATA_OUT_OF_RANGE → 400 |
| 26 | ✅ | R11 — errorHandler với mã lỗi MySQL lỗi DB khác vẫn là 500 và không lộ chi tiết ở production |
| 27 | ✅ | R11 — id số nguyên nằm trong miền INT ở mọi validator không còn `.isInt()` trần trên trường id |
| 28 | ✅ | R12 — validator cài đặt chấp nhận: giá hợp lệ |
| 29 | ✅ | R12 — validator cài đặt chấp nhận: chuỗi số từ ô nhập |
| 30 | ✅ | R12 — validator cài đặt chấp nhận: giờ cao điểm dạng số |
| 31 | ✅ | R12 — validator cài đặt chấp nhận: giờ dạng HH:mm |
| 32 | ✅ | R12 — validator cài đặt chấp nhận: dạng mảng cũ |
| 33 | ✅ | R12 — validator cài đặt chấp nhận: object rỗng |
| 34 | ✅ | R12 — validator cài đặt 400: giá là chữ |
| 35 | ✅ | R12 — validator cài đặt 400: giá âm |
| 36 | ✅ | R12 — validator cài đặt 400: giá quá lớn |
| 37 | ✅ | R12 — validator cài đặt 400: giờ sai định dạng |
| 38 | ✅ | R12 — validator cài đặt 400: giờ cao điểm ngoài 0–24 |
| 39 | ✅ | R12 — validator cài đặt 400: chuỗi quá dài |
| 40 | ✅ | R12 — validator cài đặt 400: quá nhiều khoá |
| 41 | ✅ | R12 — validator cài đặt 400: lồng quá sâu |
| 42 | ✅ | R12 — validator cài đặt 400: quá 4 KB |
| 43 | ✅ | R12 — validator cài đặt 400 (JSON thô): khoá __proto__ |
| 44 | ✅ | R12 — validator cài đặt 400 (JSON thô): khoá constructor lồng |
| 45 | ✅ | R12 — validator cài đặt 400 (JSON thô): chuỗi thay vì object |
| 46 | ✅ | R12 — validator cài đặt 400 (JSON thô): null |
| 47 | ✅ | R12 — validator cài đặt 400 (JSON thô): số |
| 48 | ✅ | R12 — validator cài đặt PUT /settings: khoá lạ bị từ chối, khoá đã biết nhận |
| 49 | ✅ | R12 — validator cài đặt validateSettingObject dùng được độc lập |

#### `groupDRules.test.js` — 13/13

| # | Kết quả | Test |
|---|---|---|
| 1 | ✅ | R15 — BookingService.durationViolation giới hạn mặc định là 3 giờ, khớp MAX_BOOKING_HOURS của trang Đặt sân |
| 2 | ✅ | R15 — BookingService.durationViolation 08:00–09:00 hợp lệ |
| 3 | ✅ | R15 — BookingService.durationViolation 08:00–10:30 hợp lệ |
| 4 | ✅ | R15 — BookingService.durationViolation 17:00–20:00 hợp lệ |
| 5 | ✅ | R15 — BookingService.durationViolation 05:00–07:59 hợp lệ |
| 6 | ✅ | R15 — BookingService.durationViolation 08:00–11:01 vượt giới hạn |
| 7 | ✅ | R15 — BookingService.durationViolation 08:00–14:00 vượt giới hạn |
| 8 | ✅ | R15 — BookingService.durationViolation 05:00–23:00 vượt giới hạn |
| 9 | ✅ | R15 — BookingService.durationViolation maxHours truyền vào được tôn trọng |
| 10 | ✅ | R15 — BookingService.durationViolation chỉ vai customer bị áp: createBooking gọi kiểm tra trong nhánh customer |
| 11 | ✅ | R14a — GitHub Actions ghim theo commit SHA có file workflow để kiểm |
| 12 | ✅ | R14a — GitHub Actions ghim theo commit SHA ci.yml: mọi `uses:` ngoài repo đều trỏ tới SHA 40 ký tự |
| 13 | ✅ | R14a — GitHub Actions ghim theo commit SHA demo-reset.yml: mọi `uses:` ngoài repo đều trỏ tới SHA 40 ký tự |

#### `mailer.test.js` — 5/5

| # | Kết quả | Test |
|---|---|---|
| 1 | ✅ | mailer — gửi mail đặt lại mật khẩu qua SMTP isMailConfigured chỉ true khi đủ HOST, USER, PASSWORD |
| 2 | ✅ | mailer — gửi mail đặt lại mật khẩu qua SMTP chưa cấu hình SMTP → lỗi 500 nói rõ biến cần khai báo |
| 3 | ✅ | mailer — gửi mail đặt lại mật khẩu qua SMTP gửi đúng người nhận, đăng nhập SMTP đúng, tiêu đề và link đặt lại có trong nội dung |
| 4 | ✅ | mailer — gửi mail đặt lại mật khẩu qua SMTP transporter được tái sử dụng: hai lần gửi liên tiếp đều tới nơi |
| 5 | ✅ | mailer — gửi mail đặt lại mật khẩu qua SMTP SMTP không kết nối được → lỗi ném ra cho nơi gọi (AuthService mới là nơi nuốt lỗi) |

#### `passwordPolicy.test.js` — 59/59

| # | Kết quả | Test |
|---|---|---|
| 1 | ✅ | checkPassword — độ dài hằng số đúng như đã duyệt: 8 đến 72 byte |
| 2 | ✅ | checkPassword — độ dài "" → length |
| 3 | ✅ | checkPassword — độ dài "abc" → length |
| 4 | ✅ | checkPassword — độ dài "1234567" → length |
| 5 | ✅ | checkPassword — độ dài "Xk9#mQ2" → length |
| 6 | ✅ | checkPassword — độ dài "Xk9#mQ2p" → ok |
| 7 | ✅ | checkPassword — độ dài 72 byte hợp lệ, 73 byte bị từ chối (bcrypt chỉ dùng 72 byte đầu) |
| 8 | ✅ | checkPassword — độ dài ký tự có dấu tính theo byte UTF-8, không theo số ký tự |
| 9 | ✅ | checkPassword — độ dài không phải chuỗi (null) → length |
| 10 | ✅ | checkPassword — độ dài không phải chuỗi (undefined) → length |
| 11 | ✅ | checkPassword — độ dài không phải chuỗi (12345678) → length |
| 12 | ✅ | checkPassword — độ dài không phải chuỗi ({}) → length |
| 13 | ✅ | checkPassword — độ dài không phải chuỗi (["abcdefgh"]) → length |
| 14 | ✅ | checkPassword — mật khẩu phổ biến 12345678 bị chặn |
| 15 | ✅ | checkPassword — mật khẩu phổ biến password bị chặn |
| 16 | ✅ | checkPassword — mật khẩu phổ biến Password bị chặn |
| 17 | ✅ | checkPassword — mật khẩu phổ biến PASSWORD123 bị chặn |
| 18 | ✅ | checkPassword — mật khẩu phổ biến qwertyuiop bị chặn |
| 19 | ✅ | checkPassword — mật khẩu phổ biến matkhau123 bị chặn |
| 20 | ✅ | checkPassword — mật khẩu phổ biến MatKhau2026! bị chặn |
| 21 | ✅ | checkPassword — mật khẩu phổ biến admin123 bị chặn |
| 22 | ✅ | checkPassword — mật khẩu phổ biến badminton bị chặn |
| 23 | ✅ | checkPassword — mật khẩu phổ biến Caulong123 bị chặn |
| 24 | ✅ | checkPassword — mật khẩu phổ biến iloveyou bị chặn |
| 25 | ✅ | checkPassword — mật khẩu phổ biến abc@123 bị chặn |
| 26 | ✅ | checkPassword — mật khẩu phổ biến Admin@123 bị chặn |
| 27 | ✅ | checkPassword — mật khẩu phổ biến Employee@123 bị chặn |
| 28 | ✅ | checkPassword — mật khẩu phổ biến Manager@123 bị chặn |
| 29 | ✅ | checkPassword — mật khẩu phổ biến Customer@123 bị chặn |
| 30 | ✅ | checkPassword — mật khẩu phổ biến 12345678 → common (đủ dài) |
| 31 | ✅ | checkPassword — mật khẩu phổ biến password → common (đủ dài) |
| 32 | ✅ | checkPassword — mật khẩu phổ biến qwertyuiop → common (đủ dài) |
| 33 | ✅ | checkPassword — mật khẩu phổ biến matkhau123 → common (đủ dài) |
| 34 | ✅ | checkPassword — mật khẩu phổ biến Admin@123 → common (đủ dài) |
| 35 | ✅ | checkPassword — mật khẩu phổ biến so không phân biệt hoa thường và bỏ đuôi số/ký hiệu |
| 36 | ✅ | checkPassword — mật khẩu phổ biến danh sách chặn đủ lớn và không chứa mật khẩu ngắn hơn quy định vô ích |
| 37 | ✅ | checkPassword — mật khẩu phổ biến Tr0ng-Ngay-M@i được chấp nhận |
| 38 | ✅ | checkPassword — mật khẩu phổ biến sau-cau-long-vui-ve được chấp nhận |
| 39 | ✅ | checkPassword — mật khẩu phổ biến Xk9#mQ2pLw được chấp nhận |
| 40 | ✅ | checkPassword — mật khẩu phổ biến Mat-khau-dai-va-khong-pho-bien-123 được chấp nhận |
| 41 | ✅ | checkPassword — mật khẩu phổ biến Sân cầu lông 2026! được chấp nhận |
| 42 | ✅ | checkPassword — đơn giản aaaaaaaa lặp một ký tự |
| 43 | ✅ | checkPassword — đơn giản zzzzzzzzzz lặp một ký tự |
| 44 | ✅ | checkPassword — đơn giản 11111111 lặp một ký tự |
| 45 | ✅ | checkPassword — đơn giản abcdefghij dãy liên tiếp |
| 46 | ✅ | checkPassword — đơn giản 87654321 dãy liên tiếp |
| 47 | ✅ | checkPassword — đơn giản mnopqrstu dãy liên tiếp |
| 48 | ✅ | checkPassword — đơn giản dãy ngắn xen ký tự khác không bị coi là đơn giản |
| 49 | ✅ | checkPassword — trùng thông tin cá nhân chứa số điện thoại (có hoặc không số 0 đầu, +84) |
| 50 | ✅ | checkPassword — trùng thông tin cá nhân chứa phần trước @ của email (≥ 4 ký tự), bỏ dấu chấm |
| 51 | ✅ | checkPassword — trùng thông tin cá nhân chứa họ tên không dấu, không khoảng trắng |
| 52 | ✅ | checkPassword — trùng thông tin cá nhân email/tên/phone ngắn hoặc không liên quan không gây báo nhầm |
| 53 | ✅ | checkPassword — trùng thông tin cá nhân assertPassword ném lỗi 400 với thông điệp tiếng Việt |
| 54 | ✅ | validator đăng ký / đổi / đặt lại mật khẩu đăng ký: mật khẩu mạnh qua, yếu 400 kèm thông điệp cụ thể |
| 55 | ✅ | validator đăng ký / đổi / đặt lại mật khẩu đổi mật khẩu: đúng chính sách qua; yếu 400; trùng email của chính mình 400 |
| 56 | ✅ | validator đăng ký / đổi / đặt lại mật khẩu đổi sang CHÍNH mật khẩu hiện tại: chỉ kiểm độ dài (Postman idempotent), nhưng vẫn phải ≥ 8 |
| 57 | ✅ | validator đăng ký / đổi / đặt lại mật khẩu đặt lại mật khẩu: kiểm độ dài + phổ biến (chưa biết user ở tầng này) |
| 58 | ✅ | validator đăng ký / đổi / đặt lại mật khẩu tạo nhân viên: chặn mật khẩu yếu và trùng SĐT |
| 59 | ✅ | validator đăng ký / đổi / đặt lại mật khẩu tạo tài khoản khách: mật khẩu tuỳ chọn, có thì phải đạt chính sách |

#### `reportExporterFormula.test.js` — 8/8

| # | Kết quả | Test |
|---|---|---|
| 1 | ✅ | buildExcel — chống formula injection (C4) payload #0 không trở thành công thức hay ô chuỗi bắt đầu bằng ký tự kích hoạt |
| 2 | ✅ | buildExcel — chống formula injection (C4) payload #1 không trở thành công thức hay ô chuỗi bắt đầu bằng ký tự kích hoạt |
| 3 | ✅ | buildExcel — chống formula injection (C4) payload #2 không trở thành công thức hay ô chuỗi bắt đầu bằng ký tự kích hoạt |
| 4 | ✅ | buildExcel — chống formula injection (C4) payload #3 không trở thành công thức hay ô chuỗi bắt đầu bằng ký tự kích hoạt |
| 5 | ✅ | buildExcel — chống formula injection (C4) payload #4 không trở thành công thức hay ô chuỗi bắt đầu bằng ký tự kích hoạt |
| 6 | ✅ | buildExcel — chống formula injection (C4) payload #5 không trở thành công thức hay ô chuỗi bắt đầu bằng ký tự kích hoạt |
| 7 | ✅ | buildExcel — chống formula injection (C4) nội dung gốc vẫn còn đọc được (chỉ thêm dấu nháy đơn phía trước) |
| 8 | ✅ | buildExcel — chống formula injection (C4) dữ liệu bình thường không bị đổi |

#### `securityHeaders.test.js` — 18/18

| # | Kết quả | Test |
|---|---|---|
| 1 | ✅ | CSP (R9) chuỗi CSP dựng đúng từ khai báo |
| 2 | ✅ | CSP (R9) script-src chỉ cho cùng origin: không unsafe-inline, không unsafe-eval, không domain ngoài |
| 3 | ✅ | CSP (R9) chống clickjacking, plugin và đổi base/form |
| 4 | ✅ | CSP (R9) chỉ mở đúng các nguồn ngoài mà frontend dùng: Google Fonts và mã QR VietQR |
| 5 | ✅ | Header bảo mật trên mọi loại response JSON API |
| 6 | ✅ | Header bảo mật trên mọi loại response danh mục công khai |
| 7 | ✅ | Header bảo mật trên mọi loại response trang tĩnh |
| 8 | ✅ | Header bảo mật trên mọi loại response 404 |
| 9 | ✅ | Header bảo mật trên mọi loại response lỗi 500 |
| 10 | ✅ | Header bảo mật trên mọi loại response Swagger UI (/api-docs) không bị CSP của ứng dụng chặn nhưng vẫn có các header còn lại |
| 11 | ✅ | HSTS chỉ khi thật sự là HTTPS HTTP thường: không có HSTS |
| 12 | ✅ | HSTS chỉ khi thật sự là HTTPS qua proxy tin cậy báo https: có HSTS 180 ngày, không includeSubDomains/preload |
| 13 | ✅ | HSTS chỉ khi thật sự là HTTPS chưa bật trust proxy: client tự gửi X-Forwarded-Proto: https KHÔNG kích hoạt HSTS |
| 14 | ✅ | Cache-Control cho API (R10) response API cá nhân là no-store |
| 15 | ✅ | Cache-Control cho API (R10) lỗi 401/500 của API cũng no-store |
| 16 | ✅ | Cache-Control cho API (R10) /api/v1/public/* không bị ép no-store |
| 17 | ✅ | Cache-Control cho API (R10) handler tự đặt Cache-Control (SSE) ghi đè được |
| 18 | ✅ | Cache-Control cho API (R10) ngoài /api/v1 (trang tĩnh) không bị đụng |

#### `securityRouteMatrix.test.js` — 22/22

| # | Kết quả | Test |
|---|---|---|
| 1 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) đọc được toàn bộ route (bắt buộc để các test dưới có nghĩa) |
| 2 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) chỉ đúng danh sách route công khai là không cần đăng nhập |
| 3 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) route chỉ cần đăng nhập (không khoá vai trò) đúng bằng danh sách đã biết |
| 4 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) webhook thanh toán đi qua paymentWebhookAuth, không qua JWT |
| 5 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) POST /invoices/:id/void chỉ cho ["admin","branch_manager"] |
| 6 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) GET /invoices/:id/export-pdf chỉ cho ["admin","branch_manager","employee"] |
| 7 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) POST /employees chỉ cho ["admin","branch_manager"] |
| 8 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) DELETE /employees/:id chỉ cho ["admin","branch_manager"] |
| 9 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) PUT /settings/pricing chỉ cho ["admin"] |
| 10 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) PUT /settings chỉ cho ["admin"] |
| 11 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) PUT /settings/branding chỉ cho ["admin"] |
| 12 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) DELETE /customers/:id chỉ cho ["admin"] |
| 13 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) GET /reports/export-excel chỉ cho ["admin","branch_manager"] |
| 14 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) GET /activity-logs chỉ cho ["admin","branch_manager"] |
| 15 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) GET /branches chỉ cho ["admin"] |
| 16 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) PUT /bookings/:id chỉ cho ["admin","branch_manager","employee"] |
| 17 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) POST /payments/checkout chỉ cho ["admin","branch_manager","employee"] |
| 18 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) POST /vouchers chỉ cho ["admin","branch_manager"] |
| 19 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) POST /goods-receipts chỉ cho ["admin","branch_manager","employee"] |
| 20 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) POST /inventory/adjustments chỉ cho ["admin","branch_manager","employee"] |
| 21 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) mọi route /my-orders chỉ dành cho khách |
| 22 | ✅ | Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1) không route nào cho khách (customer) ghi vào dữ liệu vận hành ngoài đặt/huỷ sân và đơn của mình |

#### `securityTokensAndSecrets.test.js` — 11/11

| # | Kết quả | Test |
|---|---|---|
| 1 | ✅ | Token (A4) access token hợp lệ được nhận |
| 2 | ✅ | Token (A4) refresh token không dùng làm access token được, và ngược lại |
| 3 | ✅ | Token (A4) token đặt lại mật khẩu không dùng làm access token được |
| 4 | ✅ | Token (A4) alg "none" bị từ chối |
| 5 | ✅ | Token (A4) đổi chữ ký hoặc ký bằng secret khác bị từ chối |
| 6 | ✅ | Token (A4) token hết hạn bị từ chối |
| 7 | ✅ | Token (A4) access token do server phát có hạn dùng (không vô thời hạn) |
| 8 | ✅ | Refresh token lưu dạng hash (A5b) hash sha256 hex 64 ký tự, khác token gốc, so khớp đúng |
| 9 | ✅ | Bí mật không rời khỏi hệ thống (E1, E2) model User mặc định không nạp passwordHash / refreshToken |
| 10 | ✅ | Bí mật không rời khỏi hệ thống (E1, E2) lỗi validation của Sequelize chỉ trả [{ field, message }], không có instance |
| 11 | ✅ | Bí mật không rời khỏi hệ thống (E1, E2) lỗi không rõ ở production chỉ trả thông điệp chung, không stack hay SQL |

#### `sessionRotation.test.js` — 15/15

| # | Kết quả | Test |
|---|---|---|
| 1 | ✅ | jwt — claim mới refresh token có jti: hai token ký trong CÙNG giây khác nhau |
| 2 | ✅ | jwt — claim mới access token mang tv = tokenVersion của user (mặc định 0) |
| 3 | ✅ | AuthService.refreshAccessToken — xoay vòng và ân hạn token hiện tại → cấp cặp MỚI, ghi hash mới + chuyển hash cũ sang previous với hạn ~30 giây (so-và-đổi) |
| 4 | ✅ | AuthService.refreshAccessToken — xoay vòng và ân hạn token cũ trong ân hạn → CHỈ access token, không xoay, không trả refresh token |
| 5 | ✅ | AuthService.refreshAccessToken — xoay vòng và ân hạn token cũ QUÁ ân hạn → 401 |
| 6 | ✅ | AuthService.refreshAccessToken — xoay vòng và ân hạn token lạ (không phải hiện tại cũng không phải previous) → 401 |
| 7 | ✅ | AuthService.refreshAccessToken — xoay vòng và ân hạn thua cuộc đua so-và-đổi (update ảnh hưởng 0 dòng) → rơi về ân hạn thay vì 500/401 |
| 8 | ✅ | AuthService.refreshAccessToken — xoay vòng và ân hạn tài khoản bị khoá → 401 ngay cả khi token đúng |
| 9 | ✅ | AuthService.refreshAccessToken — xoay vòng và ân hạn access token cấp ra mang tokenVersion hiện tại của user |
| 10 | ✅ | logout / đổi mật khẩu tăng token_version và xoá ân hạn logout: refreshToken, previous_* về null và token_version tăng 1 |
| 11 | ✅ | logout / đổi mật khẩu tăng token_version và xoá ân hạn đổi mật khẩu: token_version + 1, previous_* xoá, access token trả về mang version MỚI |
| 12 | ✅ | authMiddleware — so tv với token_version tv khớp → qua |
| 13 | ✅ | authMiddleware — so tv với token_version tv lệch (đã logout/đổi mật khẩu) → 401 |
| 14 | ✅ | authMiddleware — so tv với token_version token phát TRƯỚC khi có cột (không có tv) vẫn dùng được khi version = 0 |
| 15 | ✅ | authMiddleware — so tv với token_version token cũ không có tv bị thu hồi sau lần tăng version đầu tiên |

**Cộng Backend — test đơn vị / tích hợp không cần DB (backend/tests): 210/210**

### Backend — test bảo mật cần DB (backend/tests-security, chạy bằng `npm run test:security`)

#### `auth-session.security.test.js` — 24/24

| # | Kết quả | Test |
|---|---|---|
| 1 | ✅ | Phiên đăng nhập (A5, A6) A5c: sau logout, refresh token cũ bị từ chối |
| 2 | ✅ | Phiên đăng nhập (A5, A6) A1: sai mật khẩu và sai tài khoản cho cùng mã + thông điệp |
| 3 | ✅ | Phiên đăng nhập (A5, A6) A9b: đăng ký kèm role/roleId vẫn là customer |
| 4 | ✅ | Phiên đăng nhập (A5, A6) token tạo sẵn dùng được (đối chứng cho helpers) |
| 5 | ✅ | Phiên đăng nhập (A5, A6) R1/A6b: đổi mật khẩu thu hồi phiên mật khẩu cũ sai (400) không làm refresh token đang dùng mất hiệu lực |
| 6 | ✅ | Phiên đăng nhập (A5, A6) R1/A6b: đổi mật khẩu thu hồi phiên đổi mật khẩu thành công trả cặp token mới |
| 7 | ✅ | Phiên đăng nhập (A5, A6) R1/A6b: đổi mật khẩu thu hồi phiên thiết bị khác: refresh token cũ bị từ chối |
| 8 | ✅ | Phiên đăng nhập (A5, A6) R1/A6b: đổi mật khẩu thu hồi phiên thiết bị đang đổi: refresh token mới đổi được access token |
| 9 | ✅ | Phiên đăng nhập (A5, A6) R1/A6b: đổi mật khẩu thu hồi phiên thiết bị đang đổi: refresh token trước khi đổi cũng bị từ chối |
| 10 | ✅ | Phiên đăng nhập (A5, A6) R1/A6b: đổi mật khẩu thu hồi phiên access token mới gọi được /auth/me |
| 11 | ✅ | Phiên đăng nhập (A5, A6) R1/A6b: đổi mật khẩu thu hồi phiên đăng nhập bằng mật khẩu cũ bị từ chối sau khi đổi |
| 12 | ✅ | Phiên đăng nhập (A5, A6) R3/A5a: refresh token xoay vòng — cấp refresh token MỚI, token mới dùng được |
| 13 | ✅ | Phiên đăng nhập (A5, A6) R4/A6a: access token hết hiệu lực ngay sau logout |
| 14 | ✅ | Phiên đăng nhập (A5, A6) R2/A3: chính sách mật khẩu đăng ký với "123456" bị từ chối, kèm thông điệp cụ thể |
| 15 | ✅ | Phiên đăng nhập (A5, A6) R2/A3: chính sách mật khẩu đăng ký với mật khẩu mạnh được nhận |
| 16 | ✅ | Phiên đăng nhập (A5, A6) R2/A3: chính sách mật khẩu đổi mật khẩu sang mật khẩu quá ngắn → 400 |
| 17 | ✅ | Phiên đăng nhập (A5, A6) R2/A3: chính sách mật khẩu đổi mật khẩu sang mật khẩu phổ biến → 400 |
| 18 | ✅ | Phiên đăng nhập (A5, A6) R2/A3: chính sách mật khẩu đổi mật khẩu sang mật khẩu phổ biến + đuôi số/ký hiệu → 400 |
| 19 | ✅ | Phiên đăng nhập (A5, A6) R2/A3: chính sách mật khẩu đổi mật khẩu sang mật khẩu dãy bàn phím → 400 |
| 20 | ✅ | Phiên đăng nhập (A5, A6) R2/A3: chính sách mật khẩu đổi mật khẩu sang mật khẩu mật khẩu demo công khai → 400 |
| 21 | ✅ | Phiên đăng nhập (A5, A6) R2/A3: chính sách mật khẩu đổi mật khẩu sang mật khẩu lặp một ký tự → 400 |
| 22 | ✅ | Phiên đăng nhập (A5, A6) R2/A3: chính sách mật khẩu đổi mật khẩu sang mật khẩu dài hơn 72 byte → 400 |
| 23 | ✅ | Phiên đăng nhập (A5, A6) R2/A3: chính sách mật khẩu đổi mật khẩu sang mật khẩu chứa SĐT của chính mình → 400 |
| 24 | ✅ | Phiên đăng nhập (A5, A6) R2/A3: chính sách mật khẩu bị từ chối thì phiên hiện có không bị thu hồi |

#### `authz.security.test.js` — 25/25

| # | Kết quả | Test |
|---|---|---|
| 1 | ✅ | B1: khách không vào được khu nhân viên get /api/v1/employees → 403 |
| 2 | ✅ | B1: khách không vào được khu nhân viên get /api/v1/customers → 403 |
| 3 | ✅ | B1: khách không vào được khu nhân viên get /api/v1/reports/dashboard → 403 |
| 4 | ✅ | B1: khách không vào được khu nhân viên get /api/v1/activity-logs → 403 |
| 5 | ✅ | B1: khách không vào được khu nhân viên put /api/v1/settings → 403 |
| 6 | ✅ | B1: khách không vào được khu nhân viên get /api/v1/branches → 403 |
| 7 | ✅ | B1: khách không vào được khu nhân viên get /api/v1/courts → 403 |
| 8 | ✅ | B1: khách không vào được khu nhân viên không token → 401 ở route cần đăng nhập |
| 9 | ✅ | B2: khách không đụng được dữ liệu của khách khác xem booking của người khác → bị chặn |
| 10 | ✅ | B2: khách không đụng được dữ liệu của khách khác huỷ booking của người khác → bị chặn và booking còn nguyên |
| 11 | ✅ | B2: khách không đụng được dữ liệu của khách khác danh sách booking của người lạ không chứa booking này |
| 12 | ✅ | B2: khách không đụng được dữ liệu của khách khác xem hồ sơ và lịch sử của khách khác → bị chặn |
| 13 | ✅ | B3: nhân viên chi nhánh này không đụng được chi nhánh khác nhân viên CN2 GET /api/v1/courts/8 (dữ liệu CN3) → bị chặn |
| 14 | ✅ | B3: nhân viên chi nhánh này không đụng được chi nhánh khác nhân viên CN2 GET /api/v1/invoices/12 (dữ liệu CN3) → bị chặn |
| 15 | ✅ | B3: nhân viên chi nhánh này không đụng được chi nhánh khác nhân viên CN2 GET /api/v1/sales-orders/12 (dữ liệu CN3) → bị chặn |
| 16 | ✅ | B3: nhân viên chi nhánh này không đụng được chi nhánh khác nhân viên CN2 GET /api/v1/goods-receipts/6 (dữ liệu CN3) → bị chặn |
| 17 | ✅ | B3: nhân viên chi nhánh này không đụng được chi nhánh khác X-Branch-Id khác chi nhánh của mình → 403 |
| 18 | ✅ | B3: nhân viên chi nhánh này không đụng được chi nhánh khác khách gửi X-Branch-Id → 403 |
| 19 | ✅ | B3: nhân viên chi nhánh này không đụng được chi nhánh khác R8: GET /sessions/:id/extras của phiên chi nhánh khác bị chặn |
| 20 | ✅ | E1: không rò trường bí mật admin GET /api/v1/auth/me |
| 21 | ✅ | E1: không rò trường bí mật admin GET /api/v1/employees |
| 22 | ✅ | E1: không rò trường bí mật admin GET /api/v1/customers |
| 23 | ✅ | E1: không rò trường bí mật managerCn2 GET /api/v1/employees |
| 24 | ✅ | E1: không rò trường bí mật customer GET /api/v1/auth/me |
| 25 | ✅ | E1: không rò trường bí mật employeeCn2 GET /api/v1/customers |

#### `group-a.security.test.js` — 13/13

| # | Kết quả | Test |
|---|---|---|
| 1 | ✅ | R6: không lộ trạng thái khoá khi chưa biết mật khẩu mật khẩu sai → 401 (giống tài khoản không tồn tại) |
| 2 | ✅ | R6: không lộ trạng thái khoá khi chưa biết mật khẩu mật khẩu đúng → 403 vô hiệu hóa |
| 3 | ✅ | R11: đầu vào sai trả 400, không 500 báo cáo: from không có thật → 400 |
| 4 | ✅ | R11: đầu vào sai trả 400, không 500 báo cáo: from là chữ → 400 |
| 5 | ✅ | R11: đầu vào sai trả 400, không 500 báo cáo: năm 5 chữ số → 400 |
| 6 | ✅ | R11: đầu vào sai trả 400, không 500 báo cáo: period lạ → 400 |
| 7 | ✅ | R11: đầu vào sai trả 400, không 500 báo cáo hợp lệ vẫn 200 |
| 8 | ✅ | R11: đầu vào sai trả 400, không 500 tạo khách với họ tên 300 ký tự → 400 |
| 9 | ✅ | R11: đầu vào sai trả 400, không 500 id ngoài miền INT → 400 |
| 10 | ✅ | R12: cài đặt được kiểm kiểu PUT /settings/pricing giá là chữ → 400 |
| 11 | ✅ | R12: cài đặt được kiểm kiểu PUT /settings/operating-hours giờ sai → 400 |
| 12 | ✅ | R12: cài đặt được kiểm kiểu PUT /settings khoá lạ → 400 |
| 13 | ✅ | R12: cài đặt được kiểm kiểu ghi lại đúng giờ mở cửa hiện có vẫn 200 (không làm hỏng nút Lưu) |

#### `group-d.security.test.js` — 3/3

| # | Kết quả | Test |
|---|---|---|
| 1 | ✅ | R15: độ dài một lượt đặt khách đặt 6 giờ liền bị 400 với thông điệp rõ |
| 2 | ✅ | R15: độ dài một lượt đặt khách đặt đúng 3 giờ được nhận (dò khung trống) |
| 3 | ✅ | R15: độ dài một lượt đặt nhân viên đặt 6 giờ cho khách quầy vẫn được (dò ngày/khung còn trống) |

#### `security-headers.security.test.js` — 9/9

| # | Kết quả | Test |
|---|---|---|
| 1 | ✅ | F1: header bảo mật trên app thật danh mục công khai có đủ header |
| 2 | ✅ | F1: header bảo mật trên app thật lỗi 401 có đủ header |
| 3 | ✅ | F1: header bảo mật trên app thật route không tồn tại có đủ header |
| 4 | ✅ | F1: header bảo mật trên app thật HTTP thường không nhận HSTS; qua proxy báo https thì app (chưa bật trust proxy) cũng không tin client |
| 5 | ✅ | F5: response cá nhân là no-store khách GET customer |
| 6 | ✅ | F5: response cá nhân là no-store khách GET customer |
| 7 | ✅ | F5: response cá nhân là no-store nhân viên GET employeeCn2 |
| 8 | ✅ | F5: response cá nhân là no-store admin GET admin |
| 9 | ✅ | F5: response cá nhân là no-store lỗi 401 của API cũng no-store |

#### `session-rotation.security.test.js` — 12/12

| # | Kết quả | Test |
|---|---|---|
| 1 | ✅ | R3: xoay vòng refresh token và ân hạn hai request refresh CÙNG token đồng thời: cả hai 200, đúng một bên được refresh token mới |
| 2 | ✅ | R3: xoay vòng refresh token và ân hạn token mới (bên thắng cuộc) dùng được và xoay tiếp |
| 3 | ✅ | R3: xoay vòng refresh token và ân hạn token cũ vẫn trong ân hạn → access token (không có refresh token mới) |
| 4 | ✅ | R3: xoay vòng refresh token và ân hạn token cũ QUÁ ân hạn → 401 |
| 5 | ✅ | R3: xoay vòng refresh token và ân hạn token hiện tại vẫn còn hiệu lực sau khi ân hạn của token cũ đã hết |
| 6 | ✅ | R3: xoay vòng refresh token và ân hạn /auth/me không lộ trường mới (token_version, previous_*) |
| 7 | ✅ | R4: access token bị thu hồi ngay token phát trước khi có cột (không có tv) vẫn dùng được ở version 0 |
| 8 | ✅ | R4: access token bị thu hồi ngay cả hai thiết bị đang dùng được trước khi đổi mật khẩu |
| 9 | ✅ | R4: access token bị thu hồi ngay B đổi mật khẩu: access token của A bị 401 NGAY, access token mới của B dùng được |
| 10 | ✅ | R4: access token bị thu hồi ngay luồng SSE (?token=) cũng từ chối access token đã bị thu hồi |
| 11 | ✅ | R4: access token bị thu hồi ngay refresh token mới của B cấp được access token hợp lệ (mang version mới) |
| 12 | ✅ | R4: access token bị thu hồi ngay logout: access token và refresh token đều hết hiệu lực ngay |

**Cộng Backend — test bảo mật cần DB (backend/tests-security, chạy bằng `npm run test:security`): 86/86**

### Frontend — Vitest

#### `passwordRules.test.js` — 11/11

| # | Kết quả | Test |
|---|---|---|
| 1 | ✅ | passwordRules — khớp chính sách backend hằng số đúng như đã duyệt |
| 2 | ✅ | passwordRules — khớp chính sách backend "" → lỗi=true |
| 3 | ✅ | passwordRules — khớp chính sách backend "1234567" → lỗi=true |
| 4 | ✅ | passwordRules — khớp chính sách backend "12345678" → lỗi=false |
| 5 | ✅ | passwordRules — khớp chính sách backend "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" → lỗi=false |
| 6 | ✅ | passwordRules — khớp chính sách backend "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" → lỗi=true |
| 7 | ✅ | passwordRules — khớp chính sách backend tính theo byte UTF-8: 25 chữ "ệ" (75 byte) quá dài |
| 8 | ✅ | passwordRules — khớp chính sách backend không phải chuỗi → lỗi |
| 9 | ✅ | serverMessage ưu tiên lỗi từng trường (msg của express-validator) |
| 10 | ✅ | serverMessage dùng errors[0].message nếu không có msg |
| 11 | ✅ | serverMessage rơi về message chung rồi fallback |

#### `sessionTokens.test.js` — 9/9

| # | Kết quả | Test |
|---|---|---|
| 1 | ✅ | storeSessionTokens — lưu cặp token mới sau khi đổi mật khẩu ghi cả hai khi server trả đủ |
| 2 | ✅ | storeSessionTokens — lưu cặp token mới sau khi đổi mật khẩu bỏ qua và KHÔNG xoá token đang có khi dữ liệu là null |
| 3 | ✅ | storeSessionTokens — lưu cặp token mới sau khi đổi mật khẩu bỏ qua và KHÔNG xoá token đang có khi dữ liệu là undefined |
| 4 | ✅ | storeSessionTokens — lưu cặp token mới sau khi đổi mật khẩu bỏ qua và KHÔNG xoá token đang có khi dữ liệu là object rỗng |
| 5 | ✅ | storeSessionTokens — lưu cặp token mới sau khi đổi mật khẩu bỏ qua và KHÔNG xoá token đang có khi dữ liệu là thiếu refresh |
| 6 | ✅ | storeSessionTokens — lưu cặp token mới sau khi đổi mật khẩu bỏ qua và KHÔNG xoá token đang có khi dữ liệu là thiếu access |
| 7 | ✅ | storeSessionTokens — lưu cặp token mới sau khi đổi mật khẩu bỏ qua và KHÔNG xoá token đang có khi dữ liệu là chuỗi rỗng |
| 8 | ✅ | storeSessionTokens — lưu cặp token mới sau khi đổi mật khẩu bỏ qua và KHÔNG xoá token đang có khi dữ liệu là không phải chuỗi |
| 9 | ✅ | storeSessionTokens — lưu cặp token mới sau khi đổi mật khẩu không có storage thì không ném lỗi |

**Cộng Frontend — Vitest: 20/20**

**TỔNG test mới: 316/316**
