# Postman — API collection

Bộ sưu tập đầy đủ **113 endpoint / 23 nhóm** của Badminton Digital Management API.

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
| `runManual` | `false` | `POST /auth/reset-password` — cần token thật lấy từ email, không tự động hoá được |

```bash
# Kèm nhóm ghi tự dọn
npx newman run postman/badminton_api_collection.json \
  -e postman/badminton_local.postman_environment.json \
  --env-var runWrites=true
```

Request bị bỏ qua sẽ in `SKIP (...)` ra console kèm lý do, không tính là lỗi.

`POST /payments/webhook` còn cần biến `webhookSecret` trùng `PAYMENT_WEBHOOK_SECRET` của backend
đang chạy. Environment để trống biến này — truyền lúc chạy, đừng ghi secret vào file:

```bash
npx newman run postman/badminton_api_collection.json \
  -e postman/badminton_local.postman_environment.json \
  --env-var runDestructive=true --env-var webhookSecret="$PAYMENT_WEBHOOK_SECRET"
```

Không truyền thì request webhook tự `SKIP`; backend chưa cấu hình secret thì webhook luôn trả 503.

> ⚠️ `runDestructive=true` sẽ **thay đổi dữ liệu thật** và không tự hoàn tác: nó đóng phiên chơi,
> huỷ hoá đơn, sửa cấu hình cửa hàng và xoá bản ghi có sẵn. Chỉ bật trên CSDL dùng một lần.

## Chạy trọn bộ 113 endpoint

`runDestructive=true` đụng vào dữ liệu có sẵn nên **đừng bật trên CSDL thật**. Cách an toàn là
dựng một CSDL dùng một lần rồi xoá đi:

```bash
# 1. Tạo CSDL test rỗng (tên mặc định của NODE_ENV=test)
mysql -u root -p -e "CREATE DATABASE badminton_digital_management_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"

# 2. Dựng schema + dữ liệu mẫu
cd backend && NODE_ENV=test npx sequelize-cli db:migrate && NODE_ENV=test npx sequelize-cli db:seed:all

# 3. Chạy backend trên CSDL đó
NODE_ENV=test node src/server.js

# 4. Quét toàn bộ
cd .. && npx newman run postman/badminton_api_collection.json \
  -e postman/badminton_local.postman_environment.json \
  --env-var runWrites=true --env-var runDestructive=true

# 5. Dọn: xoá CSDL test + trả lại file sơ đồ (xem cảnh báo ngay dưới)
git checkout -- backend/public/layouts/
```

> 🔴 **CSDL dùng một lần KHÔNG cô lập được tất cả.** `PUT /courts/layout` ghi ra **file trên đĩa**
> (`backend/public/layouts/branch-<id>.json`) chứ không ghi vào CSDL, nên chạy trên CSDL test vẫn
> ghi đè sơ đồ mặt bằng thật. Đây là thứ duy nhất trong 113 endpoint có tác dụng phụ ra ngoài phạm
> vi CSDL — nhớ `git checkout -- backend/public/layouts/` sau khi chạy.

### Trạng thái được dựng sẵn thế nào

Vài endpoint không chạy độc lập được vì cần trạng thái có sẵn. Thay vì thêm request phụ vào
collection (làm hỏng ánh xạ 1-1 với endpoint), phần dựng trạng thái nằm ở **script chuẩn bị cấp thư
mục**:

| Thư mục | Script chuẩn bị làm gì |
|---|---|
| `06 · Court Sessions` | Mở sẵn một phiên chơi nếu chưa có → `{{openSessionId}}` |
| `14 · Sales Orders` | Tạo một voucher còn hiệu lực riêng cho nhóm → `{{orderVoucherCode}}` |
| `15 · My Orders` | Đăng nhập vai trò `customer` → `{{customerAccessToken}}` |
| `18 · Payments` | Mở sẵn một phiên chơi cho `checkout` |

Riêng request `16 · Customers → Gộp hồ sơ tại quầy vào tài khoản` tự dựng cặp hồ sơ trong script
chuẩn bị của chính nó (chỉ khi `runWrites=true`): tạo một hồ sơ tại quầy bằng số QA mới rồi đăng ký
tài khoản khách cùng số. Mỗi lượt chạy vì thế tốn thêm 1 lần rate limit của `/auth/register` và để lại
một tài khoản khách QA (hồ sơ tại quầy thì bị chính request gộp xoá mềm).

Ngoài ra `04 · Courts` chạy đúng vòng đời **mở sân → chuyển sân → đóng sân** rồi mới đổi trạng thái
sân, và request `Đổi trạng thái sân` **tự trả sân về `active`** sau khi thử `maintenance` — nếu để
sân ở trạng thái bảo trì thì mọi lần chạy sau đó sẽ hỏng hàng loạt.

## Kết quả chạy thật — 05/09/2026

| Chế độ | CSDL | Request | Assertion | Lỗi | Thời gian |
|---|---|---|---|---|---|
| Mặc định (chỉ đọc) | dev thật | 50 | 150 | **0** | 7.5 s |
| `runWrites` + `runDestructive` | test dùng một lần | 114 | 324 | **0** | 18.1 s |

Lần chạy đầy đủ chạm tới **cả 112 endpoint** (114 request vì có thêm 2 lời gọi dựng trạng thái).
Sau khi chạy xong: 5/5 sân về `active`, 0 phiên chơi còn treo — collection chạy lại nhiều lần được.

**Chạy lại 13/09/2026** (nhánh `fix/customer-data-exposure`, 113 endpoint, bản sao DB dev dùng một lần rồi
DROP): `runWrites` + `runDestructive` — **118 request, 331 assertion, 0 lỗi, 24.6 s**. Request gộp hồ sơ
mới chạy đủ chuỗi: tạo hồ sơ tại quầy (201) → đăng ký cùng số (201) → gộp (200), 4/4 assertion. SSE bỏ qua
theo `runStream=false`. `branch-1.json` bị ghi đè như cảnh báo ở trên và đã `git checkout` lại.

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

## Bốn hành vi API dễ hiểu nhầm là lỗi

Đều đã gặp thật khi chạy trọn bộ, và đều là **API đúng**:

1. **Nhiều endpoint tạo mới trả `201` chứ không phải `200`** (`/auth/register`, `/goods-receipts`,
   `/inventory/adjustments`, `/sales-orders/:id/checkout`, `/sessions/:id/extras`). Assert cứng
   `200` là test sai.
2. **Đặt lại đúng trạng thái sân đang có → `400`** *"Sân đang ở trạng thái ... rồi"*. Đây là chốt
   chặn no-op có chủ đích.
3. **`POST /sales-orders/:id/lines` trả về cả đơn hàng**, không phải dòng vừa thêm — id dòng nằm ở
   `data.lines[...]`, còn `data.id` là id đơn.
4. **`invoiceNo` có dạng `BD-<chi nhánh>-<8 chữ số>`** (vd `BD-1-00000009`), không phải `INV-…`.
   Gửi số bịa vào webhook sẽ ra 404 *"Không tìm thấy hóa đơn"*. Webhook cũng bắt buộc `amount` khớp
   số tiền giao dịch: phiên vừa mở rồi checkout ngay ra hoá đơn 0đ, không dùng để thử webhook được.

## Tài khoản khách bị giới hạn những gì (từ 13/09/2026)

Collection chạy bằng token admin nên không đụng các giới hạn này, nhưng gọi tay bằng token
`customer` sẽ gặp:

- Gửi `X-Branch-Id` → **403** ở mọi route theo chi nhánh. Khách không chọn chi nhánh qua header;
  nhóm `15 · My Orders` vốn đã không gửi.
- `GET /courts`, `/courts/:id`, `/accessories`, `/accessories/:id`, `/products`, `/products/:id`,
  `/product-categories` → **403**. Trang khách dùng `/public/*`.
- `PUT /bookings/:id` → **403**; nhân viên sửa thì body chỉ nhận `courtId`, `bookingDate`,
  `startTime`, `endTime`.
- `POST /auth/register` không trả `mergedHistory` nữa và không tự nhận hồ sơ tại quầy trùng số.

## Nhóm request

| # | Nhóm | Số request | | # | Nhóm | Số request |
|---|---|---|---|---|---|---|
| 01 | Auth | 8 | | 13 | Vouchers | 6 |
| 02 | Public | 5 | | 14 | Sales Orders | 7 |
| 03 | Branches | 1 | | 15 | My Orders | 4 |
| 04 | Courts | 10 | | 16 | Customers | 7 |
| 05 | Bookings | 7 | | 17 | Employees | 6 |
| 06 | Court Sessions | 5 | | 18 | Payments | 2 |
| 07 | Accessories | 5 | | 19 | Invoices | 3 |
| 08 | Suppliers | 5 | | 20 | Activity Logs | 1 |
| 09 | Goods Receipts | 3 | | 21 | Reports | 8 |
| 10 | Inventory | 4 | | 22 | Settings | 5 |
| 11 | Product Categories | 4 | | 23 | Realtime (SSE) | 1 |
| 12 | Products | 6 | | | **Tổng** | **113** |
