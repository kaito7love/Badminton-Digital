# 🏸 Badminton Digital Management — Frontend

> **Giao diện quản trị** cho hệ thống quản lý sân cầu lông số hoá, xây dựng bằng **React + Vite + TailwindCSS**.

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

Đây là SPA (Single Page Application) phục vụ quản trị viên và nhân viên sân cầu lông. Giao diện kết nối trực tiếp với [Backend API](../backend/README.md) thông qua Axios.

Các tính năng chính:

- 🔐 **Đăng nhập / Xác thực** — JWT với tự động refresh token
- 🏟️ **Quản lý sân** — Xem trạng thái, mở/đóng/chuyển sân
- 📅 **Quản lý đặt sân** — Danh sách booking, xác nhận, huỷ
- 🎒 **Phụ kiện** — Quản lý danh mục phụ kiện/thiết bị
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
    │   └── ThemeContext.jsx    # Context theme: dark/light toggle
    ├── hooks/              # Custom React hooks
    ├── layouts/
    │   ├── SidebarLayout.jsx   # Layout chính: sidebar + main content
    │   └── icons.jsx           # SVG icon components
    ├── pages/
    │   ├── Login/          # Trang đăng nhập
    │   ├── Dashboard/      # Tổng quan, thống kê
    │   ├── Courts/         # Quản lý sân
    │   ├── Bookings/       # Quản lý đặt sân
    │   ├── Accessories/    # Quản lý phụ kiện
    │   ├── Customers/      # Quản lý khách hàng
    │   ├── Employees/      # Quản lý nhân viên
    │   ├── Reports/        # Báo cáo & thống kê
    │   ├── History/        # Lịch sử
    │   └── Settings/       # Cài đặt hệ thống
    ├── routes/
    │   ├── AppRoutes.jsx       # Cấu hình tất cả routes
    │   └── ProtectedRoute.jsx  # HOC bảo vệ route yêu cầu đăng nhập
    ├── services/
    │   └── apiClient.js        # Axios instance: interceptor token, auto refresh
    └── utils/              # Hàm tiện ích dùng chung
```

---

## Trang & Tính năng

| Đường dẫn       | Trang          | Mô tả                                          | Auth |
|-----------------|----------------|------------------------------------------------|------|
| `/login`        | Login          | Form đăng nhập bằng email/password             | ❌    |
| `/` `/dashboard`| Dashboard      | Tổng quan: KPIs, biểu đồ doanh thu, top sân   | ✅    |
| `/courts`       | Courts         | Danh sách sân, trạng thái, mở/đóng/bảo trì    | ✅    |
| `/bookings`     | Bookings       | Danh sách đặt sân, xác nhận, huỷ              | ✅    |
| `/accessories`  | Accessories    | CRUD phụ kiện, vợt, cầu lông                  | ✅    |
| `/customers`    | Customers      | Danh sách khách hàng, lịch sử đặt sân         | ✅    |
| `/employees`    | Employees      | Quản lý nhân viên, activity logs               | ✅    |
| `/reports`      | Reports        | Báo cáo doanh thu, top sân, top phụ kiện      | ✅    |
| `/settings`     | Settings       | Giá, giờ hoạt động, thông tin thương hiệu     | ✅    |
| `/*`            | —              | Redirect về `/` (catch-all)                    | —    |

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
[Login Page]
     │
     ▼
AuthContext.login()
     │
     ├─ POST /api/v1/auth/login
     │        │
     │        └─ Nhận accessToken + refreshToken + userInfo
     │
     ├─ Lưu vào localStorage:
     │     access_token, refresh_token, user_info
     │
     └─ Redirect → /dashboard
```

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
    <AppRoutes>
      <ProtectedRoute>
        <SidebarLayout>
          <Page />
        </SidebarLayout>
      </ProtectedRoute>
    </AppRoutes>
  </AuthProvider>
</ThemeProvider>
```

### API Client

File `src/services/apiClient.js` tạo một Axios instance với:
- **Base URL**: lấy từ `VITE_API_BASE_URL` hoặc fallback `/api/v1`
- **Request interceptor**: tự động đính kèm `Authorization: Bearer <token>`
- **Response interceptor**: xử lý 401, tự động refresh token

---

## Routing & Phân quyền

### ProtectedRoute

Component `ProtectedRoute` bảo vệ toàn bộ route yêu cầu đăng nhập:
- Nếu đang kiểm tra auth (`loading = true`) → hiển thị màn hình chờ
- Nếu chưa đăng nhập (`user = null`) → redirect về `/login`
- Nếu đã đăng nhập → render `children`

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
