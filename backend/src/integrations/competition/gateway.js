const express = require('express');
const rateLimit = require('express-rate-limit');
const { randomUUID } = require('crypto');
const { matchRoute } = require('./routeMap');
const { resolvePrincipal } = require('./roleScopes');
const { signServiceToken } = require('./serviceToken');
const { createCompetitionClient } = require('./client');

// Cổng nối /api/v1/competition/* → competition-service /v1/* (docs/02 mục 5).
//  1. tính năng chưa cấu hình → 503 COMPETITION_DISABLED (phần còn lại của app không bị ảnh hưởng);
//  2. đường không nằm trong danh sách cho phép → 404 ngay tại đây;
//  3. xác thực bằng chính JWT của app chính (đường SSE nhận ?token= như /realtime/stream), áp ngữ cảnh chi nhánh;
//  4. đổi sang service token ES256 theo vai trò và chuyển tiếp nguyên trạng (envelope, status, ETag).
// Chỉ vài GET bảng xếp hạng công khai được vào mà không cần đăng nhập (có giới hạn tần suất).

const PASS_HEADERS = ['content-type', 'etag', 'idempotent-replayed', 'retry-after'];
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH']);

const fail = (res, status, message, code) =>
  res.status(status).json({ success: false, data: null, message, errors: null, ...(code ? { code } : {}) });

const createGatewayRouter = ({
  config,
  client = createCompetitionClient(),
  middlewares = null,
  publicLimiter = null,
  logger = console
}) => {
  // Nạp muộn: test không cần kéo cả tầng models (và kết nối DB) khi chỉ thử luồng cổng bằng middleware giả.
  const mw = middlewares || {
    auth: require('../../middleware/authMiddleware'),
    sseAuth: require('../../middleware/sseAuthMiddleware'),
    branch: require('../../middleware/branchContextMiddleware')
  };
  const limiter = publicLimiter || rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => fail(res, 429, 'Bạn thao tác quá nhanh, thử lại sau ít phút.', 'RATE_LIMITED')
  });

  const router = express.Router();

  router.use((req, res, next) => {
    if (!config.enabled) return fail(res, 503, 'Tính năng thi đấu chưa được bật.', 'COMPETITION_DISABLED');
    const route = matchRoute(req.method, req.path);
    if (!route) return fail(res, 404, 'Không tìm thấy endpoint.');
    req.competitionRoute = route;
    return next();
  });

  router.use((req, res, next) => {
    const route = req.competitionRoute;
    const hasCredentials = Boolean(req.headers.authorization || (route.isStream && req.query.token));
    if (route.isPublic && !hasCredentials) return limiter(req, res, next);
    const authenticate = route.isStream ? mw.sseAuth : mw.auth;
    return authenticate(req, res, (err) => (err ? next(err) : mw.branch(req, res, next)));
  });

  router.use(async (req, res, next) => {
    try {
      const route = req.competitionRoute;
      let principal;
      try {
        principal = resolvePrincipal(req);
      } catch (err) {
        return fail(res, err.statusCode || 403, err.message);
      }

      const incoming = new URL(req.originalUrl, 'http://gateway');
      incoming.searchParams.delete('token'); // token của app chính không được lọt sang service
      const headers = {
        Authorization: `Bearer ${signServiceToken(config, principal, { stream: route.isStream })}`,
        Accept: route.isStream ? 'text/event-stream' : 'application/json',
        'X-Request-Id': req.requestId || randomUUID()
      };
      if (req.headers['if-match']) headers['If-Match'] = req.headers['if-match'];
      let body;
      if (WRITE_METHODS.has(req.method)) {
        // Frontend nên tự gửi Idempotency-Key để bấm hai lần vẫn một lần; thiếu thì cổng sinh (docs/02 mục 5).
        headers['Idempotency-Key'] = req.headers['idempotency-key'] || randomUUID();
        if (Number(req.headers['content-length']) > 0 || req.headers['transfer-encoding']) {
          headers['Content-Type'] = 'application/json';
          body = JSON.stringify(req.body ?? {});
        }
      }

      const abort = new AbortController();
      res.on('close', () => abort.abort());
      let upstream;
      try {
        upstream = await client.request({
          url: `${config.serviceUrl}/v1${req.path}${incoming.search}`,
          method: req.method,
          headers,
          body,
          stream: route.isStream,
          signal: abort.signal
        });
      } catch (err) {
        if (abort.signal.aborted) return undefined;
        return fail(res, err.statusCode || 502, err.message, err.code || 'COMPETITION_UNAVAILABLE');
      }

      // Service từ chối chính token của cổng = lỗi cấu hình (khoá / issuer / audience), không phải lỗi của người dùng.
      // Trả nguyên 401 thì frontend tưởng phiên đăng nhập hết hạn và đăng xuất người dùng.
      if (upstream.status === 401) {
        logger.error('[competition] Service từ chối service token (401) — kiểm tra TRUSTED_ISSUERS / COMPETITION_KEY_ID / audience.');
        return fail(res, 502, 'Dịch vụ thi đấu từ chối xác thực của hệ thống.', 'COMPETITION_AUTH_FAILED');
      }

      res.status(upstream.status);
      for (const name of PASS_HEADERS) {
        const value = upstream.headers.get(name);
        if (value) res.setHeader(name, value);
      }

      if (route.isStream && upstream.status === 200) {
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('X-Accel-Buffering', 'no'); // proxy không đệm: tỉ số phải tới màn hình ngay
        res.flushHeaders();
        try {
          for await (const chunk of upstream.body) res.write(chunk);
        } catch {
          /* trình duyệt ngắt hoặc service đóng luồng (token hết hạn) — EventSource tự nối lại */
        }
        return res.end();
      }

      res.setHeader('Cache-Control', 'no-store');
      return res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (err) {
      return next(err);
    }
  });

  return router;
};

module.exports = { createGatewayRouter };
