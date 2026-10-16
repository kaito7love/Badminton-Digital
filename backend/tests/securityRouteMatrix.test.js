// Kế hoạch 32 (A–B, ma trận phân quyền): đọc bảng quyền THẬT từ router.stack của mọi file route.
//
// Hai middleware xác thực/vai trò được thay bằng bản có gắn nhãn (không đổi hành vi route, chỉ để
// đọc ra "route này cần đăng nhập không, cho vai trò nào"). Thêm route mới mà quên authMiddleware
// hoặc roleMiddleware thì test này đỏ, kể cả khi chưa ai viết test riêng cho route đó.
process.env.JWT_ACCESS_SECRET = 'security-matrix-access-secret-0123456789abcdef';
process.env.JWT_REFRESH_SECRET = 'security-matrix-refresh-secret-0123456789abcde';

jest.mock('../src/middleware/roleMiddleware', () => (roles) => Object.assign((req, res, next) => next(), { allowedRoles: roles }));
jest.mock('../src/middleware/authMiddleware', () => Object.assign((req, res, next) => next(), { requiresAuth: true }));
jest.mock('../src/middleware/sseAuthMiddleware', () => Object.assign((req, res, next) => next(), { requiresAuth: true, sse: true }));
jest.mock('../src/middleware/paymentWebhookAuth', () => Object.assign((req, res, next) => next(), { webhookAuth: true }));

const path = require('path');

const MOUNTS = {
  publicRoutes: '/public', authRoutes: '/auth', courtRoutes: '/courts', realtimeRoutes: '/realtime',
  bookingRoutes: '/bookings', accessoryRoutes: '/accessories', supplierRoutes: '/suppliers',
  goodsReceiptRoutes: '/goods-receipts', inventoryRoutes: '/inventory', productCategoryRoutes: '/product-categories',
  productRoutes: '/products', voucherRoutes: '/vouchers', salesOrderRoutes: '/sales-orders',
  myOrderRoutes: '/my-orders', branchRoutes: '/branches', sessionRoutes: '/sessions',
  customerRoutes: '/customers', employeeRoutes: '/employees', paymentRoutes: '/payments',
  invoiceRoutes: '/invoices', activityLogRoutes: '/activity-logs', reportRoutes: '/reports',
  settingRoutes: '/settings'
};

const collect = () => {
  const out = [];
  for (const [file, mount] of Object.entries(MOUNTS)) {
    const router = require(path.join('../src/routes', file));
    let ctx = { auth: false, roles: null };
    for (const layer of router.stack) {
      if (!layer.route) {
        const h = layer.handle;
        if (h.requiresAuth) ctx = { ...ctx, auth: true };
        if (h.allowedRoles) ctx = { ...ctx, roles: h.allowedRoles };
        continue;
      }
      let { auth, roles } = ctx;
      let webhook = false;
      for (const l of layer.route.stack) {
        if (l.handle.requiresAuth) auth = true;
        if (l.handle.allowedRoles) roles = l.handle.allowedRoles;
        if (l.handle.webhookAuth) webhook = true;
      }
      for (const method of Object.keys(layer.route.methods)) {
        out.push({ key: `${method.toUpperCase()} ${mount}${layer.route.path}`.replace(/\/$/, ''), auth, roles, webhook });
      }
    }
  }
  return out;
};

const ROUTES = collect();
const byKey = Object.fromEntries(ROUTES.map((r) => [r.key, r]));

// Route không cần đăng nhập — danh sách này chỉ được dài thêm khi chủ dự án chủ ý mở một đường công khai.
const PUBLIC = [
  'GET /public/branches', 'GET /public/courts', 'GET /public/products', 'GET /public/products/:id',
  'GET /public/availability', 'GET /public/availability/day',
  'POST /auth/register', 'POST /auth/login', 'POST /auth/refresh-token', 'POST /auth/forgot-password', 'POST /auth/reset-password',
  'POST /payments/webhook'
];

// Route chỉ cần đăng nhập, KHÔNG có roleMiddleware: quyền sở hữu / chi nhánh phải do service kiểm.
// Mỗi dòng ở đây có test phía DB tương ứng ở backend/tests-security (IDOR, chéo chi nhánh).
const AUTH_ONLY = [
  'GET /auth/me', 'POST /auth/logout', 'PUT /auth/change-password', 'GET /realtime/stream',
  'GET /bookings', 'GET /bookings/availability', 'GET /bookings/:id',
  'POST /vouchers/preview', 'GET /customers/:id/history', 'GET /customers/:id', 'GET /invoices/:id'
];

describe('Ma trận phân quyền của mọi route (kế hoạch 32, nhóm B1)', () => {
  test('đọc được toàn bộ route (bắt buộc để các test dưới có nghĩa)', () => {
    expect(ROUTES.length).toBeGreaterThanOrEqual(110);
  });

  test('chỉ đúng danh sách route công khai là không cần đăng nhập', () => {
    const open = ROUTES.filter((r) => !r.auth).map((r) => r.key).sort();
    expect(open).toEqual([...PUBLIC].sort());
  });

  test('route chỉ cần đăng nhập (không khoá vai trò) đúng bằng danh sách đã biết', () => {
    const authOnly = ROUTES.filter((r) => r.auth && !r.roles).map((r) => r.key).sort();
    expect(authOnly).toEqual([...AUTH_ONLY].sort());
  });

  test('webhook thanh toán đi qua paymentWebhookAuth, không qua JWT', () => {
    expect(byKey['POST /payments/webhook'].webhook).toBe(true);
  });

  // Quyền cố định cho những route nhạy cảm nhất — đổi vai trò ở đây phải là quyết định có chủ ý.
  test.each([
    ['POST /invoices/:id/void', ['admin', 'branch_manager']],
    ['GET /invoices/:id/export-pdf', ['admin', 'branch_manager', 'employee']],
    ['POST /employees', ['admin', 'branch_manager']],
    ['DELETE /employees/:id', ['admin', 'branch_manager']],
    ['PUT /settings/pricing', ['admin']],
    ['PUT /settings', ['admin']],
    ['PUT /settings/branding', ['admin']],
    ['DELETE /customers/:id', ['admin']],
    ['GET /reports/export-excel', ['admin', 'branch_manager']],
    ['GET /activity-logs', ['admin', 'branch_manager']],
    ['GET /branches', ['admin']],
    ['PUT /bookings/:id', ['admin', 'branch_manager', 'employee']],
    ['POST /payments/checkout', ['admin', 'branch_manager', 'employee']],
    ['POST /vouchers', ['admin', 'branch_manager']],
    ['POST /goods-receipts', ['admin', 'branch_manager', 'employee']],
    ['POST /inventory/adjustments', ['admin', 'branch_manager', 'employee']]
  ])('%s chỉ cho %j', (key, roles) => {
    expect(byKey[key]).toBeDefined();
    expect([...byKey[key].roles].sort()).toEqual([...roles].sort());
  });

  test('mọi route /my-orders chỉ dành cho khách', () => {
    const mine = ROUTES.filter((r) => r.key.includes(' /my-orders'));
    expect(mine.length).toBeGreaterThan(0);
    mine.forEach((r) => expect(r.roles).toEqual(['customer']));
  });

  test('không route nào cho khách (customer) ghi vào dữ liệu vận hành ngoài đặt/huỷ sân và đơn của mình', () => {
    const customerWritable = ROUTES
      .filter((r) => r.roles && r.roles.includes('customer') && !r.key.startsWith('GET '))
      .map((r) => r.key)
      .sort();
    expect(customerWritable).toEqual([
      'DELETE /bookings/:id',
      'POST /bookings',
      'POST /my-orders',
      'POST /my-orders/:id/cancel'
    ].sort());
  });
});
