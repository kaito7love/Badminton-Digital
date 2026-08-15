# Đánh giá bảo mật hệ thống Badminton Digital Management

**Ngày thực hiện:** 2026-08-15
**Phạm vi:** Toàn bộ mã nguồn backend (`backend/src`) và frontend (`frontend/src`) tại thời điểm audit — không phải diff của một PR cụ thể.
**Mục đích:** Tài liệu này không phải checklist bảo mật chung chung. Từng phát hiện dưới đây được đọc trực tiếp từ code, có trích dẫn file:line cụ thể, kèm kịch bản khai thác thực tế (ai làm được gì) để chủ dự án — không cần rành thuật ngữ bảo mật — vẫn hình dung được rủi ro nằm ở đâu và mức độ nghiêm trọng ra sao. Mục đích là giúp ưu tiên sửa đúng chỗ, không phải liệt kê cho đủ số lượng.

---

## 1. Bảng tóm tắt

| # | Mức độ | Phát hiện | Vị trí |
|---|--------|-----------|--------|
| 1 | 🔴 Nghiêm trọng | JWT ký bằng secret mặc định hardcode trong code nếu quên cấu hình `.env` | `backend/src/utils/jwt.js:3-4` |
| 2 | 🔴 Nghiêm trọng | Webhook thanh toán không bắt buộc xác thực + số hoá đơn dễ đoán → có thể tự đánh dấu "đã thanh toán" | `backend/src/controllers/paymentController.js:50-53`, `backend/src/utils/documentNumber.js:23` |
| 3 | 🔴 Nghiêm trọng | Không giới hạn số lần thử đăng nhập (không rate limit) | `backend/src/server.js`, `backend/src/routes/authRoutes.js:16` |
| 4 | 🟠 Nên sửa | Refresh token không xoay vòng, không có cơ chế thu hồi theo từng phiên | `backend/src/services/AuthService.js:82-112` |
| 5 | 🟠 Nên sửa | Access/refresh token lưu ở `localStorage` phía trình duyệt | `frontend/src/services/apiClient.js:13,36-54` |
| 6 | 🟠 Nên sửa | Thiếu `helmet` — không có các header bảo mật cơ bản (CSP, X-Frame-Options, HSTS…) | `backend/package.json` (không có dependency) |
| 7 | 🟠 Nên sửa | Chính sách mật khẩu quá yếu (chỉ yêu cầu ≥ 6 ký tự, không ràng buộc độ phức tạp) | `backend/src/validations/authValidation.js:32,65,90` |
| 8 | 🟠 Nên sửa | Có lỗ hổng dependency mức High/Critical (chủ yếu gián tiếp) | `backend/npm audit`, `frontend/npm audit` |
| 9 | 🟡 Ghi chú | So sánh webhook secret bằng `!==` (không phải constant-time) | `backend/src/controllers/paymentController.js:51` |
| 10 | 🟡 Ghi chú | `multer`/`UPLOAD_DIR` khai báo nhưng không dùng — cấu hình chết, dễ gây nhầm lẫn sau này | `backend/package.json`, `backend/.env.example` |
| 11 | 🟡 Ghi chú | Đăng ký tài khoản để lộ việc SĐT/email đã tồn tại (khác với login) | `backend/src/services/AuthService.js:244-262` |
| 12 | 🟠 Nên sửa | **[Bổ sung 16/08]** Xuất Excel không lọc formula injection — tên khách tự đăng ký có thể chèn công thức thực thi khi file mở bằng Excel | `backend/src/utils/reportExporter.js:155` |
| 13 | 🟠 Nên sửa | **[Bổ sung 16/08]** Container backend chạy bằng user `root`, không có `.dockerignore` nên `.env` thật có thể bị "nướng" vào layer image nếu tồn tại lúc build | `docker/backend.Dockerfile` |
| 14 | 🟡 Ghi chú | **[Bổ sung 16/08]** Cổng MySQL (3306) được mở ra host trong `docker-compose.yml`, không cần thiết vì backend gọi qua network nội bộ compose | `docker/docker-compose.yml:12-13` |

---

## 2. Chi tiết từng phát hiện

### 2.1 🔴 JWT ký bằng secret mặc định hardcode trong code

**File:** `backend/src/utils/jwt.js:3-4`

```js
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'badminton_jwt_access_secret_key_2026_super_secure';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'badminton_jwt_refresh_secret_key_2026_super_secure';
```

**Vấn đề:** Nếu biến môi trường `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` không được set (quên cấu hình `.env` khi deploy, deploy bằng Docker thiếu biến môi trường, CI/CD copy nhầm file mẫu…), server **vẫn khởi động bình thường** và âm thầm ký token bằng chuỗi cố định nằm ngay trong mã nguồn. `backend/src/server.js` không có bước kiểm tra "biến môi trường bắt buộc phải tồn tại" trước khi lắng nghe request — `sequelize.authenticate()` có log lỗi nếu DB sai, nhưng JWT secret thì không được xác thực gì cả.

**Kịch bản khai thác:** Chuỗi secret này nằm trong lịch sử Git (public hoặc bị rò rỉ mã nguồn), nên bất kỳ ai đọc được mã nguồn (kể cả sau này repo được open-source, chia sẻ cho đối tác, hoặc máy chủ bị lộ mã nguồn qua lỗi khác) đều biết chính xác secret mặc định. Nếu môi trường production nào đó thiếu cấu hình `.env` đúng cách, kẻ tấn công tự ký một access token với `role: "admin"` và `id` bất kỳ, gọi thẳng API quản trị mà không cần mật khẩu.

**Mức độ:** Nghiêm trọng — đây là kịch bản "toàn quyền hệ thống" nếu xảy ra, dù điều kiện kích hoạt (quên set env) là lỗi vận hành chứ không phải lỗi logic hằng ngày.

**Hướng khắc phục:** Bỏ giá trị fallback; ở đầu `server.js` (hoặc trong `jwt.js` khi module được require) kiểm tra `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` phải tồn tại và đủ dài (vd ≥ 32 ký tự), nếu thiếu thì `process.exit(1)` ngay khi khởi động kèm thông báo rõ ràng — "fail loudly" thay vì "chạy êm với secret yếu".

---

### 2.2 🔴 Webhook thanh toán không bắt buộc xác thực + số hoá đơn dễ đoán

**File:** `backend/src/controllers/paymentController.js:50-53`, `backend/src/routes/paymentRoutes.js:9`, `backend/src/utils/documentNumber.js:8-24`

```js
// paymentRoutes.js — webhook đăng ký TRƯỚC authMiddleware, cố ý public
router.post('/webhook', webhookRules, paymentController.processWebhook);

// paymentController.js
if (process.env.PAYMENT_WEBHOOK_SECRET && req.get('X-Webhook-Secret') !== process.env.PAYMENT_WEBHOOK_SECRET) {
  return res.status(401).json(...);
}
```

Việc kiểm tra secret chỉ xảy ra **nếu** `PAYMENT_WEBHOOK_SECRET` được cấu hình. Biến này **không có trong `backend/.env.example`**, nên một lần deploy theo đúng hướng dẫn mẫu sẽ để trống nó — và khi đó điều kiện `if` không bao giờ đúng, webhook nhận request từ bất kỳ ai mà không cần chứng minh gì cả.

Đồng thời, số hoá đơn được sinh tuần tự và có thể đoán được:

```js
// documentNumber.js:23
return `${PREFIXES[documentType] || documentType.toUpperCase()}-${branchId}-${String(currentValue).padStart(8, '0')}`;
// vd: BD-1-00000042
```

**Kịch bản khai thác:** Một khách hàng (hoặc bất kỳ ai biết endpoint) đặt sân, chưa thanh toán, biết `branchId` (hiển thị công khai qua danh mục sân) và đoán/thử tuần tự `BD-1-00000001`, `BD-1-00000002`... rồi gửi:
```
POST /api/v1/payments/webhook
{ "provider": "manual", "invoiceNo": "BD-1-00000042", "status": "paid" }
```
Nếu `PAYMENT_WEBHOOK_SECRET` chưa cấu hình, request này được chấp nhận (đã có `validations/paymentValidation.js` chặn phần dữ liệu sai định dạng, nhưng không chặn được việc thiếu xác thực), hoá đơn của người khác (hoặc của chính họ) bị đánh dấu `paid` mà không có giao dịch thật — thất thoát doanh thu trực tiếp. Code đã có ràng buộc tốt là chỉ cho chuyển `pending`/`processing` → `paid` (không cho `paid` → `paid` lặp, không cho trạng thái khác), nhưng ràng buộc đó không thay thế được việc xác thực người gọi.

**Mức độ:** Nghiêm trọng — tác động trực tiếp đến doanh thu, và điều kiện kích hoạt (thiếu env var) là kịch bản deploy thực tế hoàn toàn có thể xảy ra vì biến này không nằm trong file mẫu.

**Hướng khắc phục:** Bắt buộc `PAYMENT_WEBHOOK_SECRET` phải tồn tại (fail khi khởi động nếu thiếu, giống mục 2.1), thêm vào `.env.example` kèm ghi chú bắt buộc. Cân nhắc đổi số hoá đơn public-facing (trên PDF, link tra cứu) sang định dạng không tuần tự dễ đoán nếu nó còn được dùng làm khoá tra cứu ở chỗ nào đó không có xác thực kèm theo.

---

### 2.3 🔴 Không có giới hạn số lần đăng nhập sai (không rate limit)

**File:** `backend/src/server.js` (toàn bộ file), `backend/src/routes/authRoutes.js:16`, `backend/package.json`

Đã kiểm tra toàn bộ `server.js` và `package.json`: không có `express-rate-limit`, `express-brute`, `express-slow-down` hay middleware giới hạn tần suất nào được cài đặt hoặc áp dụng cho bất kỳ route nào, kể cả `POST /api/v1/auth/login`.

**Kịch bản khai thác:** Ai đó có một số điện thoại/email đã đăng ký (dễ có được — SĐT khách chơi sân không phải bí mật) có thể gửi hàng chục nghìn request `POST /auth/login` với các mật khẩu khác nhau trong thời gian ngắn mà không bị chặn, không bị chậm lại, không có CAPTCHA. Với mật khẩu 6 ký tự yếu (xem mục 2.7), một cuộc tấn công brute-force hoàn toàn khả thi để chiếm tài khoản khách hàng hoặc — nghiêm trọng hơn — tài khoản nhân viên/admin nếu đoán được email nội bộ.

**Mức độ:** Nghiêm trọng — đây là cửa ngõ chiếm tài khoản kinh điển và không tốn công khai thác (không cần lỗi logic gì, chỉ cần gửi request lặp lại).

**Hướng khắc phục:** Thêm `express-rate-limit` cho `/auth/login`, `/auth/forgot-password`, `/auth/reset-password` (vd 5-10 lần/15 phút theo IP + theo định danh đăng nhập), trả `429 Too Many Requests` khi vượt ngưỡng. Có thể mở rộng áp dụng nhẹ hơn cho toàn bộ `/api/v1` để chống spam/DoS tầng ứng dụng.

---

### 2.4 🟠 Refresh token không xoay vòng, không thu hồi theo từng phiên

**File:** `backend/src/services/AuthService.js:82-112` (hàm `refreshAccessToken`), `:137-144` (hàm `logout`)

Cơ chế hiện tại: mỗi user có đúng **một** cột `refreshToken` trong bảng `users`. Đăng nhập ghi đè cột này; `POST /auth/refresh-token` chỉ xác minh chữ ký + so khớp đúng chuỗi lưu trong DB rồi cấp access token mới — **không phát hành refresh token mới**, nghĩa là cùng một refresh token dùng lại được nhiều lần suốt 7 ngày hiệu lực. `logout` (`AuthService.js:137-144`) chỉ set `refreshToken = null` cho đúng user đang gọi.

**Điểm được (ghi nhận trước để rõ ràng):** vì chỉ lưu một token/user, đăng nhập ở thiết bị mới sẽ tự động "đá" refresh token cũ — đây vô tình là một dạng thu hồi thô. Đổi mật khẩu (`resetPassword`, `AuthService.js:214`) cũng chủ động null hoá refresh token, tốt.

**Vấn đề còn lại:** Nếu refresh token bị đánh cắp (vd máy khách hàng dính malware, log network bị lộ) và người dùng **không** đăng nhập lại ở nơi khác, kẻ tấn công dùng token đó liên tục trong tối đa 7 ngày để tự cấp access token mới, mà hệ thống không có cách nào phát hiện ("token này đang bị dùng ở 2 nơi khác nhau") hay admin chủ động thu hồi phiên của một user cụ thể (không có API "đăng xuất mọi thiết bị" cho admin dùng khi nghi ngờ tài khoản bị chiếm).

**Mức độ:** Nên sửa — không phải lỗ hổng có thể khai thác ngay từ bên ngoài, nhưng làm giảm khả năng phản ứng khi có sự cố (token bị lộ qua kênh khác).

**Hướng khắc phục:** Xoay vòng refresh token mỗi lần dùng (cấp token mới, vô hiệu token cũ ngay khi refresh thành công); cân nhắc lưu refresh token dạng hash thay vì plaintext trong DB; thêm API admin "thu hồi phiên đăng nhập của user X".

---

### 2.5 🟠 Access/refresh token lưu ở `localStorage`

**File:** `frontend/src/services/apiClient.js:13,36-54`

```js
const token = localStorage.getItem('access_token');
...
const refreshToken = localStorage.getItem('refresh_token');
```

**Vấn đề:** Bất kỳ đoạn JavaScript nào chạy được trên trang (kể cả từ một lỗi XSS phát sinh sau này, hoặc một thư viện bên thứ ba bị compromise) đều đọc được `localStorage` và lấy trọn cả access token lẫn refresh token. Hiện tại audit **không tìm thấy** lỗ hổng XSS nào trong `frontend/src` (xem mục 3.4 "Đã ổn"), nên đây là rủi ro phòng thủ theo chiều sâu (defense-in-depth) chứ chưa phải lỗ hổng đang bị khai thác được.

**Mức độ:** Nên sửa — mức độ ưu tiên thấp hơn 3 mục đỏ ở trên vì cần có thêm một lỗ hổng khác (XSS) mới khai thác được, nhưng đáng làm vì hậu quả khi kết hợp là chiếm toàn bộ phiên đăng nhập.

**Hướng khắc phục:** Lý tưởng là chuyển sang cookie `httpOnly` + `Secure` + `SameSite=Strict/Lax` cho refresh token (cần đổi luồng refresh sang gửi kèm cookie thay vì body); đây là thay đổi kiến trúc không nhỏ nên có thể xếp vào backlog trung hạn, không cần làm gấp.

---

### 2.6 🟠 Thiếu `helmet` — không có header bảo mật cơ bản

**File:** `backend/package.json` (dependencies), `backend/src/server.js`

Không có `helmet` trong `package.json`, và `server.js` không tự set các header như `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, `Content-Security-Policy`. Middleware hiện tại chỉ có `cors` và các middleware nghiệp vụ.

**Kịch bản khai thác:** Không phải một lỗ hổng độc lập, nhưng thiếu các header này làm tăng bề mặt tấn công cho các lớp khác (vd thiếu `X-Frame-Options` khiến trang login có thể bị nhúng iframe để clickjacking nếu sau này có XSS hoặc social-engineering; thiếu HSTS khiến trình duyệt không tự ép HTTPS ở lần truy cập sau nếu ai đó truy cập nhầm qua HTTP trên mạng không tin cậy).

**Mức độ:** Nên sửa — chi phí thấp, lợi ích rõ ràng.

**Hướng khắc phục:** `npm install helmet` rồi `app.use(helmet())` ngay đầu `server.js`, tinh chỉnh CSP nếu cần cho các domain gọi API/CDN thực tế.

---

### 2.7 🟠 Chính sách mật khẩu yếu

**File:** `backend/src/validations/authValidation.js:32` (đổi mật khẩu), `:65` (reset mật khẩu), `:90` (đăng ký)

Cả ba nơi chỉ yêu cầu `isLength({ min: 6 })` — không yêu cầu chữ hoa/số/ký tự đặc biệt, không chặn các mật khẩu phổ biến (`123456`, `password`...). Kết hợp với mục 2.3 (không rate limit), đây là combo dễ bị brute-force.

**Mức độ:** Nên sửa.

**Hướng khắc phục:** Nâng tối thiểu lên 8 ký tự, khuyến nghị thêm yêu cầu kết hợp chữ+số. Không cần làm quá phức tạp (chính sách quá khắt khe gây khó cho người dùng thật) — 8+ ký tự cộng rate-limit đăng nhập là đủ cải thiện đáng kể so với hiện tại.

---

### 2.8 🟠 Lỗ hổng dependency (npm audit)

**Backend** (`cd backend && npm audit --omit=dev`):

| Package | Mức độ | Qua đường dependency | Ghi chú |
|---|---|---|---|
| `tar` | Critical | `bcrypt` → `@mapbox/node-pre-gyp` → `tar` | Chỉ dùng lúc `npm install` build native binding của bcrypt, **không** nằm trên đường đi của request HTTP nào — rủi ro thực tế thấp trừ khi máy build/CI xử lý file `.tar` không tin cậy. Fix cần nâng `bcrypt` lên 6.x (breaking change, cần test lại kỹ vì đụng tới hàm hash mật khẩu). |
| `brace-expansion` | High | công cụ dev/glob | Tương tự, không nằm trên đường request runtime. |
| `uuid` | Moderate | `sequelize`/`exceljs` | Lỗi buffer bounds-check khi tự truyền buffer vào — codebase không thấy chỗ nào tự gọi uuid theo kiểu đó, rủi ro thấp. |

**Frontend** (`cd frontend && npm audit --omit=dev`):

| Package | Mức độ | Ghi chú |
|---|---|---|
| `react-router` (6.0.0–7.17.0) | Moderate | Open redirect qua `<Link>`/`useNavigate` khi có backslash trong URL — có thể dùng để lừa người dùng tin vào một link nội bộ nhưng bị điều hướng ra ngoài. Có bản vá qua `npm audit fix`. |

**Mức độ:** Nên sửa (không khẩn cấp) — các lỗ hổng Critical/High phía backend đều là gián tiếp và không nằm trên đường tấn công qua HTTP trực tiếp; nâng cấp nên làm có kiểm soát (đặc biệt `bcrypt` vì liên quan trực tiếp tới xác thực) chứ không cần phản ứng khẩn cấp. Lỗ hổng frontend nên vá sớm vì `npm audit fix` không phải breaking change.

---

### 2.9 🟡 So sánh webhook secret không phải constant-time

**File:** `backend/src/controllers/paymentController.js:51`

```js
req.get('X-Webhook-Secret') !== process.env.PAYMENT_WEBHOOK_SECRET
```

So sánh chuỗi bằng `!==` lý thuyết có thể lộ thông tin qua thời gian phản hồi (timing attack) để dò từng ký tự của secret. Trong thực tế cần hạ tầng đo thời gian rất chính xác qua mạng để khai thác được, và vấn đề lớn hơn là mục 2.2 (secret có thể không được set). Liệt kê để đầy đủ, không phải ưu tiên hành động ngay.

**Hướng khắc phục:** Dùng `crypto.timingSafeEqual` khi so sánh, sau khi đã đảm bảo secret luôn được cấu hình (2.2).

---

### 2.10 🟡 `multer`/`UPLOAD_DIR` khai báo nhưng không dùng

**File:** `backend/package.json` (dependency `multer`), `backend/.env.example` (`UPLOAD_DIR=./src/uploads`)

Đã grep toàn bộ `backend/src/routes` và `backend/src/controllers`: không có route nào dùng `multer`, không có endpoint upload file nào tồn tại. Vì vậy **hiện tại không có rủi ro path-traversal qua tên file upload** — nhưng đây là cấu hình "chết" (dependency cài rồi không dùng, biến môi trường khai báo rồi không đọc ở đâu). Không nguy hiểm, nhưng nếu sau này có người thêm tính năng upload (vd ảnh sân, ảnh phụ kiện) mà không để ý audit này, cần nhớ luôn validate/sanitize tên file và giới hạn loại/kích thước file lúc đó.

**Mức độ:** Ghi chú — dọn dẹp khi tiện, không phải rủi ro bảo mật hiện hành.

---

### 2.11 🟡 Đăng ký tài khoản để lộ SĐT/email đã tồn tại

**File:** `backend/src/services/AuthService.js:244-262`

```js
if (takenPhone) {
  throw new Error("Số điện thoại này đã có tài khoản. Bạn hãy đăng nhập hoặc dùng chức năng quên mật khẩu."); // 409
}
if (takenEmail) {
  throw new Error("Email này đã được dùng cho tài khoản khác."); // 409
}
```

So với `login` (cố ý dùng chung một thông báo để không lộ số nào đã đăng ký — thấy rõ trong comment tại `AuthService.js:39-40`) và `forgotPassword` (cố ý trả cùng thông điệp chung, `:168-174`), thì `register` lại trả lời khác nhau tuỳ SĐT/email đã tồn tại hay chưa. Kẻ tấn công có thể dùng endpoint đăng ký như một "máy dò" xem một số điện thoại có phải khách hàng của quán hay không.

**Mức độ:** Ghi chú — rủi ro thấp (không lộ mật khẩu hay dữ liệu nhạy cảm, chỉ lộ "số này có tài khoản hay không"), và có đánh đổi UX hợp lý (người dùng cần biết để bấm "đăng nhập" thay vì "đăng ký" lại). Liệt kê để chủ dự án chủ động quyết định có chấp nhận đánh đổi này hay không, không bắt buộc phải sửa.

---

### 2.12 🟠 [Bổ sung 16/08] Xuất Excel không lọc formula injection

**File:** `backend/src/utils/reportExporter.js:155` (hàm `buildSessionsSheet`)

```js
row.getCell('customer').value = customerLabel(session); // = session.customer?.fullName, ghi thẳng vào cell
```

**Vấn đề:** `fullName` chỉ được validate là "không rỗng, đã trim"
(`backend/src/validations/customerValidation.js:21,35`,
`backend/src/validations/authValidation.js:81` — đường tự đăng ký), không
chặn ký tự bắt đầu bằng `=`, `+`, `-`, `@`. Đây là lớp lỗ hổng có thật gọi
là "CSV/Formula Injection" — nếu 1 khách tự đăng ký với tên dạng
`=HYPERLINK("http://...", "Click")` hoặc `=cmd|'/c calc'!A1`, chuỗi đó
được ghi y nguyên vào cell Excel. Khi nhân viên/admin xuất báo cáo phiên
chơi rồi mở file bằng Excel, tuỳ cấu hình bảo mật của Excel trên máy người
mở, công thức có thể được tính toán — nhẹ thì mở 1 link lừa đảo, nặng thì
(với Excel cũ hoặc đã bật DDE/macro) có thể dẫn tới thực thi lệnh trên máy
người mở file.

**Mức độ:** Nên sửa — Excel hiện đại có cảnh báo mặc định khi mở file có
liên kết ngoài nên không tự động khai thác được 100%, nhưng đây là lớp lỗi
kinh điển, chi phí sửa rất thấp so với rủi ro nếu ai đó chủ quan bấm "Cho
phép".

**Hướng khắc phục:** Trước khi ghi bất kỳ chuỗi nào có nguồn gốc từ người
dùng (tên khách, ghi chú, tên nhà cung cấp...) vào cell Excel/CSV, nếu ký
tự đầu tiên là `=`, `+`, `-`, `@`, `\t`, `\r` thì thêm 1 dấu `'` (apostrophe)
ở đầu — Excel sẽ hiển thị nguyên văn thay vì tính công thức. Nên viết 1 hàm
dùng chung `sanitizeForSpreadsheet()` áp dụng cho mọi cell nhận dữ liệu từ
DB trong `reportExporter.js`, không chỉ tên khách.

---

### 2.13 🟠 [Bổ sung 16/08] Container backend chạy bằng root, rủi ro secret lọt vào image

**File:** `docker/backend.Dockerfile`

Không có dòng `USER` nào trong Dockerfile, nên container chạy với quyền
`root` mặc định của base image `node:18-alpine` — nếu có lỗ hổng RCE nào
khác trong ứng dụng, kẻ tấn công có quyền root ngay trong container thay vì
bị giới hạn bởi 1 user thường.

Đồng thời, **không có file `.dockerignore`** trong repo. Dockerfile có
`COPY . .` sau `npm ci` — nếu `backend/.env` (chứa secret thật) đang tồn
tại trên máy lúc build image (tình huống rất dễ xảy ra vì đây cũng là file
dev cần có để chạy `npm run dev`), nó sẽ bị copy thẳng vào image, nằm
trong lịch sử layer của image ngay cả khi file bị xoá ở bước sau — bất kỳ
ai có quyền pull/inspect image đều lấy lại được. Lưu ý: đây khác với biến
môi trường truyền lúc chạy container qua `docker-compose.yml`'s `env_file`
— cấu hình runtime đó không có vấn đề gì, vấn đề nằm ở bước *build*.

**Mức độ:** Nên sửa — chưa xảy ra tác hại nào được xác nhận (phụ thuộc quy
trình build hiện tại có đang copy `.env` vào không), nhưng đây là kiểu lỗi
"âm thầm rò rỉ secret vào image registry" nếu ai đó build đúng lúc `.env`
tồn tại trong thư mục, dễ bị bỏ sót vì image build vẫn chạy đúng.

**Hướng khắc phục:** Thêm `docker/.dockerignore` loại trừ `.env`,
`node_modules`, `*.log`; thêm `USER node` (image `node:18-alpine` đã có sẵn
user `node` không cần tạo mới) trước `CMD`/`ENTRYPOINT` trong
`backend.Dockerfile`.

---

### 2.14 🟡 [Bổ sung 16/08] Cổng MySQL mở ra host không cần thiết

**File:** `docker/docker-compose.yml:12-13`

```yaml
ports:
  - "3306:3306"
```

Backend kết nối MySQL qua network nội bộ của Docker Compose (tên service
`mysql`), không cần cổng này mở ra ngoài host. Việc mở cổng khiến MySQL có
thể truy cập được từ bất kỳ máy nào kết nối được tới host chạy Docker (tuỳ
firewall của máy/VPS) — mật khẩu MySQL vẫn là lớp bảo vệ, nhưng đỡ mở cổng
nào thì đỡ bề mặt tấn công đó, đặc biệt nếu sau này deploy lên VPS không
cấu hình firewall chặt.

**Mức độ:** Ghi chú — không phải lỗ hổng có thể khai thác ngay hôm nay
(vẫn cần đúng mật khẩu MySQL), nhưng là thực hành cấu hình nên sửa.

**Hướng khắc phục:** Bỏ mục `ports` của service `mysql` trong
`docker-compose.yml` (chỉ giữ `expose` nội bộ nếu cần), trừ khi có nhu cầu
thật sự truy cập DB trực tiếp từ máy host để debug — khi đó nên giới hạn
bằng `127.0.0.1:3306:3306` thay vì mở ra mọi network interface.

---

## 3. Đã ổn / đã làm đúng

Để không tạo cảm giác toàn hệ thống có vấn đề — các phần sau đã kiểm tra kỹ và **không** phát hiện lỗi:

1. **Mật khẩu được băm bằng bcrypt** (cost factor 10) ở mọi nơi tạo/đổi mật khẩu — `AuthService.js` (login, changePassword, resetPassword, register), `EmployeeService.js`. Không có nơi nào lưu mật khẩu dạng plaintext hay dùng thuật toán yếu (MD5/SHA1).

2. **Không có SQL injection trong code chạy runtime.** Đã grep toàn bộ `sequelize.query(...)` trong `backend/src` — tất cả các lệnh raw SQL chỉ nằm trong **migrations** và **seeders** (chạy một lần lúc deploy, không nhận input từ người dùng cuối), không có lệnh raw nào trong `services/`, `controllers/`. Toàn bộ truy vấn phục vụ request thực tế đi qua Sequelize ORM (parameterized theo mặc định).

3. **Không có command injection** — grep toàn bộ `backend/src` cho `child_process`, `exec(`, `execSync(`, `spawn(`: không có kết quả nào.

4. **Kiểm soát quyền theo chủ sở hữu (IDOR) được áp dụng nhất quán** cho vai trò `customer`:
   - `CustomerService.assertOwnership()` (`CustomerService.js:236-242`) chặn khách xem hồ sơ/lịch sử của khách khác — áp dụng ở cả `getCustomerById` lẫn `getCustomerHistory` (`CustomerService.js:55,212`).
   - `BookingService.getBookingById` (`BookingService.js:362`) chặn khách xem booking không phải của mình.
   - `PaymentService.getInvoiceById` (`PaymentService.js:225-229`) chặn khách xem hoá đơn không phải của mình.
   - Route `GET /sessions/:sessionId` không mở cho vai trò `customer` (chỉ `admin/branch_manager/employee` — `sessionRoutes.js:14-20`), nên không có đường nào để khách truy cập session của người khác.

5. **Cách ly dữ liệu đa chi nhánh (multi-tenant) hoạt động đúng như thiết kế.** `branchContextMiddleware.js:18-20` chặn 403 ngay khi nhân viên không phải admin gửi `X-Branch-Id` khác chi nhánh của họ, và middleware này được gắn (`router.use(authMiddleware, branchContextMiddleware, ...)`) ở toàn bộ 13/13 route file cần cách ly theo chi nhánh (`accessory`, `booking`, `court`, `customer`, `employee`, `goodsReceipt`, `inventory`, `invoice`, `payment`, `report`, `session`, `setting`, `supplier`) — không có route nào bị bỏ sót.

6. **Không thể tự nâng quyền khi tạo tài khoản nhân viên.** `EmployeeService.js:83-92` luôn gán cứng role `employee` khi tạo nhân viên mới (tự tra role theo tên `"employee"` trong DB), bỏ qua hoàn toàn mọi giá trị role client gửi lên — một `branch_manager` không thể tạo ra tài khoản `admin` qua API này.

7. **Token đặt lại mật khẩu tự vô hiệu khi đổi mật khẩu.** `resetTokenSecret()` (`jwt.js:11`) ký token reset bằng secret ghép thêm `passwordHash` hiện tại của user — đổi mật khẩu xong, mọi link reset cũ (kể cả chưa hết hạn 15 phút) tự động sai chữ ký. `resetPassword` cũng chủ động null hoá `refreshToken` để đăng xuất mọi phiên (`AuthService.js:214`).

8. **Không lộ thông tin tài khoản qua `forgot-password`.** `AuthService.forgotPassword` (`:167-188`) luôn trả cùng một thông điệp chung dù email tồn tại hay không.

9. **Nhật ký hoạt động (activity log) không còn ghi lại secret.** `AuditService.js:3-16` đệ quy loại bỏ (`redact`) các khoá `passwordHash`, `password`, `refreshToken` ở mọi tầng object trước khi ghi vào `ActivityLog` — đúng như hướng đã sửa ở migration `20260814110001-scrub-secrets-from-activity-logs.js`, và qua audit lần này không thấy chỗ nào ghi `req.body` thô ra log bỏ qua bước redact này.

10. **Error handler không lộ thông tin nội bộ.** `errorHandler.js` chỉ `console.error` phía server, phản hồi cho client chỉ gồm `message` đã được các service tự đặt có chủ đích — không trả `stack trace` hay chi tiết lỗi DB ra ngoài.

11. **Cấu hình CORS không mở toang.** `server.js:11-16` giới hạn `origin` theo `CORS_ORIGIN` (mặc định `http://localhost:5173`) thay vì `*`, nên việc bật `credentials: true` không rơi vào lỗi kinh điển "wildcard origin + credentials".

12. **Không có XSS phía frontend qua các vector thường gặp.** Grep toàn bộ `frontend/src` cho `dangerouslySetInnerHTML`, gán trực tiếp `.innerHTML`, và `eval(`: không có kết quả nào.

13. **Xuất báo cáo PDF an toàn.** `reportExporter.js` dựng PDF bằng PDFKit, mọi text đi qua `String(...)` rồi `.text(...)` với `ellipsis`/độ rộng cột cố định — không nội suy vào template/HTML nào, không có cách chèn mã thực thi vào file PDF xuất ra. **(Sửa 16/08: phần Excel trong nhận định này KHÔNG đúng — xem mục 2.12, phát hiện lỗ hổng formula injection thật ở `reportExporter.js:155`.)**

14. **Không có endpoint upload file nào đang hoạt động** (xem mục 2.10) — nên dù dependency `multer` có mặt, hiện chưa có bề mặt tấn công path-traversal qua file upload.

15. **`.env` không bị lộ qua Git.** `.gitignore` gốc có pattern `.env` (áp dụng mọi cấp thư mục, bao gồm `backend/.env`, `frontend/.env`), và xác nhận qua `git ls-files` không có file `.env` nào từng được track.

16. **Quyền được xác thực lại theo thời gian thực, không tin vào payload JWT.** `authMiddleware.js:29-35` luôn truy vấn lại `User` + `Role` mới nhất từ DB cho mỗi request thay vì tin vào field `role` đã ký trong access token — nghĩa là khi admin đổi quyền hoặc khoá một tài khoản, thay đổi có hiệu lực ngay lập tức, không phải chờ token cũ (tối đa 15 phút) hết hạn.

17. **Migration gộp khách hàng trùng SĐT đã được xử lý an toàn từ trước** (`20260815300001-unify-customers-chain-wide.js`, có bảng `customer_merge_audit` và xử lý xung đột) — không phát hiện thêm vấn đề mới, không audit lại chi tiết theo đúng phạm vi được giao.

18. **Thời hạn token đúng như tài liệu kiến trúc:** access token 15 phút, refresh token 7 ngày (`jwt.js:5-6`), khớp với mô tả trong `CLAUDE.md`.

---

## 4. Tổng kết ưu tiên

Nếu chỉ chọn một việc để làm trước, nên là **mục 2.1 — bỏ secret JWT mặc định và bắt buộc kiểm tra khi khởi động** — vì nó là điều kiện "một lỗi cấu hình duy nhất → mất toàn quyền hệ thống", và cách khắc phục chỉ tốn vài dòng code (không đổi kiến trúc). Ngay sau đó nên xử lý cặp 2.2 (webhook thanh toán) và 2.3 (rate limit đăng nhập) vì cả hai đều là lỗ hổng có thể khai thác **ngay hôm nay** mà không cần điều kiện đặc biệt nào, một cái ảnh hưởng trực tiếp tới doanh thu, một cái ảnh hưởng tới toàn bộ tài khoản người dùng.
