const AccessoryService = require('../services/AccessoryService');
const { successResponse } = require('../utils/responseHandler');

const getAccessories = async (req, res, next) => {
  try {
    const result = await AccessoryService.getAllAccessories(req.query, req.branchId);
    return successResponse(res, result.rows, 'Accessories retrieved successfully', 200, result.meta);
  } catch (err) {
    next(err);
  }
};

const getAccessoryById = async (req, res, next) => {
  try {
    const accessory = await AccessoryService.getAccessoryById(req.params.id);
    return successResponse(res, accessory, 'Accessory details retrieved');
  } catch (err) {
    next(err);
  }
};

const createAccessory = async (req, res, next) => {
  try {
    const newAccessory = await AccessoryService.createAccessory(req.body, { actor: req.user, branchId: req.branchId, requestId: req.requestId });
    return successResponse(res, newAccessory, 'Accessory created successfully', 201);
  } catch (err) {
    next(err);
  }
};

const updateAccessory = async (req, res, next) => {
  try {
    const updated = await AccessoryService.updateAccessory(req.params.id, req.body, { actor: req.user, branchId: req.branchId, requestId: req.requestId });
    return successResponse(res, updated, 'Accessory updated successfully');
  } catch (err) {
    next(err);
  }
};

const deleteAccessory = async (req, res, next) => {
  try {
    await AccessoryService.deleteAccessory(req.params.id, { actor: req.user, branchId: req.branchId, requestId: req.requestId });
    return successResponse(res, null, 'Accessory deleted successfully');
  } catch (err) {
    next(err);
  }
};

const addSessionExtra = async (req, res, next) => {
  try {
    const sessionExtra = await AccessoryService.addSessionExtra(
      req.params.sessionId,
      req.body.extraId,
      req.body.quantity,
      { actor: req.user, branchId: req.branchId, requestId: req.requestId }
    );
    return successResponse(res, sessionExtra, 'Accessory added to court session', 201);
  } catch (err) {
    next(err);
  }
};

const getSessionExtras = async (req, res, next) => {
  try {
    const extras = await AccessoryService.getSessionExtras(req.params.sessionId);
    return successResponse(res, extras, 'Session extras retrieved');
  } catch (err) {
    next(err);
  }
};

const returnSessionExtra = async (req, res, next) => {
  try {
    const result = await AccessoryService.returnSessionExtra(
      req.params.sessionId,
      req.body.extraId,
      req.body.returnQuantity,
      { actor: req.user, branchId: req.branchId, requestId: req.requestId }
    );
    return successResponse(res, result, 'Accessory returned successfully');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAccessories,
  getAccessoryById,
  createAccessory,
  updateAccessory,
  deleteAccessory,
  addSessionExtra,
  getSessionExtras,
  returnSessionExtra
};
