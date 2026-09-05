import http from 'k6/http';
import { check } from 'k6';

// Cấu hình dùng chung cho mọi kịch bản k6. Mọi giá trị đều override được bằng
// --env để chạy trên staging mà không phải sửa file:
//   k6 run --env BASE_URL=https://staging.example.com/api/v1 k6/load_test.js
export const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000/api/v1';
export const BRANCH_ID = __ENV.BRANCH_ID || '1';
export const IDENTIFIER = __ENV.IDENTIFIER || '0901111111';
export const PASSWORD = __ENV.PASSWORD || 'Admin@123';

// Dữ liệu tham chiếu cho các kịch bản chỉ-đọc. Mặc định khớp seeder
// (`20260723000001-seed-initial-data.js` + `20260815200002-seed-branch-courts.js`).
export const COURT_IDS = (__ENV.COURT_IDS || '1,2,3,4').split(',').map((s) => s.trim());

/**
 * Đăng nhập MỘT LẦN duy nhất, gọi trong setup() của từng kịch bản.
 *
 * QUAN TRỌNG: `/auth/login` bị chặn 10 request / 15 phút / IP
 * (`backend/src/routes/authRoutes.js`). Nếu để mỗi VU tự đăng nhập thì từ VU
 * thứ 11 trở đi sẽ ăn 429 và toàn bộ số liệu load test thành rác. Vì vậy token
 * phải lấy ở setup() rồi truyền xuống cho mọi VU dùng chung.
 *
 * Hệ quả: access token sống 15 phút, nên mọi kịch bản phải kết thúc dưới ~10
 * phút, không kịch bản nào cần xử lý refresh token giữa chừng.
 */
export function login() {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ identifier: IDENTIFIER, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' }, tags: { name: 'POST /auth/login' } }
  );

  if (res.status === 429) {
    throw new Error(
      'Đăng nhập bị rate-limit (429). Giới hạn là 10 lần/15 phút/IP — đợi hết cửa sổ ' +
      'hoặc khởi động lại backend (limiter lưu trong RAM nên restart là reset).'
    );
  }
  if (res.status !== 200) {
    throw new Error(`Đăng nhập thất bại (HTTP ${res.status}): ${res.body}`);
  }

  const token = res.json('data.accessToken');
  if (!token) throw new Error(`Không đọc được accessToken từ phản hồi: ${res.body}`);
  return token;
}

/** Header cho request cần đăng nhập — luôn kèm X-Branch-Id vì admin xem theo chi nhánh. */
export function authHeaders(token, branchId = BRANCH_ID) {
  return {
    Authorization: `Bearer ${token}`,
    'X-Branch-Id': String(branchId),
    'Content-Type': 'application/json'
  };
}

/** Header cho nhóm /public — nhóm route duy nhất không qua authMiddleware. */
export const PUBLIC_HEADERS = { 'Content-Type': 'application/json' };

/**
 * Kiểm tra 1 phản hồi: vừa đúng HTTP 200, vừa đúng envelope `{success:true}`
 * mà toàn bộ controller của dự án trả về. Chỉ check status là chưa đủ — API
 * này vẫn trả 200 kèm success:false ở vài nhánh lỗi mềm.
 */
export function checkOk(res, name) {
  return check(res, {
    [`${name} → 200`]: (r) => r.status === 200,
    [`${name} → success:true`]: (r) => {
      try {
        return r.json('success') === true;
      } catch (_) {
        return false;
      }
    }
  });
}

/** Ngày dạng YYYY-MM-DD, lệch `offsetDays` so với hôm nay. */
export function isoDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

/** Lấy ngẫu nhiên 1 phần tử — mô phỏng mỗi VU thao tác trên sân/khoảng thời gian khác nhau. */
export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
