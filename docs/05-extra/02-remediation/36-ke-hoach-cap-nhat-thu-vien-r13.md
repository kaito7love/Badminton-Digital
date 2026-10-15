# Kế hoạch 36 — Sửa R13: cập nhật thư viện có lỗ hổng Cao/Nghiêm trọng

**Ngày:** 2026-10-15 · **Nhánh:** `fix/r13-cap-nhat-thu-vien`
**Tách từ:** `test/ke-hoach-kiem-thu-bao-mat` (f9e8083, đã có R1, R9, R10). Merge đích: nhánh test, **không** `main`.
**Trạng thái:** CHỜ DUYỆT. Chưa chạy `npm install`/`npm update` nào, chưa sửa file nào.
**Nguồn:** `33-ket-qua-kiem-thu-bao-mat.md` — R13 (H1, H12).

## 1. Hiện trạng (đo bằng `npm audit --omit=dev`, 2026-10-15)

| Gói | Dự án | Đang cài | Lỗi | Sửa bằng |
|---|---|---|---|---|
| `proxy-addr` (qua `express`) | backend | 2.0.7 | 🔴 giả IP qua subnet IPv4-mapped IPv6 | `express` 4.22.3 → `proxy-addr` 2.0.8 (**cùng major**) |
| `nodemailer` | backend | 9.0.5 | 7 lỗi cao; 4 lỗi sửa ở 9.1.x, **3 lỗi chỉ sửa ở ≥ 10.0.6** (lộ SMTP credential chéo, 2 lỗi DoS parser) | `nodemailer@^10.1.1` (**major 9→10**) |
| `tar` (qua `bcrypt` → `@mapbox/node-pre-gyp`) | backend | 6.2.1 | 🔴 12 lỗi ghi đè/đọc file khi giải nén | `bcrypt@^6.0.0` (**major 5→6**, bỏ hẳn chuỗi `node-pre-gyp`/`tar`) |
| `brace-expansion` (qua `exceljs` → `archiver` → `minimatch`) | backend (runtime: xuất Excel) | 2.1.4 | 5 lỗi DoS | cập nhật transitive trong cùng major |
| `qs` (qua `express`/`body-parser`), `ip-address` (qua `express-rate-limit`), `moment`, `sprintf-js`/`argparse` | backend | — | moderate | `npm update` trong cùng major |
| `axios` | frontend | 1.18.1 | 12 lỗi cao (prototype pollution gadget, ReDoS, SSRF qua redirect) | `axios` 1.20.0 (**trong `^1.7.2`**, chỉ cập nhật lock) |
| `react-router` / `react-router-dom` | frontend | 6.30.4 | moderate: **open redirect → XSS** | 6.30.6 (**trong `^6`**) |
| `uuid` (qua `exceljs`, `sequelize`) | backend, competition | — | moderate: thiếu kiểm biên ở v3/v5/v6 khi truyền `buf` | **Không sửa** — xem Q4 |

## 2. Cái gì dùng các gói đó (để biết rủi ro khi nâng)

- **`nodemailer`:** một file duy nhất `backend/src/utils/mailer.js` (`createTransport({host, port, secure, auth})`,
  `sendMail({from, to, subject, text, html})`, `getTestMessageUrl`). Chỉ gọi từ `forgotPassword`. Bề mặt dùng nhỏ.
  Hiện **không có test nào** cho file này.
- **`bcrypt`:** `AuthService` (login, đổi/đặt lại mật khẩu, đăng ký), `EmployeeService`, `create-admin`, seeder.
  Định dạng hash `$2b$` giữ nguyên giữa 5.x và 6.x nên mật khẩu đã lưu vẫn so khớp. `bcrypt@6` dùng prebuild
  qua `node-gyp-build` (cần Node ≥ 18; dự án yêu cầu ≥ 22).
- **`express`/`proxy-addr`:** `app.set('trust proxy', n)` dùng **số hop**, không dùng danh sách subnet, nên lỗi
  này khó khai thác ở cấu hình hiện tại; vẫn cập nhật vì IP là khoá của rate limit đăng nhập.
- **`axios`, `react-router-dom`:** `apiClient.js` (một instance duy nhất) và toàn bộ routing — nên kiểm giao
  diện thật, không chỉ test đơn vị.

## 3. Thay đổi đề xuất

Chỉ đổi `package.json` + `package-lock.json` của từng dự án; **không sửa dòng code ứng dụng nào**. Lệnh cụ
thể (không dùng `npm audit fix --force`):

**backend**
1. `npm update express proxy-addr express-rate-limit mysql2` — kéo `express` 4.22.3, `proxy-addr` 2.0.8, v.v.,
   trong đúng range đang khai.
2. `npm install nodemailer@^10.1.1` và `npm install bcrypt@^6.0.0` — hai bản **major**, sửa `package.json`.
3. `npm audit fix --omit=dev` (không `--force`) để kéo các transitive còn lại trong cùng major
   (`brace-expansion`, `qs`, `ip-address`…). Xem diff `package-lock.json` trước khi giữ.

**frontend:** `npm update axios react-router-dom` (cả hai nằm trong range hiện có → chỉ đổi lock).

**competition-service:** không có gói runtime nào cần nâng ngoài `uuid`/`sequelize` (xem Q4) → **không đụng**.

Mục tiêu sau khi xong: `npm audit --omit=dev` ở backend **không còn high/critical**, frontend **không còn
high** (và hết `react-router` moderate); còn lại chỉ `uuid` (moderate, Q4) và vài moderate transitive không có
bản vá.

## 4. Test

| File | Nội dung |
|---|---|
| `backend/tests/mailer.test.js` (**mới**, không cần DB) | Dựng một SMTP giả trong chính test (module `net`, hiểu `EHLO`, `AUTH`, `MAIL`, `RCPT`, `DATA`), trỏ `MAIL_HOST/MAIL_PORT` vào đó, gọi `sendPasswordResetEmail`: kiểm có đăng nhập SMTP đúng user/pass, người nhận đúng, tiêu đề, link đặt lại có trong cả text và HTML, `from` đúng. Chưa cấu hình SMTP → lỗi 500 có thông điệp như cũ. Đây là lưới an toàn cho bước nâng `nodemailer` 9→10 |
| `backend/tests/bcryptCompat.test.js` (**mới**) | Hash `$2b$` cố định (sinh từ bcrypt 5.1.1, nhúng vào test) vẫn `compare` đúng ở bcrypt 6; hash mới do bcrypt 6 sinh có tiền tố `$2b$10$` và so khớp được hai chiều |
| Test sẵn có | `npm test` backend (kỳ vọng 683 + mới), `test:security` (48), Vitest frontend (482) — không giảm |

## 5. Kiểm tra thật

1. `npm ci` **sạch** (xoá `node_modules`) ở từng dự án → `npm test` / Vitest / `npm run build` frontend.
2. **Trên Alpine/musl giống image deploy:** chạy `node:22-alpine` (đã có sẵn trên máy), `npm ci --omit=dev` ở
   backend rồi `require('bcrypt')` + hash/compare + `require('nodemailer')` — xác nhận prebuild của `bcrypt@6`
   chạy được ở môi trường production, **không cần compiler** (đây là rủi ro lớn nhất của bản nâng bcrypt).
3. Backend tạm mới :5053 từ nhánh này (DB tạm có sẵn hash do bcrypt **5.1.1** sinh lúc seed):
   - đăng nhập `admin@badminton.com` và khách demo bằng mật khẩu cũ → 200 (chứng minh tương thích hash thật);
   - `forgot-password` → SMTP giả (cùng helper của test) nhận được email, link reset mở được và đặt mật khẩu mới;
   - đổi mật khẩu (R1) và đăng ký mới vẫn chạy; xuất Excel báo cáo (dùng `exceljs`) tải được và mở được.
4. Chrome headless đi các trang chính với `axios`/`react-router-dom` mới: đăng nhập, chuyển trang, đặt sân,
   đăng nhập hết hạn → refresh (luồng interceptor), `/reset-password?token=…`; 0 lỗi console.
5. `npm audit --omit=dev` ở hai dự án — đối chiếu mục tiêu §3; chạy lại trivy lên lockfile (image đã có).
6. Dọn dữ liệu thử sau khi xong.

## 6. Rủi ro

| Rủi ro | Mức | Cách xử lý |
|---|---|---|
| `bcrypt@6` không có prebuild cho môi trường nào đó (Alpine/Windows/Render) → `npm ci` fail hoặc đòi build từ nguồn | Trung bình | Bước 5.2 thử đúng trên `node:22-alpine`; Windows dev đã thử bằng `npm ci` sạch. Nếu hỏng → lùi về `bcrypt@5` + `overrides` ép `tar` ≥ 7.5.20 (phương án dự phòng, xem Q2) |
| `nodemailer@10` đổi hành vi (TLS mặc định, tên tuỳ chọn) làm mail quên mật khẩu hỏng im lặng — lỗi gửi mail **bị nuốt có chủ đích** để không lộ email | Trung bình | Test SMTP giả ở §4 + bước 5.3 gửi thật; không phụ thuộc vào việc có thấy lỗi ở response |
| `express` 4.22.3 / `qs` mới đổi cách parse query | Thấp | Toàn bộ test + `test:security` + ZAP/curl vài route có query; cùng major 4.x |
| `package-lock.json` đổi nhiều dòng, khó review | Thấp | Chỉ chạy đúng các lệnh ở §3; báo cáo tách phần đổi trực tiếp và phần transitive |
| Image Docker/Render build lại với lock mới lâu hơn | Thấp | Không đổi Dockerfile; `npm ci` dùng lock mới |

## 7. Phạm vi file

Sửa: `backend/package.json`, `backend/package-lock.json`, `frontend/package-lock.json` (và `frontend/package.json`
chỉ khi `npm update` buộc nâng range — dự kiến **không**).
Mới: `backend/tests/mailer.test.js`, `backend/tests/bcryptCompat.test.js`.
Không đụng: mọi file `src/`, `competition-service`, Dockerfile, `render.yaml`, tài liệu.

## 8. Câu hỏi cần bạn trả lời trước khi chạy

Chưa trả lời thì chưa làm; mặc định bên cạnh chỉ là đề xuất.

- **Q1.** Nâng `nodemailer` 9 → **10** (đề xuất; là cách duy nhất sửa nốt 3 lỗi cao) — hay chỉ nâng 9.1.x
  (sửa 4/7 lỗi, ít rủi ro hơn, còn 3 lỗi: lộ credential SMTP chéo chi nhánh DNS cache + 2 DoS parser)?
  Hệ thống hiện chỉ có một tài khoản SMTP và người nhận lấy từ DB, nên mức khai thác thực tế thấp.
- **Q2.** Nâng `bcrypt` 5 → **6** (đề xuất; bỏ hẳn `tar`) — hay giữ bcrypt 5 và thêm `overrides` ép `tar` ≥ 7.5.20
  (đổi ít hơn, nhưng `node-pre-gyp` 1.x được viết cho API `tar` 6 — vá bằng override là chắp vá)?
- **Q3.** Có xoá luôn dependency **`multer`** (khai báo nhưng không dùng; audit 08/2026 mục 10 còn mở, bản
  1.4.5-lts.2 đã cũ)? Đề xuất: **có**, vì loại bỏ bề mặt không dùng; nhưng đây là việc ngoài R13 nên cần bạn nói.
- **Q4.** `uuid` (moderate) kéo theo `sequelize`/`exceljs`: bản sửa chỉ qua đường `npm audit fix --force` sẽ
  **hạ** `exceljs` về 3.4.0 / `sequelize` về 3.30 (phá vỡ). Chấp nhận để lại (đề xuất — lỗi chỉ xảy ra khi
  truyền `buf` cho v3/v5/v6, mà code không làm vậy), ghi vào báo cáo là rủi ro đã chấp nhận?
- **Q5.** Tài liệu (`CLAUDE.md`, `00-tien-do.md`, báo cáo 33): chưa cập nhật — đúng ý bạn chứ?
