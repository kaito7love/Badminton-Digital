# Test Plan

## Dự án: Badminton Digital Management – Hệ thống quản lý sân cầu lông

**Phiên bản:** 1.2
**Ngày:** 18/10/2026 (từ v1.1 ngày 16/08/2026, v1.0 ngày 19/07/2026 — lịch sử ở mục 12)
**Tài liệu tham chiếu:** `SRS.md`, `UseCase.md`, `APIDesign.md`, `DatabaseDesign.md`, `Architecture.md`, `DeploymentGuide.md`, `docs/04-workflows/`, `services/competition-service/docs/`

---

## 1. Mục tiêu kiểm thử

Đảm bảo Badminton Digital Management hoạt động đúng theo các yêu cầu chức năng (FR) và phi chức năng (NFR) đã đặc tả trong SRS, phát hiện lỗi sớm trước khi triển khai, và cung cấp bằng chứng chất lượng (test report, coverage) để đưa vào portfolio.

## 2. Phạm vi kiểm thử

### 2.1 Trong phạm vi

- Toàn bộ API Backend (Auth, Court, Booking, Customer, Employee, Accessories, Payment, Report, Settings, bán lẻ Product/ProductCategory/SalesOrder, Voucher, đơn online `/my-orders`, Notification, Activity Log, Realtime SSE, Public) và **cổng nối thi đấu** (token dịch vụ, danh sách cho phép, sự kiện hai chiều) — xem `docs/04-workflows/flows/WF-09-Retail.md`
- **Dịch vụ thi đấu** như một sản phẩm riêng: luật thuần (điểm trình, xếp cặp, bốc thăm, tỉ số), API trên MySQL thật, bấm điểm trực tiếp, đăng ký công khai, danh sách chờ, gộp hồ sơ, outbox/inbox
- Logic nghiệp vụ cốt lõi: tính tiền sân theo khung giờ (giao với khung cao điểm, đổi sân), luật đặt sân (một nguồn `checkAvailability`), chính sách giữ chỗ, checkout sân và checkout đơn bán lẻ, mã giảm giá, webhook chuyển khoản, phân quyền, đối chiếu kho
- **Bảo mật:** xoay vòng và thu hồi phiên, chính sách mật khẩu, header bảo mật, IDOR, cách ly chi nhánh, rò dữ liệu khách, chống thử mật khẩu — đã có đợt kiểm thử riêng (mục 8)
- Giao diện Frontend: logic thuần của từng luồng và kết xuất thành phần bằng `react-dom/server`; luồng chính được **đi thật trên Chrome** (laptop và điện thoại) mỗi khi làm tính năng giao diện lớn
- Hiệu năng chịu tải cơ bản (k6)

### 2.2 Ngoài phạm vi

- Kiểm thử cổng thanh toán thực tế (không tích hợp cổng; webhook chuyển khoản được mô phỏng bằng request có secret)
- Kiểm thử xâm nhập do bên thứ ba; đợt kiểm thử bảo mật vừa qua do chính dự án thực hiện (có quét tự động trivy/semgrep/gitleaks/ZAP trong Docker) nhưng chưa có đánh giá độc lập
- Kiểm thử trên điện thoại thật, Safari, Firefox và trình đọc màn hình thật (hiện chỉ mô phỏng cỡ màn hình trong Chrome và kiểm cây trợ năng)
- Kiểm thử khung E2E tự động (Cypress/Playwright), lint trong CI

---

## 3. Chiến lược kiểm thử (Test Levels)

**Đã triển khai (kết quả đo ngày 18/10/2026 ở mục 12):**

| Cấp độ | Công cụ | Phạm vi |
| --- | --- | --- |
| Unit / service (backend) | Jest, Supertest — `backend/tests/` (61 suite) | Logic thuần và service **không cần MySQL** (mô hình, bus, mailer… được thay bằng đối tượng giả): tính tiền, luật đặt sân, chính sách giữ chỗ/mật khẩu/giảm giá, thông báo, voucher, đơn online, kho, báo cáo, cổng thi đấu, cấu hình khởi động, header bảo mật, ma trận route × vai trò |
| Bảo mật cần DB (backend) | Jest — `backend/tests-security/` (`npm run test:security`) | IDOR, chéo chi nhánh, phiên đăng nhập và xoay vòng, header, luồng đặt sân; cần một DB đã migrate và seed có chữ `test` trong tên (`DB_NAME_TEST`); **không** chạy trong `npm test` |
| Unit / thành phần (frontend) | Vitest — `frontend/src/**/*.test.*` (43 file) | Hàm thuần (lưới đặt sân, luồng đăng ký thi đấu, quyền theo vai trò, token phiên, menu khu khách…) và kết xuất thành phần bằng `react-dom/server` (không dùng jsdom); lưới đặt sân có tệp mẫu là phản hồi API **thật** nên đổi hình dạng API là test đỏ |
| Integration (dịch vụ thi đấu) | Jest — `services/competition-service/tests/` (28 suite, 11 unit + 17 integration) | Chạy trên **MySQL thật**: `globalSetup` dựng và xoá DB `competition_service_test`; phải chạy tuần tự (`npm test` = `--runInBand`), không gọi `npx jest` song song vì các suite dùng chung một DB |
| API | Postman + Newman — `postman/` (131 request, 25 nhóm, mọi request có script kiểm) | Mặc định chỉ chạy request đọc; nhóm ghi, phá huỷ, luồng và thi đấu bật bằng `runWrites`, `runDestructive`, `runStream`, `runCompetition` trong environment |
| Chịu tải | k6 — `k6/` (smoke, load, spike) | Kết quả ở mục 7 |
| Hợp đồng tài liệu | `npm run docs:build` | Sinh OpenAPI từ collection và báo lỗi nếu collection lệch với `routes/` (mỗi route mới phải có trong collection) |
| Ranh giới dịch vụ | `npm run check-boundaries` (dịch vụ thi đấu) | Dịch vụ không `require` ngoài thư mục của nó, module chỉ gọi nhau qua `index.js` |
| Build | `vite build`, build image Docker trong CI | Build production không lỗi; trong image có đủ dịch vụ và không lọt `.env`, `.keys`, `tests` |
| Đi thật trên trình duyệt | Chrome headless qua DevTools Protocol, kịch bản trong báo cáo kế hoạch | Các tính năng giao diện lớn (header, trang Đặt sân, thông báo, sơ đồ mặt bằng…): hàng chục đến hàng trăm phép kiểm tương tác ở nhiều cỡ màn hình, sáng/tối, kèm ảnh chụp; kết quả ở `docs/05-extra/02-remediation/` (ví dụ `29`, `40`–`43`) |

**Chưa có (đề xuất, không nằm trong CI):**

| Cấp độ | Ghi chú |
| --- | --- |
| UI/E2E tự động | Cypress hoặc Playwright cho luồng: đăng nhập → mở sân → checkout; đặt sân; xem báo cáo. Hiện làm bằng kịch bản Chrome DevTools chạy tay theo từng tính năng |
| Lint | CI không chạy ESLint |
| Integration backend trên MySQL trong CI | CI backend không có service DB; tầng cần DB (`test:security`) chạy tay |
| Coverage | Chưa đo tự động |

## 4. Môi trường kiểm thử

| Môi trường | Mục đích |
| --- | --- |
| Local (Docker Compose hoặc chạy tay) | Dev, unit/integration, đi thật trên trình duyệt. Nên có MySQL 8 trên ổ SSD: bộ integration của dịch vụ thi đấu ghi rất nhiều (đo ngày 18/10/2026 trên ổ cứng cơ, mỗi lần commit khoảng 94 ms, bộ chạy mất khoảng 21 phút) |
| CI (GitHub Actions) | `backend-test`, `competition-service` (MySQL 8.4 riêng), `docker-build`, `frontend-build` — xem mục 9.4 |
| CSDL dùng một lần | Newman nhóm ghi/phá huỷ, bảo mật cần DB và k6 ghi phải chạy trên DB tạm, **không** chạy trên dữ liệu đang dùng; `PUT /courts/layout` ghi ra file nên DB tạm cũng không cô lập được nó |
| Bản demo công khai | Kiểm tra sau deploy (`DeploymentGuide.md` mục 4.4): đăng nhập từng tài khoản demo, `/api/v1/health` đúng IP và đúng mã commit, thi đấu trả dữ liệu |

---

## 5. Ma trận Test Case theo Use Case (mức tổng hợp)

> Đối chiếu lại với code ngày 18/10/2026. Thông báo lỗi và mã trạng thái dưới đây lấy từ code (`APIDesign.md`), không suy đoán. Các dòng UC-26 đến UC-32 là mới; UC-01, UC-03, UC-10, UC-12, UC-18, UC-22 được sửa theo hành vi hiện tại.

| UC | Use Case | Test case chính | Test case ngoại lệ |
| --- | --- | --- | --- |
| UC-01 | Đăng nhập | Đúng thông tin (SĐT hoặc email) → nhận Access (15 phút) + Refresh (7 ngày) | Sai mật khẩu, tài khoản không tồn tại → _cùng_ message 401; tài khoản khóa chỉ báo khi mật khẩu đã đúng; quá 10 lần/15 phút/IP → 429 |
| UC-01b | Làm mới phiên | Refresh hợp lệ → cặp token **mới**; token cũ còn dùng được 30 giây nhưng chỉ đổi lấy access token | Token cũ quá 30 giây, hoặc hai tab làm mới cùng lúc (chỉ một bên thắng) → bên còn lại không bị đăng xuất; access token mang `tv` lệch sau đổi mật khẩu → 401 |
| UC-02 | Đăng xuất | `refreshToken` bị xoá, `/refresh-token` sau đó thất bại, access token cũ chết ngay (`token_version` tăng) | Không có Access Token hợp lệ → 401 |
| UC-03 | Quên mật khẩu | Email hợp lệ → nhận link reset có TTL | Email không tồn tại và email có thật cho **cùng** phản hồi 200 (kể cả khi chưa cấu hình SMTP); token reset hết hạn/đã dùng → từ chối |
| UC-04 | Đổi mật khẩu | Đúng mật khẩu cũ + mật khẩu mới đạt chính sách → cập nhật hash, trả cặp token mới cho thiết bị đang đổi, các phiên khác hết hiệu lực | Sai mật khẩu cũ → từ chối; mật khẩu 7 ký tự, thuộc danh sách phổ biến hoặc chứa SĐT/tên của mình → 400 |
| UC-05 | CRUD sân | Thêm/sửa/xóa sân hợp lệ (`admin`/`branch_manager`); lưu sơ đồ mặt bằng | `employee` gọi → 403; xóa sân đang có phiên chơi/đặt lịch → chặn |
| UC-06 | Mở sân | Mở sân trống thành công; mở từ lịch hôm nay đúng giờ | Sân bảo trì → 400; hai nhân viên cùng mở một sân → chỉ một thành công (ràng buộc DB); lịch ngày khác → 400 `BOOKING_WRONG_DAY`; lệch giờ quá ngưỡng chưa xác nhận → 409 `BOOKING_TIME_MISMATCH`; SĐT khách `123` → 400 |
| UC-07 | Đóng sân | Tiền sân tính theo giao với khung cao điểm, cộng đoạn đã chơi trước khi đổi sân, làm tròn 1.000đ một lần | Đóng sân chưa mở → 400 |
| UC-08 | Chuyển sân | Chuyển sang sân đích trống thành công, đoạn đã chơi chốt vào `accrued_court_fee` | Sân đích đang chơi → 400; chuyển sang chính sân nguồn → 400 |
| UC-09 | Đổi trạng thái khai thác sân | active ↔ maintenance ↔ inactive khi sân không có phiên chơi | Đổi khi đang có phiên → 400; `status` ngoài 3 giá trị → 400 |
| UC-10 | Tạo booking | Đặt khung giờ trống → `pending` (cả khi nhân viên tạo); máy nhân viên nhận `booking:changed` | Trùng `pending`/`confirmed` → 409; sân bảo trì/ngưng → 400; khung đã kết thúc → 400; ngoài 05:00–23:00 → 400; **khách**: quá 14 ngày, quá 3 giờ, đang giữ 5 lịch (`BOOKING_LIMIT`), quá 20 lần/10 phút → từ chối; SĐT khách vãng lai sai định dạng → 400 |
| UC-11 | Kiểm tra trùng lịch | Overlap một phần, toàn phần, liền kề (không overlap); `/public/availability`, `/bookings/availability`, `POST`, `PUT` trả lời **nhất quán** | Dữ liệu biên: booking kết thúc đúng lúc booking khác bắt đầu; `reason` đúng thứ tự ưu tiên |
| UC-12 | Sửa/Hủy booking | Nhân viên sửa sân/ngày/giờ khi `pending`/`confirmed`; hủy → `cancelled`; khách hủy lịch của mình | Sửa/hủy booking `completed`/`cancelled` → 400; khách sửa → 403 (huỷ rồi đặt lại); khách hủy lịch người khác → 403; sửa trường ngoài sân/ngày/giờ → 400 |
| UC-13 | Xác nhận booking | Pending → Confirmed; khách có tài khoản nhận thông báo | Khách tự gọi endpoint confirm → 403 |
| UC-14 | Quản lý khách hàng | Tạo khách mới (SĐT chưa tồn tại toàn chuỗi) | Trùng SĐT toàn chuỗi → 400; `employee` gọi `DELETE` → 403; xoá hồ sơ gắn tài khoản → 409 |
| UC-15 | Xem lịch sử & chi tiêu | Khách xem lịch sử của chính mình, gộp mọi chi nhánh | Xem hồ sơ/lịch sử người khác → 403 |
| UC-16 | Quản lý nhân viên | Admin/`branch_manager` tạo nhân viên → role luôn là `employee` | Email trùng → 400; SĐT trùng → 409; `branch_manager` sửa/xoá `admin` hoặc `branch_manager` khác → 403; xoá chính mình hoặc `admin` → 403 |
| UC-17 | Phụ kiện & tồn kho | Nhập kho (≥1 dòng) cộng tồn và tính lại giá vốn BQ | Điều chỉnh vượt tồn → 400 "Không đủ tồn kho tại chi nhánh này. Hiện có: {N}"; thiếu `note` → 400; `employee` thêm/sửa/xoá phụ kiện hoặc nhà cung cấp → 403 |
| UC-18 | Checkout sân | Tổng đúng (sân + phụ kiện − giảm giá); giảm giá tay kèm lý do; chuyển khoản sinh QR và `pending` cho tới webhook | Gọi lại cùng `Idempotency-Key` → kết quả cũ, không tạo trùng; giảm giá thiếu lý do → 400; `employee` vượt trần 10% → 403; `transfer` khi chưa cấu hình ngân hàng → 400 |
| UC-18b | Webhook chuyển khoản | Đúng secret, đúng số tiền → `paid` | Chưa cấu hình → 503; sai secret → 401; thiếu/lệch `amount` → 400/409 (giữ `pending`); trùng `providerReference` → 409; đã `paid` → 200 không cộng hai lần; mọi từ chối ghi nhật ký |
| UC-19 | Dashboard | Số liệu khớp DB, gộp doanh thu bán lẻ và tồn kho thấp (Extra + ProductVariant) | Không có dữ liệu → 0 không lỗi; thiếu `branchId` → 400 |
| UC-20 | Xuất báo cáo | Tải Excel/PDF đúng dữ liệu; ô bắt đầu bằng `=` không bị hiểu là công thức | `period`, `from`, `to` sai định dạng → 400 |
| UC-21 | Cài đặt hệ thống | Admin cập nhật bảng giá/giờ hoạt động/thương hiệu/chính sách | `employee`/`branch_manager` gọi `PUT /settings/*` → 403; khoá lạ hoặc sai kiểu → 400 |
| UC-22 | Tự đăng ký tài khoản | SĐT chưa có tài khoản → tạo User + Customer, trả token luôn; phản hồi **giống hệt** dù SĐT đã có hồ sơ tại quầy hay chưa | SĐT đã có tài khoản → 409; email trùng → 409; **không** tự gắn vào hồ sơ khách tại quầy trùng số (hồ sơ mới để trống `phone`); quá 5 lần/60 phút → 429; mật khẩu yếu → 400 |
| UC-23 | Chuyển chi nhánh | Admin chọn chi nhánh khác → API trả đúng dữ liệu chi nhánh đó | `employee`/`branch_manager` gửi `X-Branch-Id` khác → 403; **khách gửi `X-Branch-Id` → 403**; nhân viên chưa gán chi nhánh → 403 |
| UC-24 | Bán lẻ POS | Tạo đơn → thêm dòng (trừ kho ngay) → áp voucher → checkout → hoá đơn nhiều dòng đúng | Không đủ tồn → 400; thêm dòng vào đơn `paid` → 400; voucher hết hạn/hết lượt/chưa đủ tối thiểu → 400; huỷ giỏ hoàn kho; đơn bỏ dở 6 giờ bị huỷ |
| UC-25 | Doanh thu chi tiết / đối chiếu kho | `revenue-breakdown` tách đúng nguồn; `inventory-reconciliation` tính đúng `soldDiscrepancy` | Thiếu `branchId` → 400; `branch_manager` gửi `compareBranches=true` → ép về `false` |
| UC-26 | Khách đặt hàng online | Đặt đơn → giá từ máy chủ, trừ kho ngay; chuyển khoản → QR + hạn 30 phút; webhook đúng → đơn `paid`, `totalSpent` tăng | Không đủ tồn → cả đơn bị từ chối; quá hạn → tự huỷ, hoàn kho, nhả voucher; đoán mã đơn của người khác → 404; tiền về sau khi huỷ → webhook 409 + nhật ký |
| UC-27 | Thông báo cho khách | Xác nhận, nhân viên huỷ, đổi lịch, tự huỷ hết hạn → mỗi việc một thông báo trong cùng giao dịch; chuông hiện số chưa đọc | Khách tự huỷ → không thông báo; khách không có tài khoản → không thông báo; đọc thông báo của người khác → 404; nội dung không chứa tên nhân viên hay SĐT |
| UC-28 | Xem và đăng ký thi đấu | Khách vãng lai xem giải công khai; khách đăng ký giải đơn, giải đôi cả cặp, buổi giao lưu; hết chỗ → danh sách chờ rồi thăng hạng khi có người rút | Chưa có điểm trình → `NEEDS_ASSESSMENT`; rút sau bốc thăm → `WITHDRAW_LOCKED`; quá 5 hồ sơ đồng đội mới/24 giờ; hồ sơ `hidden` hiện dạng "Thành viên XXXX"; khách ghi vào `/public/*` bị chặn ở cổng |
| UC-29 | Gộp hồ sơ khách | Gộp chuyển phiên chơi, lịch đặt, đơn, cộng `totalSpent`, tính lại hạng, ghi `customer.merged` | Hồ sơ không có số, đích không thuộc tài khoản khách, đã mang số → 400; đã gộp → 409; khách gọi → 403 |
| UC-30 | Void hoá đơn | Hoá đơn `void`, thanh toán `refunded`, trừ `totalSpent`, hoàn kho, lịch vẫn `completed` | Thiếu lý do → 400; chưa `paid` → 400; đã `void` → 409; `employee` → 403 |
| UC-31 | Vận hành giải đấu / giao lưu | Bốc thăm, gọi trận, bấm điểm trực tiếp, hoàn tác, chốt giải; tỉ số lên TV qua SSE | Một người ở hai sân → từ chối; bấm đúp hai máy không cộng trùng; dịch vụ tắt → 503 `COMPETITION_DISABLED`; 401 từ dịch vụ → 502 `COMPETITION_AUTH_FAILED`; đường `events`/`ops`/`ai` bị chặn tại cổng |
| UC-32 | Lưới sân × giờ và đặt sân trên web | Lưới khớp `/public/availability` từng ô; chạm/kéo chọn ô; đăng nhập giữa chừng quay lại đúng lựa chọn; đặt xong sang "Lịch của tôi" | Hai khách giành một khung → người sau 409; ô đã bắt đầu hiện "đã qua"; ngày quá 14 ngày → 400; mất mạng giữa chừng → báo lỗi trong trang |
| RBAC | Phân quyền | Employee gọi API Employee-only → 200 | Customer/Employee gọi API Admin-only → 403; ma trận route × vai trò được kiểm tự động (`securityRouteMatrix.test.js`) |

---

## 6. Chi tiết Test Case mẫu (mức cao — dùng làm khuôn mẫu)

### TC-BOOK-01: Tạo booking hợp lệ

- **Tiền điều kiện:** Sân 1, một ngày trong 14 ngày tới, khung 18:00–19:00 còn trống, trong giờ mở cửa.
- **Bước thực hiện:** Gửi `POST /bookings` với dữ liệu hợp lệ.
- **Kết quả mong đợi:** HTTP 201, booking status = "pending", dữ liệu lưu đúng vào DB; máy nhân viên đang mở SSE nhận `booking:changed`.

### TC-BOOK-02: Tạo booking trùng lịch

- **Tiền điều kiện:** Khung 18:00–19:00 sân 1 đã có booking "confirmed".
- **Bước thực hiện:** Gửi `POST /bookings` với cùng sân, khung giờ overlap (VD 18:30–19:30).
- **Kết quả mong đợi:** HTTP 409, message **"Khung giờ này đã có người đặt, vui lòng chọn khung giờ khác"**, không tạo booking mới. (Bản trước của tài liệu này ghi message tiếng Anh "Selected court and time slot is already booked" — không còn đúng sau khi thống nhất luật đặt sân về `BookingService.checkAvailability`.)

### TC-BOOK-03: Luật thời gian áp đồng nhất cho mọi nơi

- **Tiền điều kiện:** Một khung giờ đã kết thúc hôm nay; một khung 23:00–24:00; một khung có `maintenance` ở sân đích.
- **Bước thực hiện:** Hỏi cùng khung giờ qua `GET /public/availability`, `GET /bookings/availability`, rồi `POST /bookings` và `PUT /bookings/:id`.
- **Kết quả mong đợi:** Cả bốn nơi cùng kết luận (khung đã qua → "Khung giờ này đã qua…", ngoài giờ → "Quán chỉ nhận đặt sân trong khung 05:00–23:00", bảo trì → từ chối); `/public/availability` chỉ trả `available` và `message`, không có `reason` hay `conflictBookingId`. Ô đã bắt đầu nhưng chưa kết thúc: server nhận, lưới `/public/availability/day` hiện `passed`.

### TC-BOOK-04: Giới hạn dành riêng cho khách

- **Tiền điều kiện:** Tài khoản `customer` và tài khoản `employee`.
- **Bước thực hiện:** Với từng tài khoản đặt (a) ngày hôm nay + 14, (b) 4 giờ liền, (c) lịch thứ 6 trong khi đã giữ 5 lịch chưa kết thúc.
- **Kết quả mong đợi:** Khách: (a) 400 "Chỉ nhận đặt trước tối đa 14 ngày…", (b) 400 nêu tối đa 3 giờ, (c) 400 `code: BOOKING_LIMIT`. Nhân viên: cả ba đều được.

### TC-BOOK-05: Tự huỷ lịch khách chưa được duyệt

- **Tiền điều kiện:** Lịch `pending` do khách đặt, `booking_policy.pendingExpiryHours` = 24; một lịch `pending` do nhân viên tạo cùng cỡ tuổi.
- **Bước thực hiện:** Chạy `expireStalePendingBookings` khi lịch của khách đã quá hạn (`max(tạo + 15 phút, min(tạo + 24 giờ, giờ bắt đầu − 60 phút))`).
- **Kết quả mong đợi:** Lịch của khách thành `cancelled`, có nhật ký `booking.expired` (không có user) và một `customer_notifications` loại `booking.expired`; lịch do nhân viên tạo **không** bị đụng. Đặt `pendingExpiryHours = 0` → không huỷ gì.

### TC-AUTH-01: Làm mới đồng thời không đá nhau ra

- **Bước thực hiện:** Đăng nhập, rồi gửi hai `POST /auth/refresh-token` cùng một refresh token gần như cùng lúc.
- **Kết quả mong đợi:** Một bên nhận cặp mới; bên còn lại (trong 30 giây ân hạn) nhận access token mới nhưng **không** nhận refresh token mới và không bị 401. Sau 30 giây, dùng lại token cũ → 401.

### TC-AUTH-02: Thu hồi phiên tức thì

- **Bước thực hiện:** Giữ một access token còn hạn, đổi mật khẩu bằng thiết bị khác, rồi gọi API bằng access token cũ.
- **Kết quả mong đợi:** 401 ngay (không đợi 15 phút) cả ở `authMiddleware` lẫn `/realtime/stream`; thiết bị vừa đổi mật khẩu nhận cặp token mới và tiếp tục dùng được.

### TC-PAY-01: Checkout tính đúng tiền cắt khung giờ

- **Tiền điều kiện:** Phiên chơi từ 17:30 (thấp điểm) đến 18:30 (cao điểm từ 18:00), đơn giá thấp điểm 60.000đ/h, cao điểm 90.000đ/h.
- **Bước thực hiện:** Đóng sân lúc 18:30.
- **Kết quả mong đợi:** courtFee = 30 phút × (60.000/h) + 30 phút × (90.000/h) = 30.000 + 45.000 = 75.000đ. Nếu phiên có đổi sân giữa chừng, tiền các đoạn trước được cộng từ `accrued_court_fee` và làm tròn 1.000đ **một lần** ở cuối.

### TC-PAY-02: Checkout gọi lại với cùng Idempotency-Key không tạo trùng

- **Tiền điều kiện:** Phiên chơi đã đóng, chưa thanh toán.
- **Bước thực hiện:** Gửi `POST /payments/checkout` với header `Idempotency-Key: test-key-1`, sau đó gửi lại **y hệt** request đó (cùng key) lần 2.
- **Kết quả mong đợi:** Lần 1 trả HTTP 201 tạo Invoice/Payment mới. Lần 2 trả lại **đúng `invoiceId`/`totalAmount` của lần 1**, không tạo thêm Invoice/Payment nào (đếm số dòng trước/sau phải bằng nhau). Mạng chập chờn khiến client gọi lại không được phép double-charge khách.

### TC-PAY-03: Webhook chuyển khoản chặn mặc định

- **Tiền điều kiện:** Một thanh toán `pending` 108.000đ của hoá đơn `BD-1-00000009`.
- **Bước thực hiện:** Gửi `POST /payments/webhook` lần lượt: (a) không cấu hình secret, (b) sai `X-Webhook-Secret`, (c) đúng secret nhưng `amount` 100.000, (d) đúng cả hai, (e) gửi lại (d) với mã giao dịch khác.
- **Kết quả mong đợi:** (a) 503, (b) 401, (c) 409 + nhật ký `payment.webhook_rejected` (`amount_mismatch`), giao dịch vẫn `pending`, (d) 200 và hoá đơn/thanh toán `paid`, (e) 200 không cộng tiền lần hai (nhật ký `already_paid`).

### TC-PAY-04: Giảm giá tay có lý do và có trần

- **Bước thực hiện:** `employee` checkout với giảm 15% (trần mặc định 10%), rồi giảm 5% không có `discountReason`, rồi giảm 5% có lý do; `branch_manager` giảm 30% có lý do.
- **Kết quả mong đợi:** 403, 400, 201 (dòng hoá đơn "Giảm giá: <lý do>" và nhật ký `payment.discount_applied`), 201.

### TC-RETAIL-01: Bán lẻ — thêm sản phẩm vào giỏ trừ kho ngay (không đợi thanh toán)

- **Tiền điều kiện:** `ProductVariant` "Áo Yonex size L" còn tồn 10 tại chi nhánh đang đăng nhập.
- **Bước thực hiện:** `POST /sales-orders` tạo đơn → `POST /sales-orders/:id/lines` thêm 3 áo → (chưa checkout) kiểm tra `GET /inventory/product-stock-levels`.
- **Kết quả mong đợi:** Tồn kho còn **7** ngay sau bước thêm dòng, TRƯỚC khi checkout. Xóa dòng đó (`DELETE .../lines/:lineId`) → tồn kho trả lại đúng 10; huỷ giỏ (`POST .../cancel`) cũng hoàn kho.

### TC-RETAIL-02: Bán lẻ — không đủ tồn kho khi thêm dòng

- **Tiền điều kiện:** `ProductVariant` còn tồn 2 tại chi nhánh.
- **Bước thực hiện:** `POST /sales-orders/:id/lines` với `quantity: 5`.
- **Kết quả mong đợi:** HTTP 400, message "Không đủ tồn kho tại chi nhánh này. Hiện có: 2", không tạo `SalesOrderLine`, tồn kho không đổi. Hai request cùng trừ một biến thể tồn thấp đồng thời không bao giờ làm tổng bán vượt tồn ban đầu.

### TC-RETAIL-03: Bán lẻ ẩn danh không cộng dồn hạng hội viên

- **Tiền điều kiện:** Khách có `totalSpent` = 4.900.000đ (hạng `normal`, sắp lên `gold` ở mốc 5.000.000đ).
- **Bước thực hiện:** Nhân viên bán 1 đơn 200.000đ qua POS **không chọn khách hàng**, thanh toán tiền mặt.
- **Kết quả mong đợi:** Checkout thành công nhưng `customer.totalSpent` **không đổi** vì đơn không gắn `customerId` — đúng thiết kế, không phải bug; test này để tránh ai đó "sửa nhầm" thành tự động gán khách gần nhất. (Đơn **online** thì khác: gắn khách và cộng `totalSpent` khi `paid`.)

### TC-VOU-01: Mã giảm giá dùng chung POS và đơn online

- **Tiền điều kiện:** Voucher `percent` 10%, trần 50.000đ, tối thiểu 100.000đ, `usageLimit` 1.
- **Bước thực hiện:** `POST /vouchers/preview` với đơn 500.000đ; áp vào một đơn online chuyển khoản đang chờ; thử áp vào đơn khác; để đơn thứ nhất quá hạn.
- **Kết quả mong đợi:** Preview giảm 50.000đ (không tiêu lượt); đơn thứ hai bị từ chối vì lượt đã được giữ bởi đơn đang chờ; sau khi đơn thứ nhất hết hạn và tự huỷ, lượt được nhả và đơn khác áp được.

### TC-ORD-01: Đơn online chuyển khoản quá hạn

- **Tiền điều kiện:** Chuyển khoản đã cấu hình; khách đặt đơn `transfer`.
- **Bước thực hiện:** Không thanh toán; chạy `expireStalePendingOrders` sau 30 phút.
- **Kết quả mong đợi:** Đơn `cancelled`, hoá đơn `void`, thanh toán `cancelled`, tồn kho hoàn lại; `qrCodeUrl` thành `null`. Webhook tới sau đó → 409 + nhật ký `payment_not_pending`.

### TC-NOTI-01: Thông báo ghi cùng giao dịch và đúng đối tượng

- **Bước thực hiện:** Nhân viên xác nhận lịch của khách có tài khoản; nhân viên đổi giờ lịch khác; khách tự huỷ lịch của mình; xác nhận lịch của khách vãng lai.
- **Kết quả mong đợi:** Hai thông báo cho hai lịch đầu (nội dung chỉ có tên sân, ngày, giờ, lịch đổi có cả khung cũ); không thông báo khi khách tự huỷ hoặc khách không có tài khoản; thay đổi lịch bị rollback thì thông báo cũng không còn; khách khác gọi `PUT /notifications/:id/read` → 404.

### TC-COMP-01: Cổng thi đấu chặn mặc định

- **Bước thực hiện:** (a) Không đặt `COMPETITION_*` rồi gọi `/api/v1/competition/tournaments`; (b) đặt thiếu một biến rồi khởi động; (c) gọi `/competition/events`, `/competition/ops/x`, `/competition/assessments/1/ai`; (d) `POST /competition/public/x`; (e) khách gửi `X-Branch-Id`.
- **Kết quả mong đợi:** (a) 503 `COMPETITION_DISABLED`; (b) máy chủ không khởi động; (c) 404 tại cổng; (d) 404; (e) 403. Token dịch vụ không bao giờ chứa `ops:admin`.

### TC-COMP-02: Danh sách chờ và rút đăng ký

- **Tiền điều kiện:** Giải đơn còn 1 chỗ, hai khách có điểm trình.
- **Bước thực hiện:** Khách A đăng ký (được chỗ), khách B đăng ký (vào danh sách chờ), A rút trước bốc thăm, rồi B kiểm tra; sau bốc thăm A thử rút.
- **Kết quả mong đợi:** B được thăng hạng tự động khi A rút; sau bốc thăm rút → `WITHDRAW_LOCKED`. Mốc `registered_at` giữ mili-giây để hai người đăng ký sát nhau không đổi thứ tự.

### TC-REPORT-01: Đối chiếu kho phát hiện chênh lệch

- **Tiền điều kiện:** 1 `ProductVariant` có `stock_movements` ghi nhận `sale` = 5 (đã trừ kho khi thêm vào 1 `SalesOrder`), nhưng đơn đó **chưa từng checkout**.
- **Bước thực hiện:** `GET /reports/inventory-reconciliation`.
- **Kết quả mong đợi:** Item đó xuất hiện với `qtySoldLedger = 5`, `qtySoldInvoice = 0` → `soldDiscrepancy = 5`. Sau khi checkout đơn đó thành công, gọi lại → `soldDiscrepancy` về **0**.

### TC-RBAC-01: Nhân viên không thể truy cập Settings

- **Tiền điều kiện:** Đăng nhập với tài khoản role = employee.
- **Bước thực hiện:** Gửi `PUT /settings/pricing`.
- **Kết quả mong đợi:** HTTP 403, không cập nhật dữ liệu.

---

## 7. Kiểm thử hiệu năng (k6)

Ba kịch bản trong `k6/` (chi tiết, biến môi trường và hai cái bẫy đã xử lý ở `k6/README.md`):

| Kịch bản | Mục tiêu |
| --- | --- |
| `smoke.js` | 1 VU, 1 vòng qua 31 endpoint đọc thuộc mọi nhóm; `checks == 100%`, `http_req_failed == 0`; đủ nhẹ để cắm vào CI |
| `load_test.js` | 100 VU trong ~5 phút chia 4 luồng (khách duyệt `/public` 40, nhân viên xem sân 30, tra cứu lịch 20, báo cáo 10); mặc định chỉ đọc, luồng ghi bật bằng `--env WRITE=1` |
| `spike_test.js` | 0 → 200 VU trong 30 giây vào nhóm `/public`; mục tiêu là không sập, không đổ lỗi hàng loạt |

**Kết quả đo 05/09/2026** (backend `NODE_ENV=production` + MySQL 8 cùng một máy Windows 11): qua 5 lần chạy, hơn 180.000 request, `http_req_failed` luôn bằng 0 và tỉ lệ check đúng luôn 100% kể cả ở 200 VU.

| Lần | Kịch bản | Tải | p95 | Lỗi |
| --- | --- | --- | --- | --- |
| #1 | `load_test` | 100 VU, DB vừa khởi động | 677 ms | 0 |
| #2 | `load_test` | 100 VU | 1,14 s | 0 |
| #3 | `load_test` | 50 VU | 31 ms | 0 |
| #4 | `spike_test` | 200 VU (chỉ `/public`) | 731 ms | 0 |
| #5 | `load_test` | 100 VU, DB đã ấm | 164 ms | 0 |

Tiêu chí đạt: p95 < 2 giây, tỉ lệ lỗi (5xx) < 1% ở tải mục tiêu (100 người dùng đồng thời — NFR trong SRS). **Bài học đã ghi vào kịch bản:** độ trễ dao động mạnh giữa các lần là do buffer pool MySQL còn lạnh, không phải bão hoà — luôn chạy một lượt bỏ đi để làm ấm trước khi lấy số. Token lấy một lần ở `setup()` vì `/auth/login` giới hạn 10 lần/15 phút/IP.

**Chưa đo lại** sau khi thêm lưới sân × giờ, thông báo, khu công khai thi đấu và cổng nối. Việc nên làm: một lượt `spike_test` cho `/public/availability/day` (6 câu SQL cố định) và `/competition/public/*` (giới hạn riêng 900 yêu cầu/phút/IP).

Còn lại trong kế hoạch ban đầu và chưa có kịch bản: stress `POST /payments/checkout` và `POST /sales-orders/:id/checkout`, kiểm đồng thời trừ kho (đã có test đơn vị cho khoá dòng ở `InventoryService`, chưa có tải thật).

---

## 8. Kiểm thử bảo mật

Từ 15/10/2026 có một **đợt kiểm thử bảo mật toàn hệ thống** (kế hoạch `32`, báo cáo `33`, tổng hợp `38` trong `docs/05-extra/02-remediation/`): hàng trăm kiểm tra trên DB và server tạm riêng — ma trận 115 route × các vai trò, IDOR, chéo chi nhánh, tiền và tranh chấp, rò dữ liệu, header, đầu vào, tải nhỏ, thư viện, secret, và quét trivy/semgrep/gitleaks/ZAP trong Docker. Kết quả: không có lỗi đỏ, 17 phát hiện (R1–R17); các kế hoạch `34`–`37` đã sửa phần lớn, một số chấp nhận có chủ đích, hai việc còn mở (R16 `ci.yml` thiếu `permissions:`, R17 npm CLI trong image gốc). Phần giữ lại thành test tự động nằm ở `backend/tests-security/` (`npm run test:security`, 86 test ở thời điểm kết thúc đợt) và `backend/tests/security*.test.js`, `sessionRotation.test.js`.

Checklist thủ công còn dùng để kiểm lại trước mỗi lần phát hành (đánh dấu = đã có test tự động hoặc đã xác minh gần nhất):

- [x] Mật khẩu và refresh token không bao giờ trả về trong response API hay nhật ký (`defaultScope`, `errorHandler`).
- [x] Access token hết hạn đúng cấu hình; bị thu hồi ngay khi đăng xuất/đổi/đặt lại mật khẩu (`token_version`).
- [x] Refresh token xoay vòng, token cũ chỉ còn 30 giây ân hạn và không nhận refresh mới.
- [x] Endpoint được bảo vệ trả 401 khi không có token, 403 khi sai Role (ma trận route × vai trò tự động).
- [x] Cách ly chi nhánh: nhân viên gửi `X-Branch-Id` khác → 403; khách gửi `X-Branch-Id` → 403; tài khoản nhân viên chưa gán chi nhánh → 403.
- [x] Dữ liệu vận hành (`/courts`, `/accessories`, `/products`, `/product-categories`) chỉ cho nhân viên; trang khách dùng `/public/*` và không lộ khách khác, giá vốn hay tồn chính xác.
- [x] Input được validate (id là số nguyên trong miền, độ dài chuỗi, ngày giờ); thử ký tự đặc biệt (`' OR 1=1--`) vào các trường tìm kiếm.
- [x] Header bảo mật (CSP, chặn nhúng khung, nosniff, HSTS khi HTTPS) và `no-store` ở API trừ `/public`.
- [x] Rate limiting: `/auth/login` 10/15 phút, `/auth/register` 5/60 phút, `/auth/refresh-token` 30/15 phút, quên và đặt lại mật khẩu cùng ngưỡng 10/15 phút với đăng nhập, đặt lịch của khách 20/10 phút/người, `/competition/public/*` 900/phút/IP; nên thử ngưỡng thật chứ không chỉ xác nhận "có hay không".
- [x] Webhook thanh toán chỉ chấp nhận đúng `X-Webhook-Secret`, đúng `amount`, không dùng lại mã tham chiếu; chưa cấu hình thì 503.
- [x] Idempotency key không dùng chéo giữa hai đối tượng khác nhau.
- [x] Cổng thi đấu: chặn `events`/`ops`/`…/ai`, token dịch vụ không bao giờ có `ops:admin`, 401 từ dịch vụ đổi thành 502, chữ ký sự kiện kiểm trên byte thô.
- [x] Hồ sơ thi đấu bị che đúng chế độ riêng tư; schema công khai đóng kín (rò một trường là test đỏ).
- [x] Xuất Excel không để ô bắt đầu bằng `=` bị hiểu là công thức (`reportExporterFormula.test.js`).
- [ ] Upload file: backend đã gỡ `multer` nên hiện không có upload; nếu thêm lại phải kiểm định dạng và dung lượng.
- [ ] Thử lại toàn bộ sau mỗi lần nâng cấp thư viện lớn (`bcrypt`, `express`, `axios`, `nodemailer`).

---

## 9. Công cụ & Quy trình

### 9.1 Test backend (`backend/tests/*.test.js`, `npm test` → `jest`)

61 suite, không kết nối DB thật. Nhóm chính:

| Nhóm | Ví dụ file |
| --- | --- |
| Tiền và thanh toán | `priceCalculator`, `courtFeeSegments`, `paymentValidation`, `paymentConfig`, `webhookAuth`, `discountPolicy`, `changePassword` |
| Đặt sân | `bookingPastSlot`, `bookingAdvanceWindow`, `bookingPolicy`, `bookingUpdateFields`, `bookingListValidation`, `daySlots`, `publicDayAvailability`, `operatingHours`, `courtService` |
| Kho, bán lẻ, đơn online | `inventoryService`, `posOrderCancel`, `onlineOrderService`, `onlineOrderValidation`, `voucherService`, `voucherValidation`, `publicCatalogService` |
| Khách và nhân viên | `customerMerge`, `customerPhoneRelease`, `employeePermissions`, `phone`, `branchContext` |
| Thông báo và thời gian thực | `notificationMessages`, `realtimeHeartbeat` |
| Bảo mật | `securityHeaders`, `securityRouteMatrix`, `securityTokensAndSecrets`, `sessionRotation`, `passwordPolicy`, `bcryptCompat`, `jwtSecrets`, `errorHandler`, `groupAValidation`, `groupDRules` |
| Cổng thi đấu | `competitionGateway`, `competitionRouteMap`, `competitionToken`, `competitionSignature`, `competitionOutbox`, `competitionDispatcher`, `competitionWebhook`, `competitionClient`, `competitionStreamGuard`, `competitionConfig`, `competitionKeys`, `competitionBoot` |
| Cấu hình và triển khai | `serverConfig`, `dbSsl`, `frontendStatic`, `demoMode`, `demoSeedGuard`, `createAdmin`, `dateTime`, `mailer`, `reportExporterFormula` |

Một test của `competitionGateway.test.js` (giới hạn tần suất `/public/*`) là **test phụ thuộc thời gian đã biết**: có lúc đỏ khi máy đang bận (ví dụ chạy song song với Vitest), chạy riêng thì qua; cũng đỏ trên bản code chưa sửa dưới cùng tải. Chạy lại riêng file đó trước khi kết luận có hồi quy.

### 9.2 Test frontend (`frontend/src/**/*.test.*`, `npm test -- --run` → `vitest`)

43 file: `pages/Booking/` (lưới, chọn khung, luồng đặt, lỗi, tiêu điểm hộp xác nhận, sơ đồ), `features/competition/` (lib thi đấu, luồng đăng ký, khu công khai, giải đấu, bấm điểm, thẻ trình độ), `components/site/` (menu, header, chân trang, chuông thông báo), `components/` (logo, thông báo lỗi, sơ đồ mặt bằng), `services/realtimeClient`, `utils/` (quyền theo vai trò, token phiên, mật khẩu, SĐT, ngày giờ), `contexts/cartReducer`.

### 9.3 Test dịch vụ thi đấu (`services/competition-service/tests/`, `npm test`)

11 suite unit (luật thuần: điểm trình, xếp cặp, bốc thăm, tỉ số, trạng thái giải, buổi giao lưu) và 17 suite integration trên MySQL thật (đăng ký tự phục vụ, danh sách chờ, bấm điểm trực tiếp, vận hành giải, giao lưu, gộp hồ sơ, outbox, API công khai, chấm trình, bảng xếp hạng). Quy tắc: chạy bằng `npm test` (tuần tự); chạy riêng một nhóm bằng `npm run test:unit` hoặc `npm run test:integration`.

### 9.4 CI/CD (`.github/workflows/ci.yml`)

Chạy trên `push`/`pull_request` vào `main` và `develop`, bốn job (Node 22):

- `backend-test`: `npm ci` + `npm test` trong `backend/` — không có MySQL, không lint.
- `competition-service`: MySQL 8.4 riêng (bật `sql_require_primary_key` như Aiven), `npm run check-boundaries` + `npm test`.
- `docker-build`: build image Render (`docker/app.Dockerfile`) và image dịch vụ, kiểm trong image có đủ dịch vụ và không lọt `.env`/`.keys`/`tests`, `docker compose config` có và không profile `competition`.
- `frontend-build`: `npm ci` + `npm test -- --run` + `npm run build`.

CI **không** chạy: lint, `test:security`, Postman/Newman, k6, hay bất kỳ bước nào cần DB ngoài job dịch vụ thi đấu. Các action được ghim theo mã commit (có test kiểm). Workflow `demo-reset.yml` là việc vận hành, không phải kiểm thử.

---

## 10. Tiêu chí chấp nhận (Acceptance Criteria) tổng thể

- 100% API trong `APIDesign.md` có ít nhất 1 test case thành công + 1 test case lỗi (mọi request Postman có script kiểm; `docs:build` đảm bảo collection khớp `routes/`).
- Không còn lỗi mức Critical/High mở (open) trước khi coi là "release-ready"; lỗi chấp nhận có chủ đích phải được ghi trong `00-tien-do.md` kèm lý do.
- Mọi bộ test ở mục 3 xanh khi chạy đúng cách (dịch vụ thi đấu chạy tuần tự); test phụ thuộc thời gian đã biết được chạy lại riêng trước khi kết luận.
- Coverage unit test tầng Service ≥ 70% (khuyến nghị; chưa đo tự động).
- Test hiệu năng đạt tiêu chí ở mục 7 với tải 100 người dùng đồng thời.
- Tính năng giao diện lớn được đi thật trên trình duyệt (laptop và điện thoại, sáng và tối) kèm ảnh chụp trong báo cáo kế hoạch.

---

## 11. Rủi ro & Giả định

- Dự án cá nhân/portfolio, không có đội QA riêng — người phát triển tự viết và chạy test; vì vậy mỗi tính năng lớn đi theo quy trình kế hoạch → duyệt → làm → đo thật → báo cáo → duyệt merge, và bằng chứng đo nằm trong báo cáo.
- Dữ liệu test cần được seed lại trước mỗi lần chạy các bộ cần DB; **không** chạy bộ ghi/phá huỷ trên DB đang dùng.
- Test tích hợp của dịch vụ thi đấu rất chậm trên ổ cứng cơ (đo 18/10/2026: khoảng 21 phút, mỗi lần commit ~94 ms) và các test có hạn chờ cứng có thể đỏ giả khi ổ chậm; không kết luận hồi quy từ một lần đỏ do hạn chờ.
- Phần thanh toán chỉ kiểm bằng webhook mô phỏng; chưa thử với dịch vụ báo có thật.
- Một số phần giao diện chỉ kiểm trên Chrome (mô phỏng điện thoại), chưa kiểm trên thiết bị, Safari, Firefox, trình đọc màn hình thật.

---

## 12. Kết quả chạy gần nhất và lịch sử thay đổi

**Chạy ngày 18/10/2026** (máy dev, MySQL 8 trên ổ cứng cơ):

| Bộ | Lệnh | Test | Lỗi | Thời gian |
| --- | --- | --- | --- | --- |
| Backend (Jest) | `npm --prefix backend test` | 888 (61 suite) | 0 (*) | ~31 giây |
| Frontend (Vitest) | `npx vitest run` | 547 (43 file) | 0 | ~13 giây |
| Dịch vụ thi đấu (Jest) | `npm --prefix services/competition-service test` | 425 (28 suite) | 0 (**) | 21 phút 12 giây |
| **Tổng** | | **1.860** | **0** | |

(*) Lần chạy đầu có 1 test của `competitionGateway` đỏ (phụ thuộc thời gian, xem 9.1); chạy riêng file đó 41/41 và chạy lại cả bộ 888/888.
(**) Số đo ngày 11/10/2026 trên cùng bản code của dịch vụ (không có commit nào vào `services/` từ đó tới 18/10/2026). Hai lần chạy đầu trước đó đỏ vì gọi `npx jest` song song thay vì `npm test` tuần tự, không phải lỗi code.

Chưa chạy lại trong đợt này: `test:security` (86 test, 15/10/2026), Newman, k6 (05/09/2026).

| Phiên bản | Ngày | Thay đổi chính |
| --- | --- | --- |
| v1.0 | 19/07/2026 | Bản đầu tiên |
| v1.1 | 16/08/2026 | Đối chiếu với `docs/04-workflows/` sau merge đa chi nhánh, kho hàng, bán lẻ POS, báo cáo chi tiết; bổ sung ma trận UC-02…UC-25 |
| v1.2 | 18/10/2026 | Làm lại chiến lược theo hiện trạng (Postman 131 request, k6, Jest 888, Vitest 547, dịch vụ thi đấu 425, kiểm thử bảo mật, đi thật trên Chrome); thêm UC-01b, 18b, 26–32 vào ma trận; sửa UC-01, 03, 10, 12, 18, 22; thêm test mẫu về đặt sân, phiên đăng nhập, webhook, giảm giá, voucher, đơn online, thông báo, thi đấu; cập nhật hiệu năng (kết quả k6), bảo mật (đợt kiểm thử 15/10), CI 4 job, kết quả chạy 18/10 |
