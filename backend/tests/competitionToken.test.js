const jwt = require('jsonwebtoken');
const { signServiceToken } = require('../src/integrations/competition/serviceToken');
const { resolvePrincipal, PrincipalError, ANONYMOUS } = require('../src/integrations/competition/roleScopes');
const { enabledConfig, PUBLIC_PEM } = require('./competitionTestKit');

const config = enabledConfig();
const verify = (token) => jwt.verify(token, PUBLIC_PEM, { algorithms: ['ES256'], audience: 'competition-service', issuer: 'badminton-digital-core', complete: true });

const user = (role, extra = {}) => ({ id: 42, role: { name: role }, ...extra });
const reqOf = (u, extra = {}) => ({ user: u, headers: {}, ...extra });

describe('service token ES256', () => {
  test('ký đúng claim theo docs/01 mục 6, kid ở header, sống 60 giây', () => {
    const principal = resolvePrincipal(reqOf(user('employee'), { branchId: 3 }));
    const { header, payload } = verify(signServiceToken(config, principal));
    expect(header).toMatchObject({ alg: 'ES256', kid: 'core-test' });
    expect(payload).toMatchObject({
      iss: 'badminton-digital-core',
      aud: 'competition-service',
      tenant: 'badminton-digital',
      sub: 'bd:user:42',
      org: ['bd:branch:3']
    });
    expect(payload.scope.split(' ')).toContain('tournament:operate');
    expect(payload.exp - payload.iat).toBe(60);
    expect(payload.player).toBeUndefined();
  });

  test('đường SSE sống 300 giây (service đóng luồng đúng lúc token hết hạn)', () => {
    const { payload } = verify(signServiceToken(config, ANONYMOUS, { stream: true }));
    expect(payload.exp - payload.iat).toBe(300);
  });

  test('khách mang claim player + tên để service tạo hồ sơ lần đầu', () => {
    const principal = resolvePrincipal(reqOf(user('customer', { customer: { id: 7, fullName: 'Nguyễn Văn A' } })));
    const { payload } = verify(signServiceToken(config, principal));
    expect(payload).toMatchObject({ player: 'bd:customer:7', player_name: 'Nguyễn Văn A', sub: 'bd:user:42', org: [] });
  });

  test('chữ ký sai khoá bị từ chối', () => {
    const token = signServiceToken(config, ANONYMOUS);
    const { publicKey } = require('crypto').generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    expect(() => jwt.verify(token, publicKey.export({ type: 'spki', format: 'pem' }), { algorithms: ['ES256'] })).toThrow();
  });
});

describe('vai trò → scope (docs/02 mục 5)', () => {
  const scopesOf = (req) => resolvePrincipal(req).scope;

  test('chưa đăng nhập: chỉ xem — BXH (ranking:read) và trang giải / buổi giao lưu công khai (public:read)', () => {
    expect(resolvePrincipal({ headers: {} })).toBe(ANONYMOUS);
    expect(ANONYMOUS.scope).toEqual(['ranking:read', 'public:read']);
  });

  test('khách: tự chấm, xem BXH, bấm điểm trận mình — không có quyền vận hành', () => {
    const scopes = scopesOf(reqOf(user('customer', { customer: { id: 1 } })));
    expect(scopes).toEqual(['rating:self', 'ranking:read', 'match:score', 'public:read']);
  });

  test.each(['customer', 'employee', 'branch_manager', 'admin'])('%s xem được trang công khai (public:read)', (role) => {
    expect(scopesOf(reqOf(user(role, { customer: { id: 1 } }), { branchId: 1 }))).toContain('public:read');
  });

  test('nhân viên có quyền vận hành nhưng KHÔNG có tournament:manage / rating:adjust / rating:assess:any', () => {
    const scopes = scopesOf(reqOf(user('employee'), { branchId: 1 }));
    expect(scopes).toEqual(expect.arrayContaining(['tournament:operate', 'session:operate', 'player:write', 'rating:assess']));
    for (const forbidden of ['tournament:manage', 'rating:adjust', 'rating:assess:any']) expect(scopes).not.toContain(forbidden);
  });

  test.each(['branch_manager', 'admin'])('%s thêm tournament:manage, rating:adjust, rating:assess:any', (role) => {
    const scopes = scopesOf(reqOf(user(role), { branchId: 1 }));
    expect(scopes).toEqual(expect.arrayContaining(['tournament:manage', 'rating:adjust', 'rating:assess:any']));
  });

  test.each(['customer', 'employee', 'branch_manager', 'admin'])('%s không bao giờ được ops:admin hay assessment:submit-ai', (role) => {
    const req = reqOf(user(role, { customer: { id: 1 } }), { branchId: 1 });
    const scopes = scopesOf(req);
    expect(scopes).not.toContain('ops:admin');
    expect(scopes).not.toContain('assessment:submit-ai');
  });

  test('org: nhân viên / quản lý theo chi nhánh của mình', () => {
    expect(resolvePrincipal(reqOf(user('employee'), { branchId: 2 })).org).toEqual(['bd:branch:2']);
    expect(resolvePrincipal(reqOf(user('branch_manager'), { branchId: 5 })).org).toEqual(['bd:branch:5']);
  });

  test('admin: chọn chi nhánh (X-Branch-Id) → chi nhánh đó; chưa chọn → * dù tài khoản có chi nhánh mặc định', () => {
    expect(resolvePrincipal(reqOf(user('admin'), { branchId: 2, headers: { 'x-branch-id': '2' } })).org).toEqual(['bd:branch:2']);
    expect(resolvePrincipal(reqOf(user('admin'), { branchId: 1, headers: {} })).org).toEqual(['*']);
  });

  test('nhân viên không xác định được chi nhánh → 403, không cấp org rỗng hay *', () => {
    expect(() => resolvePrincipal(reqOf(user('employee')))).toThrow(PrincipalError);
  });

  test('khách chưa có hồ sơ khách hàng, hoặc vai trò lạ → 403', () => {
    expect(() => resolvePrincipal(reqOf(user('customer')))).toThrow(/hồ sơ khách hàng/);
    expect(() => resolvePrincipal(reqOf(user('hacker')))).toThrow(PrincipalError);
  });
});
