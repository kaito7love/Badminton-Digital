# 🏸 Badminton Digital Management — Frontend

> **Giao diện quản trị & đặt sân khách hàng** cho hệ thống quản lý sân cầu lông số hoá, xây dựng bằng **React + Vite + TailwindCSS**.

---

## 📋 Mục lục

- [Tổng quan](#tổng-quan)
- [Tech Stack](#tech-stack)
- [Cấu trúc thư mục](#cấu-trúc-thư-mục)
- [Trang & Tính năng](#trang--tính-năng)
- [Cài đặt & Chạy](#cài-đặt--chạy)
- [Biến môi trường](#biến-môi-trường)
- [Kiến trúc ứng dụng](#kiến-trúc-ứng-dụng)
- [Routing & Phân quyền](#routing--phân-quyền)
- [Scripts](#scripts)

---

## Tổng quan

Đây là SPA (Single Page Application) phục vụ cả bàn làm việc quản trị viên/nhân viên lẫn khách hàng tự đặt sân (trang chủ công khai, đăng ký, đặt sân, xem lịch sử của mình). Giao diện kết nối trực tiếp với [Backend API](../backend/README.md) thông qua Axios.

Các tính năng chính:

- 🔐 **Đăng nhập / Xác thực** — đăng nhập bằng số điện thoại hoặc email (`identifier`), tự đăng ký tài khoản khách hàng, quên/đặt lại mật khẩu, JWT với tự động refresh token
- 🏢 **Đa chi nhánh** — Admin chuyển đổi chi nhánh đang thao tác qua bộ chuyển chi nhánh (`BranchContext`)
- 🏟️ **Quản lý sân** — Xem trạng thái, mở/đóng/chuyển sân
- 📅 **Quản lý đặt sân** — Danh sách booking, xác nhận, huỷ
- 🎒 **Phụ kiện & Kho hàng** — Danh mục phụ kiện, nhà cung cấp, phiếu nhập kho, sổ nhật ký xuất/nhập, điều chỉnh tồn kho theo chi nhánh
- 👥 **Khách hàng** — Danh sách, lịch sử đặt sân
- 👨‍💼 **Nhân viên** — CRUD nhân viên, activity logs
- 📊 **Báo cáo** — Dashboard doanh thu, biểu đồ thống kê (Recharts)
- ⚙️ **Cài đặt** — Giá, giờ hoạt động, thương hiệu
- 🌙 **Dark / Light mode** — Chuyển đổi theme, lưu localStorage

---

## Tech Stack

| Thành phần      | Công nghệ                         |
|-----------------|-----------------------------------|
| Framework       | React `^18.3`                     |
| Build Tool      | Vite `^5.3`                       |
| Routing         | React Router DOM `^6.24`          |
| HTTP Client     | Axios `^1.7`                      |
| Styling         | TailwindCSS `^3.4` + class-based dark mode |
| Charts          | Recharts `^2.12`                  |
| Font            | Inter (Google Fonts)              |
| Testing         | Vitest `^2.0`                     |

---

## Cấu trúc thư mục

```
frontend/
├── index.html              # HTML entry point (font Inter, title, root div)
├── vite.config.js          # Vite config: port 5173, proxy /api → localhost:5000
├── tailwind.config.js      # TailwindCSS: dark mode 'class', màu brand xanh
├── postcss.config.js
├── .env.example            # Mẫu biến môi trường
└── src/
    ├── main.jsx            # Entry React: mount App với Providers
    ├── App.jsx             # Root component
    ├── index.css           # Global styles
    ├── assets/             # Ảnh, icon tĩnh
    ├── components/         # Shared UI components (đang phát triển)
    ├── constants/          # Hằng số dùng chung
    ├── contexts/
    │   ├── AuthContext.jsx     # Context xác thực: login, logout, user state
    │   ├── ThemeContext.jsx    # Context theme: dark/light toggle
    │   └── BranchContext.jsx   # Context đa chi nhánh: danh sách + chi nhánh admin đang chọn
    ├── hooks/              # Custom React hooks
    ├── layouts/
    │   ├── SidebarLayout.jsx   # Layout chính: sidebar + main content
    │   └── icons.jsx           # SVG icon components
    ├── pages/
    │   ├── Home/            # Trang chủ công khai (landing, danh sách sân)
    │   ├── Login/
    │   │   ├── LoginPage.jsx           # Đăng nhập (số điện thoại hoặc email)
    │   │   ├── RegisterPage.jsx        # Khách hàng tự đăng ký
    │   │   ├── ForgotPasswordPage.jsx  # Yêu cầu email đặt lại mật khẩu
    │   │   └── ResetPasswordPage.jsx   # Đặt mật khẩu mới bằng token từ email
    │   ├── MyBookings/      # Đặt sân & lịch sử của khách hàng
    │   ├── Dashboard/      # Tổng quan, thống kê
    │   ├── Courts/         # Quản lý sân
    │   ├── Bookings/       # Quản lý đặt sân
    │   ├── Accessories/    # Danh mục phụ kiện, nhà cung cấp, nhập kho, lịch sử kho (nhiều tab)
    │   ├── Customers/      # Quản lý khách hàng
    │   ├── Employees/      # Quản lý nhân viên
    │   ├── Reports/        # Báo cáo & thống kê
    │   ├── History/        # Lịch sử
    │   └── Settings/       # Cài đặt hệ thống
    ├── routes/
    │   ├── AppRoutes.jsx       # Cấu hình tất cả routes
    │   └── ProtectedRoute.jsx  # Chặn theo đăng nhập, tuỳ chọn theo danh sách vai trò (`roles` prop)
    ├── services/
    │   └── apiClient.js        # Axios instance: interceptor token, auto refresh, gắn header X-Branch-Id
    └── utils/
        └── roles.js         # Khai báo vai trò, trang chủ theo vai trò, điều hướng sau đăng nhập (nguồn xác thực duy nhất cho route/nav/login)
```

---

## Trang & Tính năng

| Đường dẫn         | Trang          | Mô tả                                          | Vai trò |
|-------------------|----------------|--------------------------------------------------|---------|
| `/`               | Home           | Trang chủ công khai (danh sách sân, giới thiệu) | ❌ (public) |
| `/login`          | Login          | Đăng nhập bằng `identifier` (số điện thoại hoặc email) + mật khẩu | ❌ |
| `/register`       | Register       | Khách hàng tự đăng ký tài khoản                 | ❌ |
| `/forgot-password`| ForgotPassword | Gửi email đặt lại mật khẩu                      | ❌ |
| `/reset-password` | ResetPassword  | Đặt mật khẩu mới bằng token từ email            | ❌ |
| `/my-bookings`    | MyBookings     | Đặt sân & xem lịch sử của bản thân              | `customer` |
| `/dashboard`      | Dashboard      | Tổng quan: KPIs, biểu đồ doanh thu, top sân    | `admin`, `branch_manager` |
| `/courts`         | Courts         | Danh sách sân, trạng thái, mở/đóng/bảo trì     | `admin`, `branch_manager`, `employee` |
| `/bookings`       | Bookings       | Danh sách đặt sân, xác nhận, huỷ               | `admin`, `branch_manager`, `employee` |
| `/accessories`    | Accessories    | Danh mục phụ kiện, nhà cung cấp, nhập kho, lịch sử/điều chỉnh kho | `admin`, `branch_manager`, `employee` |
| `/customers`      | Customers      | Danh sách khách hàng, lịch sử đặt sân          | `admin`, `branch_manager`, `employee` |
| `/history`        | History        | Lịch sử phiên chơi                              | `admin`, `branch_manager`, `employee` |
| `/employees`      | Employees      | Quản lý nhân viên, activity logs                | `admin`, `branch_manager` |
| `/reports`        | Reports        | Báo cáo doanh thu, top sân, top phụ kiện       | `admin`, `branch_manager` |
| `/settings`       | Settings       | Giá, giờ hoạt động, thông tin thương hiệu      | `admin` |
| `/*`              | —              | Redirect về `/` (catch-all)                      | —    |

> Vai trò không đủ vào 1 route bị `ProtectedRoute` đưa thẳng về trang chủ đúng
> vai trò của họ (`homePathForRole` trong `utils/roles.js`) thay vì render rồi
> nhận 403 từ API. `/courts`, `/bookings`, `/accessories`, `/customers`,
> `/history` dùng chung `StaffLayout` (bọc `roles={STAFF_ROLES}` = `['admin',
> 'branch_manager', 'employee']`).

---

## Cài đặt & Chạy

### Yêu cầu

- Node.js >= 18
- Backend API đang chạy (mặc định `http://localhost:5000`)

### Các bước

```bash
# 1. Cài dependencies
npm install

# 2. Tạo file .env từ mẫu
cp .env.example .env
# Chỉnh sửa VITE_API_BASE_URL nếu backend chạy ở port khác

# 3. Chạy dev server
npm run dev
```

Ứng dụng sẽ chạy tại: `http://localhost:5173`

> ⚡ Vite sẽ tự động proxy mọi request `/api/*` sang `http://localhost:5000` — không cần CORS khi dev.

### Build production

```bash
npm run build     # Output vào thư mục dist/
npm run preview   # Preview bản build
```

---

## Biến môi trường

Tạo file `.env` từ `.env.example`:

```env
# URL gốc của Backend API
VITE_API_BASE_URL=http://localhost:5000/api/v1
```

> **Lưu ý**: Mọi biến môi trường trong Vite phải có tiền tố `VITE_` để có thể truy cập từ `import.meta.env`.

---

## Kiến trúc ứng dụng

### Luồng xác thực (Authentication Flow)

```
[Login Page] — nhập identifier (số điện thoại hoặc email) + password
     │
     ▼
AuthContext.login(identifier, password)
     │
     ├─ POST /api/v1/auth/login { identifier, password }
     │        │
     │        └─ Nhận accessToken + refreshToken + userInfo
     │
     ├─ Lưu vào localStorage:
     │     access_token, refresh_token, user_info
     │
     └─ Redirect → redirectAfterLogin(user, from) [utils/roles.js]
              về đúng trang đang dở việc (nếu hợp lệ với vai trò),
              ngược lại về homePathForRole(user):
                admin/branch_manager → /dashboard
                employee             → /courts
                customer             → /my-bookings
```

Khách hàng có thể tự tạo tài khoản ở `/register` (`AuthContext.register`,
gọi `POST /api/v1/auth/register`) thay vì được admin tạo qua `/employees`.

### Tự động làm mới token (Auto Refresh)

Khi API trả về `401 Unauthorized`, `apiClient` tự động:
1. Gọi `POST /api/v1/auth/refresh-token` với `refreshToken` từ localStorage
2. Lưu `accessToken` mới vào localStorage
3. Thực hiện lại request gốc với token mới
4. Nếu refresh cũng thất bại → xoá toàn bộ token, redirect về `/login`

### Provider Tree

```
<ThemeProvider>
  <AuthProvider>
    <BranchProvider>
      <AppRoutes>
        <ProtectedRoute>
          <SidebarLayout>
            <Page />
          </SidebarLayout>
        </ProtectedRoute>
      </AppRoutes>
    </BranchProvider>
  </AuthProvider>
</ThemeProvider>
```

`BranchProvider` (`contexts/BranchContext.jsx`) chỉ tải danh sách chi nhánh
khi `user` là `admin`; chi nhánh admin đang chọn được lưu ở
`localStorage['admin_selected_branch_id']` và đổi chi nhánh sẽ reload toàn
trang để mọi màn hình fetch lại dữ liệu đúng ngữ cảnh mới.

### API Client

File `src/services/apiClient.js` tạo một Axios instance với:
- **Base URL**: lấy từ `VITE_API_BASE_URL` hoặc fallback `/api/v1`
- **Request interceptor**: tự động đính kèm `Authorization: Bearer <token>`;
  nếu admin đã chọn chi nhánh (`localStorage['admin_selected_branch_id']`)
  thì đính kèm thêm header `X-Branch-Id` — nhân viên/quản lý chi nhánh không
  set giá trị này nên không gửi header, backend tự suy ra chi nhánh từ hồ sơ
  nhân viên của họ
- **Response interceptor**: xử lý 401, tự động refresh token

---

## Routing & Phân quyền

### ProtectedRoute

Component `ProtectedRoute` (`routes/ProtectedRoute.jsx`) nhận thêm prop tuỳ
chọn `roles`:
- Nếu đang kiểm tra auth (`loading = true`) → hiển thị màn hình chờ
- Nếu chưa đăng nhập (`user = null`) → redirect về `/login`, giữ lại `from` để quay lại đúng trang sau khi đăng nhập
- Nếu truyền `roles` và vai trò hiện tại không nằm trong đó → redirect về `homePathForRole(user)` (không render rồi mới lãnh 403 từ API)
- Ngược lại → render `children`

Vai trò và các quy tắc điều hướng liên quan (`STAFF_ROLES`, `roleOf`,
`homePathForRole`, `redirectAfterLogin`) khai báo tập trung ở
`utils/roles.js` để route, sidebar và trang đăng nhập không lệch nhau.

### Layout

`SidebarLayout` bao gồm:
- **Sidebar** (desktop): Logo, navigation links, user info, nút logout, toggle theme
- **Mobile bottom navigation**: Hiển thị 5 mục đầu tiên dạng tab bar
- **Main content area**: Nơi render nội dung từng page

---

## Theme (Dark / Light Mode)

`ThemeContext` quản lý theme toàn ứng dụng:
- Mặc định: **dark mode**
- Lưu trạng thái vào `localStorage` key `theme`
- Toggle bằng nút 🌙/☀️ ở sidebar hoặc mobile header
- TailwindCSS dùng `darkMode: 'class'` — class `dark` được thêm/bỏ trên `<html>`

---

## Scripts

```bash
npm run dev       # Chạy Vite dev server (hot reload) tại port 5173
npm run build     # Build production vào thư mục dist/
npm run preview   # Preview bản build production
npm test          # Chạy unit tests với Vitest
```

---

## Kết nối với Backend

Frontend kết nối với [Backend API](../backend/README.md):

| Frontend chạy tại | Backend chạy tại    | Proxy path |
|-------------------|---------------------|------------|
| `localhost:5173`  | `localhost:5000`    | `/api/*`   |

Trong môi trường production, cần cấu hình `VITE_API_BASE_URL` trỏ đúng địa chỉ server backend.

---

*© Badminton Digital Management — Frontend v1.0.0*
