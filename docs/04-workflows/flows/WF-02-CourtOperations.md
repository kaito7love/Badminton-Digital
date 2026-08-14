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
    │         ├─→ Gán khách hàng có sẵn (tìm theo SĐT/tên), hoặc
    │         └─→ Nhập tên khách vãng lai → hệ thống tự tạo hồ sơ khách hàng
    │
    ├─→ [POST /api/v1/courts/:id/open]
    │         │ DB Transaction:
    │         ├─→ Khách vãng lai: tạo (hoặc gộp theo SĐT) bản ghi Customer
    │         └─→ Tạo CourtSession { courtId, customerId, employeeId, startTime = NOW() }
    │             (KHÔNG đụng tới Court.status — sân hiển thị "đang chơi" nhờ có
    │              phiên đang mở, không phải nhờ một cột trạng thái)
    │
    └─→ Sân hiển thị trạng thái "Đang chơi" 🔴
        Hiển thị: tên khách (nếu có), giờ bắt đầu, đồng hồ tính giờ ⏱️
```

**Ngoại lệ:**
- Sân đang bảo trì → `400`: "Sân đang bảo trì"
- Sân đã ngưng khai thác → `400`: "Sân đã ngưng khai thác"
- Sân đang có người chơi → `400`: "Court is already in use"
  (kể cả khi lách qua tầng ứng dụng, DB vẫn chặn bằng unique index
  `uq_court_sessions_open_court`)

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
    │         └─→ Cập nhật CourtSession { endTime, durationSeconds, courtFee, status = 'closed' }
    │             (KHÔNG đụng tới Court.status — sân trở lại trống là hệ quả tự
    │              nhiên của việc không còn phiên nào đang mở)
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
    │         └─→ Cập nhật CourtSession.courtId = targetCourtId
    │             (chỉ một thao tác duy nhất: phiên chơi đổi sân thì cả hai sân
    │              tự động đổi cách hiển thị, không phải ghi thêm ở đâu)
    │
    └─→ Sân nguồn → 🟢 Trống
        Sân đích → 🔴 Đang chơi (với session cũ)
```

**Ngoại lệ:**
- Sân đích không trống → `400`: "Sân đích đang được sử dụng"
- Chuyển sang cùng sân → `400`: "Sân nguồn và đích không thể giống nhau"

---

## D. Luồng Đổi Trạng Thái Khai Thác Sân (UC-09)

```
Admin / Nhân viên
    │
    ├─→ Chọn sân KHÔNG có phiên chơi đang mở
    │
    ├─→ [PUT /api/v1/courts/:id/status]
    │         Body: { status: 'maintenance' | 'inactive' | 'active' }
    │         → Cập nhật Court.status
    │
    └─→ maintenance 🔧 : tạm ngưng để sửa chữa, vẫn thuộc công suất kinh doanh
        inactive    ⚫ : ngưng khai thác dài hạn (chưa mở bán, đã thanh lý...),
                         KHÔNG tính vào mẫu số của tỷ lệ lấp đầy
        active      🟢 : sẵn sàng tiếp nhận khách

Cả hai trạng thái ngưng đều chặn mở sân cho tới khi chuyển về 'active'.
```

**Ngoại lệ:**
- Sân đang có người chơi → `400`: "Không thể đổi trạng thái sân khi đang có phiên chơi"
- Giá trị ngoài 3 giá trị trên → `400` từ tầng validation

---

## 🔄 Hai trục trạng thái — vì sao không gộp làm một

`courts.status` **chỉ mô tả vòng đời khai thác của sân**, do con người quyết định.
Việc "sân có đang được chơi hay không" **không được lưu ở đâu cả** mà suy ra từ
`court_sessions`: sân đang chơi ⟺ tồn tại một phiên có `status = 'playing'`.

Lý do: nếu lưu trạng thái chiếm dụng vào `courts.status` thì cùng một dữ kiện tồn
tại ở hai nơi và có thể lệch nhau — chỉ cần tiến trình đóng sân chết giữa chừng là
sân kẹt vĩnh viễn ở trạng thái "đang chơi", không ai mở lại được.

Bất biến "một sân tối đa một phiên đang mở" được **cơ sở dữ liệu** bảo đảm bằng
unique index có điều kiện (`uq_court_sessions_open_court`), chứ không chỉ dựa vào
kiểm tra ở tầng ứng dụng — kể cả một câu INSERT chạy tay cũng bị chặn.

```
TRỤC A — vòng đời (lưu trong courts.status)
                    updateCourtStatus()
   [active] ◄──────────────────────────────► [maintenance]
       ▲                                            │
       └──────────────────────────────────────► [inactive]
       (chỉ đổi được khi sân không có phiên chơi đang mở)

TRỤC B — chiếm dụng (suy ra từ court_sessions, KHÔNG lưu)
   openCourt()  → tạo phiên status='playing'   → sân hiển thị PLAYING
   closeCourt() → phiên chuyển 'closed'        → sân hiển thị AVAILABLE
   transferCourt() → đổi court_id của phiên    → nguồn AVAILABLE, đích PLAYING

GIAO DIỆN nhận `state` do backend gộp sẵn hai trục:
   MAINTENANCE > INACTIVE > PLAYING > AVAILABLE
```
