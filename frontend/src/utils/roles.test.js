import { describe, test, expect } from 'vitest';
import { roleOf, isStaff, isStaffPath, homePathForRole, redirectAfterLogin } from './roles';

const admin = { role: 'admin' };
const employee = { role: 'employee' };
const customer = { role: 'customer' };

describe('roles — phân luồng theo vai trò', () => {
  test('roleOf đọc được cả dạng chuỗi lẫn dạng object của API', () => {
    expect(roleOf({ role: 'admin' })).toBe('admin');
    expect(roleOf({ role: { name: 'employee' } })).toBe('employee');
    expect(roleOf(null)).toBeNull();
  });

  test('chỉ admin và nhân viên là người của quán', () => {
    expect(isStaff(admin)).toBe(true);
    expect(isStaff(employee)).toBe(true);
    expect(isStaff(customer)).toBe(false);
  });

  test('trang chủ mỗi vai trò là màn hình họ thật sự mở được', () => {
    expect(homePathForRole(admin)).toBe('/dashboard');
    // /dashboard gọi API báo cáo vốn chỉ cho admin — nhân viên vào là 403
    expect(homePathForRole(employee)).toBe('/courts');
    expect(homePathForRole(customer)).toBe('/my-bookings');
  });

  test('nhận diện được đường dẫn thuộc bàn làm việc nhân viên', () => {
    expect(isStaffPath('/courts')).toBe(true);
    expect(isStaffPath('/reports')).toBe(true);
    expect(isStaffPath('/bookings/12')).toBe(true);
    expect(isStaffPath('/')).toBe(false);
    expect(isStaffPath('/my-bookings')).toBe(false);
  });

  test('khách đang đặt sân dở thì đăng nhập xong phải quay lại trang chủ', () => {
    expect(redirectAfterLogin(customer, '/')).toBe('/');
  });

  test('khách bị chặn khỏi màn quản trị, không rơi vào màn 403', () => {
    expect(redirectAfterLogin(customer, '/reports')).toBe('/my-bookings');
    expect(redirectAfterLogin(customer, '/courts')).toBe('/my-bookings');
  });

  test('nhân viên vẫn được đưa về đúng chỗ đang dở', () => {
    expect(redirectAfterLogin(employee, '/courts')).toBe('/courts');
    expect(redirectAfterLogin(admin, '/reports')).toBe('/reports');
  });

  test('không có nơi dở dang thì về trang chủ của vai trò', () => {
    expect(redirectAfterLogin(employee, null)).toBe('/courts');
    expect(redirectAfterLogin(customer, null)).toBe('/my-bookings');
  });
});
