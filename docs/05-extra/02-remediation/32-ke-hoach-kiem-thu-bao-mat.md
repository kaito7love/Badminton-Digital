# Kế hoạch 32 — Kiểm thử bảo mật toàn hệ thống

**Ngày:** 2026-10-15 · **Nhánh:** `test/ke-hoach-kiem-thu-bao-mat` (tách từ `main` 83e8f8b)
**Trạng thái:** ĐÃ DUYỆT 2026-10-15 ("Duyệt kế hoạch 32, code đi"), Q1–Q6 đã trả lời (§13). **DỪNG sau nhóm A và B** theo yêu cầu chủ dự án — kết quả ở `33-ket-qua-kiem-thu-bao-mat.md`.

## 0. Mục tiêu và nguyên tắc

- **Mục tiêu:** kiểm lại toàn bộ hệ thống (backend, frontend, competition-service, cấu hình deploy) theo
  OWASP ASVS 4.0 mức 2 và OWASP API Security Top 10 (2023). Mỗi mục có tiêu chí đạt/không đạt rõ ràng
  và bằng chứng thật (request/response, truy vấn DB, ảnh chụp trình duyệt).
- **Chỉ kiểm thử, không sửa code ứng dụng.** Lỗi tìm được ghi vào báo cáo (§11), chủ dự án chọn sửa cái
  nào. Mỗi nhóm sửa sẽ có nhánh và kế hoạch riêng. Ngoại lệ duy nhất theo Q4: thêm **file test mới** vào
  `backend/tests` (§11.2). Không sửa file `src/` nào.
- **Test hồi quy viết ra phải đỏ đúng chỗ có lỗi.** Nếu một test tìm ra lỗi thật, test đó được đánh
  `test.failing` kèm mã phát hiện (vd `B2`) để `npm test` vẫn xanh. Khi lỗi được sửa ở nhánh sau, đổi lại
  thành `test` thường.
- **Môi trường:** dùng một **DB tạm riêng** (tạo bằng `migrate` + `seed`) và một bộ server riêng chạy trên
  cổng khác (backend :5050, competition :5150, Vite :5181 — :5180 đã có tiến trình khác chiếm). **Không đụng** DB dev
  `badminton_digital_management`, không dừng các server đang chạy (:5000/:5102/:5173).
- **Bản live trên Render (đã đồng ý, Q2): chỉ đọc, không tấn công.** Tối đa khoảng 20 request GET thường
  (trang chủ, một file JS/CSS, `/api/v1/health`, `/api/v1/public/branches`, một route không tồn tại, một
  preflight `OPTIONS` từ origin lạ) để đọc header bảo mật, CORS và nội dung lỗi (H9). Không đăng nhập,
  không ghi dữ liệu, không chạy ZAP hay k6 lên Render.
- **Công cụ quét (đã đồng ý, Q3): chỉ chạy trong Docker** (§9.1). Không cài gì vào Windows hay vào
  `node_modules`. Image và container chỉ xoá **sau khi chủ dự án xác nhận**.
- Công cụ có sẵn vẫn dùng: Jest, Vitest, `npm audit`, script Node trong scratchpad, Chrome headless qua CDP.
- Giới hạn đăng nhập (10 lần/15 phút/IP) **giữ nguyên**. Script lưu token để dùng lại, không nới server.

## 1. Bề mặt cần kiểm

| Khu vực | Nội dung |
|---|---|
| Backend `/api/v1` | 24 nhóm route (~115 thao tác): auth, public, bookings, courts, sessions, customers, employees, payments/webhook, invoices, sales-orders, my-orders, vouchers, products, inventory, goods-receipts, suppliers, reports, settings, activity-logs, branches, realtime SSE |
| Cổng competition | `/api/v1/competition/*` (gateway, ký lại token ES256, allowlist `routeMap.js`, `streamGuard.js`) và webhook vào `/api/v1/integrations/competition` |
| competition-service | API riêng (:5100), phân quyền theo scope, `publicRef` che tên, SSE `board` |
| Frontend | SPA React: token trong `localStorage`, khu khách, khu nhân viên, `/thi-dau` công khai, `/dat-san` |
| Hạ tầng | `docker/` (compose, nginx, Dockerfile), `render.yaml`, `demo-entrypoint.sh`, workflow reset demo, `.env.example`, secret trong git |

**Ma trận vai trò dùng xuyên suốt:** khách vãng lai (không token) · `customer` A · `customer` B ·
`employee` CN1 · `employee` CN2 · `branch_manager` CN1 · `branch_manager` CN2 · `admin` · tài khoản bị khoá ·
token hết hạn hoặc sai chữ ký.

## 2. Xác thực và phiên (ASVS V2, V3)

| # | Kiểm | Đạt khi |
|---|---|---|
| A1 | Đăng nhập sai mật khẩu / định danh không tồn tại | Cùng mã lỗi, cùng thông điệp, thời gian phản hồi chênh nhau không đáng kể (đo 20 lần mỗi loại) |
| A2 | Rate limit `/login`, `/forgot-password`, `/reset-password`, `/register`, `/refresh-token` | Đúng ngưỡng trong `authRoutes.js`. Tính theo IP thật khi có `TRUST_PROXY_HOPS`; giả `X-Forwarded-For` khi hops=0 **không** vượt được giới hạn |
| A3 | Chính sách mật khẩu khi đăng ký, đổi mật khẩu, reset, `create-admin` | Mật khẩu yếu bị từ chối ở cả backend, không chỉ ở form |
| A4 | Access token: sai chữ ký, `alg` khác, hết hạn, thiếu `id`, user bị khoá hoặc đã xoá | Luôn 401, không lộ chi tiết lỗi |
| A5 | Refresh token: dùng lại sau logout, sau đổi mật khẩu, sau reset, dùng 2 lần | Bị từ chối. Ghi nhận hành vi xoay vòng hiện tại |
| A6 | Access token còn hạn sau logout / đổi mật khẩu / khoá tài khoản | Ghi nhận cửa sổ còn hiệu lực (tối đa 15 phút) |
| A7 | Link reset mật khẩu: dùng lần 2, sau khi đổi mật khẩu, hết hạn, của user khác | Bị từ chối |
| A8 | `forgot-password`: email có và không có, SMTP lỗi | Cùng phản hồi (không dò được email) |
| A9 | Đăng ký: SĐT/email đã tồn tại, SĐT của khách vãng lai | Không gắn hồ sơ có sẵn (đúng mô tả trong CLAUDE.md). Ghi nhận mức lộ "đã tồn tại" |
| A10 | `DEMO_MODE`: tài khoản demo không đổi được mật khẩu, SĐT, email | 403 ở mọi đường (change, reset, sửa nhân viên, sửa khách) |
| A11 | Token SSE qua `?token=` (`/realtime/stream`, SSE competition) | Ghi nhận token có lọt vào log server, log nginx, `Referer` hay không |
| A12 | Server khởi động với secret yếu, trùng nhau hoặc là placeholder; cấu hình `COMPETITION_*` dở dang | Từ chối khởi động |

## 3. Phân quyền: chức năng, đối tượng, chi nhánh (ASVS V4, API1/API3/API5)

Cách làm: một script chạy **toàn bộ ~115 thao tác × 10 vai trò ở §1**, so kết quả với ma trận quyền
mong đợi (dựng từ `roleMiddleware` + mô tả trong CLAUDE.md). Mọi ô lệch đều là phát hiện.

| # | Kiểm | Đạt khi |
|---|---|---|
| B1 | Quyền theo chức năng: mỗi route với mỗi vai trò | Đúng ma trận, không ô nào lệch |
| B2 | IDOR khách với khách: A đọc, huỷ, sửa booking / đơn / hoá đơn / lịch sử / hồ sơ của B. Ưu tiên các route **không có `roleMiddleware`**: `GET /bookings`, `GET /bookings/:id`, `GET /customers/:id`, `GET /customers/:id/history`, `GET /invoices/:id`, `POST /vouchers/preview` | 403 hoặc 404, không lộ dữ liệu của B |
| B3 | Chéo chi nhánh: employee hoặc branch_manager CN1 thao tác trên tài nguyên CN2 qua id trực tiếp (court, session, invoice, order, phiếu nhập, nhân viên) | Bị chặn. Dữ liệu CN2 không xuất hiện trong list hay report |
| B4 | `X-Branch-Id`: khách gửi; branch_manager hoặc employee gửi CN khác; admin gửi id không tồn tại | Đúng như `branchContextMiddleware` mô tả (403 / bỏ qua / 404) |
| B5 | Quản lý nhân sự: branch_manager sửa hoặc xoá admin, branch_manager khác, chính mình; tự nâng `roleId` hoặc đổi `branchId` của mình | Bị chặn (`assertCanManage`) |
| B6 | Mass assignment: gửi thêm trường không được phép (`role`, `roleId`, `branchId`, `isActive`, `status`, `totalAmount`, `paidAt`, `customerId`…) ở mọi POST/PUT, nhất là `PUT /settings/*` (body đưa thẳng vào service), `PUT /bookings/:id`, `PUT /customers/:id`, đăng ký | Trường lạ bị bỏ qua hoặc 400, không ghi xuống DB (kiểm bằng truy vấn DB) |
| B7 | Đường gọi lọt khỏi allowlist của gateway (`events`, `ops`, `…/ai`, method không cho phép, biến thể đường dẫn: hoa thường, `//`, `%2e`, dấu `/` ở cuối) | Không tới được service |
| B8 | Scope token gateway: mọi vai trò không bao giờ có `ops:admin`; `org` đúng chi nhánh đang chọn; khách chỉ có `player` của chính họ | Đúng, đối chiếu bằng cách giải mã token ở phía service test |
| B9 | competition-service gọi thẳng (bỏ qua gateway) không token hoặc token ký sai | 401 |
| B10 | Hub công khai: người ẩn danh, khách đăng nhập, chủ hồ sơ, nhân viên xem cùng một giải | Đúng mức che tên của `publicRef`; SĐT `online_guest` chỉ nhân viên thấy; response không có trường thừa |
| B11 | Giới hạn nghiệp vụ: đặt sân xa hơn 14 ngày, đặt slot đã qua, khách tự đăng ký giải không có rating, rút sau khi bốc thăm, quá 5 khách mời / 24 giờ | Server chặn, không chỉ giao diện |

## 4. Kiểm tra đầu vào và injection (ASVS V5)

| # | Kiểm | Đạt khi |
|---|---|---|
| C1 | SQL injection: rà mọi `sequelize.query` / `literal` / `fn` (ReportService, dispatcher, ratingQueries, migration không tính) xem có nối chuỗi từ input không; gửi giá trị biên vào tham số lọc, sắp xếp, phân trang, ngày tháng | Không chỗ nào nối input vào SQL. Tham số sai kiểu trả 400 |
| C2 | Kiểu dữ liệu lạ: mảng hoặc object thay cho chuỗi, số âm, số rất lớn, NaN, chuỗi rỗng, unicode, chuỗi rất dài ở mọi validator | 400, không 500, không ghi sai xuống DB |
| C3 | Stored XSS: tên khách, ghi chú, tên sản phẩm, branding, tên giải, nickname đi vào giao diện nhân viên, khách, TV board, `/thi-dau`, PDF | Hiển thị dạng chữ. Xác nhận `dangerouslySetInnerHTML` = 0 trong frontend |
| C4 | Formula injection khi xuất Excel/CSV (đã sửa ở mục 1 tiến độ) | Vẫn còn hiệu lực với mọi cột chữ, kể cả dữ liệu từ hub |
| C5 | Prototype pollution qua body JSON (`__proto__`, `constructor`) ở settings, idempotency, ETag | Không đổi hành vi server |
| C6 | Kích thước body, độ sâu JSON, số phần tử mảng (đơn hàng, layout sân) | Có giới hạn, không treo server |
| C7 | Path traversal ở `/static/layouts`, phục vụ frontend tĩnh (`FRONTEND_DIST_DIR`), tên file PDF/Excel | Không đọc được file ngoài thư mục |
| C8 | Header injection: `Content-Disposition` lấy tên từ dữ liệu, `X-Branch-Id` lạ | Được làm sạch |

## 5. Tiền và logic nghiệp vụ (API6)

| # | Kiểm | Đạt khi |
|---|---|---|
| D1 | Webhook thanh toán: chưa cấu hình (503), sai secret (401), sai `amount`, hoá đơn đã trả, gửi lặp | Đúng như `paymentWebhookAuth.js`; mỗi lần từ chối có audit `payment.webhook_rejected` |
| D2 | Webhook competition: sai chữ ký, sai timestamp, gửi lại bản cũ, body bị sửa 1 byte | 401/409, dedup `integration_inbox` hoạt động |
| D3 | Race condition: 2–20 request song song cùng đặt một slot, cùng dùng voucher lượt cuối, cùng checkout một session, cùng huỷ và xác nhận một booking, cùng trừ kho | Chỉ 1 thành công, số liệu DB nhất quán |
| D4 | Giảm giá thủ công: employee vượt `discount_policy`, thiếu lý do, giảm âm, giảm hơn 100% | Bị chặn |
| D5 | Voucher: hết hạn, hết lượt, sai chi nhánh, áp 2 lần, giữ lượt bởi đơn chuyển khoản đang mở | Đúng `VoucherService.countUsage` |
| D6 | Giá do client gửi: đơn online hoặc POS gửi kèm giá, tổng tiền, phí sân | Server tự tính, bỏ qua giá client gửi |
| D7 | Phí sân khi chuyển sân, mở giữa giờ, qua giờ cao điểm | Luôn tính qua `calculateSessionCourtFee` |
| D8 | Huỷ hoá đơn (void), huỷ đơn: sai vai trò, sai chi nhánh, đã huỷ | Bị chặn, kho hoàn đúng một lần |

## 6. Dữ liệu nhạy cảm và lỗi trả về (ASVS V7, V8, API3)

| # | Kiểm | Đạt khi |
|---|---|---|
| E1 | Quét **mọi** response JSON của §3 tìm `passwordHash`, `refreshToken`, token reset, secret | Không xuất hiện ở đâu, kể cả trong include lồng nhau |
| E2 | Lỗi 500 hoặc lỗi Sequelize | Chỉ trả `[{ field, message }]`, không stack trace, không câu SQL, không `instance` |
| E3 | `/public/*` và `/public/availability/day` | Không chứa dữ liệu khách |
| E4 | `ActivityLog` và log server | Không ghi mật khẩu, token, secret (đối chiếu migration scrub) |
| E5 | `/api-docs` khi `NODE_ENV=production` | Tắt nếu không có `ENABLE_API_DOCS=true` |
| E6 | `/api/v1/health` | Chỉ có `version` và `ip`, không lộ thêm gì |

## 7. HTTP, trình duyệt, CORS (ASVS V9, V14)

| # | Kiểm | Đạt khi |
|---|---|---|
| F1 | Header bảo mật trên backend, nginx và bản Render: CSP, `X-Frame-Options`/`frame-ancestors`, HSTS, `X-Content-Type-Options`, `Referrer-Policy` | Ghi nhận cái nào thiếu. Audit 08/2026 mục 6 (helmet) chưa thấy trong `package.json` |
| F2 | CORS: origin lạ, `null`, có credentials, preflight | Production không cho origin chéo |
| F3 | Token trong `localStorage` (audit mục 5) | Ghi nhận rủi ro; kiểm có script bên thứ ba hoặc CDN nào chạy trên trang |
| F4 | Clickjacking trang đăng nhập và trang nhân viên | Bị chặn nhúng iframe |
| F5 | Cache: response có dữ liệu cá nhân, `/public/availability/day` | Có `no-store` ở chỗ cần |
| F6 | Kiểm tra route frontend: vào thẳng URL trang nhân viên bằng tài khoản khách, khi chưa đăng nhập | Bị chuyển hướng; quan trọng hơn là API phía sau từ chối (§3) |

## 8. Từ chối dịch vụ và tài nguyên (API4)

Chạy **trên server tạm, tải nhỏ, có kiểm soát**, không chạy lên Render.

| # | Kiểm | Đạt khi |
|---|---|---|
| G1 | Số kết nối SSE mỗi IP và tổng (`streamGuard`: 40 / 300), SSE `/realtime/stream` | Vượt ngưỡng bị 429; kết nối đóng thì giải phóng chỗ |
| G2 | Limiter hub công khai 900 req/phút/IP | Đúng ngưỡng |
| G3 | `/public/*` không có limiter: đo chi phí một request `availability/day` (6 câu SQL) | Ghi nhận và đề xuất ngưỡng nếu cần |
| G4 | Phân trang: `limit` rất lớn, `page` âm | Bị chặn trên |
| G5 | Báo cáo và xuất Excel/PDF khoảng ngày rất dài | Có giới hạn hoặc thời gian chấp nhận được |
| G6 | k6 có sẵn (`k6/smoke.js`, `load_test.js`): chạy smoke lên server tạm | Không lỗi 5xx |

## 9. Hạ tầng, cấu hình, chuỗi cung ứng (ASVS V10, V14)

| # | Kiểm | Đạt khi |
|---|---|---|
| H1 | `npm audit` cho backend, frontend, competition-service | Liệt kê High/Critical kèm đường phụ thuộc và có thực sự chạm tới hay không |
| H2 | Quét secret trong toàn bộ lịch sử git (`.env`, khoá ES256, `.keys/`, mật khẩu thật) bằng `git log -p` + grep | Không có secret thật; `.gitignore` đủ |
| H3 | Dockerfile: user non-root, `.dockerignore`, không copy `.env`/`.keys`, image không chứa devDependencies không cần | Đạt |
| H4 | `docker-compose.yml`: MySQL chỉ bind 127.0.0.1, competition sau profile, mật khẩu bắt buộc | Đạt |
| H5 | `render.yaml`, `demo-entrypoint.sh`, `competition-boot.js`: secret sinh ra không bị in ra log; competition chỉ nghe 127.0.0.1 | Đạt |
| H6 | DB: TLS bắt buộc kiểm cert (`dbSsl.js`), user DB không có quyền thừa | Đạt |
| H7 | Seed: chặn ở production nếu thiếu `ALLOW_DEMO_SEED` / `DEMO_ADMIN_PASSWORD` | Đạt |
| H8 | Workflow GitHub `demo-reset.yml`: quyền token, secret không in ra log | Đạt |
| H9 | Bản live Render: header bảo mật, CORS, nội dung trang 404 và lỗi, `/api-docs` có tắt không, `/health` lộ gì (≤ 20 request GET, xem §0) | Ghi nhận, so với bản cục bộ |
| H10 | `semgrep` quét `backend/src`, `frontend/src`, `services/competition-service/src` (bộ luật JS/Node/Express/React, OWASP Top 10) | Lọc kết quả thật / báo nhầm; cái thật đưa vào báo cáo |
| H11 | `gitleaks` quét toàn bộ lịch sử git | Không có secret thật (đối chiếu với H2) |
| H12 | `trivy` quét image `docker/app.Dockerfile` build cục bộ + file cấu hình (Dockerfile, compose) | Liệt kê lỗ hổng OS/thư viện High/Critical và lỗi cấu hình |
| H13 | OWASP ZAP lên **server tạm** :5050 / :5180: baseline (thụ động) cho SPA, API scan theo `openapi.yaml` với token của từng vai trò | Lọc báo nhầm; cái thật đưa vào báo cáo |

### 9.1 Công cụ trong Docker (Q3)

| Công cụ | Image (ghim phiên bản cụ thể khi kéo về) | Chạy vào đâu |
|---|---|---|
| OWASP ZAP | `ghcr.io/zaproxy/zaproxy` (bản stable) | Chỉ server tạm, qua `host.docker.internal` |
| semgrep | `semgrep/semgrep` | Mã nguồn, mount **chỉ đọc** (`:ro`) |
| gitleaks | `zricethezav/gitleaks` | Thư mục `.git`, mount chỉ đọc |
| trivy | `aquasec/trivy` | Image app build cục bộ + file cấu hình, mount chỉ đọc |

- Mọi container chạy với `--rm` và gắn nhãn `bd-security-test=32`; image build cục bộ đặt tên
  `bd-security-test/app:32`. Kết quả ghi ra scratchpad, không ghi vào repo.
- Cần Docker Desktop đang chạy. Lúc viết kế hoạch Docker CLI 29.8.0 có sẵn nhưng daemon **chưa bật**
  (xem Q6).
- **Dọn dẹp (sau khi chủ dự án xác nhận):** liệt kê đúng các image đã kéo/build cho đợt này kèm dung lượng,
  chờ "xoá đi", rồi `docker rmi` từng cái. Không chạy `docker system prune` hay xoá image nào khác.

## 10. Rà mã có chủ đích

Đọc lại các file chịu lực chính và đối chiếu với kết quả chạy thật:
`authMiddleware.js`, `sseAuthMiddleware.js`, `branchContextMiddleware.js`, `roleMiddleware.js`,
`paymentWebhookAuth.js`, `errorHandler.js`, `AuthService.js`, `utils/jwt.js`, `EmployeeService.assertCanManage`,
`BookingService`, `CustomerService.mergeIntoAccount`, `integrations/competition/*`,
`competitionWebhookRoutes.js`, competition-service `platform/http/auth.js` + `idempotency.js` +
`player/domain/profile.js`.

## 11. Sản phẩm bàn giao

1. Script khám phá dùng một lần (chạy ma trận trên DB tạm, đo thời gian, gọi bản live) để trong scratchpad.
2. **Test hồi quy cố định trong repo (Q4).** Toàn bộ `npm test` hiện tại chạy **không cần DB** (unit +
   `supertest` với service giả lập), nên test mới đi theo hai tầng:
   - **Tầng 1, chạy trong `npm test`, không cần DB** (file mới trong `backend/tests/`):
     - `securityRouteMatrix.test.js`: đọc `router.stack` của từng file route, so vai trò được phép của
       **từng** route với bảng quyền mong đợi. Thêm route mới mà quên gắn quyền là test đỏ.
     - `securityNoSecretsInResponses.test.js`: model `User` (kể cả khi include lồng) và `errorHandler`
       không bao giờ trả `passwordHash`, `refreshToken`, `instance`, stack.
     - `securityAuthTokens.test.js`: token sai chữ ký, sai `alg`, hết hạn, sai loại (refresh dùng làm access,
       reset dùng làm access) đều bị từ chối.
     - `securityOwnership.test.js`: các hàm kiểm quyền sở hữu (booking, đơn, hoá đơn, hồ sơ khách) và chặn
       chéo chi nhánh, với dữ liệu giả lập.
   - **Tầng 2, cần DB, chạy riêng bằng `npm run test:security`** (thư mục mới `backend/tests-security/`,
     script mới trong `package.json`): dựng DB tạm, seed 10 tài khoản, chạy ma trận IDOR/chéo chi nhánh
     thật, rò dữ liệu, race condition, rồi xoá DB. Không chạy trong `npm test` để không bắt máy khác cần
     MySQL. Chi tiết xem Q5.
   - Mỗi test ghi mã mục (A1…H13) trong tên để tra ngược về kế hoạch này.
3. Báo cáo `33-ket-qua-kiem-thu-bao-mat.md` trên nhánh này. Mỗi phát hiện gồm mức độ (🔴/🟠/🟡), vị trí
   `file:dòng`, cách tái hiện dưới dạng mô tả (không kèm công cụ khai thác), bằng chứng, hướng sửa đề xuất.
4. Bảng tổng hợp: mỗi mục A1–H13 là Đạt / Không đạt / Không kiểm được (kèm lý do).
5. Dọn sạch: xoá DB tạm, dừng **chỉ** các server tạm do mình bật. Image Docker giữ lại tới khi chủ dự
   án xác nhận xoá (§9.1).

## 12. Thứ tự và ước lượng

1. Dựng môi trường tạm + bộ tài khoản 10 vai trò.
2. §2 xác thực → §3 ma trận phân quyền (phần nặng nhất, ưu tiên cao nhất).
3. §5 tiền, §6 rò dữ liệu.
4. §4 đầu vào, §7 HTTP.
5. §8 tải nhỏ, §9 hạ tầng + công cụ Docker (§9.1), §10 rà mã, H9 bản live.
6. Viết test hồi quy (§11.2), chạy `npm test` + `npm run test:security`, ghi số pass/fail.
7. Viết báo cáo, chờ chủ dự án chọn mục cần sửa, và chờ xác nhận xoá image Docker.

## 13. Câu hỏi

### Đã trả lời (2026-10-15)

- **Q1. Phạm vi + DB/server tạm riêng:** CÓ.
- **Q2. Đọc header bản live Render bằng request GET thường:** CÓ. Giới hạn ở §0 và H9.
- **Q3. Cài công cụ quét:** CÓ, **cài vào Docker**, xoá sau khi chủ dự án xác nhận. Xem §9.1.
- **Q4. Đưa kiểm thử quan trọng vào `backend/tests`:** CÓ. Xem §11.2.

### Trả lời thêm (2026-10-15)

- **Q5:** CÓ — thêm `backend/tests-security/` + `npm run test:security`.
- **Q6:** Claude tự mở Docker Desktop khi tới §9.1.

### Nội dung câu hỏi Q5–Q6 (để tra lại)

- **Q5.** Test tầng 2 cần DB: đồng ý thêm thư mục `backend/tests-security/` + script
  `npm run test:security` vào `package.json` không? (Đề xuất: có. Nếu không, chỉ làm tầng 1, còn kịch bản
  cần DB để lại thành script trong scratchpad.)
- **Q6.** Docker Desktop đang tắt. Mình tự mở Docker Desktop khi tới bước §9.1, hay bạn tự mở?
