# Kế hoạch: Swagger UI tại `/api-docs`

- **Nhánh:** `feat/swagger-api-docs`
- **Ngày:** 06/09/2026
- **Bối cảnh:** hạng mục cuối còn thiếu của Phase 6 (mục 2). `swagger-ui-express@5` và
  `yamljs@0.3` đã nằm trong `package.json` từ lâu nhưng **chưa từng được `require`** ở đâu —
  ý đồ ban đầu là nạp một file YAML tĩnh rồi serve. Không có file spec nào trong repo.

---

## 1. Lấy nội dung spec từ đâu — quyết định chính

112 endpoint. Ba đường:

| Cách | Đánh giá |
|---|---|
| A. Gõ tay `openapi.yaml` | ~2500 dòng YAML gõ tay, sai sót cao, và không có gì bảo đảm khớp code |
| **B. Sinh từ Postman collection** | Collection đã có đủ 112 endpoint, method, path, body mẫu, mô tả, quy tắc auth — và **đã chạy thật 324 assertion / 0 lỗi** trên server thật, tức là đã được kiểm chứng chứ không phải chép từ trí nhớ |
| C. `swagger-jsdoc` + chú thích trong route | Thêm dependency mới, phải sửa 23 file route với JSDoc dài; lợi ích chính (spec nằm cạnh code) không bù được công |

**Chọn B.** Đây là điểm mạnh riêng của repo lúc này: có sẵn một mô tả API đã được máy kiểm
chứng. Gõ tay lại từ đầu là tự nguyện bỏ đi bằng chứng đó.

**Chống lệch pha:** commit kèm script chuyển đổi `backend/scripts/collection-to-openapi.js`.
Collection đổi thì chạy lại một lệnh là spec khớp lại, không phải sửa hai nơi bằng tay.

## 2. Sản phẩm bàn giao

| File | Nội dung |
|---|---|
| `backend/src/docs/openapi.yaml` | Spec OpenAPI 3.0, 112 path/operation, gom theo 23 tag khớp nhóm route. Có `securitySchemes` (bearer JWT), tham số `X-Branch-Id`, schema envelope `{success, data, message, errors}`, body mẫu và mô tả lấy nguyên từ collection |
| `backend/scripts/collection-to-openapi.js` | Bộ chuyển Postman → OpenAPI, chạy `npm run docs:build` |
| `backend/src/server.js` | Gắn `swagger-ui-express` tại `/api-docs`, nạp YAML bằng `yamljs` — **không thêm dependency mới** |
| `backend/package.json` | Thêm script `docs:build` |
| `README.md`, `docs/01-plans/Phase6-...md` | Ghi nhận mục 2 đã xong |

## 3. Hai câu hỏi chính sách — đề xuất sẵn, bác nếu không đồng ý

**a) `/api-docs` có nên mở công khai ở production không?**
Trang này phơi toàn bộ bề mặt API. Đề xuất: **luôn bật ở dev/test; ở production chỉ bật khi
`ENABLE_API_DOCS=true`**. Mặc định tắt ở production, ai cần thì tự bật có ý thức.

**b) Có cho "Try it out" gọi thẳng API thật không?**
Swagger UI mặc định cho bấm thử. Đề xuất: **giữ bật** — đây là công cụ nội bộ, và `/api-docs`
đã bị chặn ở production theo (a). Người dùng phải tự dán token vào nút Authorize.

## 4. Cách kiểm thử thật

1. Chạy backend, mở `http://localhost:5000/api-docs` bằng trình duyệt thật, chụp màn hình.
2. Đối chiếu **số operation trong YAML = 112** = số endpoint đếm được trong `backend/src/routes/`.
3. Kiểm tra spec hợp lệ (parse bằng `yamljs` + rà bắt buộc của OpenAPI 3.0).
4. Bấm "Try it out" thật trên vài endpoint đại diện (1 public, 1 cần auth, 1 có `X-Branch-Id`).
5. `NODE_ENV=production` mà không đặt `ENABLE_API_DOCS` → `/api-docs` phải trả 404.
6. `npm test` vẫn 121/121; newman chế độ mặc định vẫn 150 assertion / 0 lỗi.

## 5. Ngoài phạm vi

Integration test Supertest và cắm k6/newman vào CI — hai hạng mục còn lại của Phase 6, để riêng.

---

# KẾT QUẢ THỰC HIỆN — 06/09/2026

## Đã giao

| File | |
|---|---|
| `backend/src/docs/openapi.yaml` | 3898 dòng, OpenAPI 3.0.3, **112 operation / 83 path / 23 tag** — sinh tự động |
| `backend/scripts/collection-to-openapi.js` | Bộ sinh, chạy bằng `npm run docs:build` |
| `backend/src/server.js` | Gắn `/api-docs` + `/api-docs.json`, có cổng chặn production |
| `backend/package.json` | Thêm script `docs:build` |

**Không thêm dependency nào** — `swagger-ui-express@5` và `yamljs@0.3` đã nằm sẵn trong
`package.json` từ trước mà chưa từng được dùng.

## Bộ sinh kiêm luôn việc canh lệch pha

Điểm không có trong kế hoạch ban đầu, thêm vào khi làm: script đọc **cả** collection **và**
`src/routes/` (qua `app.use` trong `server.js`), rồi **bắt buộc khớp 1-1**. Thừa hoặc thiếu một
endpoint là thoát với mã lỗi 1.

Đã kiểm chứng bằng cách thêm một route giả rồi chạy lại:

```
✖ Collection và routes/ không khớp 1-1:
   GET /branches/fake-drift-test  ← có trong routes/, thiếu trong collection
exit code: 1
```

Nhờ vậy `npm run docs:build` là chỗ bắt được việc thêm endpoint mà quên cập nhật tài liệu — đúng
căn bệnh của `docs/APIDesign.md` viết tay.

Một chi tiết phải xử lý: tên tham số đường dẫn lấy từ **route thật**, không lấy từ biến Postman.
Collection dùng `{{courtId}}` và `{{tmpCourtId}}` cho cùng một đường dẫn; nếu bê nguyên thì spec
tách thành hai path riêng. Sau khi chuẩn hoá, `/api/v1/courts/{id}` gộp đúng cả GET/PUT/DELETE —
đó cũng là lý do 112 operation chỉ nằm trên 83 path.

## Kiểm thử thật

| Hạng mục | Kết quả |
|---|---|
| `/api-docs` trên trình duyệt thật | ✅ render Swagger UI, đủ **23 nhóm**, có Authorize + ô lọc, mặc định thu gọn |
| Số operation trong spec | **112** = đúng số endpoint đếm trong `src/routes/` |
| `/api-docs.json` | ✅ 200, OpenAPI 3.0.3 |
| **"Try it out"** trên `GET /public/branches` | ✅ gọi API thật, trả về đúng 3 chi nhánh từ CSDL dev |
| Chốt chặn lệch pha | ✅ thêm route giả → build đỏ, exit 1 |
| `NODE_ENV` dev | `/api-docs` **200** |
| `NODE_ENV=production`, không cờ | `/api-docs` **404** (API nghiệp vụ vẫn 200) |
| `NODE_ENV=production` + `ENABLE_API_DOCS=true` | `/api-docs` **200** |
| Jest | 121/121 pass |
| newman (chỉ đọc) | 50 request / 150 assertion / 0 lỗi |
| k6 smoke | 60 check / 100% pass / 0 lỗi |

## Khác với kế hoạch

- Thêm `/api-docs.json` (không có trong plan) để công cụ khác tải spec thô.
- Bật `deepLinking` và `displayRequestDuration` ngoài `docExpansion: none` / `persistAuthorization`
  / `filter` đã dự tính.
- Bộ sinh làm luôn vai trò kiểm tra khớp 1-1 với `src/routes/`, không chỉ chuyển đổi một chiều.

## Còn lại của Phase 6

Integration test bằng Supertest, và cắm k6 `smoke.js` + newman + `docs:build` vào
`.github/workflows/ci.yml` (cần MySQL service container).
