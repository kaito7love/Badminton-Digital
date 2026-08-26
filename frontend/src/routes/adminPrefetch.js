// Prefetch nền cho các trang admin/staff hay dùng — chạy sau khi Admin Shell
// (SidebarLayout) đã mount, không chặn first paint. Gọi lại đúng những
// factory import() mà AppRoutes.jsx dùng cho lazy(): dynamic import() cùng
// specifier được trình duyệt/bundler cache theo module graph, nên gọi nhiều
// lần (kể cả khi React.StrictMode chạy effect 2 lần ở dev) không tạo thêm
// request mạng — không cần tự dựng thêm cơ chế khử trùng lặp.
//
// Phân loại theo tần suất dùng thực tế (xem SidebarLayout.jsx / CLAUDE.md):
// Priority A = nghiệp vụ hàng ngày mọi role staff đụng tới; Priority B =
// admin/branch_manager dùng định kỳ; Settings (Priority C) cố tình KHÔNG
// prefetch — hiếm khi vào, giữ lazy on-demand thuần.

const PRIORITY_A = [
  () => import('../pages/Courts/CourtsPage'),
  () => import('../pages/Bookings/BookingsPage'),
  () => import('../pages/Customers/CustomersPage'),
  () => import('../pages/Retail/RetailPage'),
  () => import('../pages/Accessories/AccessoriesPage'),
];

const PRIORITY_B = [
  () => import('../pages/Employees/EmployeesPage'),
  () => import('../pages/Reports/ReportsPage'),
  () => import('../pages/History/HistoryPage'),
  () => import('../pages/ActivityLog/ActivityLogPage'),
  () => import('../pages/Courts/CourtLayoutPage'),
];

const requestIdle = (cb) => {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    return window.requestIdleCallback(cb, { timeout: 3000 });
  }
  return window.setTimeout(cb, 200);
};

const cancelIdle = (id) => {
  if (typeof window !== 'undefined' && typeof window.cancelIdleCallback === 'function') {
    window.cancelIdleCallback(id);
  } else {
    window.clearTimeout(id);
  }
};

// Tôn trọng Data Saver / mạng chậm nếu trình duyệt cho biết được — prefetch
// là để mượt hơn, không đáng để tốn dữ liệu của người đang cố tình tiết kiệm.
const shouldSkipPrefetch = () => {
  const conn = typeof navigator !== 'undefined' ? navigator.connection : null;
  if (!conn) return false;
  if (conn.saveData) return true;
  return ['slow-2g', '2g'].includes(conn.effectiveType);
};

/**
 * Gọi 1 lần khi Admin Shell đã mount (sau first paint của Dashboard/trang
 * admin đầu tiên). Trả về hàm huỷ lịch — gọi trong cleanup của useEffect để
 * không rò rỉ callback nếu component unmount trước khi tới lượt chạy.
 */
export function scheduleAdminPrefetch() {
  if (shouldSkipPrefetch()) return () => {};

  let idB = null;
  const idA = requestIdle(() => {
    PRIORITY_A.forEach((load) => load());
    idB = requestIdle(() => {
      PRIORITY_B.forEach((load) => load());
    });
  });

  return () => {
    cancelIdle(idA);
    if (idB !== null) cancelIdle(idB);
  };
}
