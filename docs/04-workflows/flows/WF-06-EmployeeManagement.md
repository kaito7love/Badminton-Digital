# WF-06 — Luồng Quản lý Nhân viên (UC-16)

**Actor:** Admin, `branch_manager`  
**Use Cases:** UC-16 (Quản lý nhân viên CRUD + phân quyền)

Toàn bộ `employeeRoutes.js` gắn `roleMiddleware(['admin', 'branch_manager'])`
ở cấp router (`router.use(...)`) — nghĩa là KHÔNG chỉ Admin: `branch_manager`
cũng quản lý được nhân viên, nhưng chỉ trong đúng chi nhánh của mình
(`branchContextMiddleware` khoá `branchId`); Admin thao tác trên chi nhánh
đang chọn ở bộ chuyển chi nhánh (xem `WF-Admin.md` §7). Vai trò `employee`
đơn thuần KHÔNG truy cập được bất kỳ endpoint nào trong file này — kể cả xem
danh sách đồng nghiệp.

---

## A. Xem danh sách nhân viên

```
Admin / branch_manager
    │
    └─→ [GET /api/v1/employees]
              → Danh sách nhân viên CỦA CHI NHÁNH ĐANG HOẠT ĐỘNG, kèm:
                - Họ tên, Email, SĐT (từ User)
                - Vị trí (position), Ca làm (shift)
                - Ngày vào làm (hiredAt)
                - Role (tên role gắn trên User — hiện luôn là 'employee',
                  xem ghi chú ở mục B)
```

---

## B. Tạo nhân viên mới (UC-16)

```
Admin / branch_manager
    │
    ├─→ [Trang Thêm nhân viên]
    │       Nhập: Họ tên * | Email * | SĐT * | Mật khẩu tạm (≥ 6 ký tự) *
    │             Vị trí (position, optional) | Ca làm (shift, optional)
    │             Ngày vào làm (hiredAt, optional — mặc định hôm nay)
    │
    ├─→ [POST /api/v1/employees] { fullName, email, phone, password, position?, shift?, hiredAt? }
    │         │ Validation (route, express-validator):
    │         │   password ≥ 6 ký tự; email đúng định dạng; fullName không rỗng;
    │         │   phone bắt buộc và phải hợp lệ → "Số điện thoại không hợp lệ"
    │         │
    │         │ DB Transaction — EmployeeService.createEmployee:
    │         ├─→ Email đã tồn tại (bảng users) → 400 "Email already exists"
    │         ├─→ Chuẩn hoá SĐT, SĐT đã có tài khoản khác → 409 "Số điện
    │         │       thoại này đã có tài khoản khác"
    │         ├─→ Tạo User { fullName, email, phone, passwordHash, roleId }
    │         │       — roleId LUÔN tra theo tên role **'employee'**, không
    │         │       nhận role từ payload; **không có cách nào tạo nhân
    │         │       viên với role `branch_manager` qua API/UI này** — muốn
    │         │       có `branch_manager` phải gán trực tiếp ở tầng dữ liệu
    │         │       (xem ghi chú cuối file)
    │         └─→ Tạo Employee { userId, branchId: chi nhánh đang hoạt động,
    │               position, shift, hiredAt }
    │
    └─→ Nhân viên có thể đăng nhập ngay bằng email hoặc SĐT vừa tạo
        (Nên yêu cầu đổi mật khẩu khi đăng nhập lần đầu — UC-04)
```

---

## C. Cập nhật thông tin nhân viên (UC-16)

```
Admin / branch_manager
    │
    ├─→ Chọn nhân viên → "Sửa thông tin"
    ├─→ Cập nhật: Vị trí | Ca làm | Email | SĐT
    ├─→ [PUT /api/v1/employees/:id]
    │         └─→ Đổi SĐT: validate lại định dạng, kiểm tra không trùng
    │               tài khoản khác (loại trừ chính nhân viên đang sửa) →
    │               409 "Số điện thoại này đã có tài khoản khác" nếu trùng
    └─→ Lưu thành công
```

---

## D. Xem nhật ký hoạt động (UC-16)

```
Admin / branch_manager
    │
    └─→ [GET /api/v1/employees/:id/activity-logs]
              → 100 bản ghi gần nhất, chỉ của nhân viên thuộc chi nhánh
                đang hoạt động:
                [Action] [Target Type] [Target ID] [Thời gian]
                VD:
                  - "court.session_opened" | court_session | 3   | 14:02
                  - "payment.completed"    | payment       | 501 | 16:35
```

---

## E. Xóa nhân viên (UC-16)

```
Admin / branch_manager
    │
    ├─→ [DELETE /api/v1/employees/:id]
    │         │ DB Transaction:
    │         ├─→ Xóa Employee record
    │         └─→ Xóa User account liên kết
    │
    └─→ Tài khoản không còn đăng nhập được
```

---

## F. Sơ đồ luồng tạo nhân viên

```
Admin/branch_manager nhập thông tin
         │
         ▼
  Email đã tồn tại? ──Có──► Báo lỗi 400 "Email already exists"
         │ Không
         ▼
  SĐT hợp lệ & chưa có tài khoản khác?
    ├─→ Không hợp lệ → 400 "Số điện thoại không hợp lệ"
    ├─→ Đã có tài khoản → 409 "Số điện thoại này đã có tài khoản khác"
    └─→ OK → Tiếp tục
         │
         ▼
  [DB Transaction]
    ├─→ Tạo User (bcrypt hash password, roleId = role 'employee')
    └─→ Tạo Employee (gắn userId, branchId = chi nhánh đang hoạt động)
         │
         ▼
  Nhân viên được tạo ✅ → Có thể đăng nhập với Role 'employee'
```

---

## Ghi chú vai trò `branch_manager`

Role `branch_manager` tồn tại trong bảng `roles`
(migration `20260815300002-add-branch-manager-role.js`, seed
`20260815300003-seed-branch-managers.js`) và **không phải chỉ là bí danh của
`employee`** — trong đúng file này, nó có quyền ngang Admin (giới hạn trong
chi nhánh của mình): quản lý toàn bộ nhân viên chi nhánh, thứ mà `employee`
hoàn toàn không được chạm vào. `branch_manager` cũng có thêm quyền CRUD định
nghĩa sân (WF-02) và xem báo cáo (WF-08) mà `employee` không có. Tuy vậy,
**không có luồng tạo nhân viên nào trong hệ thống gán được role
`branch_manager`** — `EmployeeService.createEmployee` hard-code role
`'employee'` cho mọi nhân viên tạo qua API này, nên hiện tại `branch_manager`
chỉ đến từ seed dữ liệu, chưa có giao diện/API để Admin tự phong một nhân
viên hiện có thành `branch_manager`.
