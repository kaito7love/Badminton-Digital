const { Branch } = require('../models');

const branchContextMiddleware = async (req, res, next) => {
  try {
    const headerValue = req.headers['x-branch-id'];
    const requestedBranchId = headerValue ? Number(headerValue) : null;

    if (headerValue && (!Number.isInteger(requestedBranchId) || requestedBranchId < 1)) {
      return res.status(400).json({ success: false, data: null, message: 'X-Branch-Id không hợp lệ.', errors: null });
    }

    const employeeBranchId = req.user?.employee?.branchId || null;
    const isAdmin = req.user?.role?.name === 'admin';

    // Admin quản lý cả chuỗi nên được phép chuyển sang chi nhánh bất kỳ qua
    // X-Branch-Id; nhân viên thường vẫn chỉ được thao tác đúng chi nhánh của
    // mình — gửi header khác đi là chặn ngay, không âm thầm bỏ qua.
    if (!isAdmin && requestedBranchId && employeeBranchId && requestedBranchId !== employeeBranchId) {
      return res.status(403).json({ success: false, data: null, message: 'Nhân viên không được phép thao tác tại chi nhánh này.', errors: null });
    }

    const branchId = requestedBranchId || employeeBranchId;
    if (!branchId) return next();

    const branch = await Branch.findOne({ where: { id: branchId, isActive: true } });
    if (!branch) {
      return res.status(403).json({ success: false, data: null, message: 'Chi nhánh không tồn tại hoặc đã ngưng hoạt động.', errors: null });
    }

    req.branchId = branch.id;
    req.branch = branch;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = branchContextMiddleware;
