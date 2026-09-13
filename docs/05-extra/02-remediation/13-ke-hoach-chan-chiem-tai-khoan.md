# Kế hoạch: chặn chiếm tài khoản và rò rỉ bí mật (nhóm sửa 1/6)

- **Nhánh:** `fix/account-takeover-secret-leaks`
- **Ngày:** 12/09/2026
- **Bối cảnh:** nhóm đầu tiên trong thứ tự sửa của đợt kiểm tra trước deploy ngày 12/09/2026.
  Gồm 5 phát hiện: `SEC-01`, `SEC-02`, `AUTH-01`, `CFG-01`, `CFG-02`. Mục tiêu của nhánh:
  **không còn đường nào để một tài khoản dưới admin lấy được quyền admin, và bản deploy không
  mang theo mật khẩu công khai.**

---

## 0. Lỗi và đường khai thác (đã đọc lại code)

| Mã | Lỗi | Đường khai thác | Vị trí |
|---|---|---|---|
| SEC-01 | `errorHandler` trả nguyên `err.errors` của Sequelize, kể cả lỗi 500 ở production. Mỗi `ValidationErrorItem` giữ `instance` = cả bản ghi | Branch_manager gọi `PUT /employees/1 {"email":"x"}` → 500, body có `errors[0].instance.passwordHash` và `.refreshToken` của admin → gọi `/auth/refresh-token` → access token admin | `middleware/errorHandler.js:18`, `services/EmployeeService.js:131-147`, `validations/employeeValidation.js:27-36` |
| SEC-02 | Sửa/xoá nhân viên chỉ lọc theo chi nhánh, không kiểm vai trò người bị sửa | Đổi email admin sang hộp thư của mình → quên mật khẩu → đặt lại mật khẩu admin. Hoặc `DELETE /employees/1` khoá chủ sân ngoài hệ thống | `services/EmployeeService.js:128-197` |
| AUTH-01 | Trang đăng nhập in sẵn 7 tài khoản mẫu kèm mật khẩu, không phân biệt dev/production | Mở `/login` | `frontend/src/pages/Login/LoginPage.jsx:112-121` |
| CFG-01 | Role `admin`/`employee`/`customer` chỉ có trong seeder demo; không có cách tạo admin đầu tiên | Seed demo → mật khẩu công khai. Không seed → không có admin, khách đăng ký bị 500 | `seeders/20260723000001-seed-initial-data.js:10-19`, `migrations/20260815300002-add-branch-manager-role.js` |
| CFG-02 | Secret JWT mẫu trong `.env.example` dài 57–58 ký tự nên qua được kiểm tra ≥ 32 | Copy `.env.example` lên production → ai đọc repo cũng ký được token admin | `backend/.env.example:12-13`, `utils/jwt.js:6-14` |

**Điều kiện khai thác trên DB dev hôm nay** (truy vấn chỉ đọc): admin là employee #1 ở **chi nhánh 1**;
hai branch_manager đang ở chi nhánh 2 và 3. Vậy hiện chưa ai leo lên admin được, nhưng chỉ cần có
một quản lý cho chi nhánh chính. Còn lấy refresh token của **nhân viên cùng chi nhánh** thì mọi
branch_manager đều làm được ngay.

---

## 1. Câu hỏi cần chủ dự án chốt trước khi code

Mỗi câu có đề xuất sẵn — bác nếu không đồng ý.

**Q1. Bản deploy sắp tới là portfolio demo công khai hay vận hành thật cho một chuỗi sân?**
Checklist trong `DeploymentGuide.md` (mục 10: "seed dữ liệu demo… cho người xem portfolio") và
thư mục `portfolio/` cho thấy có thể là demo cho nhà tuyển dụng. Câu trả lời quyết định có bật
tài khoản mẫu trên bản deploy hay không.
- **Đề xuất:** code hỗ trợ **cả hai**, mặc định **tắt**:
  - Trang login chỉ hiện tài khoản mẫu khi chạy dev hoặc build với `VITE_SHOW_DEMO_ACCOUNTS=true`.
  - Seeder demo chỉ chạy ở production khi đặt `ALLOW_DEMO_SEED=true`.
- **Nếu là demo công khai:** đề xuất **không hiện tài khoản admin**, chỉ hiện branch_manager,
  nhân viên, khách. Khách xem với quyền admin có thể xoá nhân viên, đổi giá toàn chuỗi, void hoá
  đơn — làm hỏng demo cho người xem sau. (Tự reset dữ liệu demo hằng đêm là việc riêng, không
  làm ở nhánh này.)

**Q2. Ai được sửa email/SĐT của tài khoản nhân viên?**
- **Đề xuất:**
  - **Bỏ hẳn sửa email qua `PUT /employees/:id`**: trang Nhân viên chưa bao giờ gửi email khi sửa
    (`EmployeesPage.jsx:73-77`), và Postman cũng không. Body có `email` → trả 400 rõ ràng.
  - **SĐT, vị trí, ca làm:**
    - branch_manager chỉ sửa được tài khoản role `employee` cùng chi nhánh;
    - admin sửa được mọi người.
  - **Xoá:**
    - branch_manager chỉ xoá được `employee`;
    - admin xoá được `employee` và `branch_manager`;
    - **không ai xoá được admin hay chính mình.**

**Q3. Có lưu refresh token dạng hash luôn trong nhánh này không?**
Hiện token nằm thô trong `users.refresh_token`: DB dump nào lọt ra ngoài (ví dụ file trong
`backend/backups/` bị đóng vào Docker image — lỗi `DEP-06`) là có token dùng được ngay.
- **Đề xuất: làm luôn.** Khoảng 20 dòng, không cần đổi schema.
- **Hệ quả duy nhất:** mọi phiên đang đăng nhập phải đăng nhập lại một lần sau khi deploy.

**Q4. Mật khẩu admin tạo bằng script có yêu cầu mạnh hơn mức 6 ký tự của app không?**
- **Đề xuất:** script bootstrap yêu cầu **≥ 12 ký tự** và không trùng các mật khẩu demo đã công
  khai. Quy tắc 6 ký tự cho người dùng thường giữ nguyên, ngoài phạm vi nhánh này.

---

## 2. Thiết kế

### 2.1 `errorHandler` không bao giờ trả dữ liệu thô — SEC-01

**Quy tắc:** trường `errors` trong response chỉ chứa `[{ field, message }]` do chính server dựng;
`err.errors` thô không bao giờ ra ngoài.

| Loại lỗi | Status | `message` | `errors` |
|---|---|---|---|
| Có `statusCode`/`status` (service tự throw) | giữ nguyên | giữ nguyên | `null` |
| `SequelizeUniqueConstraintError` | 409 | "Dữ liệu bị trùng với bản ghi đã có." | `[{ field, message }]` |
| `SequelizeValidationError` | 400 | "Dữ liệu không hợp lệ." | `[{ field, message }]` |
| `SequelizeForeignKeyConstraintError` | 409 | "Dữ liệu đang được tham chiếu hoặc tham chiếu tới bản ghi không tồn tại." | `null` |
| Còn lại | 500 | production: thông báo chung; dev: `err.message` | `null` |

**Log:** `console.error` chỉ in `name`, `message`, `stack`, và `parent.code` với lỗi DB. Không in
nguyên object, vì object đó chứa `instance` và câu SQL kèm tham số — bí mật sẽ lọt vào log thay vì
vào response.

**Không làm ở đây:** map deadlock, lock timeout, `OptimisticLockError`, và guard rollback hai lần.
Để nhóm 6 (`RUN-02`).

### 2.2 Model `User` mặc định không mang bí mật — lớp phòng thủ thứ hai

- **Model:** thêm `defaultScope: { attributes: { exclude: ['passwordHash', 'refreshToken'] } }` và
  `scopes: { withSecrets: {} }`.
- **Phạm vi tác động:** Sequelize áp default scope cho cả `include`
  (`node_modules/sequelize/lib/model.js:530`). Vì vậy `req.user` trong `authMiddleware`/
  `sseAuthMiddleware`, cùng mọi `include: [{ model: User }]` (Employee, AuditService, GoodsReceipt,
  Booking creator…) đều không còn hai trường này. Có sót lỗi nào khác thì cũng không còn gì để lộ.
- **5 chỗ thật sự cần bí mật** chuyển sang `User.scope('withSecrets')` (grep đã liệt kê đủ):

  | Chỗ | Vì sao cần |
  |---|---|
  | `AuthService.login` (`:34`) | so `passwordHash` |
  | `AuthService.refreshAccessToken` (`:104`) | so `refreshToken` |
  | `AuthService.changePassword` (`:153`) | so mật khẩu cũ |
  | `AuthService.forgotPassword` (`:178`) | reset token ký bằng `passwordHash` (`jwt.js:25`) |
  | `AuthService.resetPassword` (`:223`) | xác minh reset token |

- **`logout`** (`:144`): chuyển sang `User.update({ refreshToken: null }, { where: { id } })`.
- **Nếu có chỗ nào đọc `passwordHash` bị sót:** giá trị thành `undefined` và bcrypt/jwt ném lỗi
  rõ ràng. Không có chuyện âm thầm chạy sai.

### 2.3 Quyền sửa/xoá tài khoản nhân viên — SEC-02 (theo đề xuất Q2)

| Người thao tác | Tài khoản bị tác động | Sửa SĐT/vị trí/ca | Xoá |
|---|---|---|---|
| admin | employee, branch_manager | ✅ | ✅ |
| admin | chính mình | ✅ | ❌ |
| branch_manager | employee cùng chi nhánh | ✅ | ✅ |
| branch_manager | admin, branch_manager khác, chính mình | ❌ 403 | ❌ 403 |

- **Hàm kiểm quyền:** `EmployeeService.assertCanManage({ actor, targetUser, action })` là hàm thuần
  (test không cần DB). Gọi trong `updateEmployee`/`deleteEmployee` sau khi đã khoá dòng.
- **`updateEmployee`:** include User chỉ lấy `id, roleId, email, phone, fullName, version` kèm
  `role.name`. Không nhận `email` nữa (xem Q2).
- **Validation:** `updateEmployeeRules` trả 400 khi body có `email`.
- **Frontend `EmployeesPage.jsx`:**
  - Ẩn nút ✏️/🗑️ theo đúng bảng trên. Response danh sách đã có sẵn `user.role.name`, người đang
    đăng nhập lấy từ `AuthContext`.
  - Thẻ admin/branch_manager hiện nhãn vai trò.

### 2.4 Tài khoản thử nghiệm trên trang đăng nhập — AUTH-01

- **Điều kiện hiển thị:** khối tài khoản mẫu chỉ render khi
  `import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_ACCOUNTS === 'true'`. Build production mặc
  định không chứa khối này — Vite loại nhánh chết khi điều kiện là hằng.
- **Nguồn dữ liệu:** danh sách tài khoản chuyển thành một mảng. Nếu Q1 là demo công khai, bỏ dòng
  admin ra khỏi mảng.
- **Cấu hình:** thêm `VITE_SHOW_DEMO_ACCOUNTS=false` vào `frontend/.env.example`, kèm chú thích.

### 2.5 Tạo admin đầu tiên và khoá seeder demo — CFG-01

**a) Migration mới `20260912100001-ensure-core-roles.js`**
- **Làm gì:** chèn `admin` (id 1), `employee` (id 2), `customer` (id 3) nếu chưa có role cùng tên,
  bằng `INSERT … SELECT … WHERE NOT EXISTS`.
- **Vì sao giữ id cố định:** các seeder demo tham chiếu `role_id` 1–3, và `branch_manager` đã
  chiếm id 4.
- **Trên DB dev:** đã có đủ 4 role nên migration không đổi gì.
- **`down()`:** không xoá role. Role đang có user tham chiếu (FK RESTRICT); ghi rõ lý do trong file.

**b) Seeder `20260723000001-seed-initial-data.js`**
- Bỏ khối chèn roles, vì migration đã lo. Nếu giữ lại, seed trên DB mới sẽ đụng khoá chính.
- Seeder không được sequelize-cli ghi nhận (không có bảng `SequelizeData`), nên sửa file này
  không ảnh hưởng lịch sử.

**c) Khoá seeder demo khi chạy production**
- Tạo `src/utils/demoSeedGuard.js`, gọi ở đầu `up()` của **cả 7 seeder**.
- Điều kiện chặn: `NODE_ENV=production` mà không có `ALLOW_DEMO_SEED=true` → throw, kèm thông
  báo hướng dẫn chạy `npm run create-admin`.
- Helper không đặt trong `src/seeders/`, vì sequelize-cli coi mọi file ở đó là seeder.

**d) Script `backend/scripts/create-admin.js` + `npm run create-admin`**
- **Biến môi trường:**

  | Biến | Bắt buộc | Ghi chú |
  |---|---|---|
  | `ADMIN_EMAIL` | ✅ | phải hợp lệ |
  | `ADMIN_PASSWORD` | ✅ | ≥ 12 ký tự và không phải mật khẩu demo đã công khai (Q4) |
  | `ADMIN_FULL_NAME` | ✅ | |
  | `ADMIN_PHONE` | tuỳ chọn | kiểm bằng `isValidPhone` nếu có |
  | `ADMIN_BRANCH_CODE` | tuỳ chọn | mặc định là chi nhánh đang hoạt động có id nhỏ nhất |

- **Chặn ghi đè:** từ chối nếu đã có admin đang hoạt động.
- **Tạo gì:** một transaction tạo User role admin + dòng Employee ở chi nhánh đó — cùng cấu trúc
  với admin trong seed, để `branchContextMiddleware` có chi nhánh mặc định.
- **Output:** in ra id và email, **không in mật khẩu**.
- **Chạy trong container:** được, sau khi image có bước migrate (nhóm 4), ví dụ
  `docker compose run --rm -e ADMIN_EMAIL=… backend npm run create-admin`.

### 2.6 Secret JWT mẫu — CFG-02 (kèm một phần AUTH-08)

- **`backend/.env.example`:** để trống hai secret, thêm dòng hướng dẫn sinh chuỗi ngẫu nhiên:
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
- **`utils/jwt.js`:** ngoài kiểm độ dài ≥ 32, server từ chối khởi động khi:
  1. secret trùng một trong các chuỗi mẫu cũ (của `.env.example` và `backend/README.md`);
  2. `JWT_ACCESS_SECRET === JWT_REFRESH_SECRET`.
- **Phạm vi:** áp dụng mọi môi trường. Đã kiểm tra (so sánh, không in giá trị): `.env` dev hiện
  không dùng chuỗi mẫu và hai secret khác nhau, nên server dev không bị chặn.
- **`backend/README.md`:** mục biến môi trường bỏ `change_me`.

### 2.7 Lưu refresh token dạng hash — chỉ làm nếu Q3 = có

- **Lưu trữ:** DB chỉ lưu `sha256(token)` dạng hex 64 ký tự, vẫn ở cột `users.refresh_token` hiện có.
- **Luồng:**
  - `login` và `register` lưu hash;
  - `refreshAccessToken` so `hash(input)` với cột bằng `crypto.timingSafeEqual`;
  - `logout` và `resetPassword` đặt null như cũ.
- **Không migration:** token thô đang có trong DB sẽ tự không khớp, người dùng đăng nhập lại một lần.

---

## 3. File dự kiến thay đổi

| File | Thay đổi |
|---|---|
| `backend/src/middleware/errorHandler.js` | Viết lại theo 2.1 |
| `backend/src/models/User.js` | `defaultScope` + scope `withSecrets` |
| `backend/src/services/AuthService.js` | 5 chỗ `User.scope('withSecrets')`, `logout`, (Q3) hash refresh token |
| `backend/src/services/EmployeeService.js` | `assertCanManage`, bỏ sửa email, giới hạn attributes |
| `backend/src/validations/employeeValidation.js` | 400 khi update có `email` |
| `backend/src/utils/jwt.js` | Chặn secret mẫu và hai secret trùng nhau; (Q3) hàm hash token |
| `backend/src/utils/demoSeedGuard.js` | **Mới** |
| `backend/src/migrations/20260912100001-ensure-core-roles.js` | **Mới** |
| `backend/src/seeders/*.js` (7 file) | Gọi guard; seeder đầu bỏ khối roles |
| `backend/scripts/create-admin.js` | **Mới** |
| `backend/package.json` | Script `create-admin` |
| `backend/.env.example`, `frontend/.env.example` | Secret để trống; `ALLOW_DEMO_SEED`, `ADMIN_*`, `VITE_SHOW_DEMO_ACCOUNTS` kèm chú thích |
| `backend/tests/` | **Mới:** `errorHandler.test.js`, `employeePermissions.test.js`, `demoSeedGuard.test.js`, `jwtSecrets.test.js` |
| `frontend/src/pages/Login/LoginPage.jsx` | Điều kiện hiển thị tài khoản mẫu |
| `frontend/src/pages/Employees/EmployeesPage.jsx` | Ẩn nút theo quyền, nhãn vai trò |
| `backend/README.md`, `docs/DeploymentGuide.md` (mục 5, 10), `CLAUDE.md` | Quy trình cài mới: migrate → `create-admin` (production) hoặc seed (dev/demo) |
| `docs/05-extra/02-remediation/00-tien-do.md` | Thêm mục khi xong |

Không thêm endpoint nên `npm run docs:build` không lệch. Postman chỉ gửi `position`/`shift` khi sửa
nhân viên nên không phải sửa collection.

---

## 4. Kiểm thử thật

### 4.1 Tái hiện lỗi trước khi sửa

Chạy trên nhánh, **chưa đổi code**, dùng server dev và DB dev:

1. Tạo tạm một branch_manager cho chi nhánh 1 bằng SQL. Ghi lại id để dọn sau.
2. Đăng nhập tài khoản đó, gọi `PUT /employees/1 {"email":"x"}`. Ghi nhận status và việc body
   **có mặt** khoá `passwordHash`/`refreshToken` — chỉ ghi "có mặt", không chép giá trị.
3. Dùng refresh token lấy được gọi `/auth/refresh-token` → xác nhận nhận được access token role
   admin (chứng minh leo quyền là thật). Sau đó đăng xuất admin để vô hiệu token.

### 4.2 Sau khi sửa

**Backend — server thật, DB dev:**

| # | Kịch bản | Kỳ vọng |
|---|---|---|
| 1 | Manager tạm `PUT /employees/1 {"email":"x"}` | 400; body không có `passwordHash`, `refreshToken`, `instance` |
| 2 | Manager tạm `PUT /employees/1 {"phone":"<số mới>"}` | 403 |
| 3 | Manager tạm `DELETE /employees/1`; `DELETE` chính mình | 403; 403 |
| 4 | Manager Q3 sửa SĐT một nhân viên thường cùng chi nhánh | 200 (khôi phục số cũ sau khi thử) |
| 5 | Admin sửa SĐT manager Q3; admin `DELETE` chính mình | 200 (khôi phục); bị chặn |
| 6 | Tạo xung đột unique thật (SĐT trùng tài khoản đã xoá mềm) | 409, `errors: [{ field: 'phone', message }]`, không có dữ liệu thô |
| 7 | Đăng nhập admin/nhân viên/khách, refresh, `/auth/me`, SSE `/realtime/stream`, đổi mật khẩu rồi đổi lại, reset mật khẩu bằng token sinh qua script | Tất cả chạy như trước |
| 8 | Quét response `/employees`, `/auth/me`, `/activity-logs`, `/goods-receipts`, `/bookings/:id` | Không có `passwordHash`/`refreshToken` |
| 9 | (Q3) Refresh bằng token thô còn trong DB; đăng nhập lại | 401; cột DB thành hex 64 ký tự, refresh chạy |

**Frontend — trình duyệt thật:**

| # | Kịch bản | Kỳ vọng |
|---|---|---|
| 10 | Manager tạm mở trang Nhân viên | Thẻ admin và thẻ của chính mình không có nút sửa/xoá; thẻ nhân viên thường có |
| 11 | `npm run dev` / `npm run build` + `vite preview` / build với `VITE_SHOW_DEMO_ACCOUNTS=true` | Có khối tài khoản mẫu / không có / có (theo Q1) |

**Cài mới — DB tạm, xoá sau khi xong (giống đợt kiểm tra 12/09):**

| # | Kịch bản | Kỳ vọng |
|---|---|---|
| 12 | `db:migrate` trên DB trống | Bảng roles đủ 4 role mà không cần seed |
| 13 | `NODE_ENV=production npm run create-admin` với env hợp lệ; chạy lần hai; mật khẩu 8 ký tự; mật khẩu `Admin@123` | Tạo admin + employee và đăng nhập được; lần hai bị từ chối; hai mật khẩu yếu bị từ chối |
| 14 | Khách tự đăng ký trên DB chưa seed | 201 (trước đây 500) |
| 15 | `NODE_ENV=production npm run seed` không có cờ; có `ALLOW_DEMO_SEED=true` | Dừng ngay seeder đầu kèm hướng dẫn; seed đủ 7/7 |
| 16 | Khởi động server với secret là chuỗi mẫu; với hai secret giống nhau | Từ chối khởi động, báo rõ lý do |

**Test tự động:**

| # | Kịch bản | Kỳ vọng |
|---|---|---|
| 17 | Jest mới, không chạm DB: dựng `UniqueConstraintError` có `instance` giả chứa bí mật; bảng quyền `assertCanManage`; `demoSeedGuard`; kiểm secret trong `jwt.js` | Pass cùng 121 test cũ; Vitest 46/46; build frontend thành công |

**Trước khi chạy migration mới trên DB dev:** dump DB dev ra thư mục tạm. Dự kiến migration không
đổi dữ liệu dev vì đã đủ role, nhưng vẫn làm theo nguyên tắc backup trước khi migrate.

**Dọn dẹp:** xoá manager tạm, khôi phục mọi SĐT đã đổi, DROP DB tạm. `git diff` chỉ gồm các file ở
mục 3.

---

## 5. Ngoài phạm vi nhánh này

| Việc | Để ở đâu |
|---|---|
| Map deadlock / lock timeout / `OptimisticLockError`, guard rollback | Nhóm 6 (`RUN-02`) |
| Xác minh SĐT khi khách đăng ký, chống chiếm hồ sơ khách vãng lai (`SEC-05`) | Nhóm 3 — cần chốt OTP |
| `GET /courts` lộ SĐT người chơi, `PUT /bookings/:id` ghi đè field (`SEC-03`, `SEC-04`) | Nhóm 3 |
| `trust proxy`, Docker, ép `NODE_ENV=production` | Nhóm 4 |
| Xung đột unique với bản ghi đã xoá mềm (`DATA-01`) — nhánh này chỉ đảm bảo trả 409 sạch thay vì 500 lộ dữ liệu | Nhóm 5 |
| Thu hồi phiên khi đổi mật khẩu (`AUTH-04`), dò tài khoản qua login (`AUTH-05`) | Sau |
| API tạo branch_manager / gán vai trò (`REQ-01`) | Chờ chốt onboarding (backlog nhóm B) |
| Tiêu đề modal "undefined" ở `EmployeesPage` (`FE-16`) | Nhóm lỗi hiển thị |
| Postman/k6 vẫn dùng tài khoản demo | Chỉ dành cho dev/test, không đổi |

---

## 6. Kết quả thực hiện (13/09/2026)

Chủ dự án duyệt "code đi" nhưng không trả lời riêng từng câu, nên áp dụng đúng các đề xuất ở mục 1:
- **Q1:** hỗ trợ cả hai chế độ, mặc định tắt; bản build không bao giờ hiện tài khoản admin.
- **Q2:** bỏ sửa email; bảng quyền như mục 2.3.
- **Q3:** refresh token lưu dạng sha256.
- **Q4:** mật khẩu tạo bằng `create-admin` tối thiểu 12 ký tự và không trùng mật khẩu demo.

### 6.1 Tái hiện lỗi trên code cũ (server dev, DB dev)

| Bước | Kết quả |
|---|---|
| Quản lý tạm (chi nhánh 1) gọi `PUT /employees/1 {"email":"x"}` | **500**, body có `instance` chứa `passwordHash` + `refreshToken` của admin (user #1) |
| Dùng refresh token lộ ra gọi `/auth/refresh-token` | **200**, access token mới mang role `admin`; `GET /reports/dashboard` bằng token đó → 200 |
| Đăng xuất admin để huỷ token lộ ra, rồi refresh lại | 401 |
| Quản lý tạm sửa hồ sơ admin (`position` giữ nguyên) / tự xoá chính mình | 200 / 200 (khôi phục ngay) |

### 6.2 Sau khi sửa

| # | Kịch bản | Kết quả |
|---|---|---|
| 1 | Quản lý tạm gọi `PUT /employees/1 {"email":"x"}` | ✅ 400 "Không thể đổi email đăng nhập qua API sửa nhân viên."; body không có `passwordHash`, `refreshToken`, `instance` |
| 2 | Quản lý tạm sửa SĐT admin | ✅ 403 |
| 3 | Quản lý tạm xoá admin; tự xoá chính mình | ✅ 403 / 403; không dòng nào bị xoá mềm |
| 4 | Quản lý Q3 sửa SĐT nhân viên Q3 rồi trả lại | ✅ 200 / 200; DB đổi rồi về đúng số cũ |
| 5 | Admin sửa SĐT quản lý Q3 (qua `X-Branch-Id`) rồi trả lại; admin tự xoá mình | ✅ 200 / 200; 403 "Không thể tự xoá tài khoản của chính mình." |
| 6 | Đặt SĐT nhân viên #2 trùng SĐT của tài khoản đã xoá mềm #35 (lỗi unique thật từ MySQL) | ✅ 409, `errors: [{"field":"phone","message":"Số điện thoại này đã có tài khoản khác."}]`; không dữ liệu thô; SĐT không đổi |
| 7 | Đăng nhập, `/auth/me`, refresh cho admin/nhân viên/khách/quản lý; SSE; quên mật khẩu; đổi mật khẩu rồi đổi lại; đặt lại mật khẩu bằng token sinh qua script | ✅ tất cả 200; SSE `200 text/event-stream` nhận `:ok`; dùng lại link đặt lại mật khẩu → 400 |
| 8 | Quét `/employees` (quản lý, admin), `/employees/1`, `/auth/me`, `/activity-logs`, `/goods-receipts`, `/sales-orders`, `/customers`, `/bookings/40` | ✅ tất cả 200, không có `passwordHash`/`refreshToken`/`instance` |
| 9 | Refresh bằng token thô còn trong DB; đăng nhập lại | ✅ 401; cột `refresh_token` thành hex 64 ký tự; refresh bằng token mới → 200 |
| 10 | Quản lý tạm mở trang Nhân viên (trình duyệt thật) | ✅ Thẻ admin có nhãn "Admin", không có nút, kèm dòng "Chỉ admin mới sửa hoặc xoá được tài khoản này."; thẻ của chính mình có nhãn "Tài khoản của bạn", không có nút; thẻ nhân viên thường đủ ✏️/🗑️ |
| 11 | Trang đăng nhập: `npm run dev` / build mặc định + `vite preview` / build với `VITE_SHOW_DEMO_ACCOUNTS=true` | ✅ Có khối, kèm admin / không có khối, bundle không chứa mật khẩu demo nào / có khối, bundle có `Manager@123`… nhưng không có `Admin@123` |
| 12 | `db:migrate` trên DB trống, `NODE_ENV=production` | ✅ 39/39 migration (207 giây); roles `1:admin, 2:employee, 3:customer, 4:branch_manager`; 0 user |
| 13 | `create-admin` với mật khẩu 8 ký tự / `Admin@123` / `Employee@123` / env hợp lệ / chạy lần hai / trên DB đã seed demo | ✅ Từ chối / từ chối / từ chối vì trùng mật khẩu demo / tạo admin #1 kèm hồ sơ nhân viên ở chi nhánh MAIN, output không chứa mật khẩu / từ chối "Đã có admin đang hoạt động" / từ chối. Admin mới đăng nhập được trên server production, `/auth/me` có chi nhánh |
| 14 | Khách tự đăng ký trên DB chưa từng seed | ✅ 201, role `customer` |
| 15 | `db:seed:all` ở production: không có cờ / có `ALLOW_DEMO_SEED=true` (trên bản sao DB vừa migrate) | ✅ Dừng ngay seeder đầu, 0 user, kèm hướng dẫn `npm run create-admin` / chạy đủ 7/7 seeder |
| 16 | Khởi động server với secret mẫu của `.env.example` / hai secret trùng nhau / `change_me` của README | ✅ Cả ba: exit 1 kèm lý do |
| 17 | Test tự động | ✅ Jest **164/164** (121 cũ + 43 mới, 16 suite); Vitest **49/49** (46 cũ + 3 mới); build frontend thành công |

**Kiểm tra thêm:**
- **SQL thật do Sequelize sinh:** `authMiddleware`, include User từ Employee/GoodsReceipt, `findOne` thường và `getProfile` đều không chọn `password_hash`/`refresh_token`. Chỉ `User.scope("withSecrets")` chọn hai cột này.
- **Migration trên DB dev:** `20260912100001-ensure-core-roles` đã chạy (dump trước bằng `mysqldump`, 647 KB); bảng roles giữ nguyên 4 dòng.
- **`npm run docs:build`:** 112 operation khớp 1-1 với route, `openapi.yaml` không đổi.

### 6.3 Dọn dẹp

- **Dữ liệu test:** đã xoá quản lý tạm (user #42, employee #19) và 6 dòng `activity_logs` do test sinh ra.
- **Tài khoản bị động tới:** SĐT của admin, nhân viên chính, nhân viên Q3 và quản lý Q3 đã về số cũ; admin #1 vẫn hoạt động.
- **Môi trường tạm:** hai DB tạm đã DROP; `frontend/dist` đã build lại bản mặc định.
- **Phiên đăng nhập cũ:** DB dev còn 28 refresh token thô. Các tài khoản đó sẽ phải đăng nhập lại một lần — đúng hệ quả đã nêu ở Q3.

### 6.4 Khác với kế hoạch

- **Kiểm quyền không khoá bảng roles:** `updateEmployee`/`deleteEmployee` đọc vai trò tài khoản bị tác động bằng một truy vấn riêng. Mục 2.3 dự tính join `roles` vào câu `SELECT … FOR UPDATE`, nhưng làm vậy sẽ khoá luôn dòng role dùng chung, mọi lượt sửa nhân viên khác phải chờ.
- **Tên index trong model `User`:** khai báo `unique` đúng tên index thật trong DB (`email`, `uq_users_phone`), kèm thông báo tiếng Việt. Thiếu bước này, lỗi trùng báo `field` là tên index `uq_users_phone` thay vì `phone`.
- **Sửa một nhận định sai ở mục 2.2:** plan viết "sót chỗ đọc `passwordHash` thì jwt ném lỗi rõ ràng", thực tế `jsonwebtoken` vẫn ký với chuỗi `….undefined` và link đặt lại mật khẩu hỏng âm thầm. Đã thêm kiểm tra trong `resetTokenSecret`, kèm test.
- **Log của `errorHandler`:** chỉ in stack cho lỗi 5xx, và bỏ query string khỏi đường dẫn vì SSE truyền access token qua `?token=`.
- **Seeder đầu:** `down()` không xoá `roles` nữa, vì bảng này giờ thuộc migration.
- **`create-admin`:** kiểm cả email/SĐT của tài khoản đã xoá mềm, vì UNIQUE trong DB tính cả chúng.
- **Thêm ngoài danh sách file ở mục 3:**
  - `backend/tests/createAdmin.test.js`
  - `frontend/src/utils/roles.js#canManageStaff` kèm 3 test Vitest
  - `docs/DeploymentGuide.md` mục 3.2/7.2/10
  - một đoạn hướng dẫn trong `CLAUDE.md`
- **Ghi chú khi test:**
  - Giới hạn 10 lần/15 phút dùng chung cho login/forgot/reset, nên kịch bản 9 phải chạy lại sau khi khởi động lại server.
  - 4 lỗi 500 trong console trình duyệt là proxy Vite báo `ECONNREFUSED` đúng lúc backend đang tắt để khởi động lại, không liên quan code.
