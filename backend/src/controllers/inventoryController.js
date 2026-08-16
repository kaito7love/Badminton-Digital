const InventoryService = require('../services/InventoryService');
const { successResponse } = require('../utils/responseHandler');

const getStockLevels = async (req, res, next) => {
  try {
    const result = await InventoryService.getStockLevels(req.query, req.branchId);
    return successResponse(res, result.rows, 'Stock levels retrieved successfully', 200, result.meta);
  } catch (err) {
    next(err);
  }
};

const getProductStockLevels = async (req, res, next) => {
  try {
    const result = await InventoryService.getProductStockLevels(req.query, req.branchId);
    return successResponse(res, result.rows, 'Product stock levels retrieved successfully', 200, result.meta);
  } catch (err) {
    next(err);
  }
};

const getMovements = async (req, res, next) => {
  try {
    const result = await InventoryService.listMovements(req.query, req.branchId);
    return successResponse(res, result.rows, 'Stock movements retrieved successfully', 200, result.meta);
  } catch (err) {
    next(err);
  }
};

const createAdjustment = async (req, res, next) => {
  try {
    const { movement, stock } = await InventoryService.createManualAdjustment({
      branchId: req.branchId,
      extraId: req.body.extraId,
      productVariantId: req.body.productVariantId,
      type: req.body.type,
      quantity: req.body.quantity,
      note: req.body.note,
      actor: req.user,
      requestId: req.requestId
    });
    return successResponse(res, { movement, stock }, 'Stock adjustment recorded successfully', 201);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getStockLevels,
  getProductStockLevels,
  getMovements,
  createAdjustment
};
