# Kết quả 33 — Kiểm thử bảo mật

**Ngày:** 2026-10-15 · **Nhánh:** `test/ke-hoach-kiem-thu-bao-mat` · **Kế hoạch:** `32-ke-hoach-kiem-thu-bao-mat.md`
**Hai đợt:** đợt 1 dừng sau nhóm A và B theo yêu cầu của chủ dự án; đợt 2 ("test tiếp đó") làm nốt B7–B11,
C, D, E, F, G, H, test hồi quy và công cụ Docker.
**Không sửa dòng code ứng dụng nào** (`backend/src`, `frontend/src`, `services/`). Thay đổi trong repo chỉ
gồm file test mới và hai dòng cấu hình test trong `backend/package.json` (đã được duyệt ở Q4/Q5).

## 1. Môi trường đã dùng

- DB tạm `bd_sectest_32` + `bd_sectest_32_comp` (migrate + seed + `seed-demo.js`). DB dev không bị đụng.
- Backend tạm :5050 chạy giống Render (`NODE_ENV=production`, `DEMO_MODE=true`, phục vụ luôn bản build
  frontend); competition-service tạm :5150. Server của chủ dự án (:5000/:5102/:5173) không bị dừng.
- Token cho ma trận phân quyền ký bằng đúng secret của server tạm; luồng đăng nhập thật kiểm riêng ở nhóm A.
- Công cụ quét chạy trong Docker (semgrep, gitleaks, trivy, OWASP ZAP). Bản live Render: 7 request GET/OPTIONS.
- Script khám phá nằm trong scratchpad của phiên, không đưa vào repo.

## 2. Tổng kết

**Không có lỗi 🔴.** 152 kiểm tra có kết luận, 136 đạt, 16 không đạt; 16 chỗ không đạt gộp thành
**15 phát hiện**: 4 🟠 (R1, R2, R9, R13), còn lại 🟡.

| Nhóm | Kiểm tra | Đạt | Không đạt |
|---|---|---|---|
| A — Xác thực, phiên | 34 | 26 | 8 |
| B1–B6 — Phân quyền backend | 63 | 62 | 1 |
| B7–B8 — Cổng competition (vai trò × route) | 3 | 3 | 0 |
| B10–B11 — Hub công khai, luật đặt sân | 9 | 9 | 0 |
| C — Đầu vào, injection | 12 | 10 | 2 |
| D — Tiền, race condition | 13 | 13 | 0 |
| E — Rò dữ liệu | 8 | 7 | 1 |
| F — Header, CORS, cache | 6 | 2 | 4 |
| G — Tải nhỏ | 4 | 4 | 0 |
| **Cộng** | **152** | **136** | **16** |

Điểm mạnh đã chứng minh được (đáng giữ):
- **Phân quyền kín.** 344 lần gọi ma trận trên 115 route: vai trò không được phép luôn 403, ẩn danh luôn 401.
  Khách không đọc/huỷ được dữ liệu của khách khác; CN này không đọc/sửa được CN kia (đã đối chiếu DB).
  Trường cấm (`role`, `branchId`, `status`, `userId`…) bị bỏ qua.
- **Tiền và tranh chấp.** 8 request song song cùng một slot → đúng 1 booking; 5 checkout song song → đúng 1
  hoá đơn + 1 thanh toán; webhook thanh toán chưa cấu hình → 503 dù gửi secret bất kỳ; giảm giá tay vượt
  trần / thiếu lý do / âm bị chặn; giá do client gửi bị bỏ qua; không có tồn kho âm.
- **Không có secret trong repo.** gitleaks quét 204 commit: 0 secret thật (3 chuỗi là hằng số trong file
  test). Không có `.env`, khoá hay `.keys/` nào từng được commit.
- **ZAP quét chủ động API (101 URL từ openapi.yaml, 119 luật đạt, 0 cảnh báo)** và semgrep (115 luật,
  649 file) không tìm thấy lỗ hổng injection/XSS/SSRF thật.
- Hub công khai che đúng tên, không có `phone`/`email`/`userId`; giới hạn 900 req/phút hoạt động đúng
  (200×900 rồi 429 ở request thứ 901); CORS đóng với origin lạ; `/api-docs` tắt ở production.

## 3. Phát hiện

### 🟠 Nên sửa

#### R1 Đổi mật khẩu không đăng xuất các thiết bị khác (A6b)
- **Vị trí:** `backend/src/services/AuthService.js:162` (`changePassword`).
- **Hiện tượng:** sau đổi mật khẩu (200), refresh token cũ vẫn xin được access token mới (200). `resetPassword` thì có xoá.
- **Hướng sửa:** thêm `user.refreshToken = null` trước `user.save()` (1 dòng); nên trả luôn cặp token mới cho thiết bị đang đổi.

#### R2 Chính sách mật khẩu yếu (A3) — tồn đọng từ audit 08/2026 mục 7
- **Vị trí:** `backend/src/validations/authValidation.js:32, 65, 90` (chỉ `min: 6`).
- **Hiện tượng:** đăng ký thành công với `123456`, `aaaaaa`, `abcdef`.
- **Hướng sửa:** tối thiểu 8 ký tự + chặn danh sách mật khẩu phổ biến; áp cho đăng ký, đổi, reset.

#### R9 Không có header bảo mật nào (F1) — tồn đọng từ audit 08/2026 mục 6
- **Vị trí:** `backend/src/server.js` (không `helmet`), `docker/nginx.conf` (chỉ có `Cache-Control`); bản live Render y hệt.
- **Hiện tượng:** cả trang SPA, API JSON và lỗi 401 đều thiếu `Content-Security-Policy`, `X-Frame-Options`
  (chống nhúng iframe), `X-Content-Type-Options`, `Strict-Transport-Security`, `Referrer-Policy`,
  `Permissions-Policy`. ZAP baseline: 8 cảnh báo, phần lớn là header (còn lại: thiếu SRI, nội dung cache được).
- **Hướng sửa:** `helmet` ở backend + `add_header` ở nginx; CSP cần thử với Vite/React (inline style, SSE, ảnh).
  HSTS chỉ bật khi chắc chắn luôn HTTPS.

#### R13 Thư viện có lỗ hổng mức Cao/Nghiêm trọng (H1, H12)
`npm audit --omit=dev` và trivy cho kết quả khớp nhau:

| Gói | Dự án | Vấn đề | Ảnh hưởng thực tế ở hệ thống này |
|---|---|---|---|
| `proxy-addr` 2.0.7 (qua `express`) | backend | 🔴 theo bảng điểm: giả IP qua subnet IPv4-mapped IPv6 (sửa ở 2.0.8) | Thấp: `TRUST_PROXY_HOPS` là số bước, không phải danh sách subnet. Vẫn nên cập nhật vì IP là khoá của rate limit |
| `nodemailer` 9.0.5 | backend | 7 lỗi cao: bỏ qua kiểm tra miền người nhận, DoS parser địa chỉ, lộ thông tin SMTP chéo | Thấp: chỉ gửi mail đặt lại mật khẩu, người nhận lấy từ DB |
| `tar` 6.2.1 (qua `bcrypt` → `node-pre-gyp`) | backend | 🔴 ghi đè file khi giải nén tar | Rất thấp: chỉ chạy lúc `npm install`, không chạy ở runtime |
| `axios` ≥1.7 <1.20 | frontend | 12 lỗi cao: prototype pollution gadget, ReDoS, SSRF qua redirect | Thấp: cần có nguồn prototype pollution khác; trình duyệt không dùng adapter http/proxy |
| `brace-expansion` | backend | DoS | Chỉ dev/test |

- **Hướng sửa:** `npm update proxy-addr express nodemailer` (backend), `axios` ≥ 1.20 (frontend), chạy lại `npm audit`.
  competition-service không có lỗi cao ở dependency runtime.

### 🟡 Ghi nhận

#### R3 Refresh token không xoay vòng (A5a) — audit mục 4
`AuthService.js:98–127`. Một refresh token dùng 2 lần đều 200. Đã tốt: lưu sha256 (A5b), logout và đăng nhập nơi khác vô hiệu nó (A5c).
Sửa: cấp refresh mới mỗi lần, dùng lại token cũ thì thu hồi cả phiên; cần sửa `apiClient` lưu token mới.

#### R4 Access token còn dùng được tới 15 phút sau logout / đổi mật khẩu (A6a, A6c)
`middleware/authMiddleware.js:29`. Khoá tài khoản thì chặn ngay (A6d đạt). Sửa: cột `token_version` trong `users` + token, so khớp ở middleware (user đã được nạp sẵn).

#### R5 Dò SĐT/email đã đăng ký qua thời gian đăng nhập (A1b)
`AuthService.js:57`. Trung vị 5,7 ms (không có tài khoản) so với 70,3 ms (có tài khoản, sai mật khẩu). Sửa: luôn `bcrypt.compare` với hash giả khi không tìm thấy user.

#### R6 Lộ trạng thái "bị khoá" khi chưa biết mật khẩu (A1c)
`AuthService.js:59`. Mật khẩu sai + tài khoản khoá → 403 "đã bị vô hiệu hóa". Sửa: so mật khẩu trước.

#### R7 Đăng ký báo SĐT/email đã có tài khoản (A9) — audit mục 11
`AuthService.js:281, 293`. Đánh đổi trải nghiệm (giúp khách biết đi "Quên mật khẩu"); limiter đăng ký 5/giờ/IP làm chậm việc dò. **Cần chủ dự án quyết.**

#### R8 Nhân viên chi nhánh khác đọc được phụ kiện của phiên chơi (B3)
`services/AccessoryService.js:157` (`getSessionExtras` chỉ lọc `sessionId`). Chỉ đọc, không có dữ liệu khách; thêm/trả phụ kiện chéo chi nhánh đã bị chặn.

#### R10 Response cá nhân không có `Cache-Control` (F5)
`/auth/me`, `/bookings`, `/customers` trả không kèm `Cache-Control`. Trình duyệt dùng chung hoặc proxy có thể lưu. Sửa: `no-store` cho mọi response đã đăng nhập (một middleware).

#### R11 Dữ liệu sai kiểu/độ dài gây 500 thay vì 400 (C1c, C2, D3b)
- `GET /reports/revenue?from=abc` (và `2026-13-45`, `99999-01-01`) → 500: không validate ngày.
- `POST /customers` với `fullName` 300 ký tự → 500: không giới hạn độ dài (vượt cột DB).
- `POST /sales-orders` với `customerId` 9999999999999 → 500 (ngoài miền số nguyên).
- 5 checkout song song cùng một phiên: 1 thành công, 4 trả 500 `ER_LOCK_DEADLOCK`. **Dữ liệu vẫn nhất quán** (1 hoá đơn, 1 thanh toán), nhưng nên trả 409 / thử lại.
- Không lộ stack hay SQL ở production (E2a đạt); chỉ là lỗi xử lý đầu vào.

#### R12 `PUT /settings/pricing|operating-hours|branding` lưu nguyên body, không validate
`controllers/settingController.js`. Chỉ admin gọi được, nhưng `{"peakPrice":"abc"}` được lưu (200) và đi vào cấu hình giá. Code đọc giờ cao điểm có fallback nên không crash. Sửa: schema cho từng khoá.

#### R14 Cấu hình hạ tầng (H12, semgrep)
- GitHub Actions dùng tag di động `@v4` (9 chỗ trong `ci.yml` và `demo-reset.yml`): nên ghim theo SHA.
- `docker/nginx.conf` chuyển tiếp `$host` do client gửi (3 chỗ): chấp nhận được khi chỉ có một vhost; nên đặt `server_name` cố định.
- `docker/frontend.Dockerfile`: image nginx chạy master bằng root (trivy DS-0002); cân nhắc `nginxinc/nginx-unprivileged`.
- Token SSE nằm trong URL `?token=` (A11, ZAP info "Sensitive Information in URL"): đã tắt access log ở nginx cho 2 luồng SSE; nguy cơ còn lại là log của proxy phía trước (Cloudflare/Render).

#### R15 Giới hạn 3 giờ/lượt đặt chỉ ở giao diện (B11e)
`POST /bookings` nhận 08:00–14:00 (6 giờ) từ khách. Quy tắc nghiệp vụ, chủ dự án quyết có cần chặn ở server không.

## 4. Bảng trạng thái theo kế hoạch 32

| Mục | Kết quả | Ghi chú |
|---|---|---|
| A1 | ❌ | Thông điệp giống nhau ✅; thời gian ❌ (R5); trạng thái khoá ❌ (R6) |
| A2 | ✅ | Đăng nhập: lần 11 bị 429, đổi `X-Forwarded-For` không lách được; refresh: lần 31 bị 429 |
| A3 | ❌ | R2 |
| A4 | ✅ | 8 loại token lạ → 401; claim `role` trong token bị bỏ qua |
| A5 | ❌ | Không xoay vòng (R3); lưu hash ✅; logout thu hồi ✅ |
| A6 | ❌ | R1, R4; khoá tài khoản chặn ngay ✅ |
| A7, A8, A10 | ✅ | Link reset 1 lần / hết hạn / của người khác; quên mật khẩu không lộ email; tài khoản demo bị khoá (403) |
| A9 | ❌ | R7; gửi kèm `role`/`roleId` khi đăng ký vẫn ra `customer` ✅ |
| A11 | ⚠️ | R14 |
| A12 | ✅ | 24 unit test |
| B1–B6 | ❌ (1) | Chỉ lệch R8 |
| B7–B8 | ✅ | Với body hợp lệ: ẩn danh 401; khách và nhân viên tạo giải → 403; QL CN2 tạo giải cho CN3 → 403; `ops`/`events` → 404 kể cả admin. Lưu ý nhỏ: body rỗng khiến khách nhận 400 (validate trước scope) |
| B9 | ⏸ | Chưa kiểm gọi thẳng competition-service không token (cổng 5150 chỉ lắng nghe 127.0.0.1) |
| B10 | ✅ | Ẩn danh: không `phone`/`email`/`userId`/`customerId`/`externalRef`; có người bị che `{masked:true}` |
| B11 | ✅ | >14 ngày (khách) bị chặn, nhân viên không; slot đã qua, ngoài 05:00–23:00 bị chặn; R15 |
| C1 | ❌ | Chuỗi SQL trong `?search`: không đổi kết quả, `users` còn nguyên ✅; ngày sai ở báo cáo → 500 (R11). Đọc mã: mọi `literal`/`fn` chỉ nhúng số tính phía server |
| C2 | ❌ | R11 |
| C3 | ✅ | Thẻ HTML lưu nguyên văn dạng chuỗi; frontend không có `dangerouslySetInnerHTML`/`innerHTML`/`eval` |
| C4 | ⏸ | Xuất Excel: dựa vào test sẵn có của mục 1 tiến độ, chưa chạy lại |
| C5–C8 | ✅ | `__proto__`, body 300 KB → 413, JSON lồng 2000 tầng → 400, 6 đường dẫn traversal, `Content-Disposition` an toàn |
| D1 | ✅ | Webhook chưa cấu hình → 503; 107 unit test thanh toán/voucher/giảm giá pass |
| D2 | ⏸ | Webhook competition: dựa vào `competitionWebhook`/`Signature` unit test, chưa gửi thật |
| D3 | ✅ | Booking, checkout, voucher (xem lưu ý dưới) |
| D4–D6 | ✅ | |
| D7, D8 | ⏸ | Phí sân chuyển sân / void: dựa vào unit test, chưa chạy trên server |
| E1–E3, E5, E6 | ✅ | 40 response của 5 vai trò + công khai: không `passwordHash`/`refreshToken`/hash bcrypt/JWT/instance/stack/SQL |
| E2 | ❌ | Không lộ chi tiết nhưng có 500 (R11) |
| E4 | ⏸ | Log/ActivityLog: dựa vào migration scrub, chưa quét lại |
| F1 | ❌ | R9 |
| F2 | ✅ | `https://evil.example`, `null`, `localhost:5173`: không có `Access-Control-Allow-Origin` |
| F3, F4 | ⏸ | Token trong `localStorage` (R14 phần liên quan, audit mục 5); clickjacking chưa dựng trang thử — suy ra từ R9 |
| F5 | ❌ | R10 |
| F6 | ⏸ | Chưa walk giao diện bằng Chrome |
| G1 | ⏸ | Giới hạn SSE: dựa vào `competitionStreamGuard` unit test |
| G2–G5 | ✅ | Hub 900/phút; `/public/availability/day`: 300 request dồn → 0 lỗi, **không có limiter** (ghi nhận); báo cáo 100 năm 219 ms; `limit` bị chặn trên (100) |
| G6 | ⏸ | k6 chưa chạy |
| H1, H12 | ❌ | R13 |
| H2, H11 | ✅ | 0 secret thật trong 204 commit |
| H3–H5 | ✅ | Dockerfile non-root, `.dockerignore` loại `.env`/`.keys`, MySQL chỉ bind 127.0.0.1, secret Render do `generateValue`; R14 |
| H6–H8 | ⏸ | TLS DB/seed guard: có unit test (`dbSsl`, `demoSeedGuard`); workflow reset chưa rà quyền token |
| H9 | ✅ | Live Render: không header bảo mật (R9), CORS đóng, `/api-docs` 404, `/health` chỉ `status/time/version/ip` |
| H10 | ✅ | semgrep 13 phát hiện mức WARNING, không lỗi thật (R14) |
| H13 | ✅ | ZAP baseline 8 cảnh báo header (R9); ZAP API 0 cảnh báo, 4 mục thông tin |

**Lưu ý D3c (voucher):** 4 đơn online tiền mặt cùng dùng voucher giới hạn 1 lượt đều được tạo và đều hiện giảm
5.000đ; lượt dùng chỉ bị trừ lúc thanh toán. Khi nhân viên checkout, đơn đầu thành công, ba đơn sau bị từ chối
"Mã giảm giá đã hết lượt sử dụng". Đây là thiết kế (đơn tiền mặt chưa giữ lượt), không mất tiền, nhưng khách có
thể thấy giá thay đổi tại quầy.

## 5. Test hồi quy đã thêm (Q4, Q5)

| File | Số test | Nội dung |
|---|---|---|
| `backend/tests/securityRouteMatrix.test.js` | 22 | Đọc quyền thật từ `router.stack`: chỉ 12 route công khai, đúng 11 route "chỉ cần đăng nhập" (các route cần kiểm sở hữu), 16 route nhạy cảm đúng vai trò, `/my-orders` chỉ khách, khách chỉ ghi được 4 route. Thêm route mới thiếu quyền là đỏ |
| `backend/tests/securityTokensAndSecrets.test.js` | 11 | Token sai loại/chữ ký/`alg: none`/hết hạn bị từ chối; refresh lưu hash; `User` mặc định không nạp mật khẩu/token; errorHandler không trả `instance`/SQL |
| `backend/tests-security/*.security.test.js` | 33 | Tầng cần DB: phiên đăng nhập, IDOR giữa khách, chéo chi nhánh, rò dữ liệu. Có 5 `test.failing` cho lỗi đã biết R1, R2, R3, R4, R8 — khi sửa xong test báo đỏ để đổi thành `test` |

- `npm test` (backend): **49 suite, 660 test pass** (trước đó 627; +33). `tests-security` bị loại khỏi `npm test`
  bằng `jest.testPathIgnorePatterns` trong `package.json`.
- `npm run test:security`: **2 suite, 33 test pass** trên DB tạm. Chạy: `DB_NAME_TEST=<db đã migrate + seed, tên có chữ "test"> npm run test:security`.
  Có chốt chặn: từ chối chạy nếu tên DB không chứa chữ "test".
- **Khác kế hoạch:** kế hoạch ghi 4 file tầng 1; thực tế gộp "token" và "bí mật" thành một file, và phần
  "ownership" làm ở tầng 2 (cần DB mới có ý nghĩa). Không có test cho C4/D2/D7 ở tầng 1.

## 6. Việc chưa làm hoặc làm một phần

- B9, C4, D2, D7, D8, E4, F3, F4, F6, G1, G6, H6–H8: dựa vào unit test sẵn có hoặc chưa chạy (xem bảng §4).
- trivy chỉ quét lockfile + file cấu hình Docker; **chưa quét image** đã build (lần quét cả repo qua bind mount
  Windows quá chậm, đã dừng). Không build image mới.
- ZAP quét chủ động API chỉ bằng token **khách** (không dùng token admin để khỏi sửa/xoá dữ liệu trong DB tạm
  mà chủ dự án muốn xem), nên các route nhân viên chủ yếu trả 403 trong lần quét đó; phần phân quyền chức năng
  đã được nhóm B bù lại.
- Chưa kiểm trên điện thoại thật, Safari/Firefox, hay trình đọc màn hình.

## 7. Đề xuất thứ tự sửa (mỗi nhóm một nhánh + kế hoạch riêng, chờ chủ dự án chọn)

1. **R1** — một dòng.
2. **R9 + R10** — header + `no-store`: một middleware và vài dòng nginx; cần thử CSP trên giao diện thật.
3. **R13** — cập nhật `express`/`proxy-addr`, `nodemailer`, `axios`; chạy lại test.
4. **R5, R6, R8, R11, R12** — vá nhỏ, gom một nhánh.
5. **R3 + R4** — cần migration `token_version` và sửa `apiClient`.
6. **R2** — cần quyết định chính sách mật khẩu.
7. **R7, R15, R14** — cần quyết định của chủ dự án.

## 8. Trạng thái môi trường khi viết báo cáo

Giữ lại theo yêu cầu chủ dự án, chờ "dọn đi":

- Server tạm: backend :5050 (PID 1136), competition :5150 (PID 21108); DB `bd_sectest_32`, `bd_sectest_32_comp`;
  bản build frontend và log trong scratchpad `sec/`. DB tạm đã bị test thay đổi (booking, đơn, voucher
  `SECTEST3`/`RACE1`, giải `SecTest phân quyền`, khách do test đăng ký).
- **Docker (xoá sau khi chủ dự án xác nhận, theo Q3):** image `semgrep/semgrep:latest` (1,56 GB),
  `zricethezav/gitleaks:latest` (76,6 MB), `aquasec/trivy:latest` (262 MB),
  `ghcr.io/zaproxy/zaproxy:stable` (3,76 GB), volume `bd-sec-trivy-cache`. Không còn container nào chạy.
  Các image có sẵn từ trước (`bdcomp-*`, `bd-app-demo`, `node`, `nginx`, `mysql`) không bị đụng và **không** nằm trong danh sách xoá.
- Docker Desktop do mình mở ở bước công cụ quét; có thể tự đóng sau khi dọn xong.
