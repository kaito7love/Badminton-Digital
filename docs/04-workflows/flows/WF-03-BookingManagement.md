# WF-03 — Luồng Quản lý Đặt lịch (UC-10, UC-11, UC-12, UC-13)

**Actors:** Nhân viên, Khách hàng, Hệ thống  
**Use Cases:** UC-10 (Tạo booking), UC-11 (Kiểm tra trùng), UC-12 (Sửa/Hủy), UC-13 (Xác nhận)

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
    │       Response: { available: true, conflictBookingId: null }
    │
    └─→ Có kết quả:
            Response: { available: false, conflictBookingId: 88 }
```

---

## B. Luồng Tạo Booking — Nhân viên tại quầy (UC-10)

```
Nhân viên
    │
    ├─→ [Trang Đặt lịch]
    ├─→ Chọn: Sân | Ngày | Giờ bắt đầu | Giờ kết thúc
    ├─→ Chọn khách hàng (optional, tìm theo SĐT)
    │
    ├─→ Hệ thống auto-check: UC-11
    │         ├─→ available: true → Tiếp tục
    │         └─→ available: false → Hiển thị lỗi 409, gợi ý khung giờ khác
    │
    ├─→ [POST /api/v1/bookings]
    │         → Tạo Booking { status: 'pending' }
    │
    ├─→ Nhân viên tạo trực tiếp tại quầy:
    │         → Auto confirm: [PUT /api/v1/bookings/:id/confirm]
    │         → Booking { status: 'confirmed' } ✅
    │
    └─→ Hiển thị xác nhận đặt sân thành công
```

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

---

## E. Luồng Sửa / Hủy Booking (UC-12)

```
Nhân viên hoặc Khách hàng
    │
    ├─→ [A. Sửa booking]
    │         ├─→ [PUT /api/v1/bookings/:id]
    │         ├─→ Gửi ngày/giờ mới
    │         ├─→ Hệ thống re-check UC-11 (exclude chính booking đó)
    │         ├─→ Hợp lệ → Cập nhật thành công
    │         └─→ Trùng → 409 Conflict
    │
    └─→ [B. Hủy booking]
              ├─→ [DELETE /api/v1/bookings/:id]
              └─→ Booking { status: 'cancelled' }
```

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
