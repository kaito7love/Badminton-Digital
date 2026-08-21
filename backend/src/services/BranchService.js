const { Branch } = require('../models');

class BranchService {
  static async listActiveBranches() {
    return Branch.findAll({
      where: { isActive: true },
      // `timezone` là bắt buộc với frontend: mọi mốc thời gian trả về đều là
      // UTC, phải có múi giờ chi nhánh mới hiển thị đúng giờ nơi phát sinh
      // giao dịch (ngồi ở VN xem chi nhánh Mỹ phải thấy giờ Mỹ).
      attributes: ['id', 'code', 'name', 'timezone'],
      order: [['id', 'ASC']]
    });
  }
}

module.exports = BranchService;
