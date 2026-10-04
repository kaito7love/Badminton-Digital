'use strict';

// Hàm thuần đọc cấu hình tầng HTTP từ env — tách khỏi server.js để test được
// mà không phải khởi động server.

const DEV_DEFAULT_ORIGIN = 'http://localhost:5173';
const MAX_TRUST_PROXY_HOPS = 10;

/**
 * Giá trị `origin` cho middleware `cors`.
 *
 * Bản deploy chạy cùng origin (backend phục vụ luôn bản build frontend, hoặc
 * nginx proxy `/api` trong cụm compose), nên không có request cross-origin nào
 * cần cho phép. Vì vậy ở production thiếu `CORS_ORIGIN` là ĐÓNG — `false`,
 * `cors` không gửi header nào — thay vì âm thầm rơi về `localhost:5173` như
 * trước (DEP-09). Dev/test giữ mặc định Vite dev server.
 *
 * `CORS_ORIGIN` nhận nhiều origin, phân tách bằng dấu phẩy.
 */
const resolveCorsOrigin = (env = process.env) => {
  const origins = String(env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  if (origins.length === 1) return origins[0];
  if (origins.length > 1) return origins;
  return env.NODE_ENV === 'production' ? false : DEV_DEFAULT_ORIGIN;
};

/**
 * Số proxy đứng trước Express, cho `app.set('trust proxy', n)` (AUTH-02).
 *
 * Không đặt thì `req.ip` là IP của proxy: mọi người dùng chung một bucket rate
 * limit, một người bị 429 là cả site bị 429. Dùng SỐ hop chứ không dùng `true`:
 * `true` tin cả chuỗi `X-Forwarded-For` do client tự gửi, tức ai cũng tự đổi
 * IP để né giới hạn đăng nhập. Với `n` hop, Express lấy entry thứ n tính từ
 * phải — entry do chính proxy của mình ghi, client không giả được.
 *
 * Mặc định 0 ở MỌI môi trường; nơi nào thật sự có proxy thì khai rõ — cụm
 * compose đặt 1 (nginx); render.yaml đặt 3 (Cloudflare → lớp vào của Render →
 * load balancer nội bộ — đo trên bản demo thật, 1 hay 2 đều ra IP proxy). Lý do
 * không mặc định 1 ở production: chạy image mà không có proxy phía trước thì
 * "1 hop" chính là client, tức ai cũng tự đặt `X-Forwarded-For` để né giới hạn
 * đăng nhập (đã tái hiện khi gọi thẳng cổng container). Quên khai thì hậu quả
 * chỉ là mọi người chung một bucket — kém tiện, không mở lỗ hổng.
 * Kiểm trên môi trường thật bằng `GET /api/v1/health` — trường `ip` phải là IP
 * của chính bạn; nếu ra IP của proxy thì tăng `TRUST_PROXY_HOPS`.
 */
const resolveTrustProxy = (env = process.env) => {
  const raw = env.TRUST_PROXY_HOPS;
  if (raw === undefined || String(raw).trim() === '') return 0;
  const hops = Number(raw);
  if (!Number.isInteger(hops) || hops < 0 || hops > MAX_TRUST_PROXY_HOPS) {
    throw new Error(`TRUST_PROXY_HOPS phải là số nguyên từ 0 đến ${MAX_TRUST_PROXY_HOPS} (đang là "${raw}").`);
  }
  return hops;
};

module.exports = { resolveCorsOrigin, resolveTrustProxy, DEV_DEFAULT_ORIGIN };
