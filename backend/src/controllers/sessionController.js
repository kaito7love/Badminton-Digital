const SessionService = require('../services/SessionService');
const { successResponse } = require('../utils/responseHandler');

/**
 * GET /api/v1/sessions/history
 * Lịch sử các phiên chơi đã đóng — dùng cho HistoryPage tab "Phiên Chơi"
 * Query params: date, courtName, customerId, employeeId, page, limit
 */
const getSessionHistory = async (req, res, next) => {
  try {
    const result = await SessionService.getSessionHistory(
      req.query,
      { branchId: req.branchId, actor: req.user }
    );
    return successResponse(res, result.rows, 'Session history retrieved successfully', 200, result.meta);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/sessions/:sessionId
 * Chi tiết một phiên chơi (kể cả đang chơi)
 */
const getSessionById = async (req, res, next) => {
  try {
    const session = await SessionService.getSessionById(
      req.params.sessionId,
      { branchId: req.branchId, actor: req.user }
    );
    return successResponse(res, session, 'Session details retrieved');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getSessionHistory,
  getSessionById,
};
