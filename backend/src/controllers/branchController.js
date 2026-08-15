const BranchService = require('../services/BranchService');
const { successResponse } = require('../utils/responseHandler');

const getBranches = async (req, res, next) => {
  try {
    const branches = await BranchService.listActiveBranches();
    return successResponse(res, branches, 'Branches retrieved successfully');
  } catch (err) {
    next(err);
  }
};

module.exports = { getBranches };
