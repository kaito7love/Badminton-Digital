const AuditService = require('../services/AuditService');
const { successResponse } = require('../utils/responseHandler');

const list = async (req, res, next) => {
  try {
    const result = await AuditService.list(req.query, req.branchId);
    return successResponse(res, result.rows, 'Activity logs retrieved', 200, result.meta);
  } catch (err) {
    next(err);
  }
};

module.exports = { list };
