# WF-06 — Luồng Quản lý Nhân viên (UC-16)

**Actor:** Admin  
**Use Cases:** UC-16 (Quản lý nhân viên CRUD + phân quyền)

---

## A. Xem danh sách nhân viên

```
Admin
    │
    └─→ [GET /api/v1/employees]
              → Danh sách nhân viên kèm thông tin:
                - Tên tài khoản, Email
                - Vị trí (position), Ca làm (shift)
                - Ngày vào làm (hiredAt)
                - Role (employee)
```

---

## B. Tạo nhân viên mới (UC-16)

```
Admin
    │
    ├─→ [Trang Thêm nhân viên]
    │       Nhập: Username | Email | Mật khẩu tạm | Họ tên
    │             Vị trí (Lễ tân / Quản lý) | Ca làm | Ngày vào làm
    │
    ├─→ [POST /api/v1/employees]
    │         │ DB Transaction:
    │         ├─→ Kiểm tra username trùng → 400 nếu đã tồn tại
    │         ├─→ Tạo User { username, email, passwordHash, roleId = 'employee' }
    │         └─→ Tạo Employee { userId, position, shift, hiredAt }
    │
    └─→ Nhân viên có thể đăng nhập ngay
        (Nên yêu cầu đổi mật khẩu khi đăng nhập lần đầu — UC-04)
```

---

## C. Cập nhật thông tin nhân viên (UC-16)

```
Admin
    │
    ├─→ Chọn nhân viên → "Sửa thông tin"
    ├─→ Cập nhật: Vị trí | Ca làm | Email
    ├─→ [PUT /api/v1/employees/:id]
    └─→ Lưu thành công
```

---

## D. Xem nhật ký hoạt động (UC-16)

```
Admin
    │
    └─→ [GET /api/v1/employees/:id/activity-logs]
              → 100 bản ghi gần nhất:
                [Action] [Target Type] [Target ID] [Thời gian]
                VD:
                  - "open_court" | court | 3 | 14:02
                  - "checkout"   | session | 501 | 16:35
                  - "add_extra"  | session | 501 | 15:10
```

---

## E. Xóa nhân viên (UC-16)

```
Admin
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
Admin nhập thông tin
         │
         ▼
  Kiểm tra username trùng?
    ├─→ Có → Báo lỗi 400
    └─→ Không → Tiếp tục
         │
         ▼
  [DB Transaction]
    ├─→ Tạo User (bcrypt hash password)
    └─→ Tạo Employee (gắn userId)
         │
         ▼
  Nhân viên được tạo ✅
  → Có thể đăng nhập với Role 'employee'
```
