# Lỗi phát hiện qua kiểm thử hồi quy — nguyên nhân và cách khắc phục

**Ngày phát hiện:** 21/08/2026
**Bối cảnh:** kiểm thử hồi quy toàn hệ thống sau đợt chuẩn hoá múi giờ (commit `c0fe365`).
**Cách chạy:** ~190 phép kiểm trên **MySQL thật**, backend chạy `TZ=Asia/Ho_Chi_Minh` đúng
như server production, chia 3 nhóm chạy song song + quét giao diện 16 trang bằng Chromium.

> **Kết luận về đợt đổi múi giờ: không gây hỏng gì.** Toàn bộ 8 lỗi dưới đây đều **có sẵn
> từ trước**, chỉ là bộ kiểm thử lần này soi ra. Bằng chứng: quét 170 dòng dữ liệu qua 6
> bảng — 0 dòng lưu nhầm giờ địa phương; hạn thanh toán 30 phút lệch đúng 1800 giây chẵn;
> cửa sổ hiệu lực mã giảm giá chính xác tới từng giây; 4 cột "giờ treo tường"
> (`bookings.booking_date/start_time/end_time`, `employees.hired_at`) giữ nguyên giá trị.

**Mục lục theo mức độ:**

| # | Lỗi | Mức | Ảnh hưởng |
|---|---|---|---|
| [1](#1) | Giờ cao điểm đọc sai khoá cấu hình | 🔴 Cao | Thu sai tiền khách mỗi ngày |
| [2](#2) | Đặt lịch so sánh giờ bằng chuỗi | 🔴 Cao | Từ chối lịch hợp lệ + ghi dữ liệu vô lý vào DB |
| [3](#3) | Còn 5 chỗ cắt ngày theo giờ máy chủ | 🟠 Trung bình | Sai ngày khi đổi server hoặc mở chi nhánh khác múi giờ |
| [4](#4) | `/reports/revenue` bỏ qua `from`/`to` | 🟠 Trung bình | Chọn khoảng ngày không có tác dụng |
| [5](#5) | Báo cáo sai ngày ở vùng có DST | 🟠 Trung bình | Chưa lộ ở VN, sai ngay khi mở chi nhánh Mỹ/Âu |
| [6](#6) | `compareBranches` gộp theo một múi giờ | 🟡 Thấp | Báo cáo so sánh chi nhánh ra số sai |
| [7](#7) | Thanh toán đồng thời trả HTTP 500 | 🟡 Thấp | Tiền vẫn đúng, nhưng lộ thông báo nội bộ |
| [8](#8) | Mã giảm giá "đến hết hôm nay" chết từ 7h sáng | 🟡 Thấp | Khó hiểu cho admin |

---

<a id="1"></a>
## 1. 🔴 Giờ cao điểm đọc sai khoá cấu hình — khách bị tính thừa 1 tiếng mỗi ngày

**Hiện tượng.** Cấu hình trong DB ghi khung cao điểm kết thúc lúc **21:00**, nhưng hệ thống
vẫn tính giá cao điểm tới **22:00**. Mọi phiên chơi trong khoảng 21:00–22:00 bị tính giá
cao điểm thay vì thấp điểm — với sân thường là 90.000đ/h thay vì 60.000đ/h.

**Bằng chứng đo được.**
```
DB (bảng settings):  operating_hours = {"peak_start":"17:00","peak_end":"21:00"}
getPeakHours() trả:  { peakStartHour: 17, peakEndHour: 22 }   ← không khớp
```

**Nguyên nhân.** `backend/src/services/SettingService.js:28-36` đọc khoá `pricing`:
```js
const pricing = await SettingService.getSettingByKey('pricing');
const peakStartHour = Number(pricing?.peakStartHour);
const peakEndHour = Number(pricing?.peakEndHour);
return {
  peakStartHour: Number.isFinite(peakStartHour) ? peakStartHour : 17,
  peakEndHour: Number.isFinite(peakEndHour) ? peakEndHour : 22   // ← luôn rơi vào đây
};
```
Nhưng seeder (`20260723000001-seed-initial-data.js`) lại ghi khung giờ vào khoá
`operating_hours` với tên trường khác (`peak_start`/`peak_end`, snake_case). Khoá `pricing`
**không tồn tại** trên bản cài mới, nên `pricing` = `undefined`, hai `Number(undefined)`
ra `NaN`, và hàm âm thầm rơi về mặc định cứng 17–22.

Đây là lỗi "hai nguồn sự thật": `PUT /settings/pricing` (`settingController.js:25`) ghi vào
khoá `pricing`, còn seeder và màn hình Giờ mở cửa dùng `operating_hours`. Ai chưa từng bấm
lưu ở màn hình giá thì cấu hình khung giờ của họ không bao giờ được đọc.

**Cách khắc phục.** Đọc từ cả hai nguồn, ưu tiên khoá `pricing` (nơi màn hình giá ghi vào),
lùi về `operating_hours` (nơi seeder và màn hình giờ mở cửa ghi), rồi mới tới mặc định cứng:

```js
static async getPeakHours() {
  const pricing = await SettingService.getSettingByKey('pricing');
  const hours = await SettingService.getSettingByKey('operating_hours');
  // "17:00" -> 17
  const hourOf = (v) => (typeof v === 'string' ? Number(v.slice(0, 2)) : Number(v));

  const start = [pricing?.peakStartHour, hours?.peak_start].map(hourOf).find(Number.isFinite);
  const end   = [pricing?.peakEndHour,   hours?.peak_end  ].map(hourOf).find(Number.isFinite);
  return {
    peakStartHour: Number.isFinite(start) ? start : 17,
    peakEndHour:   Number.isFinite(end)   ? end   : 22
  };
}
```

Về lâu dài nên gom một nguồn duy nhất cho khung giờ cao điểm và bỏ nguồn còn lại, vì hai
màn hình cùng sửa một khái niệm là mầm mống lệch dữ liệu.

**Cách kiểm chứng sau khi sửa.** Đặt `operating_hours.peak_end = 21:00`, mở một phiên chơi
21:00–22:00 giờ VN rồi đóng — `court_fee` phải bằng đơn giá **thấp điểm**. Đổi cấu hình
sang 22:00 thì cùng phiên đó ra giá cao điểm.

---

<a id="2"></a>
## 2. 🔴 Đặt lịch so sánh giờ bằng chuỗi — vừa từ chối oan, vừa cho ghi dữ liệu vô lý

**Hiện tượng.** Hai lỗi ngược nhau cùng một gốc:

| Yêu cầu | Kết quả thật | Đáng lẽ |
|---|---|---|
| Đặt `9:00 → 10:00` | **HTTP 400** "Giờ kết thúc phải sau giờ bắt đầu" | 201, hợp lệ |
| Đặt `10:00 → 9:00` | **HTTP 201**, lưu vào DB | 400, vô lý |

Booking ngược (`end_time` < `start_time`) còn **lọt qua cả kiểm tra trùng lịch**, nên sân
có thể bị đặt chồng mà hệ thống không phát hiện.

**Nguyên nhân.** `backend/src/services/BookingService.js:118` (và `:226` trong `updateBooking`)
so sánh trực tiếp hai chuỗi:
```js
if (data.startTime >= data.endTime) { ... }
```
JavaScript so chuỗi theo thứ tự từ điển, ký tự một. Với `"9:00"` và `"10:00"`: ký tự đầu
`'9'` (mã 57) lớn hơn `'1'` (mã 49) → `"9:00" >= "10:00"` là **true** → lịch hợp lệ bị chặn.
Ngược lại `"10:00" >= "9:00"` là **false** → lịch ngược lọt qua.

Lỗi chỉ xảy ra khi giờ có **một chữ số**, và điều đó được cho phép ở tầng validation:
`backend/src/validations/bookingValidation.js:19-20` dùng regex `^([0-1]?[0-9]|2[0-3]):...`
— dấu `?` khiến `9:00` là đầu vào hợp lệ. Nếu regex bắt buộc hai chữ số thì so chuỗi
`"09:00" < "10:00"` sẽ tình cờ đúng.

**Cách khắc phục.** Chuẩn hoá về phút rồi so bằng số — không phụ thuộc cách người dùng gõ:

```js
/** "9:00" | "09:00:00" -> số phút từ 00:00 */
const toMinutes = (t) => {
  const [h, m] = String(t).split(':');
  return Number(h) * 60 + Number(m);
};

if (toMinutes(data.startTime) >= toMinutes(data.endTime)) {
  const error = new Error('Giờ kết thúc phải sau giờ bắt đầu');
  error.statusCode = 400;
  throw error;
}
```

Sửa ở **cả hai** chỗ (`createBooking` và `updateBooking`). Nên đặt `toMinutes` vào
`utils/dateTime.js` để dùng chung, và bổ sung unit test cho đúng các ca biên: `9:00→10:00`,
`10:00→9:00`, `09:00→09:00`, `23:00→23:59`.

**Lưu ý dữ liệu cũ.** Nên rà DB xem đã có booking ngược nào lọt vào chưa:
```sql
SELECT id, booking_date, start_time, end_time FROM bookings WHERE end_time <= start_time;
```

---

<a id="3"></a>
## 3. 🟠 Còn 5 chỗ cắt ngày theo giờ máy chủ thay vì giờ chi nhánh

**Hiện tượng.** Hiện tại **kết quả vẫn đúng**, nhưng chỉ vì server tình cờ chạy cùng múi giờ
với chi nhánh (`Asia/Ho_Chi_Minh`). Đổi server sang UTC là biên ngày lệch 7 tiếng; mở chi
nhánh khác múi giờ là sai ngay lập tức. Đây chính là loại phụ thuộc mà đợt chuẩn hoá múi
giờ đặt mục tiêu xoá bỏ — 5 chỗ này bị bỏ sót.

**Bằng chứng đo được.** Cùng tham số `date=2026-08-21` cho `SessionService.getSessionHistory`:

| TZ tiến trình | Cửa sổ truy vấn sinh ra |
|---|---|
| `Asia/Ho_Chi_Minh` | `2026-08-20T17:00Z … 2026-08-21T16:59:59Z` ✅ đúng |
| `UTC` | `2026-08-21T00:00Z … 2026-08-21T23:59:59Z` ❌ lệch 7h |
| `America/New_York` | `2026-08-21T04:00Z … 2026-08-22T03:59:59Z` ❌ lệch 11h |

**Nguyên nhân.** Năm chỗ dựng mốc bằng chuỗi ISO **không kèm offset**:

| Tệp | Dòng |
|---|---|
| `backend/src/services/SessionService.js` | 24, 25 |
| `backend/src/services/ReportService.js` | 40 |
| `backend/src/services/SalesOrderService.js` | 37 |
| `backend/src/services/InventoryService.js` | 166 |

```js
const dayStart = new Date(`${date}T00:00:00`);   // ← không có 'Z' hay '+07:00'
```
Theo chuẩn ECMAScript, chuỗi ngày-giờ **không có offset** được hiểu theo **múi giờ địa
phương của tiến trình**. Vì vậy cùng một tham số cho ra mốc UTC khác nhau tuỳ máy chủ.

**Cách khắc phục.** Dự án đã có sẵn công cụ đúng trong `backend/src/utils/dateTime.js` —
`startOfLocalDay(date, timezone)` và `endOfLocalDay(date, timezone)` (dùng `Intl`, xử lý
đúng cả DST). Thay thế:

```js
const { startOfLocalDay, endOfLocalDay } = require('../utils/dateTime');

const branch = await Branch.findByPk(branchId, { attributes: ['timezone'] });
const dayStart = startOfLocalDay(new Date(`${date}T12:00:00Z`), branch?.timezone);
const dayEnd   = endOfLocalDay(new Date(`${date}T12:00:00Z`), branch?.timezone);
```

> Dùng mốc **12:00Z** làm điểm neo thay vì `00:00Z`: giữa trưa UTC thì mọi múi giờ trên thế
> giới đều đang cùng ngày lịch đó, nên `startOfLocalDay` chắc chắn cắt đúng ngày người dùng
> yêu cầu. Neo vào nửa đêm UTC sẽ rơi sang ngày khác ở các múi giờ âm.

Lưu ý khi lấy `branch.timezone`: **đừng gộp `Branch` vào include của một truy vấn có
`lock: transaction.LOCK.UPDATE`** — làm vậy sẽ khoá luôn dòng chi nhánh, biến mỗi thao tác
thành điểm nghẽn cho toàn chi nhánh. Đọc riêng bằng `Branch.findByPk(...)` như
`CourtService.closeCourt` và `PaymentService.checkout` đang làm.

**Cách kiểm chứng.** Chạy cùng một truy vấn với `TZ=UTC`, `TZ=Asia/Ho_Chi_Minh`,
`TZ=America/New_York` — kết quả phải **giống hệt nhau**.

---

<a id="4"></a>
## 4. 🟠 `/reports/revenue` bỏ qua hoàn toàn `from` và `to`

**Hiện tượng.** `GET /reports/revenue?period=daily&from=2026-08-19&to=2026-08-19` trả về
**y hệt** kết quả khi không truyền tham số — đủ 10 bucket từ 2026-08-22 ngược về 2026-01-01.
Người dùng chọn khoảng ngày trên giao diện nhưng số liệu không đổi.

**Nguyên nhân.** `backend/src/controllers/reportController.js:28-36` không truyền tham số
xuống service:
```js
const revenue = await ReportService.getRevenueReport(period, req.branchId);
```
Trong khi service đã sẵn sàng nhận (`ReportService.js:101`):
```js
static async getRevenueReport(period = 'daily', branchId, { from = null, to = null } = {}) {
```
Phần lọc `buildDateRange('paidAt', from, to)` bên trong hoạt động bình thường — chỉ là không
bao giờ nhận được giá trị. Các endpoint khác (`/reports/revenue-breakdown`,
`/reports/export-*`) truyền đủ nên lọc đúng.

**Cách khắc phục.** Một dòng:
```js
const { period = 'daily', from = null, to = null } = req.query;
const revenue = await ReportService.getRevenueReport(period, req.branchId, { from, to });
```

**Ghi chú thêm.** API dùng tên tham số `period=daily|monthly|yearly`. Nếu giao diện đang gửi
`groupBy=day` thì tham số đó bị bỏ qua âm thầm và rơi về `daily` (vẫn trả 200, không báo
lỗi) — nên rà lại phía frontend cho khớp tên, hoặc chấp nhận cả hai tên ở controller.

---

<a id="5"></a>
## 5. 🟠 Báo cáo sai ngày với chi nhánh ở vùng có giờ mùa hè (DST)

**Hiện tượng.** Chưa lộ ở Việt Nam (VN không có DST, cố định UTC+7). Sẽ sai ngay khi mở chi
nhánh ở Mỹ/Âu: doanh thu của các giao dịch sát nửa đêm bị đẩy sai ngày trong suốt nửa năm
"trái mùa".

**Bằng chứng đo được.** Đặt chi nhánh 2 sang `America/New_York`, một payment có
`paid_at = 2026-01-15 04:30:00 UTC` (tức **14/01 23:30 giờ New York**, vì tháng 1 là EST =
UTC−5). Báo cáo trả bucket `2026-01-15`, **không có** bucket `2026-01-14` — lệch nguyên một
ngày.

**Nguyên nhân.** `backend/src/services/ReportService.js:19-23`:
```js
const localDateFormatExpr = (column, groupByFormat, timezone = DEFAULT_TIMEZONE) => {
  const offsetMinutes = getUtcOffsetMinutes(new Date(), timezone);   // ← new Date() = BÂY GIỜ
  const shifted = sequelize.fn('DATE_ADD', column, sequelize.literal(`INTERVAL ${offsetMinutes} MINUTE`));
  return sequelize.fn('DATE_FORMAT', shifted, groupByFormat);
};
```
Offset được tính **một lần tại thời điểm chạy báo cáo** rồi áp cho **mọi dòng dữ liệu ở mọi
thời điểm trong quá khứ**. Chạy báo cáo vào tháng 8 (EDT, UTC−4) sẽ lấy offset −240 phút rồi
áp cả cho dữ liệu tháng 1 (EST, UTC−5) — sai 60 phút, đủ để đẩy sai ngày các giao dịch trong
khung 23:00–24:00 giờ địa phương.

Dashboard **không** dính lỗi này vì dùng `startOfLocalDay`/`endOfLocalDay` (qua `Intl`, đúng DST).

**Cách khắc phục — ba hướng, chọn theo nhu cầu.**

**(a) Dùng `CONVERT_TZ` với tên múi giờ** — chuẩn nhất, nhưng đòi hạ tầng:
```sql
DATE_FORMAT(CONVERT_TZ(paid_at, '+00:00', 'America/New_York'), '%Y-%m-%d')
```
Yêu cầu nạp sẵn bảng múi giờ vào MySQL, mà môi trường hiện tại **chưa có** (đã kiểm:
`SELECT COUNT(*) FROM mysql.time_zone_name` = 0, và `CONVERT_TZ(...,'America/New_York')`
trả `NULL`). Nạp bằng:
```bash
mysql_tzinfo_to_sql /usr/share/zoneinfo | mysql -u root mysql
```
Phải kiểm `CONVERT_TZ` khác `NULL` trước khi dùng, vì MySQL trả `NULL` thay vì báo lỗi khi
thiếu bảng — dùng mù sẽ ra báo cáo rỗng mà không ai biết vì sao.

**(b) Gộp theo khoảng đã tính sẵn ở tầng ứng dụng** — không cần hạ tầng gì thêm: dùng
`startOfLocalDay`/`endOfLocalDay` (đúng DST) để dựng danh sách mốc đầu/cuối từng kỳ trong
khoảng báo cáo, rồi `GROUP BY` theo `CASE` các khoảng đó. Chính xác tuyệt đối, đổi lại câu
SQL dài hơn và chi phí tăng theo số kỳ.

**(c) Giữ nguyên, ghi rõ giới hạn** — chấp nhận được **chừng nào mọi chi nhánh còn ở vùng
không có DST** (Việt Nam, phần lớn Đông Nam Á). Nếu chọn hướng này thì phải chặn ở tầng dữ
liệu: chỉ cho `branches.timezone` nhận các múi giờ không DST, và ghi cảnh báo ngay tại
`localDateFormatExpr`.

**Khuyến nghị:** làm (c) ngay bây giờ (rẻ, an toàn, đúng với thực tế hiện tại), và chuyển
sang (a) khi thật sự mở chi nhánh ở vùng có DST.

---

<a id="6"></a>
## 6. 🟡 `compareBranches` gộp mọi chi nhánh theo một múi giờ mặc định

**Hiện tượng.** Báo cáo so sánh nhiều chi nhánh cắt ngày cho **tất cả** chi nhánh theo giờ
Việt Nam, kể cả chi nhánh ở múi giờ khác.

**Bằng chứng đo được.** Đặt chi nhánh 2 sang `America/New_York`, dòng doanh thu sân:
```
API trả về      : { 2026-08-19: 1.200.000 }
Đúng theo giờ NY: { 2026-08-18:   500.000, 2026-08-19: 700.000 }
Theo giờ VN     : { 2026-08-19: 1.200.000 }   ← khớp cái API trả ⇒ đang cắt theo giờ VN
```

**Nguyên nhân.** `backend/src/services/ReportService.js:242`:
```js
const branch = compareBranches ? null : await Branch.findByPk(branchId);
const bucketExpr = localDateFormatExpr(..., branch?.timezone);   // undefined -> DEFAULT_TIMEZONE
```
Ở chế độ so sánh, code cố ý bỏ qua chi nhánh vì cả nhóm được gộp trong **một** câu truy vấn,
mà biểu thức dịch múi giờ lại là hằng số. Hạn chế này đã được ghi chú trong code, nhưng hệ
quả là báo cáo so sánh ra **số sai** đúng vào lúc người ta cần nó nhất — khi chuỗi có nhiều
múi giờ.

**Cách khắc phục.** Thay hằng số bằng biểu thức tra offset theo từng dòng — nối
`branches` vào truy vấn và dịch theo cột thay vì theo hằng:
```sql
DATE_FORMAT(DATE_ADD(InvoiceLine.created_at, INTERVAL br.utc_offset_minutes MINUTE), :fmt)
```
Cần một nguồn offset theo chi nhánh: hoặc thêm cột `branches.utc_offset_minutes` (đơn giản,
nhưng lại vướng đúng vấn đề DST ở mục 5), hoặc dùng `CONVERT_TZ(..., br.timezone)` sau khi
đã nạp bảng múi giờ. Nói cách khác, **mục 5 và mục 6 nên sửa cùng nhau bằng một hướng
thống nhất**.

Nếu chưa sửa ngay: chặn `compareBranches` khi phát hiện các chi nhánh không cùng múi giờ, và
trả thông báo rõ ràng thay vì âm thầm đưa ra số sai.

---

<a id="7"></a>
## 7. 🟡 Thanh toán đồng thời trả HTTP 500 kèm thông báo nội bộ

**Hiện tượng.** Hai request `POST /sales-orders/:id/checkout` chạy song song trên **cùng một
đơn**: một request trả 201, request kia trả **HTTP 500** với
`"Transaction cannot be rolled back because it has been finished with state: rollback"`.
Tái hiện 3/3 lần.

**Tiền vẫn đúng** — kiểm DB chỉ có **1 payment**, **1 invoice**, không thu trùng. Vấn đề là
mã lỗi sai (500 thay vì 409) và thông báo lộ chi tiết nội bộ ra client.

**Nguyên nhân.** Hai tầng chồng lên nhau:

*Tầng 1 — deadlock do đảo thứ tự khoá.* Xác nhận bằng `SHOW ENGINE INNODB STATUS`. Trong
`backend/src/services/SalesOrderService.js`, `checkout` khoá **`payments` trước** (gap lock
trên `uk_payments_idempotency_key` từ `Payment.findOne({ lock: UPDATE })`), rồi mới khoá
`sales_orders`. Luồng còn lại đang giữ `sales_orders` và đi chèn `payments`. Hai luồng chờ
chéo nhau, MySQL giết một transaction.

*Tầng 2 — lỗi thứ hai che mất lỗi gốc.* Khi MySQL huỷ transaction, Sequelize đã tự đánh dấu
nó kết thúc. Khối `catch` sau đó gọi `await transaction.rollback()` trên một transaction đã
chết, ném ra lỗi mới — và chính lỗi này lọt ra client, che mất nguyên nhân thật. Cùng khuôn
`catch { await transaction.rollback() }` lặp lại ở `SalesOrderService.js` dòng 139, 184, 255,
449 và ở `OnlineOrderService.placeOrder`/`cancelOrder`.

**Cách khắc phục — hai phần.**

*Phần 1: rollback an toàn.* Chỉ rollback khi transaction chưa kết thúc, và **không** để lỗi
rollback che lỗi gốc:
```js
} catch (error) {
  if (!transaction.finished) {
    await transaction.rollback().catch(() => { /* nuốt, giữ lỗi gốc */ });
  }
  throw error;
}
```

*Phần 2: thống nhất thứ tự khoá.* Luôn khoá `sales_orders` **trước**, `payments` sau, ở mọi
hàm đụng cả hai bảng. Deadlock xảy ra khi hai luồng khoá cùng bộ tài nguyên theo thứ tự khác
nhau; ép chung một thứ tự là loại bỏ tận gốc. Riêng với đơn trùng, sau khi khoá
`sales_orders` mà thấy đã có payment thì trả **409** "Đơn hàng này đã có yêu cầu thanh toán"
— đúng ngữ nghĩa hơn 500.

**Cách kiểm chứng.** Bắn 3 cặp request checkout song song trên cùng một đơn: phải luôn có
đúng 1 payment, và request thua phải nhận 409 chứ không phải 500.

---

<a id="8"></a>
## 8. 🟡 Mã giảm giá chọn "áp dụng đến hết hôm nay" lại chết từ 7 giờ sáng

**Hiện tượng.** Admin tạo mã với ngày kết thúc là hôm nay, nhưng mã đã hết hiệu lực từ
**07:00 sáng** cùng ngày. Kiểm chứng: mã `endsAt = '2026-08-21'` bị từ chối "Mã giảm giá đã
hết hạn" khi áp lúc 12:39 giờ VN.

**Nguyên nhân.** `frontend/src/pages/Retail/VoucherTab.jsx` dùng `<input type="date">`, gửi
lên chuỗi ngày trơn `"2026-08-21"`. Theo chuẩn ECMAScript, chuỗi **chỉ có ngày** được hiểu
là nửa đêm **UTC** (khác với chuỗi có cả giờ, vốn hiểu theo giờ địa phương). Nửa đêm UTC =
**07:00 sáng giờ Việt Nam**.

Đây **không phải hồi quy** của đợt đổi múi giờ — trước đó mốc tuyệt đối cũng y hệt. Nhưng
giờ giao diện hiển thị theo giờ chi nhánh nên độ lệch lộ rõ ra cho người dùng.

**Cách khắc phục.** Diễn giải ngày người dùng chọn theo **giờ chi nhánh**, và hiểu đúng ý
định "đến hết ngày" là tới **23:59:59 giờ chi nhánh**:

```js
// frontend: gửi lên mốc tuyệt đối thay vì chuỗi ngày trơn
import { startOfLocalDay, endOfLocalDay } from '../../utils/datetime';
startsAt: form.startsAt ? startOfLocalDay(form.startsAt, activeTimezone).toISOString() : null,
endsAt:   form.endsAt   ? endOfLocalDay(form.endsAt,   activeTimezone).toISOString() : null,
```
(hai hàm này hiện chỉ có ở backend `utils/dateTime.js` — cần thêm bản tương ứng cho frontend,
hoặc để backend tự diễn giải khi nhận vào chuỗi chỉ-ngày.)

Cách khác gọn hơn: **để backend chịu trách nhiệm** — trong `VoucherService.create/update`,
nếu `startsAt`/`endsAt` là chuỗi dạng `YYYY-MM-DD` thì tự quy về đầu/cuối ngày theo
`DEFAULT_TIMEZONE`. Ưu điểm là mọi client (web, app, gọi API trực tiếp) đều nhất quán.

**Cách kiểm chứng.** Tạo mã kết thúc hôm nay, áp lúc 22:00 giờ VN — phải vẫn dùng được;
sang 00:01 hôm sau thì hết hạn.

---

## Thứ tự đề xuất xử lý

1. **Mục 1 và 2** — sửa ngay. Một cái thu sai tiền khách hàng ngày, một cái cho ghi dữ liệu
   vô lý vào DB và bỏ lọt trùng lịch. Cả hai đều sửa nhỏ, rủi ro thấp, dễ kiểm chứng.
2. **Mục 3 và 4** — sửa trong cùng đợt. Mục 3 là phần sót của chính đợt chuẩn hoá múi giờ;
   mục 4 là một dòng.
3. **Mục 7** — sửa khi có thời gian. Tiền không sai, chỉ sai mã lỗi và lộ thông báo nội bộ.
4. **Mục 5 và 6** — quyết định hướng chung (nạp bảng múi giờ MySQL hay gộp ở tầng ứng dụng)
   rồi sửa cùng nhau. Chưa cấp bách chừng nào mọi chi nhánh còn ở Việt Nam.
5. **Mục 8** — sửa kèm khi đụng tới màn hình mã giảm giá.
