# Plan: `perf/frontend-code-splitting` (ĐÃ CODE + TEST XONG — chờ duyệt merge)

**Trạng thái:** đã code + test thật xong trên nhánh `perf/frontend-code-splitting`,
chưa merge vào `main`. Xem tổng kết ở `00-tien-do.md`.

## Vấn đề

`frontend/src/routes/AppRoutes.jsx` import tĩnh (static `import`) toàn bộ
14 trang — `HomePage`, `LoginPage`, `RegisterPage`, `ForgotPasswordPage`,
`ResetPasswordPage`, `DashboardPage`, `CourtsPage`, `BookingsPage`,
`AccessoriesPage`, `CustomersPage`, `EmployeesPage`, `ReportsPage`,
`SettingsPage`, `HistoryPage`, `MyBookingsPage` — cùng vào 1 bundle JS ban
đầu (`main.js`, ~800KB theo audit `../01-audit/StabilityAudit.md`). Nghĩa là
1 khách hàng chỉ vào trang chủ để đặt sân vẫn phải tải cả code trang
`SettingsPage`/`ReportsPage` mà họ không có quyền vào — tải chậm hơn cần
thiết, đặc biệt trên mạng di động yếu.

## Thiết kế

Dùng `React.lazy` + `Suspense` (có sẵn trong React, Vite hỗ trợ code
splitting theo `import()` động ngay lập tức, không cần cấu hình thêm hay
thư viện mới):

```jsx
import { lazy, Suspense } from 'react';
const DashboardPage = lazy(() => import('../pages/Dashboard/DashboardPage'));
// ... tương tự cho các trang còn lại
```

- Giữ nguyên `import` tĩnh cho `HomePage` và `LoginPage` — đây là 2 trang
  vào đầu tiên của phần lớn người dùng (khách xem trang chủ, nhân viên đăng
  nhập), lazy-load 2 trang này chỉ thêm 1 vòng loading không cần thiết cho
  đường dẫn phổ biến nhất.
- Lazy-load 12 trang còn lại — đặc biệt các trang chỉ `admin`/`branch_manager`
  mới vào được (`SettingsPage`, `EmployeesPage`, `ReportsPage`) và các trang
  nghiệp vụ nhân viên (`CourtsPage`, `BookingsPage`, `AccessoriesPage`,
  `CustomersPage`, `HistoryPage`) — khách hàng thường không bao giờ tải các
  bundle này.
- Bọc `<Routes>` (hoặc từng nhóm route) trong `<Suspense fallback={...}>` —
  fallback dùng 1 spinner/skeleton đơn giản có sẵn theo style hiện tại của
  dự án (kiểm tra `frontend/src/components` xem đã có component loading nào
  tái dùng được không, tránh tạo mới nếu đã có).
- `ErrorBoundary` đã có sẵn (`chore/frontend-resilience`) bọc ngoài
  `<AppRoutes />` — cùng lúc bắt được cả lỗi runtime lẫn lỗi tải chunk thất
  bại (network lỗi giữa chừng khi lazy-load) — không cần thêm boundary
  riêng cho việc này.

## Việc KHÔNG làm

- Không tách nhỏ hơn theo component con trong từng trang — chỉ code-split
  theo route/trang, đơn vị chunk = 1 trang, đúng mức cần thiết để giải quyết
  vấn đề đã nêu.
- Không đổi router (`react-router-dom` giữ nguyên), không thêm thư viện
  loading/skeleton mới nếu component hiện có đã đủ dùng.
- Không đụng cấu hình build Vite (`vite.config.js`) trừ khi test cho thấy
  cần `manualChunks` — mặc định Vite đã tự tách chunk theo `import()` động.

## Kiểm thử

- `npm run build` — so sánh kích thước `main.js`/entry chunk trước/sau
  (kỳ vọng giảm rõ rệt vì 12/14 trang tách khỏi bundle chính); xác nhận có
  các file chunk riêng theo từng trang trong `dist/assets/`.
- `npm test` (Vitest) — xác nhận không gãy test hiện có (nếu test nào import
  trực tiếp 1 trang đã lazy-load, kiểm tra còn resolve đúng qua
  `await import(...)`/React Testing Library).
- Test thật trên trình duyệt (`npm run dev` rồi `npm run preview` với build
  production): mở Network tab, xác nhận vào `/` hoặc `/login` không tải các
  chunk của `SettingsPage`/`ReportsPage`/...; chuyển trang qua sidebar, xác
  nhận chunk tương ứng chỉ tải đúng lúc chuyển vào, có hiển thị fallback
  loading trong lúc tải trên mạng chậm (throttle Network trong DevTools để
  thấy rõ).
- Test lỗi tải chunk: mô phỏng lỗi mạng giữa chừng khi chuyển trang (offline
  tạm thời trong DevTools ngay lúc bấm chuyển trang) — xác nhận
  `ErrorBoundary` hiện đúng giao diện lỗi tiếng Việt thay vì màn hình trắng.
