import http from 'k6/http';
import { sleep, check } from 'k6';
import { Counter } from 'k6/metrics';
import exec from 'k6/execution';
import {
  BASE_URL, BRANCH_ID, login, authHeaders, PUBLIC_HEADERS, checkOk, isoDate, pick, COURT_IDS
} from './lib/config.js';

/**
 * LOAD TEST — 100 VU đồng thời, ~5 phút.
 *
 * Không bắn cùng một URL 100 lần cho ra con số đẹp: tải được chia theo đúng tỉ
 * lệ hành vi thật của hệ thống, mỗi nhóm là một scenario riêng để đọc được p95
 * của từng luồng thay vì một con số trung bình vô nghĩa.
 *
 *   40 VU  khách vãng lai duyệt catalog + dò khung giờ trống  (không đăng nhập)
 *   30 VU  nhân viên mở màn hình sơ đồ sân, poll trạng thái
 *   20 VU  nhân viên tra cứu booking + kiểm tra khung giờ
 *   10 VU  quản lý xem dashboard/báo cáo
 *
 * MẶC ĐỊNH CHỈ ĐỌC. Bắn 100 VU vào POST /bookings sẽ đẻ rác vào DB thật và làm
 * lệch toàn bộ số liệu báo cáo. Kịch bản ghi bật riêng bằng cờ:
 *
 *   k6 run --env WRITE=1 k6/load_test.js
 *
 * Kịch bản ghi tự dọn: mỗi booking tạo ra đều bị huỷ ngay trong cùng vòng lặp,
 * và cố tình KHÔNG gửi customerName/customerPhone — gửi vào là service sẽ tự
 * tạo bản ghi Customer mới, dọn sót là bẩn bảng khách hàng.
 */

const WRITE_ENABLED = __ENV.WRITE === '1';

// Mức tải đỉnh, chia theo tỉ lệ 40/30/20/10 cho 4 luồng. Tham số hoá để dùng
// lại đúng kịch bản này ở mức tải nhẹ hơn khi dò điểm bão hoà, hoặc khi chạy
// trên máy CI yếu:  k6 run --env VUS=50 k6/load_test.js
const PEAK_VUS = Number(__ENV.VUS || 100);
const share = (percent) => Math.max(1, Math.round((PEAK_VUS * percent) / 100));

// Đếm riêng 409 của luồng ghi: hai VU giành cùng khung giờ là hành vi ĐÚNG của
// hệ thống (chống double-booking), không phải lỗi hiệu năng. Gộp vào
// http_req_failed sẽ làm threshold báo động giả.
const bookingConflicts = new Counter('booking_conflicts');
const bookingsCreated = new Counter('bookings_created');
const bookingsCleanedUp = new Counter('bookings_cleaned_up');

// Cùng một hình dạng tải cho mọi scenario: lên nửa tải 1 phút, lên đủ tải 1
// phút, giữ 2 phút, hạ 1 phút. Tổng 5 phút — an toàn dưới hạn 15 phút của
// access token nên không kịch bản nào phải refresh giữa chừng.
const ramp = (peak) => [
  { duration: '1m', target: Math.ceil(peak / 2) },
  { duration: '1m', target: peak },
  { duration: '2m', target: peak },
  { duration: '1m', target: 0 }
];

const scenarios = {
  public_browse: { executor: 'ramping-vus', startVUs: 0, stages: ramp(share(40)), exec: 'publicBrowse', gracefulRampDown: '20s' },
  staff_courts:  { executor: 'ramping-vus', startVUs: 0, stages: ramp(share(30)), exec: 'staffCourts',  gracefulRampDown: '20s' },
  booking_ops:   { executor: 'ramping-vus', startVUs: 0, stages: ramp(share(20)), exec: 'bookingOps',   gracefulRampDown: '20s' },
  reports:       { executor: 'ramping-vus', startVUs: 0, stages: ramp(share(10)), exec: 'reportsView',  gracefulRampDown: '20s' }
};

if (WRITE_ENABLED) {
  scenarios.booking_write = {
    executor: 'constant-vus', vus: 5, duration: '5m', exec: 'bookingWrite', gracefulStop: '30s'
  };
}

export const options = {
  scenarios,
  thresholds: {
    // Hai ngưỡng QUAN TRỌNG NHẤT, không nới theo máy: dù tải tới đâu, hệ thống
    // vẫn phải trả lời đúng — không rơi request, không sai envelope.
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],

    // Ngưỡng độ trễ đặt theo SỐ ĐO THẬT ở 100 VU, không đặt theo con số mong
    // muốn. Đo ngày 05/09/2026, backend + MySQL 8 cùng chạy trên một máy
    // Windows 11, 5 lần chạy liên tiếp:
    //
    //   #1  100 VU, DB vừa khởi động  → p95 677ms, 115 req/s, 0 lỗi
    //   #2  100 VU                    → p95 1.14s,  95 req/s, 0 lỗi
    //   #3   50 VU                    → p95  31ms,             0 lỗi
    //   #4  200 VU (chỉ /public)      → p95 731ms, 276 req/s, 0 lỗi
    //   #5  100 VU, DB đã ấm          → p95 164ms, 147 req/s, 0 lỗi
    //
    // ⚠️ BẪY ĐO LƯỜNG: hai lần chạy đầu chậm gấp 4-7 lần lần thứ năm ở CÙNG
    // mức tải. Không phải hệ thống bão hoà — mà là buffer pool của InnoDB còn
    // lạnh, mọi truy vấn đầu tiên phải đọc từ đĩa. Chạy một lượt bỏ đi để làm
    // ấm CSDL rồi mới lấy số, nếu không sẽ kết luận sai là "API chậm".
    //
    // Ngưỡng dưới đây lấy quanh mức đo ấm (#5) nhân ~5 lần biên: đủ chặt để
    // bắt hồi quy thật, đủ rộng để không đỏ vì nhiễu máy.
    http_req_duration: ['p(95)<800'],
    'http_req_duration{scenario:public_browse}': ['p(95)<800'],
    'http_req_duration{scenario:staff_courts}': ['p(95)<800'],
    'http_req_duration{scenario:booking_ops}': ['p(95)<800'],
    // Báo cáo quét cả tháng dữ liệu nên luôn là luồng chậm nhất.
    'http_req_duration{scenario:reports}': ['p(95)<1500']
  }
};

export function setup() {
  // Đăng nhập đúng 1 lần cho cả 100 VU — xem giải thích rate limit ở lib/config.js.
  return { token: login() };
}

/** 40% tải: khách mở trang đặt sân, xem catalog, dò khung giờ trống. */
export function publicBrowse() {
  const opts = { headers: PUBLIC_HEADERS };
  checkOk(http.get(`${BASE_URL}/public/branches`, { ...opts, tags: { name: 'GET /public/branches' } }), 'public/branches');
  checkOk(http.get(`${BASE_URL}/public/courts?branchId=${BRANCH_ID}`, { ...opts, tags: { name: 'GET /public/courts' } }), 'public/courts');
  checkOk(http.get(`${BASE_URL}/public/products?branchId=${BRANCH_ID}`, { ...opts, tags: { name: 'GET /public/products' } }), 'public/products');

  // Khách hiếm khi xem đúng 1 khung giờ — thường bấm dò vài slot liên tiếp.
  for (let i = 0; i < 3; i++) {
    const hour = 6 + Math.floor(Math.random() * 15);
    const url = `${BASE_URL}/public/availability?courtId=${pick(COURT_IDS)}&bookingDate=${isoDate(1 + i)}`
      + `&startTime=${String(hour).padStart(2, '0')}:00&endTime=${String(hour + 1).padStart(2, '0')}:00&branchId=${BRANCH_ID}`;
    checkOk(http.get(url, { ...opts, tags: { name: 'GET /public/availability' } }), 'public/availability');
  }
  sleep(Math.random() * 2 + 1);
}

/** 30% tải: màn hình sơ đồ sân của nhân viên, poll trạng thái liên tục. */
export function staffCourts(data) {
  const opts = { headers: authHeaders(data.token) };
  checkOk(http.get(`${BASE_URL}/courts`, { ...opts, tags: { name: 'GET /courts' } }), 'courts');
  checkOk(http.get(`${BASE_URL}/courts/${pick(COURT_IDS)}`, { ...opts, tags: { name: 'GET /courts/:id' } }), 'courts/:id');
  checkOk(http.get(`${BASE_URL}/accessories`, { ...opts, tags: { name: 'GET /accessories' } }), 'accessories');
  checkOk(http.get(`${BASE_URL}/inventory/stock-levels`, { ...opts, tags: { name: 'GET /inventory/stock-levels' } }), 'inventory/stock-levels');
  sleep(Math.random() * 2 + 1);
}

/** 20% tải: tra cứu lịch đặt + kiểm tra khung giờ trước khi chốt cho khách. */
export function bookingOps(data) {
  const opts = { headers: authHeaders(data.token) };
  checkOk(http.get(`${BASE_URL}/bookings`, { ...opts, tags: { name: 'GET /bookings' } }), 'bookings');
  const hour = 6 + Math.floor(Math.random() * 15);
  const url = `${BASE_URL}/bookings/availability?courtId=${pick(COURT_IDS)}&bookingDate=${isoDate(1)}`
    + `&startTime=${String(hour).padStart(2, '0')}:00&endTime=${String(hour + 1).padStart(2, '0')}:00`;
  checkOk(http.get(url, { ...opts, tags: { name: 'GET /bookings/availability' } }), 'bookings/availability');
  checkOk(http.get(`${BASE_URL}/customers?page=1&limit=20`, { ...opts, tags: { name: 'GET /customers' } }), 'customers');
  checkOk(http.get(`${BASE_URL}/sessions/history`, { ...opts, tags: { name: 'GET /sessions/history' } }), 'sessions/history');
  sleep(Math.random() * 2 + 1);
}

/**
 * 10% tải: quản lý xem dashboard và báo cáo.
 * Cố tình KHÔNG gọi /reports/export-excel và /reports/export-pdf: đó là thao
 * tác chủ động vài lần mỗi ngày, không phải tải thường trực — nhét vào đây chỉ
 * làm p95 méo mà không phản ánh thực tế nào.
 */
export function reportsView(data) {
  const opts = { headers: authHeaders(data.token) };
  const from = isoDate(-30);
  const to = isoDate(0);
  checkOk(http.get(`${BASE_URL}/reports/dashboard`, { ...opts, tags: { name: 'GET /reports/dashboard' } }), 'reports/dashboard');
  checkOk(http.get(`${BASE_URL}/reports/revenue?from=${from}&to=${to}`, { ...opts, tags: { name: 'GET /reports/revenue' } }), 'reports/revenue');
  checkOk(http.get(`${BASE_URL}/reports/top-courts`, { ...opts, tags: { name: 'GET /reports/top-courts' } }), 'reports/top-courts');
  checkOk(http.get(`${BASE_URL}/reports/revenue-breakdown?from=${from}&to=${to}`, { ...opts, tags: { name: 'GET /reports/revenue-breakdown' } }), 'reports/revenue-breakdown');
  sleep(Math.random() * 3 + 2);
}

/**
 * Luồng GHI (chỉ chạy khi --env WRITE=1): đặt sân rồi huỷ ngay để dọn.
 * Ngày đặt đẩy xa 200+ ngày và rải theo VU/vòng lặp để không đụng dữ liệu thật
 * và giảm va chạm giữa các VU với nhau.
 */
export function bookingWrite(data) {
  const opts = { headers: authHeaders(data.token) };
  const vu = exec.vu.idInTest;
  const iter = exec.scenario.iterationInTest;
  const hour = 6 + ((vu + iter) % 15);
  const payload = JSON.stringify({
    courtId: Number(COURT_IDS[vu % COURT_IDS.length]),
    bookingDate: isoDate(200 + (iter % 90)),
    startTime: `${String(hour).padStart(2, '0')}:00`,
    endTime: `${String(hour + 1).padStart(2, '0')}:00`
  });

  const res = http.post(`${BASE_URL}/bookings`, payload, { ...opts, tags: { name: 'POST /bookings' } });

  // 409 = hai VU giành cùng khung giờ, đúng như thiết kế chống trùng lịch.
  if (res.status === 409) {
    bookingConflicts.add(1);
  } else {
    check(res, { 'POST /bookings → 201': (r) => r.status === 201 });
    const id = res.status === 201 ? res.json('data.id') : null;
    if (id) {
      bookingsCreated.add(1);
      const del = http.del(`${BASE_URL}/bookings/${id}`, null, { ...opts, tags: { name: 'DELETE /bookings/:id' } });
      if (check(del, { 'DELETE /bookings/:id → 200': (r) => r.status === 200 })) {
        bookingsCleanedUp.add(1);
      }
    }
  }
  sleep(1);
}
