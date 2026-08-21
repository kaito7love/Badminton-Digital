# User Workflows — Badminton Digital Management

Thư mục này mô tả chi tiết các luồng thao tác (**User Workflows**) mà từng vai trò người dùng có thể thực hiện trong hệ thống, dựa trên `UseCase.md`.

Hệ thống hiện là đa chi nhánh (Branch/`X-Branch-Id`, Admin chuyển được chi
nhánh xem/thao tác, nhân viên và `branch_manager` bị khoá vào chi nhánh của
mình) và có thêm module quản lý kho hàng (nhà cung cấp, phiếu nhập kho, sổ
nhật ký xuất/nhập) — xem `WF-Admin.md` §7 và `flows/WF-07-Accessories.md`.
Từ 2026-08-16 hệ thống có thêm trụ kinh doanh thứ 2 — **bán lẻ dụng cụ tại
quầy** (POS độc lập với luồng thuê sân, catalog `Product`/`ProductVariant`
riêng) và 2 báo cáo nhìn xuyên cả 2 trụ (doanh thu chi tiết theo nguồn, đối
chiếu nhập-bán-tồn kho) — xem `flows/WF-09-Retail.md` và
`flows/WF-08-ReportsSettings.md` §D.1/D.2.

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
    ├── WF-08-ReportsSettings.md     ← Luồng Dashboard & Cài đặt (UC-19,20,21,25)
    └── WF-09-Retail.md              ← Luồng bán lẻ dụng cụ & POS (UC-24) — mới
```

---

## 👥 Tóm tắt Actors & Workflows

| Actor | Workflows chính |
|-------|----------------|
| **Admin** | Quản lý sân, Nhân viên, Cài đặt, Dashboard, Báo cáo, Nhà cung cấp, catalog bán lẻ, chuyển đổi chi nhánh xem/thao tác |
| **`branch_manager`** | Như Nhân viên, cộng thêm: CRUD sân, quản lý Nhân viên, xem Dashboard/Báo cáo, quản lý catalog bán lẻ — giới hạn trong chi nhánh của mình |
| **Nhân viên (Employee)** | Mở/Đóng sân, Booking, Thanh toán, Quản lý khách hàng, Gọi phụ kiện, Nhập kho & điều chỉnh kho, bán hàng tại quầy (POS bán lẻ) |
| **Khách hàng (Customer)** | Đặt lịch, Xem lịch sử (toàn chuỗi), Đổi mật khẩu, Tự đăng ký |
| **Hệ thống (System)** | Kiểm tra trùng lịch, Tính tiền tự động, VietQR |

---

## 🔗 Tham chiếu
- `UseCase.md` — Đặc tả Use Case gốc
- `APIDesign.md` — Tài liệu thiết kế API
- `SRS.md` — Software Requirements Specification
