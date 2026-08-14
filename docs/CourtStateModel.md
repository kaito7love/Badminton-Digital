# Mô hình trạng thái sân — bốn quyết định đã chốt

Tài liệu này chốt cách hệ thống biểu diễn trạng thái sân. Mọi tính năng mới đụng
tới sân, phiên chơi, đặt lịch hay realtime đều phải theo đây.

Lý do phải viết ra: bốn nhóm lỗi dưới đây đều bắt nguồn từ cùng một sai lầm mô
hình hóa — nhét hai khái niệm độc lập vào một cột, hoặc để một dữ kiện tồn tại ở
hai nơi.

> "UI báo sân trống nhưng database vẫn có session" · "sân bảo trì vẫn booking
> được" · "hai nhân viên mở cùng một sân" · "booking và court realtime hiển thị
> khác nhau"

---

## 1. `lifecycle_status` và `operational_status` là hai thứ khác nhau

| | `lifecycle_status` | `operational_status` |
|---|---|---|
| Bản chất | Sự thật do **con người** đặt ra | **Hàm** do hệ thống tính |
| Lưu ở đâu | Cột `courts.status` | **Không lưu ở đâu cả** |
| Tham số thời gian | Không có | **Bắt buộc có `T`** |
| Ai đổi | Hành động quản trị, rất hiếm | Không ai — nó là hệ quả |
| Giá trị | `active` · `maintenance` · `inactive` | `INACTIVE` · `MAINTENANCE` · `OCCUPIED` · `RESERVED` · `FREE` |

```
operational_status(court, T) = f(
    lifecycle_status,        // sân có thuộc diện khai thác không
    open session at T,       // có ai đang chơi tại T
    bookings ∩ T             // đã có ai giữ chỗ khoảng T
)
```

**Tham số `T` là điểm mấu chốt.** Cùng một hàm, gọi với `T = bây giờ` cho bảng
điều hành, gọi với `T = khung giờ khách chọn` cho đặt lịch. Vì chỉ có một cách
tính nên hai màn hình không thể nói khác nhau.

**Quy tắc phân biệt khi code:** nếu một giá trị thay đổi mà không ai bấm nút thì
nó **không** thuộc `lifecycle_status`. Sân chuyển từ trống sang đang chơi vì có
người mở phiên — không ai đổi trạng thái sân cả.

### Nợ kỹ thuật đã biết: `maintenance` đang là cờ

Bảo trì về bản chất là **sự kiện có thời hạn** (có điểm bắt đầu và kết thúc),
không phải thuộc tính của tài sản. Hiện nó bị nén thành một giá trị enum không có
chiều thời gian. Hệ quả trực tiếp nằm ở mục 2.

Khi cần đặt lịch né đúng khoảng bảo trì, hoặc cần báo cáo "tháng này sân 3 bảo trì
bao nhiêu giờ", thì phải tách thành bảng `court_maintenances` với
`starts_at` / `ends_at` / lý do, và `lifecycle_status` rút còn `active` · `retired`.

---

## 2. Không bao giờ hỏi `court.status` để quyết định đặt lịch

Mọi câu hỏi về khả dụng đi qua **đúng một hàm**:
[`BookingService.checkAvailability`](../backend/src/services/BookingService.js).

```
checkAvailability(courtId, date, from, to)
  → { available, reason, message, conflictBookingId }

reason ∈ COURT_NOT_FOUND | COURT_INACTIVE | COURT_MAINTENANCE | ALREADY_BOOKED
```

Cả `POST /bookings`, `PUT /bookings/:id` và `GET /bookings/availability` đều gọi
chính hàm này. **Giao diện không được tự suy luận khả dụng từ `court.status`** —
chỗ suy luận riêng là nơi UI bắt đầu lệch với server.

Trả về `reason` có cấu trúc thay vì chỉ `false` là để giao diện hiển thị đúng lý
do mà không phải đoán.

Mã lỗi: `ALREADY_BOOKED` → **409** (xung đột tài nguyên); sân ngưng/bảo trì →
**400** (yêu cầu không hợp lệ ngay từ đầu).

### Giới hạn hiện tại

Vì `maintenance` là cờ không có thời hạn, sân đang bảo trì bị chặn đặt cho **mọi**
khung giờ tương lai, kể cả khi tới lúc đó đã sửa xong. Đây là lựa chọn có ý thức:
chặn hết thì an toàn, còn chỉ chặn hôm nay sẽ cho đặt vào giữa một đợt bảo trì
kéo dài. Sửa triệt để = tách bảng như mục 1.

---

## 3. Chuyển trạng thái chỉ qua hành động nghiệp vụ

### a. Một bất biến, một đường ghi được canh gác

`courts.status` chỉ được ghi bởi
[`CourtService.updateCourtStatus`](../backend/src/services/CourtService.js).
`PUT /courts/:id` **không nhận** trường `status`, và service lọc trắng danh sách
trường được sửa (`pickEditableFields`) thay vì đổ thẳng `req.body` vào
`model.update()`.

> Lỗ hổng đã từng tồn tại: `PUT /courts/:id` cho phép đổi `status` (bỏ qua mọi
> kiểm tra) và cả `branchId` (chuyển sân sang chi nhánh khác, thủng cách ly dữ
> liệu). Nguyên nhân: hai đường ghi cùng một cột mà chỉ một đường có chốt chặn.

**Nguyên tắc chung: không bao giờ đổ thẳng `req.body` vào `model.update()`.**

### b. Bảng chuyển đổi khai báo tường minh

| Từ → Đến | `active` | `maintenance` | `inactive` |
|---|---|---|---|
| **`active`** | — | `court.maintenance_started` | `court.retired` |
| **`maintenance`** | `court.maintenance_completed` | — | `court.retired` |
| **`inactive`** | `court.reactivated` | ❌ **chặn** | — |

Mỗi ô là một **hành động nghiệp vụ có tên**, và tên đó đi thẳng vào nhật ký kiểm
toán — đọc log biết ngay việc gì đã xảy ra, thay vì chỉ thấy "status đổi từ A sang B".

`inactive → maintenance` bị chặn có chủ đích: sân đã ngưng khai thác thì không có
gì để bảo trì. Muốn sửa thì khai thác trở lại trước, để trạng thái luôn phản ánh
đúng ý định vận hành.

### c. Tiền điều kiện khi rời khỏi `active`

Rời `active` nghĩa là ngừng tiếp nhận khách, nên phải chắc hai điều:

1. **Không có phiên chơi đang mở** → `400`, không bỏ rơi khách đang chơi dở.
2. **Không còn lịch đặt sắp tới** (`pending`/`confirmed`, từ hôm nay trở đi) →
   `409` kèm số lượng, để nhân viên huỷ hoặc chuyển sang sân khác trước.

Không có điều kiện 2 thì sẽ để lại lịch mồ côi — đã hứa với khách mà sân không còn
phục vụ được.

### d. Mọi hành động chạy trong transaction

Khoá dòng (`LOCK.UPDATE`) → kiểm tra tiền điều kiện → ghi → ghi audit → commit.

---

## 4. Nguồn sự thật

| Câu hỏi | Nguồn **duy nhất** | Được đảm bảo bằng |
|---|---|---|
| Sân thuộc diện khai thác? | `courts.status` | Một đường ghi duy nhất (mục 3a) |
| Sân **đang** được chơi? | `court_sessions` có `status='playing'` | **Unique index ở tầng DB** |
| Đã giữ chỗ khoảng `[t1,t2)`? | `bookings` ở `pending`/`confirmed` | `checkAvailability` + `SERIALIZABLE` |
| Tiền | `invoices` / `payments` | Idempotency key |
| **Trạng thái hiển thị** | **Không có nguồn — luôn tính** | `CourtService.formatCourt` |

### Bất biến được ép ở tầng dữ liệu

"Một sân tối đa một phiên đang mở" **không** chỉ dựa vào kiểm tra ở tầng ứng dụng.
Cột sinh tự động `court_sessions.open_court_id` mang `court_id` khi phiên đang mở
và `NULL` khi đã đóng hoặc xoá mềm, kèm unique index `uq_court_sessions_open_court`.
Vì UNIQUE bỏ qua `NULL` nên ràng buộc chỉ áp lên đúng các phiên đang mở.

Kiểm chứng: một câu `INSERT` chạy thẳng vào DB, bỏ qua toàn bộ tầng ứng dụng, vẫn
bị MySQL trả `ER_DUP_ENTRY`. Đây mới là thứ thực sự chặn "hai nhân viên mở cùng
một sân" — kiểm tra ở tầng ứng dụng chỉ làm giảm xác suất.

Nguyên tắc: **bất biến nào ép được xuống DB thì ép**, tầng ứng dụng chỉ để báo lỗi
cho dễ hiểu.

### Quy tắc cho realtime *(chưa triển khai — chốt trước khi làm)*

**1. Event không mang trạng thái, chỉ mang tín hiệu vô hiệu hoá.**

```
✅ court.changed { courtId }        → client gọi lại API, lấy trạng thái đã tính
❌ court.changed { status: 'playing' } → vừa tạo nguồn sự thật thứ hai
```

Event mang sẵn trạng thái chính là cách sinh ra bug "booking và court realtime
hiển thị khác nhau": client tin vào payload của event, trong khi API tính ra kết
quả khác.

**2. Phát sau khi transaction commit, không phát bên trong.**

Phát trong transaction mà sau đó rollback thì client đã nhận tin sai và không có
gì đính chính.

---

## Đối chiếu bốn nhóm lỗi

| Lỗi | Trạng thái | Nhờ đâu |
|---|---|---|
| UI báo trống nhưng DB còn session | ✅ Không thể xảy ra | UI không đọc cột nào, tính từ chính bảng session |
| Sân bảo trì vẫn booking được | ✅ Đã chặn | `checkAvailability` xét trạng thái sân |
| Hai nhân viên mở cùng một sân | ✅ Chặn ở tầng DB | `uq_court_sessions_open_court` |
| Booking và realtime khác nhau | ⏳ Chưa có realtime | Quy tắc ở mục 4 phải áp ngay từ đầu |
