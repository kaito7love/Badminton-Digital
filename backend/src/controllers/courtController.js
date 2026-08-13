const CourtService = require('../services/CourtService');
const { successResponse, errorResponse } = require('../utils/responseHandler');

const getCourts = async (req, res, next) => {
  try {
    const courts = await CourtService.getAllCourts(req.branchId);
    return successResponse(res, courts, 'Courts retrieved successfully');
  } catch (err) {
    next(err);
  }
};

const getCourtById = async (req, res, next) => {
  try {
    const court = await CourtService.getCourtById(req.params.id, req.branchId);
    return successResponse(res, court, 'Court details retrieved');
  } catch (err) {
    next(err);
  }
};

const createCourt = async (req, res, next) => {
  try {
    const newCourt = await CourtService.createCourt(req.body, { actor: req.user, branchId: req.branchId, requestId: req.requestId });
    return successResponse(res, newCourt, 'Court created successfully', 201);
  } catch (err) {
    next(err);
  }
};

const updateCourt = async (req, res, next) => {
  try {
    const updated = await CourtService.updateCourt(req.params.id, req.body, { actor: req.user, branchId: req.branchId, requestId: req.requestId });
    return successResponse(res, updated, 'Court updated successfully');
  } catch (err) {
    next(err);
  }
};

const deleteCourt = async (req, res, next) => {
  try {
    await CourtService.deleteCourt(req.params.id, { actor: req.user, branchId: req.branchId, requestId: req.requestId });
    return successResponse(res, null, 'Court deleted successfully');
  } catch (err) {
    next(err);
  }
};

const openCourt = async (req, res, next) => {
  try {
    const session = await CourtService.openCourt(
      req.params.id,
      req.body.customerId,
      req.body.bookingId,
      { actor: req.user, branchId: req.branchId, employeeId: req.user?.employee?.id, requestId: req.requestId },
      req.body.playerName
    );
    return successResponse(res, session, 'Court opened successfully', 201);
  } catch (err) {
    next(err);
  }
};

const closeCourt = async (req, res, next) => {
  try {
    const result = await CourtService.closeCourt(req.params.id, { actor: req.user, branchId: req.branchId, requestId: req.requestId });
    return successResponse(res, result, 'Court closed and fee calculated');
  } catch (err) {
    next(err);
  }
};

const transferCourt = async (req, res, next) => {
  try {
    const result = await CourtService.transferCourt(req.params.id, req.body.targetCourtId, { actor: req.user, branchId: req.branchId, requestId: req.requestId });
    return successResponse(res, result, 'Court transferred successfully');
  } catch (err) {
    next(err);
  }
};

const toggleMaintenance = async (req, res, next) => {
  try {
    const isMaintenance = req.body.isMaintenance !== false;
    const result = await CourtService.toggleMaintenance(req.params.id, isMaintenance, { actor: req.user, branchId: req.branchId, requestId: req.requestId });
    return successResponse(res, result, 'Maintenance mode updated');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getCourts,
  getCourtById,
  createCourt,
  updateCourt,
  deleteCourt,
  openCourt,
  closeCourt,
  transferCourt,
  toggleMaintenance
};
