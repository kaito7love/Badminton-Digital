# Kế hoạch: Bổ sung k6 load test & Postman collection

- **Nhánh:** `feat/k6-load-test-postman-collection`
- **Ngày:** 05/09/2026
- **Bối cảnh:** `k6/` và `postman/` hiện chỉ có `.gitkeep` — rỗng hoàn toàn, dù
  `README.md` gốc và `docs/01-plans/Phase6-TestingDevOpsDeployment.md` đều đã liệt kê.
  Đây là 2 hạng mục còn thiếu của Phase 6.

---

## 1. Ràng buộc kỹ thuật đã khảo sát

| Điều kiện | Kết quả khảo sát |
|---|---|
| k6 binary | ✅ đã cài — `k6.exe v2.0.0` tại `C:\Program Files\k6\k6` |
| newman (chạy Postman CLI) | ❌ chưa cài → dùng `npx newman` |
| Backend đang chạy? | ❌ chưa — sẽ khởi động qua `.claude/launch.json` (`backend`, port 5000) |
| Tài khoản seed | `0901111111 / Admin@123`, `0902222222 / Employee@123`, `0903333333 / Customer@123`, `0906666666 / Manager@123` |
| Tổng endpoint | 112 endpoint / 23 nhóm route |

### Hai cái bẫy phải xử lý (nếu không, script sẽ sai ngay từ đầu)

1. **Rate limit ở `/auth/login`: 10 request / 15 phút / IP** (`authRoutes.js:35`).
   Nếu mỗi VU tự đăng nhập thì 100 VU sẽ ăn 429 sau VU thứ 10 và kết quả load test
   vô nghĩa. → **Đăng nhập đúng 1 lần trong `setup()` của k6, chia sẻ access token
   cho toàn bộ VU.**
2. **Access token sống 15 phút.** Mọi kịch bản k6 giữ tổng thời lượng < 10 phút để
   không phải xử lý refresh giữa chừng.

---

## 2. Sản phẩm bàn giao

### 2.1 `k6/`

| File | Nội dung |
|---|---|
| `k6/lib/config.js` | BASE_URL / credentials đọc từ biến `--env`, hàm `login()` dùng trong `setup()`, `authHeaders(token, branchId)` gắn sẵn `X-Branch-Id`, helper `checkOk()` |
| `k6/smoke.js` | 1 VU × 1 vòng, gọi qua mọi nhóm endpoint đọc chính (public catalog, courts, bookings, customers, inventory, reports/dashboard). Threshold ngặt: `checks: rate==1.0`. Dùng để xác minh môi trường trước khi chạy load, và có thể cắm vào CI sau này |
| `k6/load_test.js` | Kịch bản chính. Ramp `0 → 50 → 100 VU`, giữ 100 VU, tổng ~5 phút. Trộn tải theo hành vi thật: 40% khách duyệt catalog/kiểm tra khung giờ trống (public, không token), 30% nhân viên xem sơ đồ sân + trạng thái, 20% danh sách booking + availability, 10% dashboard/báo cáo. Threshold: `p(95) < 800ms`, `http_req_failed < 1%` |
| `k6/spike_test.js` | Đột biến `0 → 200 VU trong 30s` nhắm vào đúng đường dẫn bị dồn tải thật khi mở khung giờ đẹp: `GET /public/availability` + `GET /public/courts`. Threshold nới hơn: `p(95) < 2s`, lỗi < 5% |
| `k6/README.md` | Lệnh chạy, ý nghĩa từng threshold, ghi chú về rate limit và cách đọc kết quả |

**Quyết định thiết kế (không hỏi, đã chốt — nêu để bạn bác nếu không đồng ý):**
- **Load test mặc định chỉ ĐỌC, không GHI.** Bắn 100 VU vào `POST /bookings` sẽ
  đẻ rác vào DB thật và làm hỏng số liệu báo cáo. Kịch bản ghi (đặt sân → huỷ để
  dọn) để riêng, bật bằng `--env WRITE=1`, mặc định tắt.
- Threshold chọn `p95 < 800ms` cho tải thường và `< 2s` cho spike — mốc hợp lý cho
  app nội bộ chạy MySQL local, không phải con số marketing.

### 2.2 `postman/`

| File | Nội dung |
|---|---|
| `postman/badminton_api_collection.json` | Collection v2.1, **112 request** chia 23 folder khớp đúng nhóm route. Auth kiểu Bearer `{{accessToken}}` khai báo ở cấp collection (kế thừa xuống mọi request, trừ folder `Public` và `Auth`). Request `Login` có test script tự lưu `accessToken`/`refreshToken` vào biến → đăng nhập 1 lần là chạy được cả bộ. Body mẫu lấy từ các file trong `backend/src/validations/` để đúng field bắt buộc |
| `postman/badminton_local.postman_environment.json` | Environment `Local`: `baseUrl=http://localhost:5000/api/v1`, `branchId=1`, sẵn 4 bộ tài khoản seed |
| `postman/README.md` | Cách import, thứ tự chạy, lệnh `npx newman run` |

### 2.3 Cập nhật tài liệu
- `README.md` gốc: ghi rõ lệnh chạy k6 và newman thay vì chỉ nhắc tên thư mục.
- `docs/01-plans/Phase6-TestingDevOpsDeployment.md`: đánh dấu mục 2 (Postman) và
  mục 3 (Load testing) đã xong, giữ nguyên trạng thái TODO cho Swagger `/api-docs`
  và integration test Supertest (ngoài phạm vi lần này).

---

## 3. Cách kiểm thử thật (không chỉ đọc code)

1. Khởi động backend thật qua `preview_start` cấu hình `backend` (port 5000), xác nhận
   kết nối được MySQL bằng `GET /api/v1/public/branches`.
2. `k6 run k6/smoke.js` → dán nguyên output, phải 100% checks pass.
3. `k6 run k6/load_test.js` → chạy thật full 5 phút, dán bảng summary (p95, RPS,
   http_req_failed, kết quả threshold pass/fail).
4. `k6 run k6/spike_test.js` → chạy thật, dán summary.
5. `npx newman run postman/badminton_api_collection.json -e postman/badminton_local.postman_environment.json`
   → dán bảng tổng kết số request / số assertion pass-fail.
6. Nếu newman lộ ra endpoint trả lỗi do body mẫu sai → sửa collection rồi chạy lại
   tới khi sạch (hoặc ghi rõ endpoint nào cần dữ liệu có sẵn mới chạy được).
7. Dọn dữ liệu test nếu kịch bản ghi có tạo bản ghi.

**Ngoài phạm vi lần này:** Swagger UI `/api-docs`, integration test Supertest,
thêm k6/newman vào GitHub Actions CI. Nói nếu bạn muốn gộp luôn.

---

## 4. Rủi ro

- Backend không lên được nếu MySQL local chưa chạy → sẽ báo ngay ở bước 1, không code tiếp trong mù.
- Một số endpoint (`/sessions/:id`, `/invoices/:id`, `/sales-orders/:id/checkout`)
  phụ thuộc dữ liệu trạng thái có sẵn; newman có thể fail ở đó. Sẽ xử lý bằng cách
  chuỗi biến từ request tạo trước đó, hoặc ghi chú rõ nếu không tự động hoá được.

---

# KẾT QUẢ THỰC HIỆN — 05/09/2026

Toàn bộ số liệu dưới đây đo thật trên backend chạy `NODE_ENV=production` + MySQL 8 local,
dữ liệu seed thật, không phải ước lượng.

## 1. k6

| Lần | Kịch bản | Tải | p95 | Thông lượng | Lỗi | Threshold |
|---|---|---|---|---|---|---|
| #1 | `load_test` | 100 VU, DB vừa khởi động | 677 ms | 115 req/s | 0 | 1 trượt |
| #2 | `load_test` | 100 VU | 1.14 s | 95 req/s | 0 | 5 trượt |
| #3 | `load_test` | 50 VU | 31 ms | — | 0 | ✅ |
| #4 | `spike_test` | 200 VU (chỉ `/public`) | 731 ms | 276 req/s | 0 | ✅ |
| #5 | `load_test` | 100 VU, DB đã ấm | 164 ms | 147 req/s | 0 | ✅ |
| #6 | `load_test` | 100 VU (bản đã commit) | **121 ms** | — | 0 | ✅ exit 0 |

- `smoke.js`: 31 request, 62 check, **100% pass**, p95 18ms.
- Luồng ghi (`WRITE=1`, 5 VU × 40s): `bookings_created` = 163, `bookings_cleaned_up` = **163**,
  0 xung đột, 0 khách hàng rác. Kiểm tra lại bằng SQL trên DB thật: 0 booking sót chưa huỷ.
- Tổng cộng hơn **180.000 request** qua 6 lần chạy, `http_req_failed` = **0** ở mọi mức tải,
  kể cả 200 VU.

### Phát hiện đáng kể: số đo đầu tiên sai gấp 7 lần vì cache CSDL lạnh

Hai lần chạy đầu cho p95 677ms và 1.14s; lần thứ năm với **cùng 100 VU** cho 164ms. Ban đầu đã
kết luận nhầm là hệ thống bão hoà quanh 50-100 VU và đã định nới ngưỡng lên hàng giây. Chạy thêm
mới thấy nguyên nhân thật là buffer pool của InnoDB còn lạnh ở những lần đầu. Kết luận đã sửa lại,
và cảnh báo này ghi thẳng vào `k6/load_test.js` + `k6/README.md` để lần sau không vấp lại.

Vì vậy ngưỡng cuối cùng đặt quanh mức đo ấm nhân ~5 lần biên (`p95 < 800ms`, riêng báo cáo
`< 1500ms`) — đủ chặt để bắt hồi quy, đủ rộng để không đỏ vì nhiễu máy.

## 2. Postman / newman

| Chế độ | Request | Assertion | Lỗi | Thời gian |
|---|---|---|---|---|
| Mặc định (chỉ đọc) | 50 | 150 | **0** | 7.1 s |
| `runWrites=true` | 74 | 222 | **0** | 10.8 s |

Collection có đủ **112 request / 23 nhóm**, khớp chính xác số endpoint đếm được trong
`backend/src/routes/`.

### Hai lỗi collection tự phát hiện được khi chạy thật

1. **`Chi tiết voucher` trả 404** — bảng `vouchers` rỗng nên biến `voucherId` giữ giá trị mặc định
   `1`. Đã sửa: request danh sách đặt cờ `has_<var>`, request chi tiết tự bỏ qua khi danh sách rỗng
   (áp cho 15 request GET chi tiết).
2. **`Tạo khách hàng` trả 400** — dùng `{{$randomInt}}` của Postman sinh số 0–1000, ra số điện thoại
   7 chữ số trong khi `utils/phone.js` yêu cầu `^0\d{8,10}$`. Đã sửa: sinh số hợp lệ trong
   pre-request script (`{{qaCustomerPhone}}`, `{{qaEmployeePhone}}`).

## 3. Dọn dữ liệu test

Đã xoá sạch mọi bản ghi do phiên test sinh ra, kiểm chứng bằng SQL trực tiếp:

| Bảng | Trước phiên test | Sau khi dọn |
|---|---|---|
| `bookings` | 40 | **40** |
| `customers` | 98 | **98** |
| `vouchers` | 0 | **0** |

Cụ thể đã xoá: 165 booking do k6 tạo (ngày 2027+, đều đã huỷ), 2 booking + 2 khách hàng từ các lần
thăm dò thủ công, 2 voucher `QAPOSTMAN…` do newman tạo.

## 4. Điều chỉnh so với kế hoạch

- Thêm tham số `--env VUS=` cho `load_test.js` (không có trong kế hoạch) — cần để dò điểm bão hoà
  và để chạy nhẹ hơn trên máy CI yếu.
- Chia cờ an toàn của Postman thành **hai** mức thay vì một: `runWrites` (tự dọn) và
  `runDestructive` (đụng dữ liệu có sẵn). Gộp làm một sẽ khiến `newman --env-var runWrites=true`
  vô tình huỷ hoá đơn và đổi cấu hình cửa hàng.

## 5. Vẫn còn thiếu (ngoài phạm vi lần này)

- Swagger UI `/api-docs`: `swagger-ui-express` đã nằm trong `package.json` nhưng chưa nối vào
  `server.js`.
- Integration test bằng Supertest cho tầng route (`supertest` cũng đã cài sẵn, chưa dùng).
- Chưa cắm k6 `smoke.js` và newman vào `.github/workflows/ci.yml` — cần một MySQL service container
  trong CI thì mới chạy được.

---

# VÒNG 2 — QUÉT TRỌN BỘ 112 ENDPOINT · 05/09/2026

Vòng 1 chỉ chạy 74/112 request; 38 request thuộc nhóm `runDestructive` chưa hề chạy lần nào. Vòng
này dựng CSDL dùng một lần để quét nốt.

## Cách làm
`badminton_digital_management_test` dựng từ CSDL trắng: **38 migration + 7 seeder chạy sạch** (tự
nó đã xác minh bộ migration còn dựng lại được từ đầu), backend chạy `NODE_ENV=test` trên CSDL đó,
newman bật cả `runWrites` lẫn `runDestructive`. CSDL thật không bị đụng — kiểm chứng bằng SQL:
`bookings` 40, `customers` 98, `vouchers` 0, y như trước.

## Kết quả: 2 lỗi thật + 8 nhóm lỗi collection

### Lỗi thật 1 — `/auth/forgot-password` rò rỉ email nào đã đăng ký (đã sửa)

```
email CÓ trong hệ thống  → HTTP 500
email KHÔNG tồn tại      → HTTP 200
```

`AuthService.forgotPassword` cố tình trả cùng một thông điệp để giấu danh sách email, nhưng email
không tồn tại thì `return` sớm còn email có thật đi tiếp tới `sendPasswordResetEmail` — hàm này ném
500 khi chưa cấu hình SMTP. Chênh lệch mã trạng thái phá đúng thứ đoạn code đó bảo vệ. Đang sống
với `.env` hiện tại, và trên production sẽ tự bật lại mỗi khi SMTP chập chờn.

Đã sửa ở commit `900afbe`: bọc try/catch, ghi log máy chủ, vẫn trả 200 generic. Kiểm chứng: hai
phản hồi nay **giống hệt từng byte**.

### Lỗi thật 2 — `NODE_ENV=test` trỏ vào CSDL thật (đã sửa)

`config.js` nhánh `test` đọc `process.env.DB_NAME || '..._test'`; mọi `.env` đều có `DB_NAME` nên
vế mặc định không bao giờ tới lượt. Chưa nổ vì Jest chỉ có unit test, nhưng Phase 6 đang định thêm
integration test Supertest.

Đã sửa ở commit `900afbe`: dùng biến riêng `DB_NAME_TEST`, thêm chốt chặn ném lỗi khi trùng
`DB_NAME`, ghi vào `.env.example`.

### 8 nhóm lỗi collection (44 assertion) — API đều đúng

| # | Nguyên nhân | Cách sửa |
|---|---|---|
| 1 | Assert cứng `200` ở 4-5 endpoint trả `201` đúng chuẩn REST | thêm helper `testOkOrCreated` |
| 2 | `Đổi trạng thái sân → maintenance` chạy trước, làm hỏng Mở/Chuyển/Đóng sân + cả nhóm Bookings | xếp lại vòng đời mở→chuyển→đóng, đổi trạng thái xuống cuối và **tự trả sân về `active`** |
| 3 | Session-extras + `payments/checkout` cần phiên **đang mở** | script chuẩn bị cấp thư mục tự mở phiên → `{{openSessionId}}` |
| 4 | `POST /sales-orders/:id/lines` trả về cả đơn, bắt nhầm `data.id` | lấy id từ `data.lines[...]`; thêm dòng dùng-một-lần riêng cho request xoá |
| 5 | Áp voucher đã bị `deactivate` ở nhóm trước | script chuẩn bị tạo voucher riêng cho nhóm 14 |
| 6 | My Orders cần vai trò `customer`, collection đang là admin → 403 | script chuẩn bị đăng nhập customer → `{{customerAccessToken}}` |
| 7 | Webhook dùng `invoiceNo` bịa; định dạng thật là `BD-1-00000009` | capture `invoiceNo` thật từ bước thanh toán |
| 8 | `Reset password` cần token từ email | cờ `runManual`, mặc định bỏ qua |

Cũng phát hiện thêm: request `Lưu sơ đồ mặt bằng` gửi sai shape — service yêu cầu `courtName` khớp
tên sân thật (không phải `id`), zones cần `label`/`w`/`h`.

Một chi tiết nhỏ nhưng đáng sửa: script đăng nhập `customer` ban đầu chạy cả khi nhóm bị bỏ qua,
đốt phí một lượt trong hạn 10 lần/15 phút của `/auth/login`. Đã thêm điều kiện `runDestructive`.

## Số liệu sau khi sửa

| Chế độ | CSDL | Request | Assertion | Lỗi |
|---|---|---|---|---|
| Mặc định (chỉ đọc) | dev thật | 50 | 150 | **0** |
| `runWrites` + `runDestructive` | test dùng một lần | 114 | 324 | **0** |

Trước khi sửa: 107 request / 321 assertion / **45 lỗi**.

Sau lần chạy đầy đủ: 5/5 sân về `active`, 0 phiên chơi còn treo → chạy lại nhiều lần được.
Jest vẫn 121/121 pass. CSDL test đã xoá sau khi xong.

## Cảnh báo phát hiện thêm: CSDL dùng một lần không cô lập được tất cả

`PUT /courts/layout` **ghi ra file trên đĩa** (`backend/public/layouts/branch-<id>.json`) chứ không
ghi vào CSDL. Chạy bộ `runDestructive` trên CSDL test vẫn ghi đè sơ đồ mặt bằng thật — chính tay
vòng test này đã làm mất sơ đồ chi nhánh 1 (4 sân + 6 khu vực bị thay bằng payload mẫu 1 sân +
1 khu vực) và phải khôi phục bằng `git checkout`.

Đây là endpoint DUY NHẤT trong 112 endpoint có tác dụng phụ ra ngoài phạm vi CSDL. Đã ghi cảnh báo
vào mô tả request và `postman/README.md`, kèm bước dọn `git checkout -- backend/public/layouts/`.
