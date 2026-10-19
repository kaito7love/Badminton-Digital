# WF-Admin — Tổng hợp Workflow của Admin

**Actor:** Admin (Chủ sân / Quản trị viên)  
**Quyền hạn:** Toàn quyền hệ thống
**Cập nhật:** 18/10/2026 (khớp `UseCase.md` v1.3; mục 4b, 6, 8–11 được sửa hoặc thêm)

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
quên mật khẩu, đổi mật khẩu, xoay vòng refresh token, giới hạn 10 lần/15 phút/IP) xem `flows/WF-01-Login.md`.

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
           ├─→ [Bật/Tắt bảo trì]
           │       └─→ Sân chuyển trạng thái "Maintenance"
           │            (rời "active" cần: không có phiên đang mở, không còn lịch sắp tới)
           └─→ [Sơ đồ mặt bằng] (/courts/layout — Admin và quản lý chi nhánh)
                   └─→ Kéo thả sân và vùng (bãi xe…) lên khung, lưu → khách thấy ở
                       trang Đặt sân và trang chủ
```

Sơ đồ mặt bằng được lưu thành **file** `backend/public/layouts/branch-<id>.json` (không phải CSDL): trên Render mất khi deploy lại và quay về ba file mặc định; compose có volume giữ lại.

Use Cases: UC-05, UC-09

---

## 👨‍💼 3. Quản lý Nhân viên

```
Dashboard
  └─→ [Trang Nhân viên]
           ├─→ Xem danh sách nhân viên
           ├─→ [Thêm nhân viên]
           │       └─→ Tạo tài khoản User (họ tên, SĐT hoặc email, mật khẩu đạt chính sách)
           │             → Gán Role "employee"
           │             → Tạo hồ sơ Employee (chi nhánh, vị trí, ca làm)
           ├─→ [Sửa thông tin / phân quyền]
           │       └─→ Cập nhật vị trí, ca làm, email
           ├─→ [Xóa nhân viên]
           │       └─→ Xóa User + Employee record
           └─→ [Xem nhật ký hoạt động]
                   └─→ Lịch sử thao tác của nhân viên (activity_logs)
```

`branch_manager` cũng vào được trang này nhưng chỉ quản lý tài khoản `employee` trong chi nhánh của mình. Không ai xoá được tài khoản `admin` hoặc chính mình.

Use Cases: UC-16

---

## 📦 4. Quản lý Phụ kiện & Tồn kho

```
Dashboard
  └─→ [Trang Dịch Vụ & Kho — 4 tab: Sản phẩm · Nhập kho · Lịch sử kho · Nhà cung cấp]
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
  └─→ [Trang Bán Lẻ Dụng Cụ — 4 tab: Bán hàng · Kho bán lẻ · Danh mục sản phẩm · Mã giảm giá]
           ├─→ [Bán hàng] Quầy POS độc lập với luồng sân: chọn sản phẩm →
           │       giỏ hàng → mã giảm giá / giảm giá tay (kèm lý do) → thanh toán (tiền mặt/VietQR)
           ├─→ [Kho bán lẻ] Tồn kho ProductVariant theo chi nhánh đang
           │       chọn + form nhập kho (dùng chung phiếu nhập với phụ
           │       kiện — 1 phiếu có thể trộn cả 2 loại dòng)
           ├─→ [Danh mục sản phẩm] — Admin/branch_manager mới thấy tab
           │       này: CRUD nhóm hàng, sản phẩm, biến thể (size/màu, SKU,
           │       giá bán, ngưỡng cảnh báo)
           └─→ [Mã giảm giá] — Admin/branch_manager: tạo mã (% có trần hoặc
                   số tiền cố định, giá trị đơn tối thiểu, thời hạn, tổng lượt
                   và lượt mỗi khách), xem trước mức giảm, ngừng áp dụng. Mã
                   dùng cho POS và đơn online, KHÔNG dùng cho tiền sân
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
  │       toàn chuỗi (`compareBranches=true`; `branch_manager` bị ép về
  │       chi nhánh mình) — chỉ có dữ liệu từ 2026-08-16
  ├─→ [Đối chiếu nhập-bán-tồn kho] — so khớp sổ nhật ký kho với hóa đơn
  │       thật, phát hiện chênh lệch (kho đã trừ nhưng chưa có hóa đơn) —
  │       gộp cả phụ kiện lẫn sản phẩm bán lẻ
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
           ├─→ [Giờ mở cửa] — giờ nhận đặt sân (mặc định 05:00–23:00); khách
           │       không đặt được ngoài khung này
           ├─→ [Giá khung giờ] — giá cao điểm / thấp điểm, khung cao điểm
           └─→ [Nhân viên giảm giá tay tối đa] — trần % (mặc định 10)
```

Giá phụ kiện sửa ở trang Dịch Vụ & Kho (`PUT /accessories/:id`). Hai chính sách `booking_policy` (giữ chỗ: tối đa lịch khách giữ, hạn tự huỷ lịch chưa duyệt) và `notification_policy` (gửi thêm email thông báo) **chưa có màn hình**, chỉnh bằng `PUT /settings`; giá trị mặc định ở `APIDesign.md` §11.

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

---

## 🧾 8. Nhật ký hoạt động (mới)

```
Dashboard → [Nhật ký hoạt động] (Admin và quản lý chi nhánh)
       ↓
  Lọc theo hành động, loại đối tượng, khoảng ngày (cắt theo giờ chi nhánh), phân trang
       ↓
  Mỗi dòng: ai làm, làm gì, trên đối tượng nào, giá trị trước/sau, mã truy vết yêu cầu
```

Ghi lại các thao tác nhạy cảm: mở/đóng sân, huỷ/tự huỷ lịch, giảm giá tay, thanh toán, **webhook bị từ chối** (kèm lý do và số tiền — nơi để quầy phát hiện tiền về sau khi đơn đã huỷ), gộp hồ sơ khách, huỷ hoá đơn, huỷ đơn POS. Không bao giờ chứa mật khẩu hay token.

---

## 🧯 9. Huỷ hoá đơn đã thanh toán (void) (mới)

```
Mở hoá đơn đã thanh toán → "Huỷ hoá đơn" → nhập LÝ DO (bắt buộc) → xác nhận
       ↓
  Hoá đơn → void, thanh toán → refunded, trừ lại tổng chi tiêu của khách,
  hoàn kho hàng bán lẻ của đơn, ghi nhật ký; lịch đặt vẫn "completed"
```

Dành cho Admin và quản lý chi nhánh (nhân viên không có quyền). Chỉ huỷ trọn hoá đơn, không hoàn từng dòng; hoàn tiền thực tế cho khách do quầy làm thủ công. Hoá đơn chưa thanh toán → 400, đã void → 409. Use Cases: UC-30.

---

## 🏆 10. Quản lý thi đấu (mới)

```
Dashboard → menu "Thi đấu" (hiện khi dịch vụ thi đấu bật)
       ├─→ Giải đấu: tạo giải (3 thể thức), nhận đăng ký, bốc thăm, sơ đồ, chốt / huỷ chốt giải
       ├─→ Buổi giao lưu: điểm danh, xếp sân trống, ghép cặp, đóng buổi
       ├─→ Bấm điểm trực tiếp và màn hình TV
       ├─→ Người chơi: chấm trình, xác nhận điểm tạm, chỉnh điểm trình (quản lý/Admin)
       └─→ Bảng xếp hạng
```

Admin và quản lý chi nhánh có thêm quyền tạo và chốt giải, chấm trình mọi người và chỉnh điểm. Dịch vụ thi đấu là hệ thống riêng với CSDL riêng; chi tiết: `UseCase.md` UC-31 và `services/competition-service/docs/`.

---

## 🛠️ 11. Việc vận hành dành cho người cài đặt hệ thống

- **Chuyển khoản:** chỉ bật khi đủ 4 biến `PAYMENT_*`; chưa đủ thì checkout sân, POS, đơn online từ chối "chuyển khoản" và trang khách ẩn lựa chọn này (`GET /public/branches` báo `transferEnabled: false`).
- **Thi đấu:** chỉ bật khi đủ 5 biến `COMPETITION_*` (`npm run competition:keys`); thiếu thì menu tự ẩn.
- **Admin đầu tiên của bản chạy thật:** `npm run create-admin`; không seed dữ liệu demo (mật khẩu công khai).
- **Trang tài liệu API** `/api-docs` tắt mặc định ở production (`ENABLE_API_DOCS=true` để bật).
- Hướng dẫn đầy đủ: `DeploymentGuide.md`.
