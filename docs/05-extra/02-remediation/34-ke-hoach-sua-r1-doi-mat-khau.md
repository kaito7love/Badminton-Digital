# Kế hoạch 34 — Sửa R1: đổi mật khẩu phải thu hồi refresh token cũ

**Ngày:** 2026-10-15 · **Nhánh:** `fix/r1-doi-mat-khau-thu-hoi-phien`
**Tách từ:** `test/ke-hoach-kiem-thu-bao-mat` (98d3db1, **chưa merge vào `main`**) — vì test `test.failing` cần đổi nằm ở nhánh đó.
**Trạng thái:** ĐÃ DUYỆT 2026-10-15 và đã code, chờ bạn xem kết quả (§8) rồi mới merge.
**Nguồn:** phát hiện R1 trong `33-ket-qua-kiem-thu-bao-mat.md` (A6b).

## 1. Vấn đề

`AuthService.changePassword` (`backend/src/services/AuthService.js:162`) chỉ đổi `passwordHash`; cột
`users.refreshToken` giữ nguyên. Hậu quả đã đo được trên server tạm: sau khi đổi mật khẩu (200), refresh
token cũ vẫn đổi được access token mới (200), tới 7 ngày. Người nghi bị lộ tài khoản đổi mật khẩu xong mà
phiên của kẻ kia vẫn sống. `resetPassword` (cùng file, dòng 247–251) thì đã xoá `refreshToken`.

## 2. Ràng buộc phải giữ

- **Trang Tài khoản đang hứa** (`frontend/src/pages/Account/AccountPage.jsx`, đoạn mô tả form đổi mật khẩu):
  "Đổi xong bạn vẫn giữ nguyên phiên đăng nhập này." Chỉ xoá `refreshToken` là thiết bị đang đổi cũng bị
  đăng xuất sau tối đa 15 phút (khi access token hết hạn) — trái lời hứa đó. Vì vậy thiết bị đang đổi phải
  nhận cặp token mới.
- Mỗi user chỉ có **một** cột `refreshToken`, nên cấp refresh token mới cho thiết bị này tự động vô hiệu
  mọi thiết bị khác — đúng ý muốn, không cần bảng phiên.
- Tài khoản demo dùng chung vẫn bị khoá đổi mật khẩu (403) như hiện nay (`assertNotLockedDemoAccount`).
- Không đổi hình dạng response hiện có theo kiểu phá vỡ: `data` đang là `null`, sẽ thành object — client cũ
  bỏ qua `data` nên không hỏng.

## 3. Thay đổi đề xuất

### 3.1 Backend (2 file)

**`backend/src/services/AuthService.js` — `changePassword`:**
1. Nạp user kèm `Role` (như `login`) để token mang đúng `role`.
2. Sau khi kiểm mật khẩu cũ đúng: sinh `accessToken` + `refreshToken` mới.
3. Ghi **một** lệnh `User.update({ passwordHash, refreshToken: hashRefreshToken(newRefresh) }, { where: { id } })`
   thay cho `user.save()`. Lý do: model có `version: true`; `login` đã chuyển sang `User.update` vì
   `save()` ném `OptimisticLockError` (→ 500) khi chạm một lần đăng nhập/refresh đồng thời. Giữ `save()` ở
   đây là giữ nguyên lỗ hổng đó.
4. Trả `{ message, accessToken, refreshToken }`.

**`backend/src/controllers/authController.js` — `changePassword` (dòng ~113):**
trả `data: { accessToken, refreshToken }` thay vì `data: null`.

Không đụng: `authMiddleware`, validator, route, `resetPassword`, `login`, `refreshAccessToken`.

### 3.2 Frontend (1 hàm nhỏ + 1 chỗ gọi)

- **Mới** `frontend/src/utils/sessionTokens.js`: hàm thuần `storeSessionTokens(data, storage)` — chỉ ghi
  `access_token` / `refresh_token` khi cả hai là chuỗi không rỗng; ngược lại bỏ qua (không bao giờ xoá token
  hiện có). Có Vitest.
- **`AccountPage.jsx`** (`ChangePasswordCard.handleSubmit`, dòng ~77): sau `await authService.changePassword(...)`
  gọi `storeSessionTokens(res.data?.data)`.
- Không đổi chữ trên giao diện (xem Q2).

### 3.3 Test (đúng yêu cầu: đổi `test.failing` → `test`)

| File | Thay đổi |
|---|---|
| `backend/tests-security/auth-session.security.test.js` | Dòng 43 `test.failing('R1/A6b …')` → `test('R1/A6b …')`. Thêm 3 test cạnh nó: (a) response có cặp token mới và refresh token **mới** đổi được access token (200); (b) đổi mật khẩu với mật khẩu cũ **sai** (400) không làm refresh token cũ mất hiệu lực; (c) access token mới gọi được `/auth/me`. |
| `backend/tests/changePassword.test.js` (mới, không cần DB) | Mock `User.scope(...).findByPk` + `User.update`: kiểm `User.update` được gọi **một lần** với `passwordHash` khớp mật khẩu mới (bcrypt) và `refreshToken` = sha256 của refresh token trả về; mật khẩu cũ sai → không gọi `update`; tài khoản demo → 403 và không `update`. |
| `frontend/src/utils/sessionTokens.test.js` (mới) | Ghi đúng khi đủ cả hai; bỏ qua khi thiếu/không phải chuỗi/`null`; không xoá token có sẵn. |

Bốn `test.failing` còn lại (R2, R3, R4, R8) **giữ nguyên** — không thuộc phạm vi.

### 3.4 Không nằm trong phạm vi (cố ý)

- **R4:** access token đã phát vẫn dùng được tới 15 phút sau đổi mật khẩu — cần `token_version`, là nhánh riêng.
  Sau sửa R1, kẻ cầm refresh token cũ không **gia hạn** được nữa; chỉ còn đúng cửa sổ ≤ 15 phút của access
  token đã có. Test A6c vẫn là `failing`.
- R2 (chính sách mật khẩu), R3 (xoay vòng refresh khi dùng), các phát hiện khác.

## 4. Cách kiểm tra thật (đúng quy trình đã thống nhất)

1. `npm test` backend (kỳ vọng 660 + test mới, 0 đỏ) và `npm test` frontend (Vitest).
2. `npm run test:security` trên DB tạm: R1 chuyển từ "failing mong đợi" sang pass thường; R2, R3, R4, R8 vẫn
   `failing` (nếu một cái nào bỗng pass là có tác dụng phụ ngoài ý muốn).
3. **Chạy thật, không chỉ test:** dựng một backend tạm **mới** ở :5051 từ nhánh này (cùng DB tạm
   `bd_sectest_32`, frontend build vào thư mục scratchpad riêng). Server tạm cũ :5050 và server của bạn
   (:5000/:5102/:5173) **không bị dừng hay đụng**.
   - API: đăng nhập 2 lần như 2 thiết bị A, B → B đổi mật khẩu → refresh token của A bị 401, refresh token mới
     của B được 200; mật khẩu cũ sai → A vẫn còn phiên.
   - Trình duyệt Chrome headless (laptop 1366×768 và điện thoại 390×844): đăng nhập → Tài khoản → đổi mật khẩu
     → xoá `access_token` khỏi localStorage rồi tải lại trang → vẫn đăng nhập (bằng refresh token mới), không
     bị đá ra `/login`; thiết bị khác (một profile Chrome thứ hai) bị đá ra sau khi access token hết hạn.
4. Dọn dữ liệu test (tài khoản khách tạo cho lần thử) sau khi xong.

## 5. Rủi ro

| Rủi ro | Mức | Cách xử lý |
|---|---|---|
| Frontend cũ còn trong cache gọi backend mới → thiết bị đổi mật khẩu bị đăng xuất sau ≤ 15 phút | Thấp | Bản deploy (Render) phục vụ backend + frontend cùng một image; `index.html` là `no-cache`. Chỉ ảnh hưởng người đang mở tab cũ ngay lúc deploy |
| Người dùng nhiều thiết bị bị đăng xuất ở thiết bị khác khi đổi mật khẩu | Chủ đích | Đó chính là hành vi cần có |
| Hai thao tác đồng thời (đổi mật khẩu + đăng nhập) | Thấp | Dùng `User.update` một lệnh như `login`, không còn `OptimisticLockError` |

## 6. Phạm vi file

Sửa: `backend/src/services/AuthService.js`, `backend/src/controllers/authController.js`,
`frontend/src/pages/Account/AccountPage.jsx`, `backend/tests-security/auth-session.security.test.js`.
Mới: `frontend/src/utils/sessionTokens.js` (+ `.test.js`), `backend/tests/changePassword.test.js`.
Không đụng: migration, schema DB, route, cấu hình, `package.json`.

## 7. Câu hỏi cần bạn trả lời trước khi code

Các mục dưới đây **chưa có câu trả lời nên chưa làm**; mặc định ghi bên cạnh chỉ là đề xuất.

- **Q1.** Cấp cặp token mới cho thiết bị đang đổi mật khẩu (đề xuất, giữ đúng lời hứa trên giao diện) — hay
  chỉ xoá refresh token (đơn giản hơn, nhưng thiết bị đang đổi bị đăng xuất sau ≤ 15 phút)?
- **Q2.** Có đổi câu chữ trên trang Tài khoản thành kiểu "Đổi xong, các thiết bị khác sẽ phải đăng nhập lại"
  không? (Đề xuất: **không đổi** nếu bạn không yêu cầu.)
- **Q3.** Tài liệu: sau khi code xong có cập nhật (a) script test + mô tả của request "Change password" trong
  Postman rồi chạy `npm run docs:build`, (b) `CLAUDE.md` + `00-tien-do.md`, (c) đánh dấu R1 đã sửa trong báo
  cáo 33 không? (Đề xuất: làm (a) vì Postman sẽ giữ refresh token cũ; (b), (c) chỉ khi bạn nói.)
- **Q4.** Thứ tự merge: nhánh này tách từ `test/ke-hoach-kiem-thu-bao-mat` (chưa merge). Bạn muốn merge nhánh
  test vào `main` trước, rồi nhánh này — hay merge cùng lúc?

## 8. Quyết định đã chốt và kết quả thực hiện

**Trả lời bốn câu hỏi (2026-10-15):** Q1 cấp cặp token mới cho thiết bị đang đổi · Q2 không đổi chữ trên giao
diện · Q3 chỉ làm (a) Postman + `docs:build` · Q4 merge nhánh test vào `main` trước, rồi mới tới nhánh này
(**chưa merge gì**, chờ lệnh "merge vào main đi").

**Đã sửa:** đúng theo §3 — `AuthService.changePassword` (nạp `Role`, cấp cặp token mới, một lệnh
`User.update`), `authController.changePassword` (trả `data.{accessToken, refreshToken}`),
`utils/sessionTokens.js` + `AccountPage.jsx`; Postman: mô tả + script test của "Change password" lưu cặp token
mới, `openapi.yaml` sinh lại bằng `npm run docs:build` (115 route khớp, chỉ đổi 1 dòng mô tả).

**Kết quả kiểm tra:**

| Hạng mục | Kết quả |
|---|---|
| `npm test` backend | 50 suite, 665 test pass (trước 660; +5 của `changePassword.test.js`) |
| Vitest frontend | 35 file, 482 test pass (trong đó 9 của `sessionTokens.test.js`) |
| `npm run test:security` (DB tạm) | 2 suite, 39 test pass. R1 là 7 test thường; R2, R3, R4, R8 vẫn `failing` như mong đợi |
| R1 trên **code cũ** (stash 2 file src) | 5 trong 7 test R1 đỏ → test thật sự bắt được lỗi |
| API thật trên backend tạm :5051 | 9/9: phiên A bị 401 sau khi B đổi; B giữ phiên bằng token mới; mật khẩu cũ sai (400) không thu hồi gì |
| Chrome headless, 2 thiết bị (390×844 và 1366×768) | 8/8: đổi qua form → "Đã đổi mật khẩu."; B hết hạn access token rồi tải lại vẫn ở `/account`; A bị đưa về `/login` |

**Phát hiện thêm khi kiểm (không sửa, ngoài phạm vi):**
- Refresh token là JWT chỉ có `id` + `iat` (độ chính xác 1 giây, không có `jti`). Hai token ký trong cùng
  một giây **trùng nhau từng ký tự**, nên đổi mật khẩu trong cùng giây với lần đăng nhập thì "token mới" ==
  "token cũ" và phiên cũ chưa bị thu hồi. Ngoài đời không xảy ra (không ai đăng nhập và đổi mật khẩu trong
  một giây); test đã chờ 1,1 giây giữa các bước. Thêm `jti` ngẫu nhiên vào refresh token là việc cần cho
  **R3** (xoay vòng) — nên làm ở nhánh R3 thay vì nhánh này.
- Bản chạy thử đầu tiên của `tests-security/authz` đỏ khi chạy lại trên cùng DB vì slot đặt sân đã bị lần
  chạy trước chiếm (409): đã sửa để tự dò slot trống.
- Trang Tài khoản/AuthContext coi "không có `access_token` trong localStorage" là chưa đăng nhập và không thử
  refresh (có sẵn từ trước, không liên quan R1). Chỉ token hết hạn/sai mới đi qua luồng refresh.
