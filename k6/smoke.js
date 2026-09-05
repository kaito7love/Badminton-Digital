import { sleep, group } from 'k6';
import http from 'k6/http';
import {
  BASE_URL, BRANCH_ID, login, authHeaders, PUBLIC_HEADERS, checkOk, isoDate, COURT_IDS
} from './lib/config.js';

/**
 * SMOKE TEST — 1 VU, 1 vòng, quét qua mọi nhóm endpoint đọc chính.
 *
 * Mục đích KHÔNG phải đo hiệu năng mà là xác minh môi trường còn sống và mọi
 * nhóm route còn trả đúng envelope trước khi chạy load thật. Chạy vài giây,
 * đủ nhẹ để cắm vào CI.
 *
 *   k6 run k6/smoke.js
 */
export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    // Smoke thì không được phép sai một check nào — sai là môi trường hỏng.
    checks: ['rate==1.00'],
    http_req_failed: ['rate==0.00']
  }
};

export function setup() {
  return { token: login() };
}

export default function (data) {
  const h = authHeaders(data.token);
  const courtId = COURT_IDS[0];
  const from = isoDate(-30);
  const to = isoDate(0);

  group('public (không cần đăng nhập)', () => {
    checkOk(http.get(`${BASE_URL}/public/branches`, { headers: PUBLIC_HEADERS, tags: { name: 'GET /public/branches' } }), 'public/branches');
    checkOk(http.get(`${BASE_URL}/public/courts?branchId=${BRANCH_ID}`, { headers: PUBLIC_HEADERS, tags: { name: 'GET /public/courts' } }), 'public/courts');
    checkOk(http.get(`${BASE_URL}/public/products?branchId=${BRANCH_ID}`, { headers: PUBLIC_HEADERS, tags: { name: 'GET /public/products' } }), 'public/products');
    checkOk(
      http.get(
        `${BASE_URL}/public/availability?courtId=${courtId}&bookingDate=${isoDate(1)}&startTime=08:00&endTime=10:00&branchId=${BRANCH_ID}`,
        { headers: PUBLIC_HEADERS, tags: { name: 'GET /public/availability' } }
      ),
      'public/availability'
    );
  });

  group('tài khoản & chi nhánh', () => {
    checkOk(http.get(`${BASE_URL}/auth/me`, { headers: h, tags: { name: 'GET /auth/me' } }), 'auth/me');
    checkOk(http.get(`${BASE_URL}/branches`, { headers: h, tags: { name: 'GET /branches' } }), 'branches');
    checkOk(http.get(`${BASE_URL}/settings`, { headers: h, tags: { name: 'GET /settings' } }), 'settings');
  });

  group('vận hành sân', () => {
    checkOk(http.get(`${BASE_URL}/courts`, { headers: h, tags: { name: 'GET /courts' } }), 'courts');
    checkOk(http.get(`${BASE_URL}/bookings`, { headers: h, tags: { name: 'GET /bookings' } }), 'bookings');
    checkOk(
      http.get(
        `${BASE_URL}/bookings/availability?courtId=${courtId}&bookingDate=${isoDate(1)}&startTime=08:00&endTime=10:00`,
        { headers: h, tags: { name: 'GET /bookings/availability' } }
      ),
      'bookings/availability'
    );
    checkOk(http.get(`${BASE_URL}/sessions/history`, { headers: h, tags: { name: 'GET /sessions/history' } }), 'sessions/history');
  });

  group('bán lẻ & kho', () => {
    checkOk(http.get(`${BASE_URL}/accessories`, { headers: h, tags: { name: 'GET /accessories' } }), 'accessories');
    checkOk(http.get(`${BASE_URL}/products`, { headers: h, tags: { name: 'GET /products' } }), 'products');
    checkOk(http.get(`${BASE_URL}/product-categories`, { headers: h, tags: { name: 'GET /product-categories' } }), 'product-categories');
    checkOk(http.get(`${BASE_URL}/inventory/stock-levels`, { headers: h, tags: { name: 'GET /inventory/stock-levels' } }), 'inventory/stock-levels');
    checkOk(http.get(`${BASE_URL}/inventory/product-stock-levels`, { headers: h, tags: { name: 'GET /inventory/product-stock-levels' } }), 'inventory/product-stock-levels');
    checkOk(http.get(`${BASE_URL}/inventory/movements`, { headers: h, tags: { name: 'GET /inventory/movements' } }), 'inventory/movements');
    checkOk(http.get(`${BASE_URL}/suppliers`, { headers: h, tags: { name: 'GET /suppliers' } }), 'suppliers');
    checkOk(http.get(`${BASE_URL}/goods-receipts`, { headers: h, tags: { name: 'GET /goods-receipts' } }), 'goods-receipts');
    checkOk(http.get(`${BASE_URL}/sales-orders`, { headers: h, tags: { name: 'GET /sales-orders' } }), 'sales-orders');
    checkOk(http.get(`${BASE_URL}/vouchers`, { headers: h, tags: { name: 'GET /vouchers' } }), 'vouchers');
  });

  group('khách hàng & nhân sự', () => {
    checkOk(http.get(`${BASE_URL}/customers?page=1&limit=10`, { headers: h, tags: { name: 'GET /customers' } }), 'customers');
    checkOk(http.get(`${BASE_URL}/employees`, { headers: h, tags: { name: 'GET /employees' } }), 'employees');
    checkOk(http.get(`${BASE_URL}/activity-logs`, { headers: h, tags: { name: 'GET /activity-logs' } }), 'activity-logs');
  });

  group('báo cáo', () => {
    checkOk(http.get(`${BASE_URL}/reports/dashboard`, { headers: h, tags: { name: 'GET /reports/dashboard' } }), 'reports/dashboard');
    checkOk(http.get(`${BASE_URL}/reports/revenue?from=${from}&to=${to}`, { headers: h, tags: { name: 'GET /reports/revenue' } }), 'reports/revenue');
    checkOk(http.get(`${BASE_URL}/reports/top-courts`, { headers: h, tags: { name: 'GET /reports/top-courts' } }), 'reports/top-courts');
    checkOk(http.get(`${BASE_URL}/reports/top-accessories`, { headers: h, tags: { name: 'GET /reports/top-accessories' } }), 'reports/top-accessories');
    checkOk(http.get(`${BASE_URL}/reports/revenue-breakdown?from=${from}&to=${to}`, { headers: h, tags: { name: 'GET /reports/revenue-breakdown' } }), 'reports/revenue-breakdown');
    checkOk(http.get(`${BASE_URL}/reports/inventory-reconciliation?from=${from}&to=${to}`, { headers: h, tags: { name: 'GET /reports/inventory-reconciliation' } }), 'reports/inventory-reconciliation');
  });

  sleep(1);
}
