import { roleOf, isStaff } from '../../../utils/roles';

// Ai thấy / bấm được gì trên giao diện thi đấu. Chỉ để ẨN nút không có quyền — service mới là chốt chặn thật (vẫn trả 403).
// Cùng bảng vai trò → scope của cổng (backend/src/integrations/competition/roleScopes.js):
//   nhân viên: vận hành (đăng ký, điểm danh, gọi sân, nhập tỉ số, giao lưu); quản lý / admin: thêm tạo giải, bốc thăm, khoá sơ đồ,
//   chốt giải, chỉnh điểm, duyệt; khách: phần của mình.

export const permissionsFor = (user) => {
  const role = roleOf(user);
  const staff = isStaff(user);
  const manager = role === 'admin' || role === 'branch_manager';
  return {
    role,
    isStaff: staff,
    isManager: manager,
    isCustomer: role === 'customer',
    isAnonymous: !role,
    canOperate: staff,
    canManageTournaments: manager,
    canAdjustRating: manager,
    canAssessAny: manager,
    canReviewAssessments: manager,
    canScoreOwnMatch: role === 'customer'
  };
};
