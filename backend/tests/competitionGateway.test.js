const http = require('http');
const express = require('express');
const requestContextMiddleware = require('../src/middleware/requestContextMiddleware');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { createGatewayRouter } = require('../src/integrations/competition/gateway');
const { createCompetitionClient } = require('../src/integrations/competition/client');
const { createStreamGuard } = require('../src/integrations/competition/streamGuard');
const { enabledConfig, PUBLIC_PEM } = require('./competitionTestKit');

// Cổng thật (routeMap + roleScopes + serviceToken + client) trước một "service" giả bằng http thật.
// Hai middleware xác thực / chi nhánh được thay bằng bản giả đọc header — phần đó đã có test riêng.

const silent = { warn: jest.fn(), error: jest.fn() };
// Header chỉ nhận ASCII → mã hoá để tên tiếng Việt đi qua được.
const asJson = (value) => encodeURIComponent(JSON.stringify(value));
const parse = (raw) => JSON.parse(decodeURIComponent(raw));

const fakeMiddlewares = {
  auth: (req, res, next) => {
    const raw = req.headers['x-test-user'];
    if (!raw) return res.status(401).json({ success: false, data: null, message: 'Không tìm thấy Access Token xác thực.', errors: null });
    req.user = parse(raw);
    return next();
  },
  sseAuth: (req, res, next) => {
    const raw = req.headers['x-test-user'] || req.query.token;
    if (!raw) return res.status(401).json({ success: false, data: null, message: 'Không tìm thấy Access Token xác thực.', errors: null });
    req.user = parse(raw);
    return next();
  },
  branch: (req, res, next) => {
    if (req.headers['x-branch-id']) req.branchId = Number(req.headers['x-branch-id']);
    else if (req.user.defaultBranch) req.branchId = req.user.defaultBranch;
    return next();
  }
};

const EMPLOYEE = asJson({ id: 5, role: { name: 'employee' }, defaultBranch: 1 });
const MANAGER = asJson({ id: 6, role: { name: 'branch_manager' }, defaultBranch: 2 });
const ADMIN = asJson({ id: 1, role: { name: 'admin' }, defaultBranch: 1 });
const CUSTOMER = asJson({ id: 9, role: { name: 'customer' }, customer: { id: 77, fullName: 'Khách Thử' } });

describe('cổng /api/v1/competition', () => {
  let upstream;
  let upstreamUrl;
  let seen;
  let reply;
  let streamHandler;

  beforeAll(async () => {
    upstream = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        seen = { method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString('utf8') };
        if (streamHandler && req.url.includes('/stream')) return streamHandler(req, res);
        const r = reply || { status: 200, body: { success: true, data: { ok: true }, message: 'OK', errors: null } };
        res.writeHead(r.status, { 'Content-Type': 'application/json', ...(r.headers || {}) });
        return res.end(JSON.stringify(r.body));
      });
    });
    await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    upstreamUrl = `http://127.0.0.1:${upstream.address().port}`;
  });
  afterAll(() => new Promise((resolve) => { upstream.closeAllConnections?.(); upstream.close(resolve); }));
  beforeEach(() => { seen = null; reply = null; streamHandler = null; });

  const appWith = (configOverrides = {}, deps = {}) => {
    const config = enabledConfig({ COMPETITION_SERVICE_URL: upstreamUrl, ...configOverrides });
    const app = express();
    app.use(requestContextMiddleware);
    app.use(express.json());
    app.use('/api/v1/competition', createGatewayRouter({
      config,
      client: createCompetitionClient({ logger: silent }),
      middlewares: fakeMiddlewares,
      logger: silent,
      ...deps
    }));
    return app;
  };
  const tokenSeen = () => jwt.verify(seen.headers.authorization.replace('Bearer ', ''), PUBLIC_PEM, { algorithms: ['ES256'], audience: 'competition-service', issuer: 'badminton-digital-core' });

  describe('GET /status (giao diện dùng để ẩn / hiện menu)', () => {
    test('tắt → enabled=false, không cần đăng nhập, không gọi service', async () => {
      const app = express();
      app.use('/api/v1/competition', createGatewayRouter({ config: { enabled: false }, middlewares: fakeMiddlewares, logger: silent }));
      const res = await request(app).get('/api/v1/competition/status');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ success: true, data: { enabled: false, available: false } });
      expect(res.headers['cache-control']).toBe('no-store');
      expect(seen).toBeNull();
    });

    test('bật → enabled=true, available=true; không gọi service', async () => {
      const res = await request(appWith()).get('/api/v1/competition/status');
      expect(res.body.data).toEqual({ enabled: true, available: true });
      expect(seen).toBeNull();
    });

    test('ngắt mạch đang mở → available=false (vẫn enabled)', async () => {
      const client = createCompetitionClient({ logger: silent, failureThreshold: 1 });
      const app = appWith({ COMPETITION_SERVICE_URL: 'http://127.0.0.1:1' }, { client });
      await request(app).get('/api/v1/competition/tournaments').set('x-test-user', EMPLOYEE); // 1 lỗi mạng → mở mạch
      const res = await request(app).get('/api/v1/competition/status');
      expect(res.body.data).toEqual({ enabled: true, available: false });
    });
  });

  test('chưa cấu hình → 503 COMPETITION_DISABLED, không gọi service', async () => {
    const app = express();
    app.use('/api/v1/competition', createGatewayRouter({ config: { enabled: false }, middlewares: fakeMiddlewares, logger: silent }));
    const res = await request(app).get('/api/v1/competition/tournaments').set('x-test-user', EMPLOYEE);
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ success: false, data: null, code: 'COMPETITION_DISABLED' });
    expect(seen).toBeNull();
  });

  test.each([
    ['POST', '/events'],
    ['GET', '/ops/outbox'],
    ['POST', '/ops/outbox/1/replay'],
    ['POST', '/players/abc/assessments/ai'],
    ['GET', '/khong-co'],
    ['GET', '/tournaments/%2e%2e/ops/outbox']
  ])('%s %s → 404 ngay tại cổng, service không nhận được gì', async (method, path) => {
    const res = await request(appWith())[method.toLowerCase()](`/api/v1/competition${path}`).set('x-test-user', ADMIN);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(seen).toBeNull();
  });

  test('đường cần đăng nhập mà không có token → 401 của app chính, service không nhận được gì', async () => {
    const res = await request(appWith()).get('/api/v1/competition/tournaments');
    expect(res.status).toBe(401);
    expect(seen).toBeNull();
  });

  test('khoảng trắng trong query sang service là %20 chứ không phải "+" (service từ chối "+" bằng 400); dấu + thật vẫn là %2B', async () => {
    reply = { status: 200, headers: {}, body: { success: true, data: { items: [] }, message: 'OK', errors: null } };
    await request(appWith()).get('/api/v1/competition/players?search=thanh%20nhan&q=a%2Bb&limit=25').set('x-test-user', EMPLOYEE);
    expect(seen.url).toBe('/v1/players?search=thanh%20nhan&q=a%2Bb&limit=25');
  });

  test('nhân viên: chuyển tiếp đường dẫn + query, ký ES256 với org = chi nhánh của mình, envelope / ETag giữ nguyên', async () => {
    reply = { status: 200, headers: { ETag: '"3"' }, body: { success: true, data: { items: [] }, message: 'OK', errors: null } };
    const res = await request(appWith()).get('/api/v1/competition/tournaments?status=open&page=2').set('x-test-user', EMPLOYEE).set('X-Request-Id', 'req-1');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ items: [] });
    expect(res.headers.etag).toBe('"3"');
    expect(seen).toMatchObject({ method: 'GET', url: '/v1/tournaments?status=open&page=2' });
    expect(seen.headers['x-request-id']).toBe('req-1');
    expect(seen.headers.accept).toBe('application/json');
    const claims = tokenSeen();
    expect(claims).toMatchObject({ sub: 'bd:user:5', org: ['bd:branch:1'] });
    expect(claims.scope.split(' ')).toContain('tournament:operate');
    expect(claims.scope.split(' ')).not.toContain('tournament:manage');
    expect(claims.exp - claims.iat).toBe(60);
  });

  test('quản lý chi nhánh 2 được tournament:manage nhưng org chỉ chi nhánh 2', async () => {
    await request(appWith()).get('/api/v1/competition/tournaments').set('x-test-user', MANAGER);
    expect(tokenSeen()).toMatchObject({ org: ['bd:branch:2'] });
    expect(tokenSeen().scope.split(' ')).toContain('tournament:manage');
  });

  test('admin chọn chi nhánh 3 → org chỉ chi nhánh 3; không chọn → *', async () => {
    await request(appWith()).get('/api/v1/competition/tournaments').set('x-test-user', ADMIN).set('X-Branch-Id', '3');
    expect(tokenSeen().org).toEqual(['bd:branch:3']);
    await request(appWith()).get('/api/v1/competition/tournaments').set('x-test-user', ADMIN);
    expect(tokenSeen().org).toEqual(['*']);
  });

  test('khách: scope giới hạn, mang claim player / tên, không có org', async () => {
    await request(appWith()).get('/api/v1/competition/me').set('x-test-user', CUSTOMER);
    const claims = tokenSeen();
    expect(claims).toMatchObject({ sub: 'bd:user:9', player: 'bd:customer:77', player_name: 'Khách Thử', org: [] });
    expect(claims.scope).toBe('rating:self ranking:read match:score public:read entry:self');
  });

  test('khách chưa có hồ sơ khách hàng → 403 và service không nhận được gì', async () => {
    const res = await request(appWith()).get('/api/v1/competition/me').set('x-test-user', asJson({ id: 9, role: { name: 'customer' } }));
    expect(res.status).toBe(403);
    expect(seen).toBeNull();
  });

  test('ghi (POST): thân JSON chuyển nguyên, Idempotency-Key tự sinh khi thiếu và giữ nguyên khi có, If-Match chuyển tiếp', async () => {
    const app = appWith();
    await request(app).post('/api/v1/competition/tournaments/abc/knockout').set('x-test-user', MANAGER).send({ positions: ['a', 'b'] });
    expect(seen.body).toBe('{"positions":["a","b"]}');
    expect(seen.headers['content-type']).toBe('application/json');
    expect(seen.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);

    await request(app).put('/api/v1/competition/matches/m1/result').set('x-test-user', EMPLOYEE).set('Idempotency-Key', 'key-123').set('If-Match', '"7"').send({ games: [[21, 10]] });
    expect(seen.headers['idempotency-key']).toBe('key-123');
    expect(seen.headers['if-match']).toBe('"7"');
  });

  test('POST không thân → không gửi Content-Type / thân sang service', async () => {
    await request(appWith()).post('/api/v1/competition/tournaments/abc/open').set('x-test-user', MANAGER);
    expect(seen.body).toBe('');
    expect(seen.headers['content-type']).toBeUndefined();
  });

  test('GET không tự thêm Idempotency-Key', async () => {
    await request(appWith()).get('/api/v1/competition/me').set('x-test-user', CUSTOMER);
    expect(seen.headers['idempotency-key']).toBeUndefined();
  });

  test('lỗi nghiệp vụ của service (409, 422, 500) giữ nguyên status và envelope', async () => {
    for (const status of [409, 422, 500]) {
      reply = { status, body: { success: false, data: null, message: `lỗi ${status}`, errors: null, code: 'X' } };
      const res = await request(appWith()).post('/api/v1/competition/tournaments/abc/finalize').set('x-test-user', MANAGER).send({});
      expect(res.status).toBe(status);
      expect(res.body.message).toBe(`lỗi ${status}`);
    }
  });

  test('service từ chối token của cổng (401) → 502 COMPETITION_AUTH_FAILED, KHÔNG trả 401 (frontend sẽ tưởng hết phiên và đăng xuất)', async () => {
    reply = { status: 401, body: { success: false, data: null, message: 'Token không hợp lệ', errors: null, code: 'UNAUTHENTICATED' } };
    const res = await request(appWith()).get('/api/v1/competition/tournaments').set('x-test-user', EMPLOYEE);
    expect(res.status).toBe(502);
    expect(res.body.code).toBe('COMPETITION_AUTH_FAILED');
    expect(silent.error).toHaveBeenCalled();
  });

  test('service tắt (từ chối kết nối) → 503 COMPETITION_UNAVAILABLE đúng envelope', async () => {
    const res = await request(appWith({ COMPETITION_SERVICE_URL: 'http://127.0.0.1:1' })).get('/api/v1/competition/tournaments').set('x-test-user', EMPLOYEE);
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ success: false, data: null, code: 'COMPETITION_UNAVAILABLE' });
  });

  describe('đường công khai (BXH)', () => {
    test('chưa đăng nhập xem được BXH, token chỉ có ranking:read + public:read và sub anonymous', async () => {
      const res = await request(appWith()).get('/api/v1/competition/leaderboards/rating?page=1');
      expect(res.status).toBe(200);
      expect(seen.url).toBe('/v1/leaderboards/rating?page=1');
      expect(tokenSeen()).toMatchObject({ sub: 'anonymous', scope: 'ranking:read public:read', org: [] });
    });

    test('hồ sơ công khai cũng được; hồ sơ không công khai thì không', async () => {
      expect((await request(appWith()).get('/api/v1/competition/players/abc/public')).status).toBe(200);
      seen = null;
      expect((await request(appWith()).get('/api/v1/competition/players/abc/stats')).status).toBe(401);
      expect(seen).toBeNull();
    });

    test('đã đăng nhập thì dùng quyền của vai trò, không phải quyền ẩn danh', async () => {
      await request(appWith()).get('/api/v1/competition/leaderboards/points').set('Authorization', 'Bearer t').set('x-test-user', EMPLOYEE);
      expect(tokenSeen().sub).toBe('bd:user:5');
    });

    test('vượt giới hạn tần suất → 429, service không nhận thêm request', async () => {
      const limited = (req, res) => res.status(429).json({ success: false, data: null, message: 'Quá nhanh', errors: null });
      const res = await request(appWith({}, { publicLimiter: limited })).get('/api/v1/competition/leaderboards/rating');
      expect(res.status).toBe(429);
      expect(seen).toBeNull();
    });

    test('đường công khai chỉ GET', async () => {
      const res = await request(appWith()).post('/api/v1/competition/leaderboards/rating').send({});
      expect(res.status).toBe(401);
    });
  });

  describe('trang công khai /public/* (plan 27)', () => {
    const listen = (app) => new Promise((resolve) => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
    const SSE_HELLO = 'event: snapshot\ndata: {}\n\n';

    test('chưa đăng nhập xem được danh sách giải / chi tiết / buổi giao lưu; token anonymous có public:read, không org', async () => {
      for (const path of ['/public/tournaments?status=open&page=1', '/public/tournaments/abc/entries', '/public/sessions/abc/board']) {
        seen = null;
        const res = await request(appWith()).get(`/api/v1/competition${path}`);
        expect([path, res.status]).toEqual([path, 200]);
        expect(seen.url).toBe(`/v1${path}`);
        expect(tokenSeen()).toMatchObject({ sub: 'anonymous', scope: 'ranking:read public:read', org: [] });
      }
    });

    test('dấu phẩy trong status sang service là %2C (bộ kiểm hợp đồng của service từ chối dấu phẩy thô)', async () => {
      await request(appWith()).get('/api/v1/competition/public/tournaments?status=open,drawn');
      expect(seen.url).toBe('/v1/public/tournaments?status=open%2Cdrawn');
    });

    test('đã đăng nhập thì dùng quyền của vai trò (khách mang claim player để service nhận ra "mình")', async () => {
      await request(appWith()).get('/api/v1/competition/public/tournaments/abc/entries').set('Authorization', 'Bearer t').set('x-test-user', CUSTOMER);
      expect(tokenSeen()).toMatchObject({ sub: 'bd:user:9', player: 'bd:customer:77', org: [] });
      expect(tokenSeen().scope.split(' ')).toContain('public:read');
    });

    test('chỉ đọc: POST / PUT / PATCH / DELETE vào /public/* → 404 ngay tại cổng, service không nhận được gì', async () => {
      for (const method of ['post', 'put', 'patch', 'delete']) {
        const res = await request(appWith())[method]('/api/v1/competition/public/tournaments/abc').set('x-test-user', ADMIN).send({});
        expect([method, res.status]).toEqual([method, 404]);
        expect(seen).toBeNull();
      }
      expect((await request(appWith()).get('/api/v1/competition/public')).status).toBe(404);
    });

    test('vượt giới hạn tần suất → 429, service không nhận thêm request', async () => {
      const limited = (req, res) => res.status(429).json({ success: false, data: null, message: 'Quá nhanh', errors: null });
      const res = await request(appWith({}, { publicLimiter: limited })).get('/api/v1/competition/public/tournaments');
      expect(res.status).toBe(429);
      expect(seen).toBeNull();
    });

    test('khách tự đăng ký giải (plan 27): POST /me/tournaments/:id/entries chuyển nguyên thân, tự sinh Idempotency-Key, token có entry:self + player; chưa đăng nhập → 401', async () => {
      const body = { partner: { guest: { name: 'Lê Văn Bình', phone: '0912345678', gender: 'male', level: 'tb' } } };
      const res = await request(appWith()).post('/api/v1/competition/me/tournaments/abc/entries').set('x-test-user', CUSTOMER).send(body);
      expect(res.status).toBe(200);
      expect(seen).toMatchObject({ method: 'POST', url: '/v1/me/tournaments/abc/entries' });
      expect(JSON.parse(seen.body)).toEqual(body);
      expect(seen.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
      expect(tokenSeen()).toMatchObject({ player: 'bd:customer:77' });
      expect(tokenSeen().scope.split(' ')).toContain('entry:self');
      seen = null;
      expect((await request(appWith()).post('/api/v1/competition/me/tournaments/abc/entries').send(body)).status).toBe(401);
      expect((await request(appWith()).delete('/api/v1/competition/me/tournaments/abc/entries')).status).toBe(401);
      expect((await request(appWith()).get('/api/v1/competition/me/partners?search=an')).status).toBe(401);
      expect(seen).toBeNull();
    });

    test('luồng SSE công khai: không cần đăng nhập, token 300 giây, đường dẫn đúng', async () => {
      streamHandler = (req, res) => { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.end(SSE_HELLO); };
      const server = await listen(appWith());
      try {
        const res = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/competition/public/tournaments/abc/stream`);
        expect(res.status).toBe(200);
        expect(await res.text()).toContain('event: snapshot');
        expect(seen.url).toBe('/v1/public/tournaments/abc/stream');
        const claims = tokenSeen();
        expect([claims.sub, claims.exp - claims.iat]).toEqual(['anonymous', 300]);
      } finally {
        server.closeAllConnections();
        server.close();
      }
    });

    test('giới hạn số luồng công khai mỗi địa chỉ: quá giới hạn → 429 TOO_MANY_STREAMS; đóng một luồng thì mở lại được', async () => {
      const open = [];
      streamHandler = (req, res) => { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.write(SSE_HELLO); open.push(res); };
      const server = await listen(appWith({}, { streamGuard: createStreamGuard({ perIp: 2, total: 50 }) }));
      try {
        const url = `http://127.0.0.1:${server.address().port}/api/v1/competition/public/sessions/abc/stream`;
        const controllers = [new AbortController(), new AbortController()];
        const first = await Promise.all(controllers.map((c) => fetch(url, { signal: c.signal })));
        expect(first.map((r) => r.status)).toEqual([200, 200]);
        const third = await fetch(url);
        expect(third.status).toBe(429);
        expect((await third.json()).code).toBe('TOO_MANY_STREAMS');
        controllers[0].abort();
        await new Promise((resolve) => setTimeout(resolve, 300));
        const again = await fetch(url);
        expect(again.status).toBe(200);
        controllers[1].abort();
        await again.body.cancel();
      } finally {
        open.forEach((r) => r.end());
        server.closeAllConnections();
        server.close();
      }
    });

    test('luồng SSE của nhân viên (không phải /public) không bị giới hạn luồng công khai', async () => {
      streamHandler = (req, res) => { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.end(SSE_HELLO); };
      const server = await listen(appWith({}, { streamGuard: createStreamGuard({ perIp: 0, total: 0 }) }));
      try {
        const res = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/competition/tournaments/abc/stream?token=${EMPLOYEE}`);
        expect(res.status).toBe(200);
        await res.text();
      } finally {
        server.closeAllConnections();
        server.close();
      }
    });
  });

  describe('luồng SSE', () => {
    const listen = (app) => new Promise((resolve) => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });

    test('chuyển từng mảnh ngay (không đệm), token 300 giây, ?token= của app chính không lọt sang service, header chống đệm', async () => {
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      streamHandler = (req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
        res.write('event: snapshot\ndata: {"a":1}\n\n');
        gate.then(() => { res.write('event: score\ndata: {"b":2}\n\n'); res.end(); });
      };
      const server = await listen(appWith());
      try {
        const port = server.address().port;
        const userToken = EMPLOYEE;
        const res = await fetch(`http://127.0.0.1:${port}/api/v1/competition/tournaments/abc/stream?token=${userToken}&x=1`);
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('text/event-stream');
        expect(res.headers.get('x-accel-buffering')).toBe('no');
        const reader = res.body.getReader();
        const first = new TextDecoder().decode((await reader.read()).value);
        expect(first).toContain('event: snapshot'); // tới nơi dù service chưa gửi xong mảnh thứ hai
        release();
        const second = new TextDecoder().decode((await reader.read()).value);
        expect(second).toContain('event: score');

        expect(seen.url).toBe('/v1/tournaments/abc/stream?x=1');
        expect(seen.headers.accept).toBe('text/event-stream');
        const claims = tokenSeen();
        expect(claims.exp - claims.iat).toBe(300);
      } finally {
        release();
        server.closeAllConnections();
        server.close();
      }
    });

    test('?branchId= của EventSource thành X-Branch-Id (admin chọn chi nhánh) và không lọt sang service', async () => {
      streamHandler = (req, res) => { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.end('event: snapshot' + String.fromCharCode(10) + 'data: {}' + String.fromCharCode(10, 10)); };
      const server = await listen(appWith());
      try {
        const port = server.address().port;
        const res = await fetch(`http://127.0.0.1:${port}/api/v1/competition/tournaments/abc/stream?token=${ADMIN}&branchId=3`);
        await res.text();
        expect(seen.url).toBe('/v1/tournaments/abc/stream');
        expect(tokenSeen().org).toEqual(['bd:branch:3']);
      } finally {
        server.closeAllConnections();
        server.close();
      }
    });

    test('luồng không có token → 401 trước khi gọi service', async () => {
      const res = await request(appWith()).get('/api/v1/competition/sessions/abc/stream');
      expect(res.status).toBe(401);
      expect(seen).toBeNull();
    });
  });
});
