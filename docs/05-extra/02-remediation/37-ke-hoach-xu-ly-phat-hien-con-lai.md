# Kế hoạch 37 — Xử lý toàn bộ phát hiện còn lại của đợt bảo mật (gộp)

**Ngày:** 2026-10-15 · **Nhánh kế hoạch:** `docs/ke-hoach-37-xu-ly-con-lai` (tách từ `test/ke-hoach-kiem-thu-bao-mat`, bae38c7)
**Yêu cầu của bạn:** "tiếp đi, làm xong hết luôn". Vì còn nhiều mục cần bạn **chọn chính sách** (độ dài mật khẩu,
có chặn đặt 6 giờ không…) và có **một migration**, mình gộp mọi thứ vào một kế hoạch để bạn duyệt **một lần**;
duyệt xong mình làm liền một mạch, không dừng hỏi từng mục.
**Trạng thái:** CHỜ DUYỆT. Chưa sửa dòng code nào.
**Đích merge:** `test/ke-hoach-kiem-thu-bao-mat` (không `main`, không push).

## 1. Còn lại những gì

Đã xong: R1, R9, R10, R13. Còn lại (theo `33-ket-qua-kiem-thu-bao-mat.md`):

| Nhóm | Mục | Cần quyết định? | Có migration? |
|---|---|---|---|
| **A** vá nhỏ | R5 (dò tài khoản qua thời gian), R6 (lộ trạng thái khoá), R8 (phụ kiện chéo chi nhánh), R11 (500 thay vì 400/409), R12 (settings không validate) | Không | Không |
| **B** mật khẩu | R2 (chính sách mật khẩu) | **Có** — Q1, Q2 | Không |
| **C** phiên đăng nhập | R3 (refresh token xoay vòng), R4 (access token sống sau logout/đổi mật khẩu) | **Có** — Q3, Q4 | **Có** (3 cột) |
| **D** quy tắc & hạ tầng | R15 (giới hạn 3 giờ ở server), R14 (ghim GitHub Actions…), R7 (đăng ký báo trùng) | **Có** — Q5, Q6, Q7 | Không |
| **E** kiểm thử còn thiếu | B9, C4, D2, D7, D8, E4, F3, F4, F6, G1, G6, H6–H8 + trivy image | Không (chỉ test, không đổi code ứng dụng) | Không |

## 2. Nhóm A — vá nhỏ (nhánh `fix/r5-r6-r8-r11-r12-va-nho`)

| Mục | Vị trí | Sửa |
|---|---|---|
| **R5** | `AuthService.login` dòng ~57 | Khi không tìm thấy user vẫn `bcrypt.compare` với một hash giả (sinh một lần lúc nạp module, cost 10) rồi mới trả 401 — thời gian hai nhánh xấp xỉ nhau |
| **R6** | `AuthService.login` dòng ~59 | So mật khẩu **trước**; chỉ khi mật khẩu đúng mới báo "tài khoản bị vô hiệu hóa" (403). Mật khẩu sai → 401 như mọi trường hợp |
| **R8** | `AccessoryService.getSessionExtras` + controller | Truyền `req.branchId`, kiểm phiên thuộc chi nhánh (cùng cách `addSessionExtra`); khác chi nhánh → 404 |
| **R11** | `validations/` + `errorHandler.js` | (a) báo cáo: `period` ∈ {daily, monthly, quarterly, yearly}, `from`/`to` đúng `YYYY-MM-DD`, `from ≤ to` → 400; (b) độ dài chuỗi khớp cột DB (`fullName` ≤ 100, v.v.) ở đăng ký, khách, nhân viên; (c) id số nguyên trong miền INT (`customerId`, `courtId`…) → 400 thay vì 500; (d) `ER_LOCK_DEADLOCK`/`ER_LOCK_WAIT_TIMEOUT` → **409** "Hệ thống đang bận, vui lòng thử lại" thay vì 500 |
| **R12** | `validations/settingValidation.js` + 3 route | Kiểm **kiểu**, không ép hình dạng (giao diện Cài đặt còn gửi nhiều biến thể): body phải là object phẳng, ≤ 20 khoá, ≤ 4 KB; giờ (`open`/`close`/`peak_*`) khớp `HH:mm`; số tiền/giá là số hữu hạn không âm ≤ 1e9; chuỗi ≤ 200 ký tự. `PUT /settings` chỉ nhận khoá đã dùng trong code: `pricing`, `operating_hours`, `branding`, `discount_policy`, `store_info` |

Test: đổi `test.failing` của R8 → `test`; thêm test cho R5 (spy `bcrypt.compare` được gọi cả khi không có user), R6,
R11, R12 ở `backend/tests` (không cần DB) và `tests-security`.

## 3. Nhóm B — chính sách mật khẩu R2 (nhánh `fix/r2-chinh-sach-mat-khau`)

**Đề xuất (Q1):** tối thiểu **8 ký tự**; không nằm trong danh sách ~200 mật khẩu phổ biến/kiểu bàn phím
(`123456`, `password`, `qwerty`, `matkhau`, `12345678`…); không trùng số điện thoại, phần trước `@` của email,
hay chính họ tên. **Không** ép chữ hoa/số/ký tự đặc biệt (NIST 800-63B khuyến nghị bỏ).

- **Backend:** hàm thuần `utils/passwordPolicy.js` (có test), dùng ở: đăng ký, đổi mật khẩu, đặt lại mật khẩu,
  tạo nhân viên (`employeeValidation`), tạo tài khoản khách (`customerValidation`). Mật khẩu **đang có** không
  bị ảnh hưởng; đăng nhập không kiểm chính sách.
- **Frontend (Q2 — đây là đổi chữ trên giao diện, nên cần bạn nói):** 5 chỗ ghi "tối thiểu 6 ký tự"
  (`AccountPage`, `RegisterPage`, `ResetPasswordPage`, `EmployeesPage`, `CustomersPage`) và `minLength={6}` →
  8; hiển thị lỗi server (danh sách phổ biến / trùng SĐT) bằng thông báo hiện có. Một hàm `passwordRules.js` +
  Vitest, dùng chung để chữ và kiểm tra không lệch nhau.
- Mật khẩu mẫu của seeder/demo (`Admin@123` 9 ký tự, `Manager@123`, `Employee@123`, `Customer@123`) vẫn ≥ 8
  và không bị kiểm khi đăng nhập; không phải sửa.
- Test: `test.failing` R2 → `test`.

## 4. Nhóm C — phiên đăng nhập R3 + R4 (nhánh `fix/r3-r4-phien-dang-nhap`)

### 4.1 Migration (một file, 3 cột trên `users`)

| Cột | Mục đích |
|---|---|
| `token_version INT NOT NULL DEFAULT 0` | R4: access token mang `tv`; tăng khi logout, đổi/đặt lại mật khẩu, khoá tài khoản |
| `previous_refresh_token VARCHAR(255) NULL` | R3: hash refresh token **ngay trước** lần xoay gần nhất |
| `previous_refresh_expires_at DATETIME NULL` | R3: hết hạn của "cửa sổ ân hạn" (mặc định 30 giây) |

`down()` đảo ngược. Chỉ chạy trên **DB tạm** của đợt test; DB dev của bạn **không** bị migrate cho tới khi bạn
nói (Q4). Bản demo Render tự migrate khi reset hằng đêm.

### 4.2 R3 — xoay vòng refresh token

- Refresh token thêm `jti` ngẫu nhiên (hiện hai token ký cùng giây trùng nhau từng ký tự — phát hiện ở kế hoạch 34).
- `POST /auth/refresh-token`: khớp token hiện tại → cấp **cặp mới** (`accessToken` + `refreshToken`), lưu hash
  mới, chuyển hash cũ sang `previous_*` kèm hạn 30 s. Khớp token **ngay trước đó** còn trong 30 s (hai tab/hai
  luồng cùng refresh) → chỉ cấp `accessToken` mới, **không xoay** (tránh đá nhau). Quá 30 s hoặc không khớp → 401.
- **Frontend:** `apiClient.requestRefresh`/`refreshAccessToken` lưu thêm `refresh_token` mới nếu server trả
  (dùng lại `storeSessionTokens` đã có từ R1). Cả luồng SSE (`realtimeClient`, `competitionStream`) đã đi qua
  `refreshAccessToken` nên tự hưởng.
- Đổi mật khẩu/đặt lại mật khẩu/logout xoá luôn `previous_*`.

### 4.3 R4 — thu hồi access token

- Access token thêm claim `tv` (= `token_version` lúc phát). `authMiddleware` và `sseAuthMiddleware` (hai nơi
  duy nhất verify access token) so với `req.user.tokenVersion` đã nạp sẵn → lệch thì 401. Không thêm truy vấn.
- Token phát **trước** khi deploy không có `tv` → coi như 0 → còn hiệu lực tới khi hết hạn hoặc tới lần tăng
  đầu tiên, nên deploy không đăng xuất ai.
- Tăng `token_version` ở: logout, đổi mật khẩu (thiết bị đang đổi nhận token mới mang `tv` mới — giữ phiên như R1),
  đặt lại mật khẩu, khoá tài khoản (`isActive=false`).

Test: đổi `test.failing` R3 và R4 → `test`; thêm test: hai tab refresh song song (ân hạn), token quá hạn ân hạn
→ 401, `tv` lệch → 401, đổi mật khẩu vẫn giữ phiên thiết bị đang đổi, token cũ không `tv` vẫn dùng được.

## 5. Nhóm D — quy tắc & hạ tầng (nhánh `fix/r14-r15-quy-tac-va-ha-tang`)

| Mục | Đề xuất mặc định | Ghi chú |
|---|---|---|
| **R15** (Q5) | `POST /bookings` và `PUT /bookings/:id`: **khách** tối đa 3 giờ/lượt (cùng `MAX_BOOKING_HOURS` của giao diện); nhân viên không giới hạn | Trả 400 với thông điệp rõ |
| **R14a** (Q6) | Ghim `actions/checkout@v4` và `actions/setup-node@v4` theo **commit SHA** (lấy bằng `git ls-remote`) ở `ci.yml`, `demo-reset.yml`, kèm comment tag | Không đổi hành vi |
| **R14b** | `nginx.conf`: giữ `$host` — backend không dùng `Host` của request để dựng link (dùng `FRONTEND_URL`/`RENDER_EXTERNAL_URL`), nên không khai thác được; ghi vào báo cáo | Không đổi |
| **R14c** | `frontend.Dockerfile` chạy nginx bằng root: **không đổi** (đổi sang `nginx-unprivileged` làm đổi cổng 80→8080, compose và healthcheck) — ghi là rủi ro chấp nhận | Quyết bạn nếu muốn đổi |
| **R14d** | Token SSE trong URL (`?token=`): **không đổi** (cần thiết kế lại bằng vé một lần) — ghi vào báo cáo | |
| **R7** (Q7) | **Giữ nguyên** thông báo "SĐT/email đã có tài khoản" (giúp khách biết đi "Quên mật khẩu"), ghi là rủi ro chấp nhận; limiter 5/giờ/IP làm chậm việc dò | Đổi sang thông báo chung nếu bạn muốn, đổi lại bằng trải nghiệm |

## 6. Nhóm E — kiểm thử còn thiếu (không đổi code ứng dụng)

Làm trên server tạm + Docker đã có: **B9** (gọi thẳng competition-service không token / token ký sai), **C4**
(xuất Excel với ô bắt đầu bằng `= + - @`), **D2** (webhook competition: sai chữ ký, timestamp, bản cũ, body sửa
1 byte), **D7/D8** (phí sân chuyển sân; void hoá đơn sai vai trò/chi nhánh/đã huỷ), **E4** (log và `ActivityLog`
không chứa mật khẩu/token), **F3/F4/F6** (token ở `localStorage`, clickjacking trang nhân viên, vào thẳng URL
khu nhân viên bằng tài khoản khách), **G1** (giới hạn SSE 40/300), **G6** (k6 smoke), **H6–H8** (DB TLS, chặn
seed ở production, quyền token workflow), và trivy quét **image** build từ `docker/app.Dockerfile`.
Kết quả ghi vào báo cáo; lỗi mới (nếu có) sẽ **liệt kê chứ không tự sửa** — chờ bạn.

## 7. Cách làm một mạch sau khi bạn duyệt

Thứ tự: **A → B → D → C → E**. Mỗi nhóm một nhánh riêng tách từ nhánh test (đã có nhóm trước), theo đúng quy
trình của đợt này:

1. code + test (`npm test`, `test:security`, Vitest, build);
2. **kiểm thật**: backend tạm riêng + Chrome headless 2 cỡ màn hình + (khi liên quan) ZAP/curl;
3. commit, rồi **merge vào `test/ke-hoach-kiem-thu-bao-mat`** (`--no-ff`, worktree riêng); chạy tiếp nhóm sau.

`node_modules` của bạn **không bị đụng** (làm trong worktree riêng như R13). Không migrate DB dev, không push,
không dừng server của bạn. Cuối cùng: một báo cáo tổng hợp (cập nhật `33-…` nếu Q8 = có) và dọn môi trường tạm
khi bạn nói. Nếu giữa chừng có kết quả bất ngờ (test đỏ không giải thích được, kiểm thật lộ lỗi), mình dừng ở
nhóm đó và báo, **không** làm tiếp phần sau.

## 8. Rủi ro chính

| Rủi ro | Mức | Cách xử lý |
|---|---|---|
| R3: xoay refresh token làm người dùng bị đăng xuất nhầm khi nhiều tab/SSE refresh cùng lúc | Trung bình | Cửa sổ ân hạn 30 s + kiểm Chrome mở 2 tab refresh song song; nếu vẫn đá nhau thì dừng, không merge |
| R4/R3: migration trên bảng `users` | Thấp | 3 cột có giá trị mặc định/NULL, không khoá lâu; có `down()`; thử `up`→`down`→`up` trên DB tạm |
| R2: chính sách mới chặn người dùng quen mật khẩu ngắn khi **đổi** mật khẩu | Thấp | Chỉ áp khi đặt/đổi, không khi đăng nhập |
| R11(d): 409 do deadlock khiến client cũ hiểu sai | Thấp | Thông điệp rõ, giao diện hiện lỗi từ server như các lỗi 4xx khác |
| Khối lượng lớn → khó review | Trung bình | Mỗi nhóm một nhánh/commit riêng, plan này ghi rõ file nào của nhóm nào |

## 9. Câu hỏi cần bạn trả lời (một lần)

Mặc định bên cạnh chỉ là đề xuất; câu nào bạn không trả lời, mình **không** tự làm phần đó.

- **Q1.** Chính sách mật khẩu: tối thiểu **8** ký tự + chặn mật khẩu phổ biến + chặn trùng SĐT/email/tên, không
  ép ký tự đặc biệt — đồng ý? (hay 10/12 ký tự?)
- **Q2.** Cho đổi chữ "Tối thiểu 6 ký tự" → "8" ở 5 trang (bắt buộc nếu làm Q1)?
- **Q3.** Xoay refresh token **kèm cửa sổ ân hạn 30 giây** (cần 2 cột) — đồng ý? Hay chỉ xoay đơn giản không
  ân hạn (dễ đá người dùng nhiều tab)?
- **Q4.** Thêm cột `token_version` + 2 cột refresh trước đó vào `users` bằng **một migration**; chạy trên DB
  tạm, **không** chạy lên DB dev của bạn cho tới khi bạn nói — đồng ý?
- **Q5.** Server giới hạn **khách** đặt tối đa 3 giờ/lượt (nhân viên không giới hạn)?
- **Q6.** Ghim GitHub Actions theo SHA (R14a) — làm? Và xác nhận **không** làm R14b/c/d (chỉ ghi rủi ro chấp nhận)?
- **Q7.** Giữ thông báo "SĐT/email đã có tài khoản" khi đăng ký (R7), ghi là rủi ro chấp nhận?
- **Q8.** Cuối đợt có cập nhật `33-ket-qua-kiem-thu-bao-mat.md` (đánh dấu từng R đã sửa/chấp nhận), `CLAUDE.md`
  (mục auth, header, chính sách mật khẩu) và `00-tien-do.md` không? (Các lần trước bạn chọn "chưa"; đề xuất:
  **có** vào lúc kết thúc để tài liệu không lệch với code.)
- **Q9.** Nhóm E (§6) — làm hết như liệt kê?
