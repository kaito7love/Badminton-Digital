import apiClient from './apiClient';

// ─── Auth ────────────────────────────────────────────────────────
export const authService = {
  login: (data) => apiClient.post('/auth/login', data),
  register: (data) => apiClient.post('/auth/register', data),
  logout: () => apiClient.post('/auth/logout'),
  refreshToken: () => apiClient.post('/auth/refresh-token'),
  changePassword: (data) => apiClient.put('/auth/change-password', data),
  forgotPassword: (data) => apiClient.post('/auth/forgot-password', data),
  resetPassword: (data) => apiClient.post('/auth/reset-password', data),
};

// ─── Public (trang chủ, không cần đăng nhập) ─────────────────────
export const publicService = {
  getCourts: (params) => apiClient.get('/public/courts', { params }),
  checkAvailability: (params) => apiClient.get('/public/availability', { params }),
  getProducts: (params) => apiClient.get('/public/products', { params }),
  getProductById: (id, params) => apiClient.get(`/public/products/${id}`, { params }),
  getBranches: () => apiClient.get('/public/branches'),
};

// ─── Đơn hàng của khách (đặt online, nhận tại quầy) ─────────────
export const myOrderService = {
  getAll: (params) => apiClient.get('/my-orders', { params }),
  getById: (id) => apiClient.get(`/my-orders/${id}`),
  place: (data) => apiClient.post('/my-orders', data),
  cancel: (id) => apiClient.post(`/my-orders/${id}/cancel`),
};

// ─── Branches (chỉ admin — bộ chuyển chi nhánh) ─────────────────
export const branchService = {
  getAllBranches: () => apiClient.get('/branches'),
};

// ─── Courts ──────────────────────────────────────────────────────
export const courtService = {
  getAllCourts: () => apiClient.get('/courts'),
  getCourtById: (id) => apiClient.get(`/courts/${id}`),
  createCourt: (data) => apiClient.post('/courts', data),
  updateCourt: (id, data) => apiClient.put(`/courts/${id}`, data),
  deleteCourt: (id) => apiClient.delete(`/courts/${id}`),
  openCourt: (id, data) => apiClient.post(`/courts/${id}/open`, data),
  closeCourt: (id) => apiClient.post(`/courts/${id}/close`),
  transferCourt: (id, data) => apiClient.post(`/courts/${id}/transfer`, data),
  updateStatus: (id, status) => apiClient.put(`/courts/${id}/status`, { status }),
};

// ─── Bookings ────────────────────────────────────────────────────
export const bookingService = {
  getAllBookings: (params) => apiClient.get('/bookings', { params }),
  getBookingById: (id) => apiClient.get(`/bookings/${id}`),
  createBooking: (data) => apiClient.post('/bookings', data),
  updateBooking: (id, data) => apiClient.put(`/bookings/${id}`, data),
  cancelBooking: (id) => apiClient.delete(`/bookings/${id}`),
  confirmBooking: (id) => apiClient.put(`/bookings/${id}/confirm`),
  checkAvailability: (params) => apiClient.get('/bookings/availability', { params }),
};

// ─── Accessories (Vật tư / Kho) ─────────────────────────────────
export const accessoryService = {
  getAllAccessories: (params) => apiClient.get('/accessories', { params }),
  getAccessoryById: (id) => apiClient.get(`/accessories/${id}`),
  createAccessory: (data) => apiClient.post('/accessories', data),
  updateAccessory: (id, data) => apiClient.put(`/accessories/${id}`, data),
  deleteAccessory: (id) => apiClient.delete(`/accessories/${id}`),
};

// ─── Session Extras (Vật tư trong phiên chơi) ───────────────────
export const sessionService = {
  addExtra: (sessionId, data) => apiClient.post(`/sessions/${sessionId}/extras`, data),
  getExtras: (sessionId) => apiClient.get(`/sessions/${sessionId}/extras`),
  returnExtra: (sessionId, data) => apiClient.post(`/sessions/${sessionId}/extras/return`, data),
};

// ─── Suppliers (Nhà cung cấp) ────────────────────────────────────
export const supplierService = {
  getAllSuppliers: (params) => apiClient.get('/suppliers', { params }),
  getSupplierById: (id) => apiClient.get(`/suppliers/${id}`),
  createSupplier: (data) => apiClient.post('/suppliers', data),
  updateSupplier: (id, data) => apiClient.put(`/suppliers/${id}`, data),
  deleteSupplier: (id) => apiClient.delete(`/suppliers/${id}`),
};

// ─── Goods Receipts (Phiếu nhập kho) ─────────────────────────────
export const goodsReceiptService = {
  getAllGoodsReceipts: (params) => apiClient.get('/goods-receipts', { params }),
  getGoodsReceiptById: (id) => apiClient.get(`/goods-receipts/${id}`),
  createGoodsReceipt: (data) => apiClient.post('/goods-receipts', data),
};

// ─── Inventory (Tồn kho / Lịch sử kho / Điều chỉnh kho) ─────────
export const inventoryService = {
  getStockLevels: (params) => apiClient.get('/inventory/stock-levels', { params }),
  getProductStockLevels: (params) => apiClient.get('/inventory/product-stock-levels', { params }),
  getMovements: (params) => apiClient.get('/inventory/movements', { params }),
  createAdjustment: (data) => apiClient.post('/inventory/adjustments', data),
};

// ─── Product Categories (Danh mục bán lẻ — dùng chung toàn chuỗi) ─
export const productCategoryService = {
  getAll: (params) => apiClient.get('/product-categories', { params }),
  create: (data) => apiClient.post('/product-categories', data),
  update: (id, data) => apiClient.put(`/product-categories/${id}`, data),
  delete: (id) => apiClient.delete(`/product-categories/${id}`),
};

// ─── Products & Variants (Catalog bán lẻ) ────────────────────────
export const productService = {
  getAll: (params) => apiClient.get('/products', { params }),
  getById: (id) => apiClient.get(`/products/${id}`),
  create: (data) => apiClient.post('/products', data),
  update: (id, data) => apiClient.put(`/products/${id}`, data),
  addVariant: (id, data) => apiClient.post(`/products/${id}/variants`, data),
  updateVariant: (variantId, data) => apiClient.put(`/products/variants/${variantId}`, data),
};

// ─── Sales Orders (Bán lẻ tại quầy — POS, độc lập luồng sân) ─────
export const salesOrderService = {
  getAll: (params) => apiClient.get('/sales-orders', { params }),
  create: (data) => apiClient.post('/sales-orders', data),
  getById: (id) => apiClient.get(`/sales-orders/${id}`),
  addLine: (id, data) => apiClient.post(`/sales-orders/${id}/lines`, data),
  removeLine: (id, lineId) => apiClient.delete(`/sales-orders/${id}/lines/${lineId}`),
  applyVoucher: (id, voucherCode) => apiClient.post(`/sales-orders/${id}/voucher`, { voucherCode }),
  checkout: (id, data) => {
    const { idempotencyKey, ...payload } = data;
    const requestKey = idempotencyKey || crypto.randomUUID();
    return apiClient.post(`/sales-orders/${id}/checkout`, payload, {
      headers: { 'Idempotency-Key': requestKey }
    });
  },
};

// ─── Vouchers (Mã giảm giá — dùng chung online + POS) ────────────
export const voucherService = {
  getAll: (params) => apiClient.get('/vouchers', { params }),
  getById: (id) => apiClient.get(`/vouchers/${id}`),
  create: (data) => apiClient.post('/vouchers', data),
  update: (id, data) => apiClient.put(`/vouchers/${id}`, data),
  deactivate: (id) => apiClient.post(`/vouchers/${id}/deactivate`),
  preview: (code, orderAmount) => apiClient.post('/vouchers/preview', { code, orderAmount }),
};

// ─── Customers ───────────────────────────────────────────────────
export const customerService = {
  getAllCustomers: (params) => apiClient.get('/customers', { params }),
  getCustomerById: (id) => apiClient.get(`/customers/${id}`),
  createCustomer: (data) => apiClient.post('/customers', data),
  updateCustomer: (id, data) => apiClient.put(`/customers/${id}`, data),
  deleteCustomer: (id) => apiClient.delete(`/customers/${id}`),
  getHistory: (id) => apiClient.get(`/customers/${id}/history`),
};

// ─── Employees ───────────────────────────────────────────────────
export const employeeService = {
  getAllEmployees: (params) => apiClient.get('/employees', { params }),
  getEmployeeById: (id) => apiClient.get(`/employees/${id}`),
  createEmployee: (data) => apiClient.post('/employees', data),
  updateEmployee: (id, data) => apiClient.put(`/employees/${id}`, data),
  deleteEmployee: (id) => apiClient.delete(`/employees/${id}`),
  getActivityLogs: (id) => apiClient.get(`/employees/${id}/activity-logs`),
};

// ─── Payments ────────────────────────────────────────────────────
export const paymentService = {
  checkout: (data) => {
    const { idempotencyKey, ...payload } = data;
    const requestKey = idempotencyKey || crypto.randomUUID();
    return apiClient.post('/payments/checkout', payload, {
      headers: { 'Idempotency-Key': requestKey }
    });
  },
  applyDiscount: (id, data) => apiClient.post(`/payments/${id}/apply-discount`, data),
};

// ─── Invoices ────────────────────────────────────────────────────
export const invoiceService = {
  getInvoiceById: (id) => apiClient.get(`/invoices/${id}`),
  exportPdf: (id) => apiClient.get(`/invoices/${id}/export-pdf`, { responseType: 'blob' }),
  voidInvoice: (id, { reason }) => apiClient.post(`/invoices/${id}/void`, { reason }),
};

// ─── Activity Log (Nhật ký hoạt động, admin/branch_manager) ──────
export const activityLogService = {
  list: (params) => apiClient.get('/activity-logs', { params }),
};

// ─── Reports ─────────────────────────────────────────────────────
export const reportService = {
  getDashboard: () => apiClient.get('/reports/dashboard'),
  getRevenueReport: (params) => apiClient.get('/reports/revenue', { params }),
  getTopCourts: (params) => apiClient.get('/reports/top-courts', { params }),
  getTopAccessories: (params) => apiClient.get('/reports/top-accessories', { params }),
  getRevenueBreakdown: (params) => apiClient.get('/reports/revenue-breakdown', { params }),
  getInventoryReconciliation: (params) => apiClient.get('/reports/inventory-reconciliation', { params }),
  getOccupancyReport: (params) => apiClient.get('/reports/occupancy', { params }),
  exportExcel: (params) => apiClient.get('/reports/export-excel', { params, responseType: 'blob' }),
  exportPdf: (params) => apiClient.get('/reports/export-pdf', { params, responseType: 'blob' }),
};

// ─── History ─────────────────────────────────────────────────────
export const historyService = {
  getSessions: (params) => apiClient.get('/sessions/history', { params }),
  getBookings: (params) => apiClient.get('/bookings', { params }),
};

// ─── Settings ────────────────────────────────────────────────────
export const settingService = {
  getAll: () => apiClient.get('/settings'),
  updatePricing: (data) => apiClient.put('/settings/pricing', data),
  updateAccessoryPricing: (data) => apiClient.put('/settings/accessory-pricing', data),
  updateOperatingHours: (data) => apiClient.put('/settings/operating-hours', data),
  updateBranding: (data) => apiClient.put('/settings/branding', data),
};
