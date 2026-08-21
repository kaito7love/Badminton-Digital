# WF-Admin — Tổng hợp Workflow của Admin

**Actor:** Admin (Chủ sân / Quản trị viên)  
**Quyền hạn:** Toàn quyền hệ thống

---

## 🔐 1. Xác thực tài khoản

```
[Truy cập hệ thống]
       ↓
  Nhập SĐT hoặc email (1 ô "identifier") + mật khẩu
       ↓
  [POST /api/v1/auth/login] { identifier, password }
  ┌───────────────────────────────────────────────┐
  │ Có '@' → tra theo email                        │
  │ Toàn số → chuẩn hoá SĐT rồi tra theo phone      │
  │ bcrypt verify + kiểm tra isActive               │
  │ Hệ thống xác thực JWT (Access 15p, Refresh 7n) │
  └───────────────────────────────────────────────┘
       ↓ Thành công         ↓ Thất bại
  Vào Dashboard Admin    401 "Số điện thoại/email hoặc mật khẩu
                          không chính xác" / Thử lại
```

Sai định danh và sai mật khẩu trả về cùng 1 thông báo lỗi — không phân biệt
"chưa có tài khoản" với "sai mật khẩu". Tài khoản `isActive = false` báo riêng:
"Tài khoản bị khóa, vui lòng liên hệ Admin". Chi tiết đầy đủ (chuẩn hoá SĐT,
quên mật khẩu, đổi mật khẩu, refresh token) xem `flows/WF-01-Login.md`.

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
  └─→ [Trang Dịch Vụ & Kho — 4 tab]
           ├─→ [Sản phẩm] Danh mục dùng chung mọi chi nhánh (tên, giá,
           │       ngưỡng cảnh báo) + tồn kho hiển thị là của chi nhánh
           │       đang chọn (xem §7 — Chuyển chi nhánh)
           │       ├─→ [Thêm / Sửa / Xóa phụ kiện] — chỉ đổi tên/giá/
           │       │       ngưỡng, KHÔNG còn sửa tồn kho trực tiếp ở đây
           │       └─→ Sản phẩm mới luôn khởi tạo tồn kho = 0
           ├─→ [Nhập kho] Tạo phiếu nhập: chọn nhà cung cấp (tuỳ chọn) +
           │       nhiều dòng (sản phẩm, số lượng, đơn giá) → hệ thống
           │       cộng vào tồn kho chi nhánh và tính lại giá vốn bình
           │       quân gia quyền, sinh mã phiếu GR-{chi nhánh}-000000xx
           ├─→ [Lịch sử kho] Sổ nhật ký mọi biến động tồn kho (nhập,
           │       bán ra khi gọi phụ kiện, trả hàng, điều chỉnh tăng/
           │       giảm, hàng hỏng, thất lạc), lọc theo sản phẩm/loại/
           │       khoảng ngày; có nút "Điều chỉnh kho" thủ công (bắt
           │       buộc nhập lý do)
           └─→ [Nhà cung cấp] — riêng cho Admin: CRUD nhà cung cấp dùng
                   chung cho mọi chi nhánh khi tạo phiếu nhập kho
```

Chi tiết đầy đủ luồng nhập kho, giá vốn bình quân, và các loại giao dịch kho
xem `flows/WF-07-Accessories.md`.

Use Cases: UC-17

---

## 🛍️ 4b. Bán lẻ Dụng cụ (POS) — mới

```
Dashboard
  └─→ [Trang Bán Lẻ Dụng Cụ — 3 tab]
           ├─→ [Bán hàng] Quầy POS độc lập với luồng sân: chọn sản phẩm →
           │       giỏ hàng → giảm giá → thanh toán (tiền mặt/VietQR)
           ├─→ [Kho bán lẻ] Tồn kho ProductVariant theo chi nhánh đang
           │       chọn + form nhập kho (dùng chung phiếu nhập với phụ
           │       kiện — 1 phiếu có thể trộn cả 2 loại dòng)
           └─→ [Danh mục sản phẩm] — Admin/branch_manager mới thấy tab
                   này: CRUD danh mục, sản phẩm, biến thể (size/màu, SKU,
                   giá bán, ngưỡng cảnh báo)
```

Đây là hệ thống catalog RIÊNG với `Extra` ở mục 4 (vợt/áo/quần bán độc lập,
có biến thể size/màu, không gắn `CourtSession`) nhưng dùng chung 1 ledger
tồn kho (`stock_movements`) và 1 hạ tầng hóa đơn (`Invoice`/`Payment`) với
phụ kiện trong sân. Chi tiết đầy đủ xem `flows/WF-09-Retail.md`.

Use Cases: UC-24

---

## 📊 5. Dashboard & Báo cáo

```
Dashboard
  ├─→ Doanh thu hôm nay / tuần / tháng (biểu đồ) — gộp cả thuê sân + bán lẻ
  ├─→ Tổng số lượt khách
  ├─→ Tỷ lệ lấp đầy sân (Occupancy Rate)
  ├─→ Cảnh báo tồn kho thấp — gộp cả phụ kiện trong sân + sản phẩm bán lẻ
  ├─→ Top sân được thuê nhiều nhất
  ├─→ Top phụ kiện bán chạy (chỉ phụ kiện gọi trong sân, KHÔNG gồm bán lẻ)
  ├─→ [Báo cáo doanh thu chi tiết theo nguồn] — tách sân/phụ kiện trong
  │       sân/bán lẻ/giảm giá theo từng kỳ; Admin xem được kèm so sánh
  │       toàn chuỗi (`compareBranches=true`) — mới, chỉ có dữ liệu từ
  │       2026-08-16
  ├─→ [Đối chiếu nhập-bán-tồn kho] — so khớp sổ nhật ký kho với hóa đơn
  │       thật, phát hiện chênh lệch (kho đã trừ nhưng chưa có hóa đơn) —
  │       mới, gộp cả phụ kiện lẫn sản phẩm bán lẻ
  └─→ [Xuất báo cáo]
           ├─→ Xuất Excel (.xlsx)
           └─→ Xuất PDF
```

Hai báo cáo mới (doanh thu chi tiết, đối chiếu kho) chi tiết xem
`flows/WF-08-ReportsSettings.md` §D.1/D.2.

Use Cases: UC-19, UC-20, UC-25

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

---

## 🏢 7. Chuyển chi nhánh (Admin đa chi nhánh)

```
Admin đăng nhập
  ├─→ [Bộ chuyển chi nhánh] (chỉ Admin thấy — BranchContext, gọi
  │       GET /api/v1/branches, cũng chỉ role admin mới gọi được)
  ├─→ Lần đầu vào: mặc định chọn đúng chi nhánh gốc của Admin
  │       (user.employee.branchId), không đổi hành vi cũ
  ├─→ Chọn 1 chi nhánh khác trong danh sách
  │       └─→ Lưu localStorage (admin_selected_branch_id) → reload trang
  └─→ Từ đó mọi request gắn header X-Branch-Id = chi nhánh đã chọn
           └─→ branchContextMiddleware xác thực branch còn active,
               gán req.branchId — mọi API branch-scoped (sân, đặt sân,
               phụ kiện/tồn kho, báo cáo...) trả về đúng dữ liệu của
               chi nhánh đó
```

Nhân viên (`employee`, `branch_manager`) không có bộ chuyển này — luôn bị
khoá vào đúng chi nhánh của mình; nếu tự gửi `X-Branch-Id` khác, API chặn
403 "Nhân viên không được phép thao tác tại chi nhánh này." Chỉ `admin` được
gửi `X-Branch-Id` bất kỳ vì quản lý cả chuỗi.
