# WF-03 — Luồng Quản lý Đặt lịch (UC-10, UC-11, UC-12, UC-13)

**Actors:** Nhân viên, `branch_manager`, Khách hàng, Hệ thống  
**Use Cases:** UC-10 (Tạo booking), UC-11 (Kiểm tra trùng), UC-12 (Sửa/Hủy), UC-13 (Xác nhận)

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
    │         │
    │         └─→ Truy vấn DB:
    │               WHERE court_id = :courtId
    │                 AND booking_date = :bookingDate
    │                 AND status IN ('pending', 'confirmed')
    │                 AND start_time < :endTime        ← Overlap condition
    │                 AND end_time > :startTime        ← Overlap condition
    │
    ├─→ Không có kết quả:
    │       Response: { available: true, reason: null, message: null,
    │                    conflictBookingId: null }
    │
    └─→ Có kết quả:
            Response: { available: false, reason: 'ALREADY_BOOKED',
                         message: 'Selected court and time slot is already booked',
                         conflictBookingId: 88 }
```

`checkAvailability` (`BookingService.js`) là nguồn trả lời DUY NHẤT — mọi luồng
tạo/sửa booking đều gọi lại đúng hàm này trước khi ghi, nên UI và server không
bao giờ lệch nhau. Ngoài trùng lịch, hàm còn từ chối theo trạng thái sân:

| `reason` | `message` | Khi nào |
|---|---|---|
| `COURT_NOT_FOUND` | "Không tìm thấy sân" | Sân không tồn tại / không thuộc chi nhánh |
| `COURT_INACTIVE` | "Sân đã ngưng khai thác, không nhận đặt lịch" | `court.status = 'inactive'` |
| `COURT_MAINTENANCE` | "Sân đang bảo trì, không nhận đặt lịch mới cho tới khi hoàn tất" | `court.status = 'maintenance'` |
| `ALREADY_BOOKED` | "Selected court and time slot is already booked" (tạo) hoặc "Updated time slot conflicts with an existing booking" (sửa) | Overlap với booking `pending`/`confirmed` khác |

`ALREADY_BOOKED` trả HTTP 409 (xung đột tài nguyên); hai lý do sân ngưng/bảo
trì trả 400 (yêu cầu không hợp lệ ngay từ đầu).

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
    ├─→ Nhân viên tạo trực tiếp tại quầy:
    │         → Auto confirm: [PUT /api/v1/bookings/:id/confirm]
    │         → Booking { status: 'confirmed' } ✅
    │
    └─→ Hiển thị xác nhận đặt sân thành công
```

`POST`/`PUT`/`DELETE /api/v1/bookings` chấp nhận cả `customer` tự đặt cho
chính mình (`roleMiddleware(['admin', 'branch_manager', 'employee', 'customer'])`
trong `bookingRoutes.js`) — khách không thể gán `customerId` khác hồ sơ của
mình (403 "Khách hàng không thể chuyển booking sang hồ sơ khác" nếu cố).

---

## C. Luồng Tạo Booking — Khách hàng tự đặt online (UC-10)

```
Khách hàng
    │
    ├─→ [Trang Đặt sân]
    ├─→ Chọn sân → Xem lịch trống (Calendar View)
    ├─→ Chọn ngày & kéo chọn khung giờ
    │
    ├─→ Hệ thống realtime check: UC-11
    │         ├─→ available → Hiển thị "Còn trống"
    │         └─→ conflict → Tô đỏ khung giờ "Đã đặt"
    │
    ├─→ Xác nhận thông tin → [POST /api/v1/bookings]
    │         → Booking { status: 'pending' }
    │
    └─→ Chờ Nhân viên xác nhận (UC-13)
        → Email/notification khi được confirm
```

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
```

Chỉ `['admin', 'branch_manager', 'employee']` gọi được — khách hàng không tự
xác nhận booking của chính mình.

---

## E. Luồng Sửa / Hủy Booking (UC-12)

```
Nhân viên/branch_manager/Admin, hoặc Khách hàng (chỉ booking của chính mình)
    │
    ├─→ [A. Sửa booking]
    │         ├─→ [PUT /api/v1/bookings/:id]
    │         ├─→ Gửi ngày/giờ mới
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

Ownership hai lớp cho mọi thao tác đọc/sửa/hủy booking
(`BookingService.assertOwnership`): sai chi nhánh → 403 "Booking không thuộc
chi nhánh hiện tại"; khách hàng cố truy cập booking không phải của mình → 403
"Bạn không có quyền truy cập booking này".

---

## F. Sơ đồ trạng thái Booking

```
              Tạo mới
                 │
                 ▼
           [pending] ──── confirm ────► [confirmed]
               │                            │
               │                      Mở sân (UC-06)
             cancel                         │
               │                            ▼
               ▼                       [completed]
          [cancelled]
```
