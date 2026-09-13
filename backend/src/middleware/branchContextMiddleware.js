const { Branch } = require('../models');

const STAFF_ROLES = ['admin', 'branch_manager', 'employee'];

const forbid = (res, message) => res.status(403).json({ success: false, data: null, message, errors: null });

const branchContextMiddleware = async (req, res, next) => {
  try {
    const headerValue = req.headers['x-branch-id'];
    const requestedBranchId = headerValue ? Number(headerValue) : null;

    if (headerValue && (!Number.isInteger(requestedBranchId) || requestedBranchId < 1)) {
      return res.status(400).json({ success: false, data: null, message: 'X-Branch-Id không hợp lệ.', errors: null });
    }

    const roleName = req.user?.role?.name;
    const isAdmin = roleName === 'admin';
    const employeeBranchId = req.user?.employee?.branchId || null;

    // Chọn chi nhánh là việc của nhân viên. Tài khoản khách không có dòng
    // Employee nên trước đây header của khách được nhận âm thầm — gửi số nào là
    // đọc được dữ liệu vận hành của chi nhánh đó. Khách không gửi header thì đi
    // tiếp không có branchId; các service tự giới hạn về dữ liệu của chính khách.
    if (!STAFF_ROLES.includes(roleName)) {
      if (headerValue) return forbid(res, 'Chỉ tài khoản nhân viên được chọn chi nhánh.');
      return next();
    }

    // Nhân viên/quản lý chưa gắn chi nhánh (thiếu dòng Employee) từng được coi
    // là "không giới hạn chi nhánh" — đọc và thao tác được cả chuỗi.
    if (!isAdmin && !employeeBranchId) {
      return forbid(res, 'Tài khoản nhân viên chưa được gán chi nhánh.');
    }

    // Admin quản lý cả chuỗi nên được phép chuyển sang chi nhánh bất kỳ qua
    // X-Branch-Id; nhân viên thường vẫn chỉ được thao tác đúng chi nhánh của
    // mình — gửi header khác đi là chặn ngay, không âm thầm bỏ qua.
    if (!isAdmin && requestedBranchId && requestedBranchId !== employeeBranchId) {
      return forbid(res, 'Nhân viên không được phép thao tác tại chi nhánh này.');
    }

    const branchId = requestedBranchId || employeeBranchId;
    if (!branchId) return next();

    const branch = await Branch.findOne({ where: { id: branchId, isActive: true } });
    if (!branch) {
      return forbid(res, 'Chi nhánh không tồn tại hoặc đã ngưng hoạt động.');
    }

    req.branchId = branch.id;
    req.branch = branch;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = branchContextMiddleware;
