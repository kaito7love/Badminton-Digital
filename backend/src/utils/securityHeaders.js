'use strict';

/**
 * Header bảo mật cho mọi response (R9) và `Cache-Control: no-store` cho API (R10) — kế hoạch 35.
 *
 * Tự viết thay vì dùng `helmet`: CSP của hệ thống này khá riêng (Google Fonts, mã QR VietQR, `style=` inline của
 * React) nên phải tự khai từng nguồn; thêm một dependency chỉ để đặt 6 header không đáng.
 *
 * Danh sách nguồn dưới đây được dựng từ việc rà toàn bộ `frontend/src` (xem docs/…/35-ke-hoach-header-bao-mat-va-no-store.md
 * §2). Thêm domain ảnh/CDN/font mới vào frontend thì PHẢI thêm vào đây, nếu không trình duyệt sẽ chặn.
 */

const CSP_DIRECTIVES = Object.freeze({
  'default-src': ["'self'"],
  // Vite build ra một module ngoài, không inline, không eval.
  'script-src': ["'self'"],
  // 'unsafe-inline': React ghi thuộc tính style= trực tiếp lên phần tử. Bỏ được khi viết lại mọi style= thành class.
  'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  'font-src': ["'self'", 'https://fonts.gstatic.com'],
  // img.vietqr.io: mã QR chuyển khoản (utils/vietqr.js). data: cho ảnh nhúng nhỏ của thư viện/biểu tượng.
  'img-src': ["'self'", 'data:', 'https://img.vietqr.io'],
  // API và SSE (EventSource) đều cùng origin.
  'connect-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  // Chống clickjacking; X-Frame-Options bên dưới là bản cho trình duyệt cũ.
  'frame-ancestors': ["'none'"]
});

const buildCsp = (directives = CSP_DIRECTIVES) =>
  Object.entries(directives).map(([name, sources]) => `${name} ${sources.join(' ')}`).join('; ');

const CSP = buildCsp();

const STATIC_HEADERS = Object.freeze({
  'Content-Security-Policy': CSP,
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  // Link đặt lại mật khẩu mang ?token= — không để lọt sang Google Fonts qua Referer.
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
});

// 180 ngày. Không includeSubDomains/preload: tên miền onrender.com không phải của mình.
const HSTS_VALUE = 'max-age=15552000';

/**
 * Gắn header bảo mật. HSTS chỉ khi request thật sự đi HTTPS (`req.secure`, phụ thuộc `trust proxy`):
 * gửi HSTS qua HTTP thường là vô nghĩa, và trên localhost còn dễ "dính" vào trình duyệt dev.
 */
const securityHeaders = (req, res, next) => {
  // Swagger UI (`/api-docs`, chỉ bật ở dev hoặc khi ENABLE_API_DOCS=true) dựng trang bằng script/style inline nên
  // CSP của ứng dụng sẽ làm nó trắng trang. Các header còn lại vẫn áp dụng cho nó.
  const isApiDocs = req.path === '/api-docs' || req.path.startsWith('/api-docs/') || req.path === '/api-docs.json';
  for (const [name, value] of Object.entries(STATIC_HEADERS)) {
    if (isApiDocs && name === 'Content-Security-Policy') continue;
    res.setHeader(name, value);
  }
  if (req.secure) res.setHeader('Strict-Transport-Security', HSTS_VALUE);
  next();
};

/**
 * Mount ở `/api/v1`: mọi response API là dữ liệu của người đang đăng nhập nên không được lưu ở proxy hay cache
 * dùng chung. `/public/*` là danh mục công khai nên để nguyên. Handler nào tự đặt Cache-Control sau đó (SSE
 * `no-cache`, cổng competition) vẫn ghi đè được vì middleware này chạy trước.
 */
const apiNoStore = (req, res, next) => {
  const isPublic = req.path === '/public' || req.path.startsWith('/public/');
  if (!isPublic) res.setHeader('Cache-Control', 'no-store');
  next();
};

module.exports = { securityHeaders, apiNoStore, buildCsp, CSP, CSP_DIRECTIVES, STATIC_HEADERS, HSTS_VALUE };
