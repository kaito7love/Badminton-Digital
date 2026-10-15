# 38 — Tổng hợp toàn bộ kết quả kiểm thử bảo mật (để kiểm tra)

**Ngày:** 2026-10-16 · **Nhánh:** `test/ke-hoach-kiem-thu-bao-mat` · **Commit được kiểm:** `3823ef8` (`main` vẫn `83e8f8b`, chưa push)
**Nguồn số liệu:** (1) lần chạy **mới** hôm nay trên worktree sạch (`npm ci` đúng lockfile, DB tạm riêng đã xoá sau khi chạy);
(2) các báo cáo đã ghi trong đợt: `33-ket-qua-kiem-thu-bao-mat.md` (đặc biệt §9), `34`–`37-*.md` (mục "Kết quả").
Phụ lục liệt kê từng test mới: `38b-phu-luc-danh-sach-test-moi.md`.

> **Lưu ý trung thực về bằng chứng.** Khi bạn bảo "dọn đi", mình đã xoá script, log thô và báo cáo của các công cụ quét
> (ZAP, semgrep, gitleaks, trivy), các server tạm và DB tạm. Phần **(A) bộ test tự động** dưới đây được **chạy lại hôm nay** và
> bạn tự chạy lại được bằng lệnh ở §7. Phần **(C) kiểm thật bằng trình duyệt/HTTP và công cụ quét** là kết quả **đã ghi lại trong
> các báo cáo** ở thời điểm chạy; log thô không còn — muốn thấy lại thì cần chạy lại (mình làm được nếu bạn yêu cầu).

---

## 1. Kết luận một trang

| | Kết quả |
|---|---|
| Lỗ hổng mức 🔴 nghiêm trọng | **0** |
| Phát hiện tổng cộng | **17** (R1–R17): **13 đã sửa**, **1 sửa một phần** (R14), **1 chấp nhận** (R7), **2 còn mở/thông tin** (R16, R17) |
| Test tự động mới thêm | **316** (backend không cần DB 210 · backend cần DB 86 · frontend 20) — **316/316 pass** |
| Bộ test hiện có + mới | backend **837** (834–835 pass; 2–3 đỏ **toàn bộ trong 1 file flake đã biết**, xem §3.2) · backend cần DB **86/86** · Vitest **493/493** · build frontend OK |
| Thay đổi cần bạn làm | `npm ci` (backend + frontend), `npm run migrate` (1 migration mới), quyết định merge `main`/push |

---

## 2. Phạm vi đã kiểm (kế hoạch 32 → báo cáo 33)

Chuẩn tham chiếu: OWASP ASVS 4.0 mức 2 + OWASP API Security Top 10 (2023). Môi trường: DB và server tạm riêng (chạy `NODE_ENV=production`
như Render), không đụng DB/server dev của bạn.

| Nhóm | Mã | Nội dung |
|---|---|---|
| A | A1–A12 | xác thực, phiên, refresh token, reset mật khẩu, rate limit, khoá demo |
| B | B1–B11 | phân quyền theo chức năng, IDOR, chéo chi nhánh, mass assignment, cổng competition, hub công khai, luật đặt sân |
| C | C1–C8 | SQL/injection, kiểu dữ liệu lạ, XSS lưu, formula injection Excel, prototype pollution, kích thước body, path traversal, header |
| D | D1–D8 | webhook thanh toán/competition, race condition, giảm giá, voucher, giá do client gửi, phí sân, void |
| E | E1–E6 | rò dữ liệu nhạy cảm, nội dung lỗi, log, `/api-docs`, `/health` |
| F | F1–F6 | header bảo mật, CORS, token ở `localStorage`, clickjacking, cache, truy cập URL nhân viên |
| G | G1–G6 | giới hạn SSE/hub, tải nhỏ, phân trang, báo cáo dài, k6 |
| H | H1–H13 | `npm audit`, secret trong git, Docker/compose/Render, TLS DB, seed guard, workflow, bản live, semgrep/gitleaks/trivy/ZAP |

**Đợt 1** (dừng sau A, B theo yêu cầu) → **152 kiểm tra có kết luận: 136 đạt, 16 không đạt**. **Đợt 2** làm nốt phần còn lại + nhóm E của
kế hoạch 37. Bảng từng mã bên dưới là trạng thái **sau xử lý**.

### 2.1 Bảng từng mã (ban đầu → hiện tại)

| Mã | Kiểm gì | Ban đầu | Hiện tại |
|---|---|---|---|
| A1 | đăng nhập: thông điệp/thời gian/trạng thái khoá | ❌ R5, R6 | ✅ (68,1 ms vs 67,5 ms; khoá chỉ lộ khi đúng mật khẩu) |
| A2 | rate limit login/forgot/refresh, `X-Forwarded-For` | ✅ | ✅ |
| A3 | chính sách mật khẩu | ❌ R2 | ✅ 8–72 byte, chặn phổ biến/trùng cá nhân |
| A4 | token sai chữ ký/`alg:none`/hết hạn/sai khoá/claim `role` | ✅ | ✅ |
| A5 | refresh token: hash, thu hồi, xoay vòng | ❌ R3 | ✅ xoay vòng + ân hạn 30 giây |
| A6 | token sau logout/đổi mật khẩu | ❌ R1, R4 | ✅ thu hồi ngay (`token_version`) |
| A7 | link reset: 1 lần, hết hạn, của người khác | ✅ | ✅ |
| A8 | quên mật khẩu không lộ email | ✅ | ✅ |
| A9 | đăng ký trùng SĐT/email | ❌ R7 | ⏸ chấp nhận (UX; limiter 5/giờ/IP) |
| A10 | khoá tài khoản demo | ✅ | ✅ |
| A11 | token SSE trong URL | ⚠️ | ⏸ chấp nhận (R14d; nginx tắt access log luồng SSE) |
| A12 | khởi động với secret yếu/dở dang | ✅ | ✅ |
| B1 | ma trận chức năng 344 lần gọi | ✅ | ✅ (+ test `securityRouteMatrix`) |
| B2 | IDOR khách ↔ khách | ✅ | ✅ |
| B3 | chéo chi nhánh | ❌ R8 | ✅ |
| B4 | `X-Branch-Id` | ✅ | ✅ |
| B5 | quản lý nhân sự | ✅ | ✅ |
| B6 | mass assignment | ✅ | ✅ |
| B7–B8 | cổng competition: vai trò × route, scope | ✅ | ✅ |
| B9 | gọi thẳng competition-service | ⏸ | ✅ 6/6 (token ES256 khoá lạ, HS256, `alg:none`… → 401) |
| B10 | hub công khai: không lộ `phone`/`email`/`userId` | ✅ | ✅ |
| B11 | luật đặt sân (14 ngày, qua giờ, ngoài giờ, độ dài) | ✅ + R15 | ✅ khách tối đa 3 giờ ở server |
| C1 | SQL injection / tham số lọc / ngày báo cáo | ❌ R11 | ✅ ngày sai → 400 |
| C2 | kiểu dữ liệu lạ, độ dài, id ngoài INT | ❌ R11 | ✅ → 400, deadlock → 409 |
| C3 | XSS lưu | ✅ | ✅ (0 sink XSS trong `frontend/src`) |
| C4 | formula injection Excel | ⏸ | ✅ 8 test `reportExporterFormula` |
| C5–C8 | `__proto__`, body 300 KB, JSON lồng sâu, path traversal, `Content-Disposition` | ✅ | ✅ |
| D1 | webhook thanh toán fail-closed | ✅ | ✅ |
| D2 | webhook competition: chữ ký/replay/dedup | ⏸ | ✅ 9/9 |
| D3 | race: slot, checkout, voucher | ✅ (500 do deadlock) | ✅ 201 + 5×409 |
| D4–D6 | giảm giá, voucher, giá client | ✅ | ✅ |
| D7 | phí sân khi chuyển sân | ⏸ | ✅ qua test đơn vị `courtFeeSegments` + `priceCalculator` |
| D8 | void hoá đơn: quyền, chi nhánh, lặp, song song | ⏸ | ✅ 7/7 |
| E1, E3, E5, E6 | rò hash/token, dữ liệu công khai, `/api-docs`, `/health` | ✅ | ✅ |
| E2 | nội dung lỗi (không 500) | ❌ R11 | ✅ |
| E4 | log và `ActivityLog` không chứa bí mật | ⏸ | ✅ 18 file log + 54 dòng |
| F1 | header bảo mật | ❌ R9 | ✅ CSP/XFO/nosniff/Referrer/Permissions/HSTS |
| F2 | CORS | ✅ | ✅ |
| F3 | token ở `localStorage` | ⏸ | ⚠️ chấp nhận (kiến trúc; giảm nhẹ bằng CSP) |
| F4 | clickjacking trang nhân viên | ⏸ | ✅ |
| F5 | cache dữ liệu cá nhân | ❌ R10 | ✅ `no-store` |
| F6 | vào URL nhân viên bằng khách/ẩn danh | ⏸ | ✅ |
| G1 | giới hạn SSE 40/IP | ⏸ | ✅ 40 nhận + 5×429, mở lại được |
| G2–G5 | hub 900/phút, tải `availability/day`, phân trang, báo cáo dài | ✅ | ✅ |
| G6 | k6 smoke | ⏸ | ✅ 60/60 |
| H1, H12 | thư viện, trivy image | ❌ R13 | ✅ prod: backend 0 high/critical, frontend 0 high; image OS 0 |
| H2, H11 | secret trong git | ✅ | ✅ gitleaks 204 commit: 0 secret thật |
| H3–H5 | Dockerfile/compose/Render | ✅ (R14) | ✅ (R14 chấp nhận một phần) |
| H6–H7 | TLS DB, chặn seed production | ⏸ | ✅ unit test |
| H8 | quyền token workflow | ⏸ | ⚠️ `ci.yml` thiếu `permissions:` (R16) |
| H9 | bản live Render (7 GET/OPTIONS) | ✅ | ✅ (đo trước R9: chưa có header — nay đã sửa ở code, chưa deploy) |
| H10, H13 | semgrep, ZAP | ✅ | ✅ |

---

## 3. (A) Bộ test tự động — chạy lại hôm nay

### 3.1 Bảng tổng

| Bộ | Lệnh | Kết quả hôm nay |
|---|---|---|
| Backend, không cần DB | `cd backend && npm test` | **58 suite, 837 test**: 834–835 pass, 2–3 đỏ (xem §3.2) |
| Backend không gồm file flake | `npx jest --testPathIgnorePatterns competitionGateway tests-security` | **57 suite, 796/796 pass** |
| `competitionGateway.test.js` chạy riêng | `npx jest competitionGateway` | **41/41 pass** (3 lần liên tiếp) |
| Backend, cần DB | `DB_NAME_TEST=<db> npm run test:security` | **6 suite, 86/86 pass** (~30 giây) |
| Frontend | `cd frontend && npx vitest run` | **36 file, 493/493 pass** |
| Build frontend | `npm run build` | thành công |

### 3.2 Về mấy test đỏ trong `competitionGateway.test.js` (đã điều tra, không phải do các thay đổi bảo mật)

- Các ca đỏ luôn cùng một cụm: "giới hạn tần suất mặc định `/public/*`" (một vòng ~120 request, **timeout 5 giây mặc định của Jest**), sau đó
  hai ca SSE đọc nhầm "request cuối cùng" của service giả mà vòng request bị timeout còn để lại (**dây chuyền**, không phải lỗi độc lập).
- **So với bản chưa sửa** (`main` @ `83e8f8b`, `npm ci` riêng, chạy 2 lần cùng điều kiện máy): **627 test, 3 rồi 4 ca đỏ — đúng cùng cụm**.
  Vậy flake có trước đợt này.
- Chạy riêng file đó: 41/41 pass; chạy cả bộ **bỏ file đó**: 796/796 pass.
- Khắc phục (không làm, ngoài phạm vi): tăng timeout của ca đó hoặc cô lập service giả cho từng ca.

### 3.3 Test mới thêm trong đợt (316 test, 316/316 pass)

| File | Số test | Bảo vệ cái gì |
|---|---|---|
| `securityRouteMatrix.test.js` | 22 | quyền thật đọc từ `router.stack` của 24 file route: chỉ 12 route công khai, 11 route "chỉ đăng nhập", 16 route nhạy cảm đúng vai trò |
| `securityTokensAndSecrets.test.js` | 11 | token sai loại/chữ ký/`none`/hết hạn; `User` không nạp mật khẩu/refresh/`previous_*`; `errorHandler` không lộ `instance`/SQL |
| `changePassword.test.js` | 5 | R1: đổi mật khẩu thu hồi phiên, cấp cặp token mới, `User.update` một lệnh |
| `mailer.test.js` | 5 | SMTP giả bằng `net`: đăng nhập, người nhận, tiêu đề, link reset, tái sử dụng (lưới an toàn cho nodemailer 10) |
| `bcryptCompat.test.js` | 5 | hash do bcrypt 5.1.1 sinh vẫn so khớp ở bcrypt 6; không còn `tar`/`node-pre-gyp` |
| `securityHeaders.test.js` | 18 | CSP, XFO, nosniff, HSTS chỉ khi HTTPS, `no-store` dưới `/api/v1` trừ `/public` |
| `groupAValidation.test.js` | 49 | R5/R6 (spy `bcrypt.compare`), validator báo cáo, độ dài, id trong INT, deadlock → 409, cài đặt |
| `passwordPolicy.test.js` | 59 | độ dài theo byte, danh sách phổ biến, đơn giản, trùng SĐT/email/tên, các validator |
| `groupDRules.test.js` | 13 | khách tối đa 3 giờ (khớp frontend), mọi `uses:` của workflow ghim SHA |
| `sessionRotation.test.js` | 15 | xoay vòng, ân hạn, thua cuộc đua so-và-đổi, `tv` lệch, token cũ không có `tv` |
| `reportExporterFormula.test.js` | 8 | 6 payload formula injection qua tên sân/khách/SĐT/phụ kiện |
| `tests-security/*.security.test.js` (6 file) | 86 | IDOR, chéo chi nhánh, phiên, chính sách mật khẩu, header, `no-store`, rotation/thu hồi, R15 — trên app thật + DB thật |
| `frontend/.../sessionTokens.test.js`, `passwordRules.test.js` | 9 + 11 | lưu cặp token mới; quy tắc mật khẩu phía giao diện + `serverMessage` |

### 3.4 Test có sẵn liên quan bảo mật/tiền (chạy trong cùng lần hôm nay)

31 file, **459/462 pass** (3 đỏ là cụm `competitionGateway` ở §3.2): `webhookAuth` 6, `jwtSecrets` 10, `errorHandler` 6, `demoMode` 11,
`demoSeedGuard` 16, `createAdmin` 5, `discountPolicy` 24, `paymentConfig` 12, `paymentValidation` 10, `voucherService` 21, `voucherValidation` 15,
`onlineOrderValidation` 19, `employeePermissions` 12, `customerMerge` 17, `branchContext` 18, `dbSsl` 6, `serverConfig` 12, `frontendStatic` 16,
`competitionToken` 25, `competitionSignature` 12, `competitionWebhook` 21, `competitionRouteMap` 51, `competitionStreamGuard` 5,
`competitionConfig` 14, `competitionOutbox` 6, `bookingAdvanceWindow` 8, `bookingPastSlot` 15, `bookingUpdateFields` 9, `courtFeeSegments` 8,
`priceCalculator` 11, `competitionGateway` 38/41.

---

## 4. Phát hiện R1–R17 và xử lý

| # | Mức | Vấn đề | Trạng thái | Bằng chứng đóng |
|---|---|---|---|---|
| R1 | 🟠 | đổi mật khẩu không thu hồi refresh token | ✅ kế hoạch 34 | 7 test HTTP (`tests-security`): 5 đỏ trên code cũ (đã thử), xanh sau; API 9/9; Chrome 2 thiết bị 8/8 |
| R2 | 🟠 | mật khẩu tối thiểu 6, nhận `123456` | ✅ kế hoạch 37-B | 59 test đơn vị + 11 test HTTP; Chrome 10/10 |
| R3 | 🟡 | refresh token không xoay vòng | ✅ 37-C | 15 test đơn vị + 12 test HTTP; Chrome: 2 tab refresh cùng lúc đều ở lại |
| R4 | 🟡 | access token sống 15 phút sau logout/đổi mật khẩu | ✅ 37-C | thiết bị A bị đưa về `/login` ngay khi B đổi mật khẩu (Chrome 11/11) |
| R5 | 🟡 | dò tài khoản qua thời gian (5,7 vs 70,3 ms) | ✅ 37-A | đo lại 68,1 vs 67,5 ms |
| R6 | 🟡 | lộ trạng thái "khoá" khi sai mật khẩu | ✅ 37-A | test đơn vị + HTTP |
| R7 | 🟡 | đăng ký báo trùng SĐT/email | ⏸ chấp nhận (Q7) | limiter 5/giờ/IP |
| R8 | 🟡 | phụ kiện phiên chi nhánh khác đọc được | ✅ 37-A | `test.failing` → `test`; 404 thật |
| R9 | 🟠 | không có header bảo mật | ✅ kế hoạch 35 | 30 trang × 2 cỡ màn hình: 0 vi phạm CSP; ZAP các luật header PASS; nginx `-t` + `curl -I` |
| R10 | 🟡 | response cá nhân không `Cache-Control` | ✅ kế hoạch 35 | 5 test HTTP (F5) + 5 test đơn vị |
| R11 | 🟡 | 500 thay vì 400/409 | ✅ 37-A | 6 checkout song song: 201 + 5×409 (trước: 4×500) |
| R12 | 🟡 | `PUT /settings/*` không validate | ✅ 37-A | nút "Lưu" của giao diện thật vẫn chạy |
| R13 | 🟠 | thư viện Cao/Nghiêm trọng | ✅ kế hoạch 36 | backend 17→6 moderate, frontend 3→2; trivy lockfile 32+7→0; `node:22-alpine` không compiler chạy được bcrypt 6; luồng thật 16/16 |
| R14 | 🟡 | cấu hình hạ tầng | ◐ 37-D | a) ghim Actions SHA ✅; b/c/d chấp nhận (Q6) |
| R15 | 🟡 | giới hạn 3 giờ chỉ ở giao diện | ✅ 37-D | khách 6 giờ → 400; 3 giờ → 201; nhân viên 6 giờ → 201 |
| R16 | 🟡 | `ci.yml` thiếu `permissions:` | 🔓 mở | phát hiện ở nhóm E; sửa 1 dòng |
| R17 | ℹ️ | npm CLI trong image gốc có 11 HIGH | 🔓 mở (thông tin) | không phải thư viện của ứng dụng |

**Rủi ro chấp nhận còn lại (đã ghi trong báo cáo 33 §9 và kế hoạch 36/37):** `uuid` (qua `sequelize`/`exceljs`), `yamljs → sprintf-js` (chỉ đọc
`openapi.yaml` của repo), `react-router` 6.x moderate (bản sửa là major 7; đã rà: không có đích điều hướng lấy từ đầu vào người dùng), token trong
`localStorage`, token SSE trong URL, nginx chạy root trong image frontend.

---

## 5. (C) Kiểm thật bằng HTTP / trình duyệt và công cụ quét — kết quả đã ghi lại

*(Log thô đã bị dọn; các con số dưới đây lấy từ báo cáo 33 §2–§4, §9 và kế hoạch 34–37 mục "Kết quả".)*

| Phép kiểm | Kết quả |
|---|---|
| Ma trận phân quyền trên server tạm | 344 lần gọi / 115 route / các vai trò: 0 lệch |
| R1 qua API thật + Chrome (390×844, 1366×768) | 9/9 + 8/8 |
| R9/R10 Chrome 30 trang × 2 cỡ, đọc `securitypolicyviolation` | 0 vi phạm; font + QR hiển thị; script inline, ảnh `example.com` bị chặn; nhúng iframe bị chặn (đối chứng bản cũ nhúng được) |
| R9 HSTS | không có qua HTTP; có `max-age=15552000` khi `X-Forwarded-Proto: https` + trust proxy; client tự gửi header khi chưa bật trust proxy: không kích hoạt |
| nginx | `nginx -t` OK; container thật trả 5 header ở `/`, `/login`, `/assets/*` |
| R13 backend tạm | 16/16 (đăng nhập hash cũ, đăng ký, đổi mật khẩu, quên mật khẩu→SMTP giả→reset, Excel, PDF, rate limit) |
| R13 Alpine/musl không compiler | `npm ci --omit=dev` chạy; bcrypt 6 hash/compare; hash 5.1.1 so khớp |
| Nhóm A thật | 14/14 (HTTP + Chrome: nút Lưu cài đặt) |
| Nhóm B thật | Chrome 10/10 (đăng ký mật khẩu yếu → "quá phổ biến"; đổi mật khẩu) |
| Nhóm C thật | Chrome 11/11 (2 tab đua refresh; 2 thiết bị thu hồi) |
| Nhóm E thật | B9 6/6 · D2 9/9 · D8 7/7 · F4 4/4 · E4 2/2 · G1 2/2 · F6 3/3 · k6 60/60 |
| ZAP baseline (SPA) | trước: 8 cảnh báo (header); sau R9: các luật header PASS, còn 5 cảnh báo đã chấp nhận (`unsafe-inline` style, COEP, SRI, cache file tĩnh, thông tin) |
| ZAP API scan (101 URL, token khách) | 119 luật PASS, 0 cảnh báo, 4 mục thông tin |
| semgrep (115 luật, 649 file) | 13 phát hiện mức WARNING, không lỗi thật (Actions tag di động — đã sửa; `$host` nginx — chấp nhận) |
| gitleaks (204 commit) | 3 chuỗi, đều là hằng số trong file test |
| trivy lockfile | 0 HIGH/CRITICAL sau R13 |
| trivy image `docker/app.Dockerfile` | OS Alpine 3.24 0 HIGH/CRITICAL, 0 secret; 11 HIGH nằm trong npm CLI của image gốc (R17) |

---

## 6. Những gì KHÔNG kiểm hoặc kiểm chưa đủ

- **Bản live Render** chỉ được đọc bằng 7 request GET/OPTIONS (header, CORS, `/api-docs`, `/health`); **không** có tấn công/ghi/đăng nhập. Các sửa của đợt
  này **chưa deploy**, nên bản live vẫn thiếu header cho tới khi bạn merge + deploy.
- Chưa kiểm trên **điện thoại thật**, Safari, Firefox, trình đọc màn hình; "điện thoại" ở trên là Chrome emulation 390×844.
- ZAP quét chủ động chỉ bằng **token khách** (không dùng admin để khỏi sửa/xoá dữ liệu); phân quyền nhân viên/quản lý được phủ bằng ma trận B1.
- D7 (phí sân khi chuyển sân) dựa vào test đơn vị, chưa dựng lại luồng chuyển sân trên server.
- Chưa có test cho **một số đường ít dùng**: staff tạo tài khoản khách có mật khẩu qua giao diện (đã kiểm validator + API), luồng reset qua email
  thật (chỉ SMTP giả).
- Test tầng DB (`tests-security`) chạy được khi có DB thử đã migrate + seed; **không** nằm trong `npm test`.
- Migration `20261015100001-…` chỉ chạy trên DB tạm (up → down → up); **chưa** chạy trên DB dev của bạn hay bản thật.

---

## 7. Cách tự chạy lại

```bash
# 1) Cập nhật thư viện theo lockfile mới (bắt buộc — node_modules cũ đang lệch)
cd backend  && npm ci
cd ../frontend && npm ci

# 2) Test không cần DB
cd ../backend && npm test
npx jest --testPathIgnorePatterns competitionGateway tests-security   # bỏ file flake: kỳ vọng 57 suite, 796/796
npx jest competitionGateway                                           # chạy riêng: kỳ vọng 41/41

# 3) Frontend
cd ../frontend && npx vitest run && npm run build

# 4) Test bảo mật cần DB — dùng DB RIÊNG (tên phải có chữ "test"), KHÔNG dùng DB dev
#    tạo DB rỗng bd_sectest_check rồi:
cd ../backend
DB_NAME=bd_sectest_check npx sequelize-cli db:migrate
DB_NAME=bd_sectest_check npx sequelize-cli db:seed:all
DB_NAME_TEST=bd_sectest_check npm run test:security                   # kỳ vọng 6 suite, 86/86
```

`tests-security` tự **từ chối chạy** nếu tên DB không chứa "test".

---

## 8. Việc còn lại cần bạn quyết

1. `npm ci` ở `backend/` và `frontend/`; `npm run migrate` khi muốn dùng nhánh này trên DB dev.
2. Merge `test/ke-hoach-kiem-thu-bao-mat` → `main` và push (Render tự deploy + tự migrate ở lần reset đêm) — mình **chưa làm**.
3. R16 (`permissions: contents: read` trong `ci.yml`) và R17 (image gốc/npm CLI): làm hay chấp nhận.
4. Muốn mình chạy lại các phép kiểm thật ở §5 để có log thô mới: nói một tiếng.
