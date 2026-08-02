# WF-05 — Luồng Quản lý Khách hàng (UC-14, UC-15)

**Actors:** Nhân viên, Admin, Khách hàng (xem lịch sử của chính mình)  
**Use Cases:** UC-14 (Quản lý khách hàng CRUD), UC-15 (Xem lịch sử & chi tiêu)

---

## A. Tìm kiếm khách hàng

```
Nhân viên
    │
    └─→ [GET /api/v1/customers?search=Nguyễn]
              → Tìm theo tên / SĐT / email
              → Trả về danh sách + thông tin hạng hội viên
```

---

## B. Thêm khách hàng mới (UC-14)

```
Nhân viên
    │
    ├─→ Nhập: Họ tên | SĐT | Email (optional)
    │
    ├─→ [POST /api/v1/customers]
    │         ├─→ Kiểm tra SĐT trùng → 400 nếu đã tồn tại
    │         └─→ Tạo Customer mới { loyaltyTier: 'normal', totalSpent: 0 }
    │
    └─→ Thành công → Hiển thị profile khách hàng mới
```

---

## C. Cập nhật thông tin khách hàng (UC-14)

```
Nhân viên
    │
    ├─→ Tìm khách → Chọn "Sửa thông tin"
    ├─→ Cập nhật: Tên | SĐT | Email
    ├─→ [PUT /api/v1/customers/:id]
    │         └─→ Kiểm tra SĐT mới không trùng với người khác
    └─→ Lưu thành công
```

---

## D. Xem lịch sử chơi & chi tiêu (UC-15)

```
Nhân viên / Admin / Khách hàng (chính mình)
    │
    └─→ [GET /api/v1/customers/:id/history]
              │
              ├─→ Thông tin cá nhân:
              │     Tên, SĐT, Email, Hạng hội viên, Tổng chi tiêu
              │
              ├─→ Lịch sử phiên chơi (CourtSessions):
              │     [Sân] [Ngày] [Thời gian] [Tiền sân] [Phụ kiện] [Tổng]
              │
              └─→ Lịch sử đặt lịch (Bookings):
                    [Sân] [Ngày đặt] [Khung giờ] [Trạng thái]
```

---

## E. Xóa khách hàng (UC-14 — Admin only)

```
Admin
    │
    ├─→ [DELETE /api/v1/customers/:id]
    └─→ Xác nhận → Xóa Customer record
```
