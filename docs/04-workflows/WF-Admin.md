# WF-Admin — Tổng hợp Workflow của Admin

**Actor:** Admin (Chủ sân / Quản trị viên)  
**Quyền hạn:** Toàn quyền hệ thống

---

## 🔐 1. Xác thực tài khoản

```
[Truy cập hệ thống]
       ↓
  Nhập email + mật khẩu
       ↓
  ┌─────────────────────────────┐
  │ Hệ thống xác thực JWT       │
  └─────────────────────────────┘
       ↓ Thành công         ↓ Thất bại
  Vào Dashboard Admin    Hiển thị lỗi / Thử lại
```

Use Cases: UC-01 (Đăng nhập), UC-03 (Quên mật khẩu), UC-04 (Đổi mật khẩu)

---

## 🏸 2. Quản lý Sân (Court Management)

```
Dashboard
  └─→ [Trang Quản lý Sân]
           ├─→ Xem danh sách sân + trạng thái realtime
           ├─→ [Thêm sân mới]
           │       └─→ Nhập tên, giá cao điểm/thấp điểm → Lưu
           ├─→ [Sửa thông tin sân]
           │       └─→ Cập nhật tên, giá, ghi chú → Lưu
           ├─→ [Xóa sân]
           │       └─→ Xác nhận → Xóa (chỉ khi sân đang trống)
           └─→ [Bật/Tắt bảo trì]
                   └─→ Sân chuyển trạng thái "Maintenance"
```

Use Cases: UC-05, UC-09

---

## 👨‍💼 3. Quản lý Nhân viên

```
Dashboard
  └─→ [Trang Nhân viên]
           ├─→ Xem danh sách nhân viên
           ├─→ [Thêm nhân viên]
           │       └─→ Tạo tài khoản User (username, email, mật khẩu)
           │             → Gán Role "employee"
           │             → Tạo hồ sơ Employee (vị trí, ca làm)
           ├─→ [Sửa thông tin / phân quyền]
           │       └─→ Cập nhật vị trí, ca làm, email
           ├─→ [Xóa nhân viên]
           │       └─→ Xóa User + Employee record
           └─→ [Xem nhật ký hoạt động]
                   └─→ Lịch sử thao tác của nhân viên (activity_logs)
```

Use Cases: UC-16

---

## 📦 4. Quản lý Phụ kiện & Tồn kho

```
Dashboard
  └─→ [Trang Phụ kiện]
           ├─→ Xem danh sách (tên, giá, tồn kho, cảnh báo hàng thấp)
           ├─→ [Thêm phụ kiện mới]
           ├─→ [Sửa giá / cập nhật tồn kho]
           └─→ [Xóa phụ kiện]
```

Use Cases: UC-17

---

## 📊 5. Dashboard & Báo cáo

```
Dashboard
  ├─→ Doanh thu hôm nay / tuần / tháng (biểu đồ)
  ├─→ Tổng số lượt khách
  ├─→ Tỷ lệ lấp đầy sân (Occupancy Rate)
  ├─→ Cảnh báo tồn kho thấp
  ├─→ Top sân được thuê nhiều nhất
  ├─→ Top phụ kiện bán chạy
  └─→ [Xuất báo cáo]
           ├─→ Xuất Excel (.xlsx)
           └─→ Xuất PDF
```

Use Cases: UC-19, UC-20

---

## ⚙️ 6. Cài đặt hệ thống

```
Dashboard
  └─→ [Trang Cài đặt]
           ├─→ [Cài đặt bảng giá]
           │       └─→ Giá cao điểm (Peak Hour Price per Hour)
           │             Giá thấp điểm (Off-Peak Price per Hour)
           ├─→ [Cài đặt giờ hoạt động]
           │       └─→ Giờ mở cửa / đóng cửa
           │             Khung giờ cao điểm (VD: 17:00 - 22:00)
           ├─→ [Thông tin thương hiệu]
           │       └─→ Tên trung tâm, logo, theme màu sắc
           └─→ [Giá phụ kiện mặc định]
```

Use Cases: UC-21
