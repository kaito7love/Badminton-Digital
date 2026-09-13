# WF-05 — Luồng Quản lý Khách hàng (UC-14, UC-15)

**Actors:** Nhân viên, `branch_manager`, Admin (CRUD dùng chung toàn chuỗi), Khách hàng (xem hồ sơ + lịch sử của chính mình)
**Use Cases:** UC-14 (Quản lý khách hàng CRUD), UC-15 (Xem lịch sử & chi tiêu)

---

## Thay đổi mô hình dữ liệu (từ merge "hợp nhất khách hàng toàn chuỗi")

Trước merge này, `customers` có cột `branch_id` — mỗi khách hàng thuộc về
đúng 1 chi nhánh, và cùng một số điện thoại ghé 2 chi nhánh khác nhau sẽ tạo
ra 2 hồ sơ tách biệt, lịch sử chi tiêu/hạng hội viên bị chẻ đôi. Migration
`20260815300001-unify-customers-chain-wide.js` đã gộp các hồ sơ trùng SĐT
(có kiểm tra cẩn thận để không gộp nhầm 2 khách khác nhau vô tình trùng SĐT —
xem commit `61e51dd`) và xóa hẳn cột `branch_id`. Từ nay:

| | Trước | Từ merge này |
|---|---|---|
| Phạm vi 1 hồ sơ Customer | 1 chi nhánh | Toàn chuỗi — 1 SĐT = 1 hồ sơ duy nhất ở mọi chi nhánh |
| `GET /api/v1/customers` (danh sách/tìm kiếm) | Lọc theo chi nhánh đang hoạt động | **Không lọc theo chi nhánh** — trả về toàn bộ khách hàng của cả chuỗi |
| Lịch sử chơi/đặt lịch (`/:id/history`) | Chỉ sessions/bookings của chi nhánh đó | Gộp **mọi chi nhánh** khách từng chơi (session/booking bản thân vẫn có `branchId` riêng, nhưng câu truy vấn không lọc theo `req.branchId`) |
| Khách vãng lai có SĐT (mở sân/booking) | Gộp trong cùng chi nhánh | Gộp vào hồ sơ đã có ở **bất kỳ** chi nhánh nào (`CustomerService.resolveWalkIn`) |
| `totalSpent` / `loyaltyTier` | Tính theo chi nhánh | Cộng dồn **toàn chuỗi** — khách chơi ở chi nhánh nào cũng lên cùng 1 hạng hội viên |

Hệ quả trực tiếp: nhân viên đăng nhập ở chi nhánh A giờ nhìn thấy đầy đủ danh
sách khách hàng của TẤT CẢ chi nhánh trong `GET /api/v1/customers`, không chỉ
khách từng ghé chi nhánh A. Đây là hành vi có chủ đích (khách hàng là thực thể
dùng chung), không phải lỗi thiếu filter.

---

## A. Tìm kiếm khách hàng

```
Nhân viên / branch_manager / Admin
    │
    └─→ [GET /api/v1/customers?search=Nguyễn]
              → CustomerService.getAllCustomers — KHÔNG nhận/áp branchId
              → Tìm theo tên / SĐT / email (LIKE %search%), toàn chuỗi
              → Trả về danh sách + loyaltyTier + totalSpent (đã là số liệu
                 cộng dồn toàn chuỗi, không phải riêng chi nhánh hiện tại)
```

Chỉ `['admin', 'branch_manager', 'employee']` gọi được danh sách này
(`roleMiddleware` trên `GET /`); khách hàng không tự liệt kê được khách khác.

Hồ sơ tại quầy (chưa gắn tài khoản, có SĐT) mà số đó đã có tài khoản khách tự đăng ký
nhưng chưa gộp được trả kèm `pendingAccount: { customerId, fullName, registeredAt }` —
màn Khách hàng hiện nhãn "Có tài khoản online chưa gộp" và nút "Gộp vào tài khoản"
(mục F).

---

## B. Thêm khách hàng mới (UC-14)

```
Nhân viên / branch_manager / Admin
    │
    ├─→ Nhập: Họ tên * | SĐT * | Email (optional) | Mật khẩu (optional)
    │
    ├─→ [POST /api/v1/customers] { fullName, phone, email?, password? }
    │         │
    │         ├─→ Chuẩn hoá SĐT, kiểm tra trùng trên TOÀN CHUỖI
    │         │       → đã có hồ sơ → 400 "Số điện thoại này đã có hồ sơ khách hàng"
    │         │
    │         ├─→ Không có `password` → chỉ tạo hồ sơ Customer (không tài
    │         │       khoản đăng nhập); khách tự đăng ký sau bằng đúng SĐT
    │         │       này (WF-01-Login.md) thì tài khoản nhận hồ sơ riêng —
    │         │       nhân viên xác minh rồi gộp lịch sử (mục F)
    │         │
    │         └─→ Có `password` → DB Transaction: kiểm tra SĐT/email chưa
    │                 dùng cho tài khoản đăng nhập nào khác (409 "Số điện
    │                 thoại này đã có tài khoản đăng nhập" / "Email này đã
    │                 được dùng cho tài khoản khác") → tạo User (role
    │                 `customer`) + Customer gắn `userId` cùng lúc — nhân
    │                 viên lập tài khoản đăng nhập hộ khách ngay tại quầy
    │
    └─→ Thành công → Hiển thị profile khách hàng mới { loyaltyTier: 'normal', totalSpent: 0 }
```

---

## C. Cập nhật thông tin khách hàng (UC-14)

```
Nhân viên / branch_manager / Admin
    │
    ├─→ Tìm khách → Chọn "Sửa thông tin"
    ├─→ Cập nhật: Tên | SĐT | Email  (totalSpent/loyaltyTier/userId KHÔNG
    │       sửa được qua form này — chỉ PaymentService mới được cộng dồn,
    │       xem WF-04)
    │
    ├─→ [PUT /api/v1/customers/:id]
    │         ├─→ Đổi SĐT trùng khách khác (toàn chuỗi) → 400 "Số điện
    │         │       thoại này đã thuộc về khách hàng khác"
    │         └─→ Khách đã gắn tài khoản đăng nhập (`customer.userId`):
    │                 đổi SĐT ở đây ĐỒNG BỘ luôn sang `users.phone` (SĐT là
    │                 danh tính đăng nhập) — nếu SĐT mới đã có tài khoản
    │                 khác dùng → 409 "Số điện thoại này đã có tài khoản
    │                 đăng nhập khác"
    │
    └─→ Lưu thành công
```

---

## D. Xem lịch sử chơi & chi tiêu (UC-15)

```
Nhân viên / branch_manager / Admin / Khách hàng (chỉ hồ sơ của chính mình)
    │
    └─→ [GET /api/v1/customers/:id/history]
              │
              ├─→ Thông tin cá nhân:
              │     Tên, SĐT, Email, Hạng hội viên, Tổng chi tiêu (toàn chuỗi)
              │
              ├─→ Lịch sử phiên chơi (CourtSessions) — GỘP TỪ MỌI CHI NHÁNH
              │     khách từng chơi, không lọc theo chi nhánh đang hoạt động:
              │     [Chi nhánh] [Sân] [Ngày] [Thời gian] [Tiền sân] [Phụ kiện] [Tổng]
              │
              └─→ Lịch sử đặt lịch (Bookings) — cũng gộp mọi chi nhánh:
                    [Chi nhánh] [Sân] [Ngày đặt] [Khung giờ] [Trạng thái]
```

Khách hàng tự xem hồ sơ/lịch sử của người khác → 403 "Bạn không có quyền
truy cập khách hàng này" (`CustomerService.assertOwnership`). Đây là kiểm
tra DUY NHẤT cho `GET /:id` và `/:id/history` — hai endpoint này không đòi
role cụ thể ở tầng route, chỉ cần đã đăng nhập.

Khi chính khách xem hồ sơ của mình mà hồ sơ chưa mang SĐT (đăng ký trùng số với một hồ
sơ tại quầy chưa gộp — xem WF-01-Login.md), `phone` trả về là SĐT của tài khoản. Tài
khoản khách gửi `X-Branch-Id` bị 403 ở cả hai endpoint.

> Vì lịch sử không còn lọc theo chi nhánh, UI nên hiển thị cột "Chi nhánh"
> trên mỗi dòng session/booking để nhân viên phân biệt được đâu là lượt chơi
> tại chi nhánh mình, đâu là chi nhánh khác — tài liệu cũ (trước merge) không
> có cột này vì khi đó lịch sử vốn đã chỉ gồm 1 chi nhánh.

---

## E. Xóa khách hàng (UC-14 — Admin only)

```
Admin
    │
    ├─→ [DELETE /api/v1/customers/:id]
    └─→ Xác nhận → Soft-delete Customer record (model `paranoid: true` —
          bản ghi không mất hẳn, chỉ ẩn khỏi các truy vấn thường)
```

Chỉ `['admin']` gọi được — khác với xem/tạo/sửa (`admin`/`branch_manager`/
`employee`), xóa khách hàng KHÔNG mở cho `branch_manager`. Vì Customer dùng
chung toàn chuỗi, đây thực chất là xóa khỏi cả hệ thống chứ không phải khỏi
riêng 1 chi nhánh — hợp lý khi giới hạn về đúng 1 vai trò cao nhất.

---

## F. Gộp hồ sơ tại quầy vào tài khoản online (từ 13/09/2026)

Đăng ký online không tự nhận hồ sơ tại quầy trùng SĐT (WF-01-Login.md): hệ thống chưa
xác minh được người đăng ký có đúng là chủ số, gắn tự động là trao lịch sử chơi, tổng
chi tiêu và mọi buổi quầy nhập số đó về sau cho bất kỳ ai biết số. Việc gộp chuyển về
quầy:

```
Nhân viên / branch_manager / Admin
    │
    ├─→ Tìm khách theo SĐT → hồ sơ có nhãn "Có tài khoản online chưa gộp"
    │       (GET /customers trả `pendingAccount`)
    │
    ├─→ Xác minh người trước mặt vừa là chủ số vừa là chủ tài khoản
    │       (ví dụ khách mở app đang đăng nhập bằng số đó)
    │
    ├─→ Bấm "Gộp vào tài khoản" → hộp xác nhận nhắc lại bước xác minh
    │
    └─→ [POST /api/v1/customers/:id/merge-into-account] { accountCustomerId }
              │  (một transaction)
              ├─→ Khoá hai hồ sơ. Điều kiện: hồ sơ tại quầy chưa gắn tài khoản và
              │     có SĐT; hồ sơ đích thuộc tài khoản `customer`, chưa mang SĐT,
              │     SĐT đăng nhập trùng SĐT hồ sơ tại quầy → sai: 400;
              │     hồ sơ tại quầy đã gộp/đã gắn tài khoản: 409
              ├─→ Chuyển court_sessions, bookings, sales_orders sang hồ sơ tài
              │     khoản (kể cả dòng đã xoá mềm)
              ├─→ Cộng totalSpent, tính lại loyaltyTier (utils/loyalty.js)
              ├─→ Gỡ SĐT khỏi hồ sơ cũ rồi gắn sang hồ sơ tài khoản (phone unique);
              │     lấy email cũ nếu tài khoản chưa có; xoá mềm hồ sơ cũ
              └─→ Nhật ký `customer.merged` (người làm, hai hồ sơ, số dòng mỗi
                    bảng, tổng chi tiêu trước/sau)
```

Mọi nhân viên đều gộp được vì việc xác minh diễn ra tại quầy; khách gọi route này → 403.

**Còn hở:** kẻ gian đăng ký trước bằng một số *chưa từng* ra quầy thì hồ sơ tài khoản mang
luôn số đó, và lần đầu chủ số thật ra quầy sẽ rơi vào tài khoản kẻ gian. Chặn hẳn cần xác
minh số bằng OTP SMS — chưa làm.
