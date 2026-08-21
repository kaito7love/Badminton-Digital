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

> ## ✅ Cập nhật 21/08/2026 (tối) — cả 8 mục đã được vá
>
> Toàn bộ 8 lỗi dưới đây đã sửa và kiểm chứng lại trên **DB chính (dữ liệu thật)**, không
> phải DB seed — dựng lại đúng ca lỗi đã ghi trong từng mục, xác nhận chuyển sang kết quả
> đúng, rồi dọn sạch dữ liệu test. `npm test` → **121/121 PASS** sau mỗi đợt sửa. Chi tiết
> "đã vá bằng" và bằng chứng kiểm chứng nằm ngay cuối mỗi mục bên dưới. Nhân dịp sửa mục 4,
> đã bổ sung thêm lựa chọn xem báo cáo theo **Quý** (ngoài Ngày/Tháng/Năm sẵn có) theo yêu
> cầu — xem ghi chú trong mục 4.

**Mục lục theo mức độ:**

| # | Lỗi | Mức | Ảnh hưởng | Trạng thái |
|---|---|---|---|---|
| [1](#1) | Giờ cao điểm đọc sai khoá cấu hình | 🔴 Cao | Thu sai tiền khách mỗi ngày | ✅ Đã vá |
| [2](#2) | Đặt lịch so sánh giờ bằng chuỗi | 🔴 Cao | Từ chối lịch hợp lệ + ghi dữ liệu vô lý vào DB | ✅ Đã vá |
| [3](#3) | Còn 4 tệp/8 dòng cắt ngày theo giờ máy chủ | 🟠 Trung bình | Sai ngày khi đổi server hoặc mở chi nhánh khác múi giờ | ✅ Đã vá |
| [4](#4) | `/reports/revenue` bỏ qua `from`/`to` | 🟠 Trung bình | Chọn khoảng ngày không có tác dụng | ✅ Đã vá |
| [5](#5) | Báo cáo sai ngày ở vùng có DST | 🟠 Trung bình | Chưa lộ ở VN, sai ngay khi mở chi nhánh Mỹ/Âu | ✅ Đã vá (hướng c) |
| [6](#6) | `compareBranches` gộp theo một múi giờ | 🟡 Thấp | Báo cáo so sánh chi nhánh ra số sai | ✅ Đã vá |
| [7](#7) | Thanh toán đồng thời trả HTTP 500 | 🟡 Thấp | Tiền vẫn đúng, nhưng lộ thông báo nội bộ | ✅ Đã vá |
| [8](#8) | Mã giảm giá "đến hết hôm nay" chết từ 7h sáng | 🟡 Thấp | Khó hiểu cho admin | ✅ Đã vá |

---

<a id="1"></a>
## 1. 🔴 Giờ cao điểm đọc sai khoá cấu hình — khách bị tính thừa mỗi ngày

**Hiện tượng.** Cấu hình cao điểm admin đã lưu ghi khung kết thúc lúc **21:00**, nhưng hệ
thống vẫn tính giá cao điểm tới **22:00**. Mọi phiên chơi trong khoảng 21:00–22:00 bị tính
giá cao điểm thay vì thấp điểm.

**Bằng chứng đo được — trên cả DB seed sạch lẫn DB chính (dữ liệu thật).** Kết quả giống
nhau về bản chất nhưng qua **hai cơ chế lệch khác nhau**, vì hai DB có dữ liệu `settings`
khác nhau:

```
# DB seed sạch (npm run seed)
operating_hours = {"peak_start":"17:00","peak_end":"21:00"}
pricing         = (không tồn tại — key chưa bao giờ được ghi)
getPeakHours() trả: { peakStartHour: 17, peakEndHour: 22 }        ← rơi về mặc định cứng

# DB chính — dữ liệu admin đã từng lưu thật
operating_hours = {"openTime":"06:00","closeTime":"23:00"}        ← không có field peak nào
pricing         = {"peakStartTime":"17:00","peakEndTime":"21:00",
                    "peakPricePerHour":130000,"offpeakPricePerHour":85000}
getPeakHours() trả: { peakStartHour: 17, peakEndHour: 22 }        ← cũng rơi về mặc định cứng,
                                                                      dù key "pricing" CÓ tồn tại

Phiên 21:00–22:00 giờ VN trên DB chính, giá thật 130.000đ/85.000đ:
  hệ thống tính  : 130.000đ  (giá cao điểm — sai)
  đúng cấu hình  : 85.000đ   (giá thấp điểm)
  → thu thừa 45.000đ mỗi phiên 21–22h
```

**Nguyên nhân — không phải "hai nguồn", mà là bốn cách đặt tên field khác nhau cho cùng
một khái niệm, không nguồn nào khớp nguồn nào.**

`backend/src/services/SettingService.js:28-36` (`getPeakHours()`) đọc khoá `pricing`, field
`peakStartHour`/`peakEndHour`:
```js
const pricing = await SettingService.getSettingByKey('pricing');
const peakStartHour = Number(pricing?.peakStartHour);
const peakEndHour = Number(pricing?.peakEndHour);
return {
  peakStartHour: Number.isFinite(peakStartHour) ? peakStartHour : 17,
  peakEndHour: Number.isFinite(peakEndHour) ? peakEndHour : 22   // ← luôn rơi vào đây
};
```

Đối chiếu 4 nguồn cùng nói về "giờ cao điểm":

| Nguồn | Field đặt giờ bắt đầu/kết thúc cao điểm |
|---|---|
| Đặc tả [`WF-08-ReportsSettings.md`](../../04-workflows/flows/WF-08-ReportsSettings.md) (UC-21, mục E) | `peakStartHour` / `peakEndHour` |
| `SettingService.getPeakHours()` — code đang chạy | đọc `peakStartHour` / `peakEndHour` — khớp đặc tả |
| Seeder `20260723000001-seed-initial-data.js` (cài mới) | `operating_hours.peak_start` / `peak_end` (snake_case) |
| **Dữ liệu thật trên DB chính** | `pricing.peakStartTime` / `peakEndTime` — khớp **không nguồn nào** ở trên |

Seeder tự chế ra một quy ước riêng (`operating_hours.peak_start`/`peak_end`) không khớp đặc
tả. Còn dữ liệu thật trên DB chính lại tự chế ra một quy ước khác nữa
(`pricing.peakStartTime`/`peakEndTime`) — cũng không khớp đặc tả, không khớp cả seeder.
`operating_hours` trên DB chính hoàn toàn không có field peak nào (`openTime`/`closeTime`
theo đúng đặc tả mục F) — nên dù seeder có ghi đúng snake_case đi nữa thì DB chính vẫn
không đọc được, vì admin thật chưa từng đụng tới đường ghi đó.

**Không có màn hình nào cho admin sửa đúng.**
`frontend/src/pages/Settings/SettingsPage.jsx:49-55` chỉ **hiển thị**
`pricing.peakPricePerHour`/`offpeakPricePerHour` (khớp dữ liệu thật) — không có ô nhập nào
cho giờ bắt đầu/kết thúc cao điểm. Nút "Lưu cài đặt" (`handleSave`, dòng 31-33) chỉ
`PUT` lại nguyên giá trị vừa `GET` về, không sửa được gì. Tức là field
`peakStartTime`/`peakEndTime` trong DB chính hẳn phải được ghi tay qua gọi API trực tiếp
(Postman hoặc tương tự) lúc dựng dữ liệu demo, dùng đúng field `pricing.peakPricePerHour`
mà frontend đọc, nhưng đoán sai tên field giờ cao điểm.

**Cách khắc phục.** Đọc đủ mọi biến thể field name đã biết tồn tại trong thực tế — không chỉ
biến thể của seeder — trước khi rơi về mặc định cứng:

```js
static async getPeakHours() {
  const pricing = await SettingService.getSettingByKey('pricing');
  const hours = await SettingService.getSettingByKey('operating_hours');
  // "17:00" -> 17 ; chấp nhận cả số lẫn chuỗi "HH:mm"
  const hourOf = (v) => (typeof v === 'string' ? Number(v.slice(0, 2)) : Number(v));

  const start = [pricing?.peakStartHour, pricing?.peakStartTime, hours?.peak_start]
    .map(hourOf).find(Number.isFinite);
  const end = [pricing?.peakEndHour, pricing?.peakEndTime, hours?.peak_end]
    .map(hourOf).find(Number.isFinite);
  return {
    peakStartHour: Number.isFinite(start) ? start : 17,
    peakEndHour:   Number.isFinite(end)   ? end   : 22
  };
}
```

Đây vẫn là bản vá tình thế — dò từng biến thể đã biết là cách chữa cháy, không phải chốt
được vấn đề gốc. **Về lâu dài phải làm hai việc:**
1. Chốt **một** field name duy nhất theo đúng đặc tả `WF-08-ReportsSettings.md` (đã là
   nguồn "chính danh" vì backend đang đọc đúng theo nó), sửa seeder cho khớp, và xoá field
   `peak_start`/`peak_end` khỏi `operating_hours` — khái niệm "giờ cao điểm" chỉ nên có một
   chỗ lưu.
2. **Làm màn hình Cài đặt có form nhập thật** cho `peakStartHour`/`peakEndHour` — hiện tại
   không ai sửa được qua giao diện, nên mọi lần cấu hình đều phải gọi API tay, và đó chính
   là lý do dữ liệu thật trên DB chính bị đặt sai tên field. Không có form đúng thì lỗi này
   sẽ tái diễn ở bất kỳ lần seed dữ liệu demo tiếp theo nào.

**Cách kiểm chứng sau khi sửa.** Test lại cả hai kiểu dữ liệu đã biết tồn tại trong thực tế:
- DB seed sạch: đặt `operating_hours.peak_end = "21:00"` (snake_case).
- DB chính (hoặc mọi nơi từng ghi tay qua API): đặt `pricing.peakEndTime = "21:00"`.

Cả hai trường hợp: mở một phiên chơi 21:00–22:00 giờ VN rồi đóng — `court_fee` phải bằng
đơn giá **thấp điểm**. Đổi cấu hình sang 22:00 thì cùng phiên đó ra giá cao điểm.

**✅ Đã vá (21/08/2026).** Áp đúng bản vá tình thế đã đề — `SettingService.getPeakHours()`
giờ dò cả 3 biến thể field name. **Chưa làm** 2 việc dài hạn đã nêu (chốt một field name
duy nhất theo đặc tả, dựng form nhập thật cho màn hình Cài đặt) — nằm ngoài phạm vi đợt vá
lần này, để theo dõi riêng. Kiểm chứng trên DB chính: `getPeakHours()` đọc đúng
`pricing.peakStartTime/peakEndTime` thật đang có (17/21), phiên 21:00–22:00 giờ VN với giá
thật 130.000đ/85.000đ tính đúng **85.000đ** (trước khi vá ra 130.000đ — đúng khoản thu thừa
45.000đ đã đo được).

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

**Bằng chứng đo được — cô lập từng ca, mỗi ca một sân trống riêng (không phải sân đã có
booking hợp lệ khác, để chắc chắn HTTP 409/201 chỉ do chính booking ngược quyết định):**

| Ca | Booking ngược đã có trên sân | Đặt tiếp | Đáng lẽ | Kết quả thật |
|---|---|---|---|
| A | `11:00 → 9:00` | `09:00 → 11:00` (trùng khít) | 409 | **201** |
| B | `11:00 → 9:00` | `10:00 → 10:30` (chồng giữa) | 409 | **201** |
| C | `11:00 → 9:00` | `08:30 → 09:30` (chồng đầu) | 409 | **201** |

Cả 3 ca đều được chấp nhận — sân bị đặt chồng thật sự, hệ thống không phát hiện ra ở bất kỳ
kiểu chồng lấp nào.

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

**Vì sao booking ngược vô hình với kiểm tra trùng lịch.** `checkAvailability`
(`BookingService.js:51-56`) tìm booking đụng độ bằng điều kiện SQL trên cột TIME thật —
không dính lỗi so chuỗi ở trên:
```js
[Op.and]: [{ startTime: { [Op.lt]: endTime } }, { endTime: { [Op.gt]: startTime } }]
```
Với booking ngược đã lưu `startTime=11:00, endTime=9:00`, điều kiện này trở thành
`11:00 < newEnd AND 9:00 > newStart` — chỉ đúng khi booking mới vừa **kết thúc sau 11:00**
**vừa bắt đầu trước 9:00** cùng lúc. Không booking chồng lấp thực tế nào (9:00-11:00,
10:00-10:30, 8:30-9:30, ...) thoả cả hai vế cùng lúc, nên booking ngược **luôn bị bỏ qua**
ở bước kiểm trùng — không phải "thỉnh thoảng lọt", mà lọt ở **mọi** ca chồng lấp.

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

**✅ Đã vá (21/08/2026).** `toMinutes` đặt vào `utils/dateTime.js` như đề xuất, áp cho cả
`createBooking` và `updateBooking`. Đã rà DB chính trước khi vá — `0` dòng `end_time <=
start_time`, không cần xử lý dữ liệu cũ. Không cần đụng `checkAvailability` — chuẩn hoá
input đã chặn từ gốc nên không còn dòng ngược nào được ghi vào DB nữa. Kiểm chứng lại đúng
3 ca A/B/C ở bảng bằng chứng trên: cả 3 giờ đều bị chặn từ bước tạo (400), không booking
ngược nào lọt vào DB để có thể "vô hình" với kiểm tra trùng lịch nữa.

---

<a id="3"></a>
## 3. 🟠 Còn 4 tệp / 8 dòng cắt ngày theo giờ máy chủ thay vì giờ chi nhánh

**Hiện tượng.** Hiện tại **kết quả vẫn đúng**, nhưng chỉ vì server tình cờ chạy cùng múi giờ
với chi nhánh (`Asia/Ho_Chi_Minh`). Đổi server sang UTC là biên ngày lệch 7 tiếng; mở chi
nhánh khác múi giờ là sai ngay lập tức. Đây chính là loại phụ thuộc mà đợt chuẩn hoá múi
giờ đặt mục tiêu xoá bỏ — những chỗ này bị bỏ sót.

**Bằng chứng đo được.** Cùng tham số `date=2026-08-21` cho `SessionService.getSessionHistory`:

| TZ tiến trình | Cửa sổ truy vấn sinh ra |
|---|---|
| `Asia/Ho_Chi_Minh` | `2026-08-20T17:00Z … 2026-08-21T16:59:59Z` ✅ đúng |
| `UTC` | `2026-08-21T00:00Z … 2026-08-21T23:59:59Z` ❌ lệch 7h |
| `America/New_York` | `2026-08-21T04:00Z … 2026-08-22T03:59:59Z` ❌ lệch 11h |

**Nguyên nhân.** Trước đây liệt kê "5 chỗ" — kiểm lại bằng
`grep -rn "new Date(\`\${.*}T00:00:00\`)" backend/src/services/` thì đúng ra là
**4 tệp, 8 dòng**: mỗi hàm lọc khoảng ngày đều có một cặp `from`/`to`, bản liệt kê trước chỉ
ghi 1 trong 2 dòng của cặp đó ở 3 trên 4 tệp:

| Tệp | Hàm | Dòng | Kiểu lọc |
|---|---|---|---|
| `backend/src/services/SessionService.js` | `getSessionHistory` | 24, 25 | 1 ngày đúng (`date`) |
| `backend/src/services/ReportService.js` | `buildDateRange` (dùng chung cho `getRevenueReport`, `getSessionDetails`, `getRevenueBreakdown`) | 40, 41 | khoảng `from`/`to` |
| `backend/src/services/SalesOrderService.js` | `listOrders` | 37, 38 | khoảng `from`/`to` |
| `backend/src/services/InventoryService.js` | `listMovements` | 166, 167 | khoảng `from`/`to` |

```js
const dayStart = new Date(`${date}T00:00:00`);   // ← không có 'Z' hay '+07:00'
```
Theo chuẩn ECMAScript, chuỗi ngày-giờ **không có offset** được hiểu theo **múi giờ địa
phương của tiến trình**. Vì vậy cùng một tham số cho ra mốc UTC khác nhau tuỳ máy chủ.

**Cách khắc phục.** Dự án đã có sẵn công cụ đúng trong `backend/src/utils/dateTime.js` —
`startOfLocalDay(date, timezone)` và `endOfLocalDay(date, timezone)` (dùng `Intl`, xử lý
đúng cả DST). Có hai khuôn mẫu khác nhau tuỳ hàm, không copy-paste y hệt được:

**(a) Lọc đúng 1 ngày — `SessionService.getSessionHistory`:**
```js
const { startOfLocalDay, endOfLocalDay } = require('../utils/dateTime');

const branch = await Branch.findByPk(branchId, { attributes: ['timezone'] });
const dayStart = startOfLocalDay(new Date(`${date}T12:00:00Z`), branch?.timezone);
const dayEnd   = endOfLocalDay(new Date(`${date}T12:00:00Z`), branch?.timezone);
```

**(b) Lọc khoảng `from`/`to` — `ReportService.buildDateRange`, `SalesOrderService.listOrders`,
`InventoryService.listMovements`:**
```js
const buildDateRange = (column, from, to, timezone) => {
  if (!from && !to) return null;
  const range = {};
  if (from) range[Op.gte] = startOfLocalDay(new Date(`${from}T12:00:00Z`), timezone);
  if (to)   range[Op.lte] = endOfLocalDay(new Date(`${to}T12:00:00Z`), timezone);
  return { [column]: range };
};
```
`ReportService.buildDateRange` hiện không nhận tham số múi giờ — cả 3 nơi gọi nó
(`getRevenueReport:112`, `getSessionDetails:169`, `getRevenueBreakdown:237`) đều đã có sẵn
`branchId` trong scope nên chỉ cần thêm tham số và truyền `branch?.timezone` xuống. Riêng
`getRevenueBreakdown` ở chế độ `compareBranches` không có một `branchId` duy nhất — đây
chính là ca đã nêu ở [mục 6](#6), nên sửa cùng lúc với mục 6 thay vì tách riêng.

> Dùng mốc **12:00Z** làm điểm neo thay vì `00:00Z`: giữa trưa UTC thì mọi múi giờ trên thế
> giới đều đang cùng ngày lịch đó, nên `startOfLocalDay` chắc chắn cắt đúng ngày người dùng
> yêu cầu. Neo vào nửa đêm UTC sẽ rơi sang ngày khác ở các múi giờ âm.

Lưu ý khi lấy `branch.timezone`: **đừng gộp `Branch` vào include của một truy vấn có
`lock: transaction.LOCK.UPDATE`** — làm vậy sẽ khoá luôn dòng chi nhánh, biến mỗi thao tác
thành điểm nghẽn cho toàn chi nhánh. Đọc riêng bằng `Branch.findByPk(...)` như
`CourtService.closeCourt` và `PaymentService.checkout` đang làm.

**Cách kiểm chứng.** Chạy cùng một truy vấn với `TZ=UTC`, `TZ=Asia/Ho_Chi_Minh`,
`TZ=America/New_York` — kết quả phải **giống hệt nhau**, cho cả 4 tệp (kể cả 2 endpoint
`from`/`to` chưa có ca kiểm nào trong bằng chứng ban đầu: `/sales-orders?from=&to=` và
`/inventory/movements?from=&to=`).

**✅ Đã vá (21/08/2026).** Áp đúng cả 2 khuôn (a)/(b) cho cả 4 tệp/8 dòng. Kiểm trên DB
chính: lọc `/sales-orders?from=2026-08-16&to=2026-08-16` trả đúng 4 đơn (khớp SQL đối
chiếu trực tiếp `CONVERT_TZ(created_at,'+00:00','+07:00')`); `/inventory/movements` và
`/sessions/history?date=` cùng thu hẹp đúng kết quả khi lọc. `ReportService.buildDateRange`
đã nhận thêm tham số `timezone` như đề xuất.

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

**✅ Đã vá (21/08/2026).** Đúng 1 dòng như đề xuất — `reportController.getRevenue` giờ đọc
`from`/`to` từ query và truyền xuống service. Kiểm trên DB chính: `/reports/revenue` không
lọc và có lọc `from=2026-08-19&to=2026-08-19` giờ trả **kết quả khác nhau** (trước khi vá
giống hệt nhau bất kể tham số).

**Bổ sung ngoài phạm vi lỗi này (theo yêu cầu khi review):** thêm lựa chọn xem báo cáo theo
**Quý** — trước đây `period` chỉ có `daily`/`monthly`/`yearly`, không có `quarterly`.
`ReportService` thêm `localQuarterExpr` (dựng `"YYYY-Qn"` bằng `YEAR()`/`QUARTER()` vì
`DATE_FORMAT` của MySQL không có specifier quý), áp cho cả `getRevenueReport` và
`getRevenueBreakdown`. Biểu đồ Tổng quan (`OverviewTab.jsx`) trước đây gọi cứng
`period: 'daily'`, không có bộ chọn — nay có dropdown Ngày/Tháng/Quý giống
`RevenueBreakdownTab.jsx` (dropdown đó cũng được bổ sung thêm lựa chọn Quý). Kiểm chứng
trực tiếp trên trình duyệt thật: chọn "Quý" trên cả 2 tab báo cáo, số liệu gộp đúng thành
1 bucket `"2026-Q3"` khớp tổng đã biết.

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

**✅ Đã vá (21/08/2026) — chọn hướng (c).** Thêm `hasDst(timezone)` vào
`backend/src/utils/dateTime.js` (so lệch UTC tại 1/1 và 1/7 một năm cố định — khác nhau là
có DST), gọi ngay trong `shiftToLocal` (hàm dùng chung cho mọi biểu thức dịch múi giờ của
`ReportService`, kể cả `localQuarterExpr` mới thêm ở mục 4) — chi nhánh DST giờ nhận
**HTTP 422** kèm thông báo rõ ràng thay vì âm thầm ra số sai. Kiểm trên DB chính: đặt chi
nhánh 2 sang `America/New_York` (có DST) → `/reports/revenue` trả đúng 422; đổi lại
`Asia/Ho_Chi_Minh` → hoạt động bình thường trở lại. Hướng (a) vẫn chưa khả thi trên môi
trường hiện tại như đã kiểm (`mysql.time_zone_name` = 0 dòng).

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

**✅ Đã vá (21/08/2026) — hướng thứ ba, không cần cột mới lẫn `CONVERT_TZ`.** Vì mục 5 đã
chặn DST (hướng c), offset của một chi nhánh không-DST là hằng số quanh năm — không cần
thêm cột `branches.utc_offset_minutes` hay nạp bảng múi giờ MySQL. `shiftToLocalPerBranch`
(mới, `ReportService.js`) tính offset từng chi nhánh ngay trong JS (`getUtcOffsetMinutes`)
rồi nhúng thành một `CASE invoice.branch_id WHEN … THEN …` trong câu SQL — mỗi chi nhánh
dịch đúng theo múi giờ của chính nó, đồng thời áp luôn guard DST của mục 5 cho từng chi
nhánh liên quan. Kiểm trên DB chính: đặt chi nhánh 2 sang `Pacific/Kiritimati` (UTC+14,
không DST, khác hẳn giờ VN), một giao dịch neo vào 2026-08-19 20:00 UTC (=10:00 20/08 giờ
Kiritimati) — báo cáo 1-chi-nhánh và `compareBranches` giờ **cùng cho ra bucket
`2026-08-20`** (trước khi vá, `compareBranches` ra `2026-08-19` — cắt theo giờ VN).

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
`catch { await transaction.rollback() }` (không kiểm `transaction.finished` trước khi gọi)
lặp lại ở **7 chỗ**, không phải chỉ ở `placeOrder`/`cancelOrder` như bản trước liệt kê:

| Tệp | Hàm | Dòng |
|---|---|---|
| `SalesOrderService.js` | `addLine` | 139 |
| `SalesOrderService.js` | `removeLine` | 184 |
| `SalesOrderService.js` | `applyVoucher` | 255 |
| `SalesOrderService.js` | `checkout` | 449 |
| `OnlineOrderService.js` | `placeOrder` | 255 |
| `OnlineOrderService.js` | `cancelOrder` | 373 |
| `OnlineOrderService.js` | `expireStalePendingOrders` (tác vụ quét nền 30 phút) | 421 |

Chỗ thứ 7 mức độ nhẹ hơn 6 chỗ kia: `expireStalePendingOrders` chạy nền, lỗi rollback-che-lỗi-gốc
chỉ làm **log server khó đọc** (`console.error` in ra thông báo sai), không lọt ra HTTP
response nào vì không có client nào đang chờ — nhưng vẫn nên sửa cùng đợt vì cùng một khuôn
lỗi, và log sai sẽ cản việc chẩn đoán nếu tác vụ quét thật sự gặp lỗi khác.

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

**✅ Đã vá (21/08/2026).** Cả 7 vị trí đều áp khuôn rollback-an-toàn. Phần khoá thứ tự:
`checkout` giờ khoá `sales_orders` trước tiên (khớp với `addLine`/`removeLine`/`applyVoucher`
vốn đã khoá đúng thứ tự này), rồi mới kiểm hoá đơn/giao dịch đã tồn tại cho đơn đó chưa —
nếu có và cùng `idempotencyKey` thì trả lại kết quả cũ (retry an toàn), khác key thì mới
báo 409. Kiểm trên DB chính, bắn 3 cặp request checkout song song (không truyền
`Idempotency-Key`, đúng kịch bản gốc gây deadlock): **cả 3 cặp đều 201/201**, không còn
500 — cả hai request coi nhau là cùng một lần retry hợp lệ, không tạo giao dịch trùng
(luôn đúng 1 invoice/1 payment mỗi đơn). Test riêng với 2 `Idempotency-Key` khác nhau (đúng
kịch bản "2 yêu cầu thanh toán thật khác nhau") xác nhận request thua nhận đúng **409**
"Đơn hàng này đã có yêu cầu thanh toán". Không còn thông báo `Sequelize`/`Transaction` nào
lộ ra client ở cả hai kịch bản.

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
`frontend/src/utils/datetime.js` **đã tồn tại sẵn** (đang có `formatDate`/`formatDateTime`/
`todayInZone`, chính là file `VoucherTab.jsx` đang import `formatDate` từ đó) — chỉ **thiếu
đúng 2 hàm** `startOfLocalDay`/`endOfLocalDay`, hiện mới có bản backend ở `utils/dateTime.js`.
Việc cần làm là thêm 2 hàm này vào file frontend đã có sẵn, không phải dựng hạ tầng mới.
Cách khác là để backend tự diễn giải khi nhận vào chuỗi chỉ-ngày (xem đoạn dưới).

Cách khác gọn hơn: **để backend chịu trách nhiệm** — trong `VoucherService.create/update`,
nếu `startsAt`/`endsAt` là chuỗi dạng `YYYY-MM-DD` thì tự quy về đầu/cuối ngày theo
`DEFAULT_TIMEZONE`. Ưu điểm là mọi client (web, app, gọi API trực tiếp) đều nhất quán.

**Cách kiểm chứng.** Tạo mã kết thúc hôm nay, áp lúc 22:00 giờ VN — phải vẫn dùng được;
sang 00:01 hôm sau thì hết hạn.

**✅ Đã vá (21/08/2026) — chọn hướng "để backend chịu trách nhiệm".** Không đụng frontend
(bỏ qua phương án thêm `startOfLocalDay`/`endOfLocalDay` vào `frontend/src/utils/datetime.js`)
— `VoucherService.create`/`update` giờ tự nhận diện chuỗi thuần `YYYY-MM-DD` và quy đổi
bằng `startOfLocalDay`/`endOfLocalDay` (đầu ngày cho `startsAt`, hết ngày `23:59:59.999`
cho `endsAt`) theo `DEFAULT_TIMEZONE`, trước khi lưu. Ưu điểm đúng như đã nêu: mọi client
(web, gọi API trực tiếp) đều nhất quán. Kiểm trên DB chính: tạo mã `endsAt="2026-08-21"` —
DB lưu `ends_at = 2026-08-21T16:59:59Z` (= 23:59:59 giờ VN, đúng ý "đến hết hôm nay"), mã
còn dùng được lúc 23:21 giờ VN; ca biên "mã hết hạn hôm qua" vẫn bị từ chối đúng (400).

---

## Thứ tự đề xuất xử lý — đã hoàn tất 21/08/2026

Thứ tự dưới đây là kế hoạch gốc, giữ nguyên để đối chiếu — thực tế đã gộp **cả 5 đợt vào
một lần sửa** thay vì trải nhiều đợt như đề xuất, vì tổng khối lượng vẫn kiểm chứng nổi
trong một phiên (mỗi đợt verify riêng trên DB chính trước khi sang đợt kế). Toàn bộ 8 mục
nay đã ✅ — xem ghi chú "Đã vá" cuối mỗi mục ở trên cho chi tiết & bằng chứng kiểm chứng.

1. ~~**Mục 1 và 2** — sửa ngay.~~ ✅
2. ~~**Mục 3 và 4** — sửa trong cùng đợt.~~ ✅ (mục 4 nhân tiện bổ sung thêm lựa chọn Quý)
3. ~~**Mục 7** — sửa khi có thời gian.~~ ✅
4. ~~**Mục 5 và 6** — quyết định hướng chung rồi sửa cùng nhau.~~ ✅ (chọn hướng (c) cho mục 5)
5. ~~**Mục 8** — sửa kèm khi đụng tới màn hình mã giảm giá.~~ ✅
