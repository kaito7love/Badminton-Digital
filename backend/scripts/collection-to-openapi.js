#!/usr/bin/env node
/**
 * Sinh `src/docs/openapi.yaml` từ Postman collection đã được kiểm chứng.
 *
 * Vì sao không gõ tay YAML: collection ở `postman/` mô tả đủ 112 endpoint kèm
 * body mẫu và mô tả, và đã chạy thật 324 assertion / 0 lỗi trên server — tức là
 * nội dung đó đã được máy kiểm chứng. Gõ lại bằng tay là vứt bỏ bằng chứng đó
 * rồi tự tạo ra nguồn sự thật thứ ba để lệch pha.
 *
 * Nhưng collection KHÔNG phải nguồn sự thật cuối cùng — `src/routes/` mới là.
 * Nên script này đọc cả hai và **bắt buộc khớp 1-1**: thừa hay thiếu một
 * endpoint là dừng với mã lỗi khác 0. Nhờ vậy bước sinh tài liệu kiêm luôn
 * việc canh cho collection không tụt lại sau code.
 *
 * Tên tham số đường dẫn lấy từ route thật (`/courts/:id`), không lấy từ biến
 * của Postman (`{{tmpCourtId}}`) — nếu không, cùng một đường dẫn sẽ bị tách
 * thành mấy path khác nhau trong spec.
 *
 *   npm run docs:build
 */
'use strict';

const fs = require('fs');
const path = require('path');
const YAML = require('yamljs');

const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(ROOT, '..');
const COLLECTION = path.join(REPO, 'postman', 'badminton_api_collection.json');
const SERVER_FILE = path.join(ROOT, 'src', 'server.js');
const ROUTES_DIR = path.join(ROOT, 'src', 'routes');
const OUT = path.join(ROOT, 'src', 'docs', 'openapi.yaml');

const BASE_PATH = '/api/v1';

// ── 1. Đọc route thật từ server.js + routes/ ────────────────────────────────

/** `app.use('/api/v1/courts', require('./routes/courtRoutes'))` → { courtRoutes: '/courts' } */
function readMounts() {
  const src = fs.readFileSync(SERVER_FILE, 'utf8');
  const re = /app\.use\(\s*'\/api\/v1([^']*)'\s*,\s*(?:require\('\.\/routes\/(\w+)'\)|(\w+))\s*\)/g;
  const mounts = {};
  let m;
  while ((m = re.exec(src))) {
    const file = m[2] || guessFileFromVar(src, m[3]);
    if (file) mounts[file] = m[1];
  }
  return mounts;
}

/** Vài route được require lên biến ở đầu file rồi mới app.use(biến). */
function guessFileFromVar(src, varName) {
  const m = new RegExp(`const\\s+${varName}\\s*=\\s*require\\('\\./routes/(\\w+)'\\)`).exec(src);
  return m ? m[1] : null;
}

function readRoutes() {
  const mounts = readMounts();
  const routes = [];
  for (const [file, prefix] of Object.entries(mounts)) {
    const full = path.join(ROUTES_DIR, `${file}.js`);
    if (!fs.existsSync(full)) continue;
    const src = fs.readFileSync(full, 'utf8');
    const re = /router\.(get|post|put|patch|delete)\(\s*'([^']*)'/g;
    let m;
    while ((m = re.exec(src))) {
      const sub = m[2] === '/' ? '' : m[2];
      routes.push({
        method: m[1].toLowerCase(),
        routePath: `${prefix}${sub}` || '/',
        file
      });
    }
  }
  return routes;
}

// ── 2. Đọc request từ Postman collection ────────────────────────────────────

function flattenRequests(items, tag, acc) {
  for (const it of items) {
    if (it.item) flattenRequests(it.item, it.name, acc);
    else if (it.request) acc.push({ ...it, tag });
  }
  return acc;
}

/** ['courts','{{tmpCourtId}}'] → 'courts/*' ; [':id'] cũng thành '*' */
const shapeOf = (segments) =>
  segments.map((s) => (s.startsWith('{{') || s.startsWith(':') ? '*' : s)).join('/');

// ── 3. Ghép collection ↔ route, dựng OpenAPI ────────────────────────────────

const METHOD_DEFAULT_CODE = { post: '201', get: '200', put: '200', patch: '200', delete: '200' };

/** Mô tả trong collection là Markdown nhiều dòng — giữ nguyên, YAML tự xử lý. */
const clean = (s) => (s || '').trim();

function build() {
  const collection = JSON.parse(fs.readFileSync(COLLECTION, 'utf8'));
  const requests = flattenRequests(collection.item, null, []);
  const routes = readRoutes();

  // Chỉ mục route theo method + hình dạng đường dẫn.
  const routeIndex = new Map();
  for (const r of routes) {
    const key = `${r.method} ${shapeOf(r.routePath.split('/').filter(Boolean))}`;
    if (!routeIndex.has(key)) routeIndex.set(key, []);
    routeIndex.get(key).push(r);
  }

  const paths = {};
  const tags = [];
  const matched = new Set();
  const unmatched = [];

  for (const it of requests) {
    const req = it.request;
    const method = req.method.toLowerCase();
    const segs = (req.url.path || []).filter(Boolean);
    const key = `${method} ${shapeOf(segs)}`;
    const candidates = routeIndex.get(key) || [];

    if (!candidates.length) {
      unmatched.push(`${req.method} ${segs.join('/')}  ← có trong collection, không thấy trong routes/`);
      continue;
    }
    const route = candidates.shift();
    matched.add(`${route.method} ${route.routePath}`);

    if (!tags.includes(it.tag)) tags.push(it.tag);

    // Đường dẫn OpenAPI dùng TÊN THAM SỐ THẬT của route.
    const oaPath = BASE_PATH + '/' + route.routePath.split('/').filter(Boolean)
      .map((s) => (s.startsWith(':') ? `{${s.slice(1)}}` : s)).join('/');

    const parameters = [];
    for (const s of route.routePath.split('/').filter(Boolean)) {
      if (!s.startsWith(':')) continue;
      parameters.push({
        name: s.slice(1), in: 'path', required: true,
        schema: { type: 'string' },
        description: 'Mã định danh bản ghi'
      });
    }
    for (const q of req.url.query || []) {
      parameters.push({
        name: q.key, in: 'query', required: false,
        schema: { type: 'string' },
        example: String(q.value || '').replace(/\{\{|\}\}/g, '')
      });
    }
    if ((req.header || []).some((h) => h.key === 'X-Branch-Id')) {
      parameters.push({
        name: 'X-Branch-Id', in: 'header', required: false,
        schema: { type: 'integer' },
        description: 'Chi nhánh đang thao tác. `admin` có thể gửi bất kỳ chi nhánh nào; '
          + '`employee`/`branch_manager` bị khoá vào chi nhánh của mình. Bỏ trống thì dùng chi nhánh của tài khoản. '
          + 'Chỉ tài khoản nhân viên được gửi header này — tài khoản `customer` gửi sẽ nhận 403.'
      });
    }

    const op = {
      tags: [it.tag],
      summary: it.name,
      operationId: `${method}_${route.routePath.replace(/[^\w]+/g, '_').replace(/^_|_$/g, '')}`,
      description: clean(req.description)
    };
    if (parameters.length) op.parameters = parameters;

    if (req.body && req.body.raw) {
      let example;
      try {
        example = JSON.parse(req.body.raw.replace(/"\{\{[^}]+\}\}"/g, '"string"'));
      } catch (_) {
        example = undefined;
      }
      op.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: { type: 'object' },
            ...(example !== undefined ? { example } : {})
          }
        }
      };
    }

    // Endpoint không đi qua authMiddleware được đánh dấu noauth trong collection.
    if (req.auth && req.auth.type === 'noauth') op.security = [];

    const okCode = req.body || method === 'post' ? METHOD_DEFAULT_CODE[method] : '200';
    op.responses = {
      [okCode]: { $ref: '#/components/responses/Success' },
      400: { $ref: '#/components/responses/ValidationError' },
      401: { $ref: '#/components/responses/Unauthorized' },
      403: { $ref: '#/components/responses/Forbidden' },
      404: { $ref: '#/components/responses/NotFound' }
    };

    paths[oaPath] = paths[oaPath] || {};
    paths[oaPath][method] = op;
  }

  // Route có trong code mà collection bỏ sót.
  const missing = routes
    .filter((r) => !matched.has(`${r.method} ${r.routePath}`))
    .map((r) => `${r.method.toUpperCase()} ${r.routePath}  ← có trong routes/, thiếu trong collection`);

  return { collection, paths, tags, routes, requests, problems: unmatched.concat(missing) };
}

// ── 4. Khung spec ───────────────────────────────────────────────────────────

function assemble({ collection, paths, tags }) {
  const envelope = {
    type: 'object',
    required: ['success', 'data', 'message', 'errors'],
    properties: {
      success: { type: 'boolean' },
      data: { nullable: true, description: 'Payload của endpoint; `null` khi lỗi' },
      message: { type: 'string', nullable: true },
      errors: { nullable: true, description: 'Danh sách lỗi validation, `null` khi thành công' }
    }
  };
  const jsonEnvelope = (desc) => ({
    description: desc,
    content: { 'application/json': { schema: { $ref: '#/components/schemas/Envelope' } } }
  });

  return {
    openapi: '3.0.3',
    info: {
      title: 'Badminton Digital Management API',
      version: '1.0.0',
      description: [
        'REST API quản lý chuỗi sân cầu lông — đặt sân, phiên chơi, bán lẻ, kho, báo cáo.',
        '',
        '**Sinh tự động** từ `postman/badminton_api_collection.json` bằng `npm run docs:build`.',
        'Đừng sửa tay file YAML này — sửa collection rồi chạy lại lệnh trên.',
        '',
        '## Envelope',
        'Mọi phản hồi đều có dạng `{ success, data, message, errors }`.',
        '',
        '## Xác thực',
        'Bấm **Authorize** rồi dán access token lấy từ `POST /auth/login`',
        '(tài khoản mẫu: `0901111111` / `Admin@123`). Access token sống 15 phút.',
        '',
        '## Đa chi nhánh',
        'Phần lớn endpoint nhận header `X-Branch-Id`. Nhóm `Public` là nhóm duy nhất không cần đăng nhập.'
      ].join('\n')
    },
    servers: [
      { url: 'http://localhost:5000', description: 'Máy cá nhân' },
      { url: '{scheme}://{host}', description: 'Máy chủ khác', variables: {
        scheme: { default: 'https', enum: ['http', 'https'] },
        host: { default: 'localhost:5000' }
      } }
    ],
    tags: tags.map((t) => ({ name: t })),
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
      },
      schemas: { Envelope: envelope },
      responses: {
        Success: jsonEnvelope('Thành công'),
        ValidationError: jsonEnvelope('Dữ liệu gửi lên không hợp lệ'),
        Unauthorized: jsonEnvelope('Thiếu token hoặc token hết hạn'),
        Forbidden: jsonEnvelope('Vai trò không đủ quyền, hoặc sai chi nhánh'),
        NotFound: jsonEnvelope('Không tìm thấy bản ghi')
      }
    },
    paths
  };
}

// ── 5. Chạy ─────────────────────────────────────────────────────────────────

const built = build();

if (built.problems.length) {
  console.error('✖ Collection và routes/ không khớp 1-1:\n');
  built.problems.forEach((p) => console.error('   ' + p));
  console.error('\nSửa collection (hoặc route) cho khớp rồi chạy lại.');
  process.exit(1);
}

const spec = assemble(built);
const operationCount = Object.values(spec.paths).reduce((n, p) => n + Object.keys(p).length, 0);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  '# ⚠️ FILE SINH TỰ ĐỘNG — đừng sửa tay.\n'
  + '# Nguồn: postman/badminton_api_collection.json · Sinh lại: npm run docs:build\n'
  + YAML.stringify(spec, 12, 2),
  'utf8'
);

console.log(`✓ ${path.relative(REPO, OUT)}`);
console.log(`  ${operationCount} operation / ${spec.tags.length} tag`);
console.log(`  khớp 1-1 với ${built.routes.length} route trong src/routes/`);
