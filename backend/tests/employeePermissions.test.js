const EmployeeService = require('../src/services/EmployeeService');

const account = (id, role) => ({ id, role: { name: role } });
const admin = account(1, 'admin');
const secondAdmin = account(9, 'admin');
const manager = account(2, 'branch_manager');
const otherManager = account(3, 'branch_manager');
const staff = account(4, 'employee');

const outcome = (actor, targetUser, action) => {
  try {
    EmployeeService.assertCanManage({ actor, targetUser, action });
    return 'allow';
  } catch (err) {
    return err.statusCode;
  }
};

describe('EmployeeService.assertCanManage — bảng quyền sửa/xoá tài khoản nhân viên', () => {
  test.each([
    // [mô tả, người thao tác, tài khoản bị tác động, sửa, xoá]
    ['admin → nhân viên', admin, staff, 'allow', 'allow'],
    ['admin → quản lý chi nhánh', admin, manager, 'allow', 'allow'],
    ['admin → admin khác', admin, secondAdmin, 'allow', 403],
    ['admin → chính mình', admin, admin, 'allow', 403],
    ['quản lý → nhân viên', manager, staff, 'allow', 'allow'],
    ['quản lý → admin', manager, admin, 403, 403],
    ['quản lý → quản lý khác', manager, otherManager, 403, 403],
    ['quản lý → chính mình', manager, manager, 403, 403],
    ['nhân viên → nhân viên khác', staff, account(5, 'employee'), 403, 403]
  ])('%s', (_, actor, target, update, del) => {
    expect(outcome(actor, target, 'update')).toBe(update);
    expect(outcome(actor, target, 'delete')).toBe(del);
  });

  test('không rõ vai trò tài khoản bị tác động: quản lý không đụng được, admin không xoá được', () => {
    expect(outcome(manager, { id: 7 }, 'update')).toBe(403);
    expect(outcome(admin, null, 'delete')).toBe(403);
  });

  test('thiếu người thao tác thì chặn', () => {
    expect(outcome(undefined, staff, 'update')).toBe(403);
  });

  test('action lạ là lỗi lập trình, không phải 403', () => {
    expect(() => EmployeeService.assertCanManage({ actor: admin, targetUser: staff, action: 'promote' })).toThrow(/action không hợp lệ/);
  });
});
