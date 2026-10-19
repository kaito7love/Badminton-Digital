# WF-03 — Luồng Quản lý Đặt lịch (UC-10, UC-11, UC-12, UC-13)

**Actors:** Nhân viên, `branch_manager`, Khách hàng, Hệ thống  
**Use Cases:** UC-10 (Tạo booking), UC-11 (Kiểm tra trùng), UC-12 (Sửa/Hủy), UC-13 (Xác nhận), UC-27 (Thông báo), UC-32 (Đặt sân trên web)
**Cập nhật:** 18/10/2026 — luật thời gian, giới hạn của khách, chính sách giữ chỗ, thông báo và trang `/dat-san` (kế hoạch 29, 41–43).

Mọi endpoint booking đều branch-scoped qua `branchContextMiddleware` (Booking
kế thừa `branchId` từ `Court.branchId` lúc tạo). Danh sách/khả dụng chỉ tính
trong đúng chi nhánh đang hoạt động — Admin xem đúng chi nhánh đang chọn ở bộ
chuyển chi nhánh, nhân viên/`branch_manager` luôn là chi nhánh của mình.

---

## A. Luồng Kiểm tra khung giờ trống (UC-11) — Được gọi tự động

```
Người dùng cung cấp: courtId, bookingDate, startTime, endTime
    │
    ├─→ [GET /api/v1/bookings/availability?courtId=&bookingDate=&startTime=&endTime=]
    │   (khách và khách vãng lai dùng [GET /api/v1/public/availability] cùng tham số)
    │         │
    │         └─→ BookingService.checkAvailability — kiểm THEO THỨ TỰ:
    │               1. Sân tồn tại, thuộc chi nhánh, đang khai thác (không bảo trì / ngưng)
    │               2. Khung giờ CHƯA KẾT THÚC (endTime > bây giờ, theo múi giờ CHI NHÁNH)
    │               3. Nằm trọn trong giờ mở cửa (operating_hours, mặc định 05:00–23:00)
    │               4. Không overlap với booking 'pending'/'confirmed' cùng sân:
    │                    WHERE court_id = :courtId AND booking_date = :bookingDate
    │                      AND status IN ('pending','confirmed')
    │                      AND start_time < :endTime AND end_time > :startTime
    │
    ├─→ Qua hết:   { available: true,  reason: null, message: null, conflictBookingId: null }
    └─→ Vi phạm:   { available: false, reason, message, conflictBookingId? }
```

`checkAvailability` (`BookingService.js`) là nguồn trả lời DUY NHẤT — `GET /public/availability`,
`GET /bookings/availability`, `POST /bookings` và `PUT /bookings/:id` đều gọi đúng hàm này
trước khi ghi, nên UI và server không bao giờ lệch nhau:

| `reason` | `message` | HTTP khi tạo / sửa |
|---|---|---|
| `COURT_NOT_FOUND` | "Không tìm thấy sân" | 404 |
| `COURT_INACTIVE` | "Sân đã ngưng khai thác, không nhận đặt lịch" | 400 |
| `COURT_MAINTENANCE` | "Sân đang bảo trì, không nhận đặt lịch mới cho tới khi hoàn tất" | 400 |
| `SLOT_PASSED` | "Khung giờ này đã qua, vui lòng chọn khung giờ khác" | 400 |
| `OUTSIDE_OPERATING_HOURS` | "Quán chỉ nhận đặt sân trong khung 05:00–23:00" | 400 |
| `ALREADY_BOOKED` | "Khung giờ này đã có người đặt, vui lòng chọn khung giờ khác" | 409 |

`ALREADY_BOOKED` trả HTTP 409 (xung đột tài nguyên); các lý do còn lại 400 (yêu cầu không hợp lệ
ngay từ đầu). Ở các route kiểm tra (`/availability`) cùng lý do đó được trả dưới dạng
`available: false` kèm `message`; `/public/availability` **chỉ** trả `available` và `message` (không có `reason`, không có
`conflictBookingId`). Khung đã **bắt đầu nhưng chưa kết thúc** vẫn nhận (khách bước vào quầy giữa giờ);
lưới `/public/availability/day` cố ý chặt hơn một bậc và coi ô đã bắt đầu là "đã qua". "Hôm nay" luôn theo lịch của **chi nhánh**.

**Luật dành riêng cho khách** (`POST /bookings`, ngoài `checkAvailability`; nhân viên không bị): đặt trước tối đa
14 ngày (hôm nay … hôm nay + 13); tối đa 3 giờ một lần; giữ tối đa 5 lịch `pending`/`confirmed` chưa kết
thúc cùng lúc (`booking_policy.maxActivePerCustomer`, vi phạm → 400 `code: BOOKING_LIMIT`, đếm trong giao dịch
SERIALIZABLE); tối đa 20 lần đặt trong 10 phút theo người dùng (429).

---

## B. Luồng Tạo Booking — Nhân viên tại quầy (UC-10)

```
Nhân viên
    │
    ├─→ [Trang Đặt lịch]
    ├─→ Chọn: Sân | Ngày | Giờ bắt đầu | Giờ kết thúc
    ├─→ Chọn khách hàng có sẵn (optional, tìm theo SĐT — toàn chuỗi, xem
    │       WF-05 §A), hoặc để trống và chỉ gõ tên/SĐT khách vãng lai
    │
    ├─→ Hệ thống auto-check: UC-11
    │         ├─→ available: true → Tiếp tục
    │         └─→ available: false → Hiển thị lỗi theo bảng ở mục A
    │
    ├─→ [POST /api/v1/bookings] { courtId, bookingDate, startTime, endTime,
    │         customerId? | customerName? + customerPhone? }
    │         │ Không truyền customerId → CustomerService.resolveWalkIn:
    │         │   có SĐT và đã có hồ sơ ở BẤT KỲ chi nhánh nào → gộp vào hồ
    │         │   sơ đó; không thì tạo Customer mới. Booking vẫn ghi
    │         │   branchId theo chi nhánh của sân, chỉ customerId là dùng
    │         │   chung chuỗi.
    │         └─→ Tạo Booking { status: 'pending' }
    │
    ├─→ Booking luôn bắt đầu ở 'pending', kể cả khi nhân viên tạo — nhân viên bấm
    │     "Xác nhận" ở danh sách (mục D) để sang 'confirmed'. Lịch do nhân viên tạo
    │     KHÔNG bao giờ tự huỷ (chỉ lịch khách tự đặt mới bị tự huỷ khi chưa được duyệt)
    │
    └─→ Phát `booking:changed` qua SSE (máy nhân viên khác thấy ngay) và hiển thị
          xác nhận đặt sân thành công
```

Khi gõ SĐT khách vãng lai, màn hình tra số trước khi lưu (`GET /customers?search=`); `POST /bookings` trả thêm
`customerMatch { id, fullName, nameDiffers }` (không lưu) khi số khớp một khách có sẵn. SĐT sai định dạng (`123`, `abc`) → 400; rỗng được phép.

`POST`/`DELETE /api/v1/bookings` chấp nhận cả `customer` tự đặt/hủy cho chính
mình (`roleMiddleware(['admin', 'branch_manager', 'employee', 'customer'])` trong
`bookingRoutes.js`); booking khách tự đặt luôn gắn hồ sơ của chính khách.
`PUT /api/v1/bookings/:id` (đổi lịch) chỉ mở cho nhân viên — khách muốn đổi thì
hủy rồi đặt lại, đúng như trang "Lịch của tôi".

---

## C. Luồng Tạo Booking — Khách hàng tự đặt online (UC-10, UC-32)

```
Khách hàng (hoặc khách vãng lai khi xem)
    │
    ├─→ [Trang Đặt sân /dat-san] — nơi DUY NHẤT khách đặt sân
    │       (mọi nút "Đặt sân" khác chỉ là liên kết tới đây, không điền sẵn)
    ├─→ Chọn chi nhánh và ngày trong dải 14 ngày
    ├─→ [GET /api/v1/public/availability/day?date=&branchId=]
    │       → lưới sân × giờ (ô 60 phút: free | booked | passed | maintenance, cờ cao điểm),
    │         6 câu SQL cố định, không lộ dữ liệu khách; tự làm mới mỗi 30 giây
    ├─→ Chạm một ô hoặc kéo thành khoảng (tối đa 3 giờ) → thanh tóm tắt giá
    │
    ├─→ Bấm xác nhận:
    │         ├─→ Chưa đăng nhập → /login (hoặc đăng ký), lưu lựa chọn trong sessionStorage
    │         │      `pending_booking_datsan` → quay lại, khôi phục chi nhánh/ngày/sân/khung,
    │         │      mở hộp xác nhận nếu khung còn trống
    │         └─→ Đã đăng nhập → hộp xác nhận
    │
    ├─→ [POST /api/v1/bookings] → UC-11 → Booking { status: 'pending' } (SERIALIZABLE)
    │         ├─→ 409 trùng (hai khách giành một khung) → báo lỗi tại chỗ, lưới cập nhật
    │         └─→ 400 BOOKING_LIMIT / quá 14 ngày / quá 3 giờ → thông điệp tiếng Việt tại chỗ
    │
    └─→ Chuyển tới /my-bookings; chờ Nhân viên xác nhận (UC-13)
```

Lịch `pending` do khách tự đặt mà chưa được duyệt sẽ **tự huỷ** theo chính sách giữ chỗ
(`booking_policy`): vào lúc `max(tạo + 15 phút, min(tạo + pendingExpiryHours, giờ bắt đầu − pendingExpireBeforeStartMinutes))`,
mặc định 24 giờ / 60 phút; việc nền 5 phút ghi nhật ký `booking.expired` (không có user). Khách nhận
**thông báo trong ứng dụng** (UC-27) khi lịch được xác nhận, bị tự huỷ, bị nhân viên huỷ hoặc bị đổi — chưa có nhắc lịch
sắp đến.

---

## D. Luồng Xác nhận Booking (UC-13)

```
Nhân viên
    │
    ├─→ [Trang Quản lý Booking] → Filter: status = 'pending'
    │
    ├─→ Xem chi tiết booking → Kiểm tra thông tin
    │
    └─→ [PUT /api/v1/bookings/:id/confirm]
              → Booking { status: 'confirmed' } ✅
              → Khách có tài khoản nhận thông báo "Lịch đặt sân đã được xác nhận"
              → booking:changed qua SSE
```

Chỉ `['admin', 'branch_manager', 'employee']` gọi được — khách hàng không tự
xác nhận booking của chính mình.

---

## E. Luồng Sửa / Hủy Booking (UC-12)

```
Nhân viên/branch_manager/Admin, hoặc Khách hàng (chỉ booking của chính mình)
    │
    ├─→ [A. Sửa booking — chỉ nhân viên/branch_manager/Admin; khách → 403]
    │         ├─→ [PUT /api/v1/bookings/:id]
    │         ├─→ Chỉ gửi sân/ngày/giờ mới (courtId, bookingDate, startTime,
    │         │     endTime); trường khác (status, branchId, createdBy,
    │         │     customerId, customerName...) → 400 "Không sửa được các
    │         │     trường: ..."; đổi khách thì hủy lịch và tạo lịch mới
    │         ├─→ Chỉ sửa được khi status ∈ {pending, confirmed}; khác thì
    │         │     400 "Booking ở trạng thái hiện tại không thể chỉnh sửa"
    │         ├─→ Hệ thống re-check UC-11 (exclude chính booking đó)
    │         ├─→ Hợp lệ → Cập nhật thành công
    │         └─→ Trùng → 409 "Updated time slot conflicts with an existing booking"
    │
    └─→ [B. Hủy booking]
              ├─→ [DELETE /api/v1/bookings/:id]
              ├─→ Chỉ hủy được khi status ∈ {pending, confirmed}; khác thì
              │     400 "Booking ở trạng thái hiện tại không thể hủy"
              └─→ Booking { status: 'cancelled' }
```

Thông báo cho khách: **nhân viên** đổi hoặc huỷ lịch của khách có tài khoản → thông báo (đổi lịch kèm khung cũ);
**khách tự huỷ** lịch của mình thì không có thông báo. Thông báo được ghi trong CÙNG giao dịch với thay đổi lịch
(rollback thì không còn thông báo).

Ownership hai lớp cho mọi thao tác đọc/sửa/hủy booking
(`BookingService.assertOwnership`): sai chi nhánh → 403 "Booking không thuộc
chi nhánh hiện tại"; khách hàng cố truy cập booking không phải của mình → 403
"Bạn không có quyền truy cập booking này".

---

## F. Sơ đồ trạng thái Booking

```
              Tạo mới (nhân viên hoặc khách; luôn bắt đầu ở pending)
                 │
                 ▼
           [pending] ──── confirm (nhân viên) ────► [confirmed]
               │  │                                    │
               │  └─ tự huỷ khi chưa duyệt kịp         │ Mở sân từ lịch (UC-06, chỉ qua API)
               │     (chỉ lịch KHÁCH tự đặt;           │
             cancel   nhân viên tạo không bao giờ)     ▼
               │                                  [completed]
               ▼
          [cancelled]
```

Mỗi chuyển trạng thái do nhân viên hoặc việc nền (xác nhận, huỷ, tự huỷ, đổi lịch) phát `booking:changed { branchId, bookingId, status }` qua SSE **sau khi commit**, và (với khách có tài khoản, trừ khi chính khách huỷ) ghi một thông báo trong cùng giao dịch.
