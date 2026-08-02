# WF-07 — Luồng Quản lý Phụ kiện & Tồn kho (UC-17)

**Actors:** Admin (CRUD danh mục), Nhân viên (gọi thêm vào phiên chơi)  
**Use Cases:** UC-17 (Quản lý phụ kiện & tồn kho)

---

## A. Xem danh sách phụ kiện (Admin / Nhân viên)

```
[GET /api/v1/accessories]
    │
    └─→ Danh sách:
          ┌──────────────────────────────────────────────┐
          │ Tên         │ Giá    │ Tồn kho │ Cảnh báo    │
          ├─────────────┼────────┼─────────┼─────────────┤
          │ Nước Aqua   │ 15.000 │   48    │             │
          │ Cầu lông    │ 25.000 │    3    │ ⚠️ Sắp hết  │
          │ Vợt thuê    │ 30.000 │   10    │             │
          └──────────────────────────────────────────────┘
          * Cảnh báo khi stockQuantity ≤ lowStockThreshold
```

---

## B. Thêm phụ kiện mới (Admin)

```
Admin
    │
    ├─→ Nhập: Tên | Giá bán | Số lượng tồn kho | Ngưỡng cảnh báo hàng thấp
    │
    ├─→ [POST /api/v1/accessories]
    └─→ Phụ kiện được thêm vào danh mục ✅
```

---

## C. Cập nhật phụ kiện / Nhập thêm kho (Admin)

```
Admin
    │
    ├─→ Chọn phụ kiện → "Sửa"
    ├─→ Cập nhật: Tên | Giá | Tồn kho (nhập thêm) | Ngưỡng cảnh báo
    ├─→ [PUT /api/v1/accessories/:id]
    └─→ Tồn kho được cập nhật ✅
```

---

## D. Gọi thêm phụ kiện vào sân đang chơi (Nhân viên — UC-17)

```
Nhân viên
    │
    ├─→ [Màn hình sân đang chơi] → Nhấn "Gọi thêm"
    │
    ├─→ Chọn phụ kiện + nhập số lượng
    │
    ├─→ [POST /api/v1/sessions/:sessionId/extras]
    │         │ DB Transaction:
    │         ├─→ Tìm Extra → kiểm tra tồn kho
    │         │       ├─→ Không đủ → 400: "Insufficient stock. Available: N"
    │         │       └─→ Đủ → Tiếp tục
    │         ├─→ Trừ kho: Extra.stockQuantity -= quantity
    │         └─→ Tạo SessionExtra { sessionId, extraId, quantity, unitPrice, subtotal }
    │
    └─→ Phụ kiện được ghi vào phiên chơi ✅
        Hiển thị cập nhật trên màn hình sân:
          "Nước Aquafina × 2 — 30.000đ đã được thêm"
```

---

## E. Luồng cảnh báo tồn kho thấp

```
Sau khi trừ kho:
    stockQuantity <= lowStockThreshold?
        ├─→ Có → Gắn flag "low_stock" trên response
        │         → Dashboard Admin hiển thị ⚠️ cảnh báo
        └─→ Không → Bình thường
```

---

## F. Sơ đồ luồng gọi phụ kiện vào sân

```
Nhân viên chọn phụ kiện + số lượng
            │
            ▼
    Kiểm tra session đang 'playing'?
      ├─→ Không → 400 "Session đã đóng"
      └─→ Có → Tiếp tục
            │
            ▼
    Kiểm tra tồn kho đủ?
      ├─→ Không → 400 "Insufficient stock"
      └─→ Có → Tiếp tục
            │
            ▼
    [DB Transaction]
      ├─→ Extra.stockQuantity -= quantity
      └─→ Tạo SessionExtra record
            │
            ▼
    Ghi nhận thành công ✅
    Tổng chi phí phiên chơi tăng thêm
    (Sẽ được tính vào Invoice khi checkout)
```
