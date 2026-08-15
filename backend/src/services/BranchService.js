const { Branch } = require('../models');

class BranchService {
  static async listActiveBranches() {
    return Branch.findAll({
      where: { isActive: true },
      attributes: ['id', 'code', 'name'],
      order: [['id', 'ASC']]
    });
  }
}

module.exports = BranchService;
