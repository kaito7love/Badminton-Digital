# Kết quả 33 — Kiểm thử bảo mật (đợt 1, dừng giữa chừng)

**Ngày:** 2026-10-15 · **Nhánh:** `test/ke-hoach-kiem-thu-bao-mat` · **Kế hoạch:** `32-ke-hoach-kiem-thu-bao-mat.md`
**Phạm vi thực tế:** chủ dự án yêu cầu **dừng sau nhóm A và B** ("Dừng kiểm thử ở đây, viết báo cáo 33 với
kết quả hiện có"). Các nhóm C–H, test hồi quy và công cụ Docker **chưa làm** (xem §4).
**Không sửa dòng code nào** trong `backend/src`, `frontend/src`, `services/`.

## 1. Môi trường đã dùng

- DB tạm `bd_sectest_32` (backend) + `bd_sectest_32_comp` (competition), tạo mới bằng `migrate` + `seed`
  + `seed-demo.js`. DB dev `badminton_digital_management` không bị đụng.
- Backend tạm :5050 chạy **giống Render**: `NODE_ENV=production`, `DEMO_MODE=true`, tự phục vụ bản build
  frontend (`FRONTEND_DIST_DIR`). competition-service tạm :5150. Server của chủ dự án (:5000/:5102/:5173)
  vẫn chạy, không bị dừng hay khởi động lại.
- Dữ liệu mẫu tạo qua API thật: khách B tự đăng ký, khách C (bị khoá), 3 booking, 2 phiên chơi đang mở ở
  CN2/CN3, 1 khách lẻ CN3, 1 đơn online, 1 voucher.
- Token cho ma trận phân quyền được ký bằng đúng secret của server tạm (giống hệt token server phát ra), để
  không chạm giới hạn 10 lần đăng nhập/15 phút. Luồng đăng nhập thật được kiểm riêng ở nhóm A.
- Script và kết quả JSON nằm trong scratchpad của phiên, không đưa vào repo.

## 2. Tổng kết

| Nhóm | Số kiểm tra có kết luận | Đạt | Không đạt |
|---|---|---|---|
| A — Xác thực và phiên | 34 | 26 | **8** |
| B1–B6 — Phân quyền backend | 63 | 62 | **1** |
| B7–B9 — Cổng competition | chỉ dựa unit test có sẵn: 117 test | 117 | 0 |
| B10–B11, C, D, E, F, G, H | chưa kiểm | — | — |

**Không có lỗi 🔴 nào.** Phân quyền — phần quan trọng nhất — gần như kín: 344 lần gọi trên 115 route, mọi
vai trò không được phép đều nhận 403, khách vãng lai đều 401; khách không xem/huỷ được dữ liệu của nhau;
CN2 không đọc/sửa được dữ liệu CN3 (đã đối chiếu DB); gửi kèm `role`, `branchId`, `status`… bị bỏ qua.

## 3. Phát hiện

### R1 🟠 Đổi mật khẩu không đăng xuất các thiết bị khác (A6b)

- **Vị trí:** `backend/src/services/AuthService.js:162` (`changePassword`).
- **Hiện tượng:** sau khi đổi mật khẩu thành công (200), refresh token cũ vẫn xin được access token mới (200).
  Ngược lại `resetPassword` có xoá `refreshToken`.
- **Rủi ro:** người dùng nghi bị lộ tài khoản và đổi mật khẩu, nhưng phiên đang mở ở máy kia vẫn sống tới
  7 ngày.
- **Hướng sửa:** thêm `user.refreshToken = null` trước `user.save()` như `resetPassword` (1 dòng). Nên trả
  luôn cặp token mới cho thiết bị đang đổi để người dùng không bị đăng xuất.

### R2 🟠 Chính sách mật khẩu yếu (A3) — tồn đọng từ audit 08/2026 mục 7

- **Vị trí:** `backend/src/validations/authValidation.js:32, 65, 90` (chỉ `min: 6`).
- **Hiện tượng:** đăng ký thành công (201) với `123456`, `aaaaaa`, `abcdef`.
- **Hướng sửa:** tối thiểu 8 ký tự + chặn danh sách mật khẩu phổ biến; áp cho đăng ký, đổi, reset.
  `create-admin` đã đòi ≥ 12 ký tự, giữ nguyên.

### R3 🟡 Refresh token không xoay vòng (A5a) — tồn đọng từ audit mục 4

- **Vị trí:** `AuthService.js:98–127` (`refreshAccessToken` chỉ trả access token).
- **Hiện tượng:** cùng một refresh token dùng 2 lần đều 200. Điểm tốt đã có: lưu dạng sha256 (A5b đạt),
  logout và đăng nhập nơi khác vô hiệu nó (A5c đạt).
- **Hướng sửa:** mỗi lần refresh cấp refresh token mới và ghi đè hash; token cũ dùng lại → thu hồi cả phiên.
  Cần sửa `apiClient` phía frontend để lưu token mới.

### R4 🟡 Access token còn dùng được tới 15 phút sau logout / đổi mật khẩu (A6a, A6c)

- **Vị trí:** `backend/src/middleware/authMiddleware.js:29` (chỉ kiểm chữ ký + user còn hoạt động).
- **Hiện tượng:** sau logout và sau đổi mật khẩu, `GET /auth/me` bằng access token cũ vẫn 200. Khoá tài
  khoản thì bị chặn ngay (A6d đạt).
- **Hướng sửa:** thêm cột `token_version` (hoặc `password_changed_at`) vào `users`, đưa vào token, tăng khi
  logout/đổi mật khẩu; `authMiddleware` so khớp (user đã được nạp sẵn nên không tốn thêm truy vấn).

### R5 🟡 Dò được SĐT/email đã đăng ký qua thời gian phản hồi đăng nhập (A1b)

- **Vị trí:** `AuthService.js:57` (không có tài khoản → trả lỗi ngay, không chạy bcrypt).
- **Số đo:** trung vị 5,7 ms (không có tài khoản) so với 70,3 ms (có tài khoản, sai mật khẩu), 9 lần mỗi
  loại. Thông điệp và mã lỗi thì giống nhau (A1a đạt).
- **Hướng sửa:** khi không tìm thấy user vẫn `bcrypt.compare` với một hash giả cố định.

### R6 🟡 Lộ trạng thái "bị khoá" khi chưa biết mật khẩu (A1c)

- **Vị trí:** `AuthService.js:59` (kiểm `isActive` trước khi so mật khẩu).
- **Hiện tượng:** mật khẩu sai nhưng tài khoản bị khoá → 403 "Tài khoản đã bị vô hiệu hóa." thay vì 401
  như mọi trường hợp sai khác.
- **Hướng sửa:** so mật khẩu trước, chỉ báo "bị khoá" khi mật khẩu đúng.

### R7 🟡 Đăng ký báo SĐT/email đã có tài khoản (A9) — tồn đọng từ audit mục 11

- **Vị trí:** `AuthService.js:281, 293` (409 kèm thông điệp rõ).
- **Ghi chú:** đây là đánh đổi trải nghiệm — báo rõ giúp khách biết đi "Quên mật khẩu". Limiter đăng ký
  (5 lần/giờ/IP) làm chậm việc dò hàng loạt. **Cần chủ dự án quyết** giữ hay đổi.

### R8 🟡 Nhân viên chi nhánh khác đọc được phụ kiện của phiên chơi (B3)

- **Vị trí:** `backend/src/services/AccessoryService.js:157` (`getSessionExtras` chỉ lọc theo `sessionId`,
  controller không truyền `req.branchId`).
- **Hiện tượng:** nhân viên CN2 `GET /sessions/2/extras` (phiên của CN3) → 200. Chỉ đọc; không có dữ liệu
  khách. Thêm/trả phụ kiện chéo chi nhánh **bị chặn** (404) vì hai hàm đó đã lọc `branchId`.
- **Hướng sửa:** kiểm `CourtSession` thuộc `req.branchId` trước khi trả danh sách, như `addSessionExtra`.

## 4. Bảng trạng thái theo kế hoạch 32

| Mục | Kết quả | Ghi chú |
|---|---|---|
| A1 | ❌ | Thông điệp giống nhau ✅; thời gian ❌ (R5); trạng thái khoá ❌ (R6) |
| A2 | ✅ | Đăng nhập: lần 11 bị 429, đổi `X-Forwarded-For` không lách được; forgot dùng chung bộ đếm; refresh: lần 31 bị 429 |
| A3 | ❌ | R2 |
| A4 | ✅ | Sai chữ ký, `alg: none`, ký bằng refresh secret, hết hạn, thiếu id, id không có, tài khoản khoá, chuỗi rác → 401; claim `role` trong token bị bỏ qua |
| A5 | ❌ | Không xoay vòng (R3); lưu hash ✅; logout thu hồi ✅ |
| A6 | ❌ | R1, R4; khoá tài khoản chặn ngay ✅ |
| A7 | ✅ | Link reset dùng 1 lần, hết hạn, của người khác, access token thay link → đều 400 |
| A8 | ✅ | Cùng phản hồi; chênh 3 ms (không đủ để dò) |
| A9 | ❌ | R7; gửi kèm `role`/`roleId` khi đăng ký vẫn ra `customer` ✅ |
| A10 | ✅ | Tài khoản demo không đổi / reset mật khẩu được (403) |
| A11 | ⚠️ một phần | nginx tắt access log cho 2 luồng SSE ✅; log HTTP của Render chưa xem được |
| A12 | ✅ | 24 unit test (`jwtSecrets`, `competitionConfig`) pass |
| B1 | ✅ | 344 lần gọi, 0 lệch |
| B2 | ✅ | 14 kịch bản khách A ↔ khách B / khách lẻ, kể cả huỷ booking (DB không đổi) |
| B3 | ❌ | 22/23 đạt, 10 danh sách chỉ có dữ liệu CN2; lệch duy nhất: R8 |
| B4 | ✅ | 6/6 trường hợp `X-Branch-Id` |
| B5 | ✅ | QL không sửa/xoá admin, QL khác, chính mình; admin không tự xoá |
| B6 | ✅ | Nhân viên, booking, khách: trường cấm không ghi xuống DB |
| B7–B9 | ⚠️ chỉ unit test | 117 test `competitionRouteMap`/`Token`/`Gateway` pass; chưa kiểm trực tiếp trên server tạm (script dừng giữa chừng) |
| B10–B11 | ⏸ chưa kiểm | |
| C1–C8 | ⏸ chưa kiểm | |
| D1–D8 | ⏸ chưa kiểm | |
| E1–E6 | ⏸ chưa kiểm | Gián tiếp: không response nào trong nhóm A/B lộ `passwordHash`/`refreshToken` (chưa quét có hệ thống) |
| F1–F6 | ⏸ chưa kiểm | Audit 08/2026 mục 6 (`helmet`) vẫn chưa có trong `package.json` — chưa đo header |
| G1–G6 | ⏸ chưa kiểm | |
| H1–H13 | ⏸ chưa kiểm | Docker Desktop chưa mở, chưa kéo image nào; bản live Render chưa gửi request nào |
| Test hồi quy (§11.2) | ⏸ chưa viết | Chưa thêm file nào vào `backend/tests`, chưa thêm `npm run test:security` |

Ghi nhận thêm (không phải lỗi): khách gọi được `POST /vouchers/preview`; script gửi sai tên trường nên chỉ
nhận 400 validation, chưa kết luận gì về việc dò mã voucher.

## 5. Đề xuất thứ tự sửa (mỗi nhóm một nhánh + kế hoạch riêng, chờ chủ dự án chọn)

1. **R1** — một dòng, rủi ro thấp, đáng làm ngay.
2. **R8, R5, R6** — nhỏ, gói chung một nhánh "vá nhỏ xác thực + phụ kiện".
3. **R4 + R3** — cần migration (`token_version`) và sửa `apiClient`; làm chung vì cùng chạm luồng token.
4. **R2** — cần quyết định chính sách (độ dài, danh sách cấm) và báo trước cho người dùng hiện có.
5. **R7** — cần quyết định sản phẩm.
6. Làm tiếp các nhóm chưa kiểm (C–H, B10–B11) nếu chủ dự án muốn — ưu tiên D (tiền) và E/F (rò dữ liệu,
   header).

## 6. Trạng thái môi trường khi viết báo cáo

Vẫn còn, **chờ chủ dự án cho dọn**: backend tạm :5050 và competition tạm :5150 (PID trong scratchpad
`sec/sectest-pids.txt`), hai DB `bd_sectest_32` và `bd_sectest_32_comp`, bản build frontend trong scratchpad.
Không có image hay container Docker nào được tạo.
