import apiClient from './apiClient';

// ─── Auth ────────────────────────────────────────────────────────
export const authService = {
  login: (data) => apiClient.post('/auth/login', data),
  logout: () => apiClient.post('/auth/logout'),
  refreshToken: () => apiClient.post('/auth/refresh-token'),
  changePassword: (data) => apiClient.put('/auth/change-password', data),
  forgotPassword: (data) => apiClient.post('/auth/forgot-password', data),
  resetPassword: (data) => apiClient.post('/auth/reset-password', data),
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
  toggleMaintenance: (id, data) => apiClient.put(`/courts/${id}/maintenance`, data),
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
};

// ─── Reports ─────────────────────────────────────────────────────
export const reportService = {
  getDashboard: () => apiClient.get('/reports/dashboard'),
  getRevenueReport: (params) => apiClient.get('/reports/revenue', { params }),
  getTopCourts: (params) => apiClient.get('/reports/top-courts', { params }),
  getTopAccessories: (params) => apiClient.get('/reports/top-accessories', { params }),
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
