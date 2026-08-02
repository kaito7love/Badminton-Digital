# User Workflows — Badminton Digital Management

Thư mục này mô tả chi tiết các luồng thao tác (**User Workflows**) mà từng vai trò người dùng có thể thực hiện trong hệ thống, dựa trên `UseCase.md`.

---

## 📌 Cấu trúc thư mục

```
04-workflows/
├── README.md                        ← File này
├── WF-Admin.md                      ← Toàn bộ workflow của Admin
├── WF-Employee.md                   ← Toàn bộ workflow của Nhân viên
├── WF-Customer.md                   ← Toàn bộ workflow của Khách hàng
└── flows/
    ├── WF-01-Login.md               ← Luồng đăng nhập (UC-01)
    ├── WF-02-CourtOperations.md     ← Luồng vận hành sân: mở/đóng/chuyển (UC-06,07,08,09)
    ├── WF-03-BookingManagement.md   ← Luồng đặt lịch & kiểm tra trùng (UC-10,11,12,13)
    ├── WF-04-Payment.md             ← Luồng thanh toán & hóa đơn (UC-18)
    ├── WF-05-CustomerManagement.md  ← Luồng quản lý khách hàng (UC-14,15)
    ├── WF-06-EmployeeManagement.md  ← Luồng quản lý nhân viên (UC-16)
    ├── WF-07-Accessories.md         ← Luồng phụ kiện & tồn kho (UC-17)
    └── WF-08-ReportsSettings.md     ← Luồng Dashboard & Cài đặt (UC-19,20,21)
```

---

## 👥 Tóm tắt Actors & Workflows

| Actor | Workflows chính |
|-------|----------------|
| **Admin** | Quản lý sân, Nhân viên, Cài đặt, Dashboard, Báo cáo |
| **Nhân viên (Employee)** | Mở/Đóng sân, Booking, Thanh toán, Quản lý khách hàng, Gọi phụ kiện |
| **Khách hàng (Customer)** | Đặt lịch, Xem lịch sử, Đổi mật khẩu |
| **Hệ thống (System)** | Kiểm tra trùng lịch, Tính tiền tự động, VietQR |

---

## 🔗 Tham chiếu
- `UseCase.md` — Đặc tả Use Case gốc
- `APIDesign.md` — Tài liệu thiết kế API
- `SRS.md` — Software Requirements Specification
