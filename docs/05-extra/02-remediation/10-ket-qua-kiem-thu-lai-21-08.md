# Kiểm thử lại tài liệu 08 và 09 — kết quả đo được

**Ngày chạy:** 21/08/2026 (tối, ~21:20–21:35 giờ VN)
**Phạm vi:** kiểm chứng lại từng khẳng định trong
[`08-bao-cao-thanh-toan-online-voucher.md`](08-bao-cao-thanh-toan-online-voucher.md) và
[`09-loi-phat-hien-kiem-thu-hoi-quy.md`](09-loi-phat-hien-kiem-thu-hoi-quy.md).
**Commit:** `d50fb8e`, cây làm việc sạch — **không sửa một dòng mã nào** trong đợt này.

## Cách chạy

- Dựng **MySQL thật** (9.5.0) từ DB rỗng `bdm_regress_0821`: `db:migrate` + `db:seed:all`.
- Backend thật chạy `TZ=Asia/Ho_Chi_Minh`, cổng 5099, trỏ vào DB đó.
- ~30 phép kiểm qua **API thật**; mọi kết luận về dữ liệu đều đối chiếu bằng **truy vấn SQL
  trực tiếp**, không chỉ tin response.
- Các phép kiểm phụ thuộc múi giờ chạy lại tiến trình với `TZ` = VN / UTC / New York /
  Kiritimati.
- DB gốc `badminton_digital_management` **không bị đụng tới**.

## Kết luận một dòng

| Tài liệu | Kết quả |
|---|---|
| 09 — 8 lỗi hồi quy | **Cả 8 vẫn còn nguyên**, tái hiện được 8/8, số liệu khớp tài liệu |
| 08 — 7 lỗi voucher đã vá | **Cả 7 vẫn giữ**, không có hồi quy |
| 08 — luồng VietQR + huỷ đơn | **Hoạt động đúng như mô tả** |
| 08 §5.2 — 3 vấn đề tồn tại | **Cả 3 vẫn còn** |

---

## 1. Tài liệu 09 — 8 lỗi: tái hiện 8/8

### Mục 1 🔴 Giờ cao điểm đọc sai khoá cấu hình — **còn nguyên**

```
Cấu hình trong DB (operating_hours): peak 17:00 – 21:00
getPeakHours() trả về             : 17h – 22h
Phiên 21:00–22:00 giờ VN, sân 90k/60k:
  hệ thống tính : 90.000đ   (giá cao điểm)
  đúng cấu hình : 60.000đ   (giá thấp điểm)
  → thu thừa 30.000đ mỗi phiên 21–22h
```

Đúng như tài liệu mô tả: bản cài mới **không có** khoá `pricing` trong bảng `settings`
(seeder chỉ ghi `operating_hours`), nên `SettingService.getPeakHours()` rơi về mặc định
cứng 17–22.

Đã xác nhận lại gốc "hai nguồn sự thật": `settingController.updatePricing` ghi khoá
`pricing`, `updateOperatingHours` ghi khoá `operating_hours`, và màn hình Cài đặt phía
frontend lưu vào `operating_hours`.

### Mục 2 🔴 Đặt lịch so sánh giờ bằng chuỗi — **còn nguyên**

| Yêu cầu | Kết quả đo được |
|---|---|
| `9:00 → 10:00` | **400** "Giờ kết thúc phải sau giờ bắt đầu" |
| `10:00 → 9:00` | **201**, ghi thẳng vào `bookings` |
| `09:00 → 10:00` | 201 (đúng) |

Kiểm DB sau đó: `SELECT COUNT(*) FROM bookings WHERE end_time <= start_time` → **1 dòng**.

Xác nhận thêm phần "lọt kiểm tra trùng lịch": sau khi booking ngược `10:00→09:00` nằm
trong DB, đặt tiếp `09:00→10:00` **cùng sân cùng ngày vẫn thành công (201)** — tức là
booking ngược hoàn toàn vô hình với bộ kiểm trùng.

> **Bổ sung so với tài liệu:** lỗ hổng chỉ mở theo **một chiều**. `12:00 → 08:00` vẫn bị
> chặn đúng (400), vì `"12:00" >= "08:00"` là true theo thứ tự từ điển. Chỉ lọt khi giờ
> bắt đầu có 2 chữ số và giờ kết thúc có 1 chữ số (bắt đầu ≥ 10h, kết thúc ≤ 9h).

### Mục 3 🟠 Cắt ngày theo giờ máy chủ — **còn nguyên**

Cùng tham số `date=2026-08-21`:

| TZ tiến trình | Cửa sổ sinh ra |
|---|---|
| `Asia/Ho_Chi_Minh` | `2026-08-20T17:00Z … 2026-08-21T16:59:59Z` |
| `UTC` | `2026-08-21T00:00Z … 2026-08-21T23:59:59Z` |
| `America/New_York` | `2026-08-21T04:00Z … 2026-08-22T03:59:59Z` |
| `Pacific/Kiritimati` | `2026-08-20T10:00Z … 2026-08-21T09:59:59Z` |

Khớp chính xác con số trong tài liệu.

> **Đính chính con số:** tài liệu ghi "5 chỗ". Thực tế là **4 tệp / 8 dòng** — mỗi chỗ đều
> có một cặp `from`/`to`: `SessionService.js:24,25`, `ReportService.js:40,41`,
> `SalesOrderService.js:37,38`, `InventoryService.js:166,167`. Tài liệu liệt kê thiếu 3
> dòng `to`.

### Mục 4 🟠 `/reports/revenue` bỏ qua `from`/`to` — **còn nguyên**

`GET /reports/revenue?period=daily` và `...&from=2026-08-19&to=2026-08-19` trả về chuỗi
JSON **giống hệt nhau từng ký tự**.

Đối chứng: `/reports/revenue-breakdown` với cùng cặp tham số cho kết quả **khác nhau** —
đúng như tài liệu nói, chỉ mỗi `/revenue` quên truyền tham số xuống service.

### Mục 5 🟠 Báo cáo sai ngày ở vùng có DST — **còn nguyên**

Đặt chi nhánh 2 sang `America/New_York`, một payment `paid_at = 2026-01-15 04:30:00 UTC`
(= **14/01 23:30 giờ New York**, tháng 1 là EST = UTC−5):

```
bucket API trả về : ["2026-08-20","2026-08-19","2026-01-15"]
đáng lẽ phải có   : 2026-01-14
```

Lệch nguyên một ngày, đúng như tài liệu.

Hướng khắc phục (a) vẫn **chưa dùng được**: trên MySQL 9.5.0 của môi trường này
`SELECT COUNT(*) FROM mysql.time_zone_name` = **0** và
`CONVERT_TZ('2026-01-15 04:30:00','+00:00','America/New_York')` trả **NULL**.

### Mục 6 🟡 `compareBranches` gộp theo một múi giờ — **còn nguyên**

Lần này tách bạch được khỏi lỗi DST của mục 5 bằng cách dùng dữ liệu **tháng 8** (New York
đang EDT, offset hiện tại đúng). Cùng một dòng `invoice_lines` của chi nhánh 2
(`created_at = 2026-08-19 02:00 UTC` = **18/08 22:00 giờ NY** = 19/08 09:00 giờ VN):

```
/reports/revenue-breakdown           (1 chi nhánh, tz=NY)  → bucket 2026-08-18  ✅
/reports/revenue-breakdown?compareBranches=true            → bucket 2026-08-19  ❌
```

Hai chế độ báo cáo cho **hai ngày khác nhau trên cùng một giao dịch** — bằng chứng trực
tiếp là chế độ so sánh đang cắt theo `DEFAULT_TIMEZONE` chứ không theo chi nhánh.

### Mục 7 🟡 Thanh toán đồng thời trả HTTP 500 — **còn nguyên, tái hiện 3/3**

```
lượt 1: HTTP 201/500 | invoices=1 payments=1
lượt 2: HTTP 500/201 | invoices=1 payments=1
lượt 3: HTTP 201/500 | invoices=1 payments=1

thông báo lọt ra client:
"Transaction cannot be rolled back because it has been finished with state: rollback"
```

**Tiền vẫn đúng** — mọi lượt đều đúng 1 hoá đơn, 1 giao dịch, không thu trùng. Đúng y như
tài liệu đánh giá.

### Mục 8 🟡 Mã giảm giá "đến hết hôm nay" chết từ 7h sáng — **còn nguyên**

```
Bây giờ theo giờ VN : 2026-08-21 21:24:17
Tạo mã endsAt="2026-08-21" : 201
DB lưu ends_at             : 2026-08-21T00:00:00.000Z   (= 07:00 sáng giờ VN)
Áp mã lúc 21:24            : 400 "Mã giảm giá đã hết hạn"
```

Xác nhận lại `frontend/src/pages/Retail/VoucherTab.jsx` vẫn dùng `<input type="date">` và
gửi thẳng chuỗi ngày trơn (dòng 77–78, 205, 210).

---

## 2. Tài liệu 08 — 7 lỗi voucher đã vá: **cả 7 vẫn giữ**

| # | Kịch bản khai thác cũ | Kết quả hôm nay |
|---|---|---|
| 1 | Áp mã lúc giỏ 250.000đ rồi rút giỏ còn 25.000đ, thanh toán | **400** "Đơn hàng cần tối thiểu 200.000đ mới dùng được mã này" ✅ |
| 2 | `PUT /vouchers/:id` sửa thành 150% | **400** "Giảm theo % không thể vượt quá 100" ✅ |
| 3 | Giảm giá tay 999.999đ trên đơn 25.000đ | Ghi nhận **25.000đ**, hoá đơn `total=0`, không âm ✅ |
| 4 | Mã dài 100 ký tự | **400** (không phải 500) ✅ |
| 5 | `endsAt` trước `startsAt` | **400** "Ngày kết thúc phải sau ngày bắt đầu" ✅ |
| 6 | Giảm 33,33% trên 100.000đ | **33.330đ** — số nguyên ✅ |
| 7 | `PUT` gắn `maxDiscountAmount` cho mã `flat` | Ghi vào DB thành `NULL` — bất biến được giữ ✅ |

**F7 (không vá quá tay):** đơn hợp lệ mã 5.000đ + giảm tay 20.000đ vẫn thanh toán được
(201), và hoá đơn khớp tuyệt đối: `total_amount = 225.000` = tổng các dòng `225.000`.

> **Hai điểm cần nói rõ hơn tài liệu 08.** Lỗi #3 và #7 được vá bằng cách **âm thầm nắn
> giá trị**, không phải trả lỗi:
> - #3: `SalesOrderService.js:340` dùng `Math.max(0, Math.min(discountAmount, extrasFee -
>   voucherDiscount))`. Sổ sách không thể sai nữa, nhưng thu ngân gõ nhầm 999.999đ vẫn
>   nhận **201 "thành công"** mà không hề biết số mình nhập đã bị cắt xuống 25.000đ.
> - #7: `PUT` ép `maxDiscountAmount = null` thay vì báo 400.
>
> Cả hai đều an toàn về dữ liệu; chỉ là người dùng không nhận được phản hồi. Nếu muốn chặt
> hơn thì nên trả 400 ở #3.

### Luồng VietQR và huỷ đơn — đúng như mô tả

| Phép kiểm | Kết quả |
|---|---|
| Đặt đơn online `paymentMethod=transfer` | 201, `payment_deadline_at` − `created_at` = **đúng 30 phút** |
| Trừ kho ngay lúc đặt | 48 → 46 (đúng 2 đơn vị) |
| Webhook ngân hàng xác nhận | 200; đơn/hoá đơn/giao dịch → **paid / paid / paid** |
| Khách tự huỷ đơn chuyển khoản | 200; **cancelled / void / cancelled** |
| Huỷ đơn hoàn kho | về đúng số cũ |
| Huỷ đơn nhả lại lượt dùng mã (`usageLimit=1`) | đặt lại cùng mã **thành công** |
| Tác vụ quét nền quá hạn 30 phút | `expireStalePendingOrders()` → `{expired:1, checked:1}`, đơn cancelled, kho **+2** |

Lỗi "`processWebhook` bỏ qua hoá đơn đơn hàng" đã vá và **vẫn đúng**.

---

## 3. Tài liệu 08 §5.2 — 3 vấn đề tồn tại: **cả 3 vẫn còn**

**1. `POST /auth/login` trả 500 khi đăng nhập đồng thời.**
```
A: 500  "Attempting to update a stale model instance: User"
B: 200  "Đăng nhập thành công."
```
Ngoài mã lỗi sai, thông báo `OptimisticLockError` của Sequelize lọt thẳng ra client — cùng
loại rò rỉ với mục 7 của tài liệu 09.

**3. Đơn online chuyển khoản tạo hoá đơn nhưng không tạo dòng hoá đơn.**
Đơn `transfer` sinh hoá đơn `BD-1-00000015` với `SELECT COUNT(*) FROM invoice_lines` =
**0**, trong khi đơn POS cùng lúc có đủ dòng. Xem chi tiết hoá đơn của đơn online sẽ trống.

**4. `countUsage` tính cả đơn `open`.**
Mã `usageLimit=1`, áp vào một đơn quầy rồi **bỏ dở không thanh toán** → đơn thứ hai áp cùng
mã nhận **400 "Mã giảm giá đã hết lượt sử dụng"**. Một đơn bỏ dở giữ lượt mã vĩnh viễn.

> Danh sách §5.2 đánh số 1, 3, 4 — thiếu mục 2. Nên đánh lại cho liền mạch.

---

## 4. Phát sinh ngoài phạm vi hai tài liệu

- **`npm run migrate && npm run seed` chạy trọn vẹn từ DB rỗng** — xác nhận lại khẳng định
  của tài liệu 08. Con số nay là **38 migration + 7 seeder** (tài liệu ghi 35 migration,
  viết trước 3 migration cuối).
- **`npm test` → 121/121 PASS**, 11 bộ test. Tài liệu 08 ghi 113 — đã tăng sau đợt chuẩn
  hoá múi giờ.
- ⚠️ **DB phát triển trên máy đang chạy sau mã nguồn 7 migration** (31/38). Bảng `vouchers`
  chưa tồn tại, nên mọi màn hình mã giảm giá và đơn online sẽ lỗi nếu chạy app ngay bây
  giờ. Cần `npm run migrate` — trong đó có `20260821400001-store-datetime-as-utc` **dịch 78
  cột DATETIME**, nên hãy sao lưu trước khi chạy:

```bash
mysqldump -u root -p badminton_digital_management > backup-truoc-migrate.sql
```

---

## 5. Việc nên làm tiếp

Thứ tự trong tài liệu 09 vẫn đúng và không cần đổi. Sau đợt kiểm này chỉ thêm hai ghi chú:

1. **Mục 1 và 2 nên sửa ngay** — đã đo được thiệt hại cụ thể: 30.000đ mỗi phiên 21–22h, và
   1 dòng dữ liệu vô lý đã lọt vào `bookings` chỉ sau vài phép kiểm.
2. **Mục 5 hướng (a) hiện chưa khả thi** — MySQL của môi trường này không có bảng múi giờ.
   Nếu chọn hướng (a) thì phải nạp bảng trước, hoặc chọn hướng (b)/(c).
