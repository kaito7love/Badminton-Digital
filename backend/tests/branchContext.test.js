jest.mock('../src/models', () => ({ Branch: { findOne: jest.fn() } }));

const { Branch } = require('../src/models');
const branchContextMiddleware = require('../src/middleware/branchContextMiddleware');

// Chi nhánh 1–3 đang hoạt động, còn lại coi như không tồn tại/ngưng.
const ACTIVE_BRANCHES = [1, 2, 3];

const account = (role, branchId) => ({
  role: { name: role },
  employee: branchId ? { branchId } : null
});

const run = async (user, branchHeader) => {
  const req = { user, headers: branchHeader === undefined ? {} : { 'x-branch-id': String(branchHeader) } };
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
  };
  const next = jest.fn();
  await branchContextMiddleware(req, res, next);
  return { req, res, next };
};

beforeEach(() => {
  Branch.findOne.mockReset();
  Branch.findOne.mockImplementation(async ({ where }) =>
    (ACTIVE_BRANCHES.includes(where.id) ? { id: where.id, isActive: true } : null));
});

describe('branchContextMiddleware — ai được chọn chi nhánh', () => {
  test('khách gửi X-Branch-Id → 403, không tra chi nhánh', async () => {
    const { res, next } = await run(account('customer'), 2);
    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe('Chỉ tài khoản nhân viên được chọn chi nhánh.');
    expect(next).not.toHaveBeenCalled();
    expect(Branch.findOne).not.toHaveBeenCalled();
  });

  test('khách không gửi header → đi tiếp, không có branchId', async () => {
    const { req, next } = await run(account('customer'));
    expect(next).toHaveBeenCalledWith();
    expect(req.branchId).toBeUndefined();
  });

  test('không rõ vai trò mà gửi header → 403', async () => {
    const { res } = await run({ role: null, employee: null }, 1);
    expect(res.statusCode).toBe(403);
  });

  test.each(['employee', 'branch_manager'])('%s chưa gắn chi nhánh → 403 kể cả khi không gửi header', async (role) => {
    const { res, next } = await run(account(role));
    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe('Tài khoản nhân viên chưa được gán chi nhánh.');
    expect(next).not.toHaveBeenCalled();
  });

  test.each([
    // [vai trò, chi nhánh của tài khoản, header, chi nhánh kỳ vọng]
    ['employee', 1, undefined, 1],
    ['employee', 1, 1, 1],
    ['branch_manager', 2, undefined, 2],
    ['admin', null, 3, 3],
    ['admin', 1, 2, 2]
  ])('%s (chi nhánh %s) gửi %s → làm việc ở chi nhánh %s', async (role, own, header, expected) => {
    const { req, next } = await run(account(role, own), header);
    expect(next).toHaveBeenCalledWith();
    expect(req.branchId).toBe(expected);
  });

  test.each(['employee', 'branch_manager'])('%s gửi chi nhánh khác của mình → 403', async (role) => {
    const { res, next } = await run(account(role, 1), 2);
    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe('Nhân viên không được phép thao tác tại chi nhánh này.');
    expect(next).not.toHaveBeenCalled();
  });

  test('admin không có dòng Employee, không gửi header → đi tiếp không có branchId', async () => {
    const { req, next } = await run(account('admin'));
    expect(next).toHaveBeenCalledWith();
    expect(req.branchId).toBeUndefined();
  });

  test.each(['abc', '0', '-1', '1.5'])('X-Branch-Id "%s" → 400', async (header) => {
    const { res } = await run(account('admin'), header);
    expect(res.statusCode).toBe(400);
  });

  test('chi nhánh không tồn tại hoặc đã ngưng → 403', async () => {
    const { res } = await run(account('admin'), 9);
    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe('Chi nhánh không tồn tại hoặc đã ngưng hoạt động.');
  });
});
