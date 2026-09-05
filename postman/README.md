# Postman — API collection

Bộ sưu tập đầy đủ **112 endpoint / 23 nhóm** của Badminton Digital Management API.

| File | Nội dung |
|---|---|
| `badminton_api_collection.json` | Collection v2.1 — toàn bộ endpoint, có body mẫu và test script |
| `badminton_local.postman_environment.json` | Environment `Badminton — Local` + 4 tài khoản seed |

## Dùng trong Postman

1. **Import** cả hai file (File → Import).
2. Chọn environment **Badminton — Local** ở góc trên bên phải.
3. Chạy `01 · Auth → Login`. Request này tự lưu `accessToken` + `refreshToken` vào biến collection —
   sau đó mọi request khác dùng được ngay, không phải copy token thủ công.

Các biến id (`courtId`, `customerId`, `sessionId`, `productId`, …) **tự điền** từ các request danh
sách chạy trước đó. Chạy cả collection theo thứ tự thư mục là không phải nhập tay id nào.

Request thuộc phạm vi chi nhánh gửi kèm header `X-Branch-Id: {{branchId}}`. Admin đổi chi nhánh
đang xem bằng cách đổi biến `branchId` (1 / 2 / 3 theo seeder).

## Chạy bằng newman (CLI)

```bash
npx newman run postman/badminton_api_collection.json -e postman/badminton_local.postman_environment.json
```

Mặc định **chỉ chạy request đọc** để không làm bẩn CSDL. Ba cờ mở rộng phạm vi:

| Cờ | Mặc định | Bật thêm nhóm nào |
|---|---|---|
| `runWrites` | `false` | Request ghi **tự dọn** — tạo bản ghi QA rồi xoá/huỷ/ngừng ngay trong cùng nhóm |
| `runDestructive` | `false` | Request tác động lên dữ liệu có sẵn: checkout, void hoá đơn, điều chỉnh kho, đổi cấu hình, xoá bản ghi seed, `logout` |
| `runStream` | `false` | `GET /realtime/stream` — SSE, kết nối mở vô hạn nên **newman sẽ treo** |

```bash
# Kèm nhóm ghi tự dọn
npx newman run postman/badminton_api_collection.json \
  -e postman/badminton_local.postman_environment.json \
  --env-var runWrites=true
```

Request bị bỏ qua sẽ in `SKIP (...)` ra console kèm lý do, không tính là lỗi.

> ⚠️ `runDestructive=true` sẽ **thay đổi dữ liệu thật** và không tự hoàn tác: nó đóng phiên chơi,
> huỷ hoá đơn, sửa cấu hình cửa hàng và xoá bản ghi có sẵn. Chỉ bật trên CSDL dùng một lần.

## Kết quả chạy thật — 05/09/2026

Chạy trên backend local (`NODE_ENV=production`) + MySQL 8 với dữ liệu seed:

| Chế độ | Request chạy | Assertion | Lỗi | Thời gian |
|---|---|---|---|---|
| Mặc định (chỉ đọc) | 50 | 150 | **0** | 7.1 s |
| `runWrites=true` | 74 | 222 | **0** | 10.8 s |

Sau lần chạy `runWrites=true`, nhóm ghi đã tự đưa mọi bản ghi QA về trạng thái vô hại — sân/phụ
kiện/nhà cung cấp/danh mục bị xoá, booking bị huỷ, khách hàng bị xoá mềm, voucher bị ngừng.

> Lưu ý về chữ "tự dọn": nó dùng đúng API xoá của hệ thống, nghĩa là **xoá mềm** (`deleted_at`),
> **huỷ** (`status = cancelled`) hoặc **ngừng** (`is_active = 0`) — dòng vẫn còn trong bảng. Voucher
> không có endpoint xoá nên mỗi lần chạy để lại một mã `QAPOSTMAN…` đã tắt.

## Hai điều dễ vấp

**Rate limit khi chạy lại nhiều lần.** `POST /auth/login` giới hạn **10 lần / 15 phút / IP**
(`/auth/register` 5 lần/giờ, `/auth/refresh-token` 30 lần/15 phút). Chạy collection quá nhiều lượt
liên tiếp sẽ ăn 429 ở request `Login` và cả bộ hỏng theo. Bộ đếm nằm trong RAM — khởi động lại
backend là reset.

**Số điện thoại trong body mẫu.** Validator yêu cầu `^0\d{8,10}$` (9–11 chữ số sau khi chuẩn hoá).
Các request tạo khách hàng/nhân viên sinh số hợp lệ ở pre-request script (`{{qaCustomerPhone}}`,
`{{qaEmployeePhone}}`) thay vì dùng `{{$randomInt}}` — biến dựng sẵn của Postman chỉ trả 0–1000 nên
sinh ra số quá ngắn và bị trả về 400.

## Nhóm request

| # | Nhóm | Số request | | # | Nhóm | Số request |
|---|---|---|---|---|---|---|
| 01 | Auth | 8 | | 13 | Vouchers | 6 |
| 02 | Public | 5 | | 14 | Sales Orders | 7 |
| 03 | Branches | 1 | | 15 | My Orders | 4 |
| 04 | Courts | 10 | | 16 | Customers | 6 |
| 05 | Bookings | 7 | | 17 | Employees | 6 |
| 06 | Court Sessions | 5 | | 18 | Payments | 2 |
| 07 | Accessories | 5 | | 19 | Invoices | 3 |
| 08 | Suppliers | 5 | | 20 | Activity Logs | 1 |
| 09 | Goods Receipts | 3 | | 21 | Reports | 8 |
| 10 | Inventory | 4 | | 22 | Settings | 5 |
| 11 | Product Categories | 4 | | 23 | Realtime (SSE) | 1 |
| 12 | Products | 6 | | | **Tổng** | **112** |
