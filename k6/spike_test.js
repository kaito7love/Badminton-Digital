import http from 'k6/http';
import { sleep } from 'k6';
import {
  BASE_URL, BRANCH_ID, PUBLIC_HEADERS, checkOk, isoDate, pick, COURT_IDS
} from './lib/config.js';

/**
 * SPIKE TEST — 0 → 200 VU trong 30 giây.
 *
 * Mô phỏng đúng tình huống dồn tải có thật của một sân cầu lông: mở bán khung
 * giờ đẹp cuối tuần, hoặc tung mã giảm giá — hàng trăm người cùng lúc mở trang
 * đặt sân và bấm dò khung giờ trống trong vài chục giây, rồi tắt hết.
 *
 * Chỉ nhắm vào nhóm `/public` vì đó chính là mặt tiền hứng đợt dồn đó, và cũng
 * là nhóm route duy nhất không qua authMiddleware — không cần token, nên số đo
 * phản ánh đúng sức chịu của tầng đọc catalog + truy vấn khung giờ trống.
 *
 *   k6 run k6/spike_test.js
 *
 * Ngưỡng nới hơn load_test có chủ ý: mục tiêu của spike test không phải "vẫn
 * nhanh" mà là "không sập, không đổ lỗi hàng loạt" khi tải tăng đột ngột gấp
 * nhiều lần bình thường.
 */
export const options = {
  scenarios: {
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 200 }, // dồn tải đột ngột
        { duration: '1m', target: 200 },  // giữ đỉnh
        { duration: '30s', target: 0 }    // rút tải, xem hệ thống hồi phục
      ],
      gracefulRampDown: '20s'
    }
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<2000'],
    checks: ['rate>0.95']
  }
};

export default function () {
  const opts = { headers: PUBLIC_HEADERS };

  checkOk(
    http.get(`${BASE_URL}/public/courts?branchId=${BRANCH_ID}`, { ...opts, tags: { name: 'GET /public/courts' } }),
    'public/courts'
  );

  // Đây mới là endpoint chịu trận thật: mỗi người dò 2-3 khung giờ liên tiếp
  // để tìm slot còn trống, mỗi lần là một truy vấn đè lên bảng bookings.
  for (let i = 0; i < 2; i++) {
    const hour = 17 + Math.floor(Math.random() * 4); // khung giờ cao điểm 17-21h
    const url = `${BASE_URL}/public/availability?courtId=${pick(COURT_IDS)}&bookingDate=${isoDate(1 + i)}`
      + `&startTime=${String(hour).padStart(2, '0')}:00&endTime=${String(hour + 1).padStart(2, '0')}:00&branchId=${BRANCH_ID}`;
    checkOk(http.get(url, { ...opts, tags: { name: 'GET /public/availability' } }), 'public/availability');
  }

  sleep(0.5);
}
