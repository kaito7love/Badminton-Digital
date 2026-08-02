# WF-02 — Luồng Vận hành Sân (UC-06, UC-07, UC-08, UC-09)

**Actors:** Nhân viên, Admin  
**Use Cases:** UC-06 (Mở sân), UC-07 (Đóng sân & tính tiền), UC-08 (Chuyển sân), UC-09 (Bảo trì)

---

## A. Luồng Mở Sân Walk-in (UC-06)

```
Nhân viên
    │
    ├─→ Vào màn hình "Tổng quan sân" (Court Monitor)
    │       Thấy danh sách sân với trạng thái:
    │         🟢 Trống (empty)
    │         🔴 Đang chơi (playing)
    │         🔧 Bảo trì (maintenance)
    │
    ├─→ Chọn sân trạng thái "Trống"
    │
    ├─→ Nhấn "Mở sân"
    │         ├─→ Gán khách hàng? (tìm theo SĐT/tên) — optional
    │         └─→ Khách vãng lai — để null
    │
    ├─→ [POST /api/v1/courts/:id/open]
    │         │ DB Transaction:
    │         ├─→ Tạo CourtSession { courtId, customerId, employeeId, startTime = NOW() }
    │         └─→ Cập nhật Court.status = 'playing'
    │
    └─→ Sân hiển thị trạng thái "Đang chơi" 🔴
        Hiển thị: tên khách (nếu có), giờ bắt đầu, đồng hồ tính giờ ⏱️
```

**Ngoại lệ:**
- Sân đang bảo trì → API trả về `400 Bad Request`: "Sân đang bảo trì, không thể mở"
- Sân đang có người chơi → `400`: "Sân đã đang được sử dụng"

---

## B. Luồng Đóng Sân & Tính Tiền (UC-07)

```
Nhân viên
    │
    ├─→ Chọn sân đang chơi → Nhấn "Đóng sân"
    │
    ├─→ [POST /api/v1/courts/:id/close]
    │         │ DB Transaction:
    │         ├─→ Ghi nhận endTime = NOW()
    │         ├─→ Tính durationSeconds = endTime - startTime
    │         ├─→ Tính courtFee theo khung giờ:
    │         │       Cắt phiên tại ranh giới Peak/Off-peak
    │         │       VD: 16:30 → 17:45
    │         │         Đoạn 16:30–17:00 (30p) × Off-peak rate
    │         │         Đoạn 17:00–17:45 (45p) × Peak rate
    │         │       Làm tròn đến 1.000đ
    │         ├─→ Cập nhật CourtSession { endTime, durationSeconds, courtFee, status = 'closed' }
    │         └─→ Cập nhật Court.status = 'empty'
    │
    └─→ Chuyển sang màn hình Thanh toán (UC-18)
        Hiển thị bảng tổng kết:
          - Thời gian chơi
          - Tiền sân
          - Phụ kiện đã dùng (SessionExtras)
          - Tổng tạm tính
```

---

## C. Luồng Chuyển Sân (UC-08)

```
Nhân viên
    │
    ├─→ Chọn sân đang chơi → Nhấn "Chuyển sân"
    │
    ├─→ Chọn sân đích (phải đang TRỐNG)
    │
    ├─→ [POST /api/v1/courts/:id/transfer]
    │         │ DB Transaction:
    │         ├─→ Cập nhật CourtSession.courtId = targetCourtId
    │         ├─→ Cập nhật sân nguồn: status = 'empty'
    │         └─→ Cập nhật sân đích: status = 'playing'
    │
    └─→ Sân nguồn → 🟢 Trống
        Sân đích → 🔴 Đang chơi (với session cũ)
```

**Ngoại lệ:**
- Sân đích không trống → `400`: "Sân đích đang được sử dụng"
- Chuyển sang cùng sân → `400`: "Sân nguồn và đích không thể giống nhau"

---

## D. Luồng Bảo trì Sân (UC-09)

```
Admin / Nhân viên
    │
    ├─→ Chọn sân đang TRỐNG
    │
    ├─→ [PUT /api/v1/courts/:id/maintenance]
    │         Body: { isMaintenance: true }
    │         → Cập nhật Court.status = 'maintenance'
    │
    └─→ Sân hiển thị 🔧 Bảo trì
        Không thể mở cho khách chơi cho đến khi tắt bảo trì

Tắt bảo trì:
    ├─→ Body: { isMaintenance: false }
    └─→ Court.status = 'empty' → Sân sẵn sàng trở lại 🟢
```

**Ngoại lệ:**
- Sân đang có người chơi → `400`: "Không thể bật bảo trì khi sân đang hoạt động"

---

## 🔄 Sơ đồ trạng thái sân tổng hợp

```
          [empty] ◄──────────────────────────────┐
             │                                    │
       openCourt()                         closeCourt()
             │                             transferCourt() (destination)
             ▼                                    │
         [playing] ─── transferCourt() ──► [empty] (source)
             │
    (chỉ khi trống)
             │
    toggleMaintenance(true)
             │
             ▼
       [maintenance]
             │
    toggleMaintenance(false)
             │
             ▼
          [empty]
```
