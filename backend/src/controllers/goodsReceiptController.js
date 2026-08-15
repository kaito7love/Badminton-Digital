const GoodsReceiptService = require('../services/GoodsReceiptService');
const { successResponse } = require('../utils/responseHandler');

const getGoodsReceipts = async (req, res, next) => {
  try {
    const result = await GoodsReceiptService.listGoodsReceipts(req.query, req.branchId);
    return successResponse(res, result.rows, 'Goods receipts retrieved successfully', 200, result.meta);
  } catch (err) {
    next(err);
  }
};

const getGoodsReceiptById = async (req, res, next) => {
  try {
    const receipt = await GoodsReceiptService.getGoodsReceiptById(req.params.id, req.branchId);
    return successResponse(res, receipt, 'Goods receipt details retrieved');
  } catch (err) {
    next(err);
  }
};

const createGoodsReceipt = async (req, res, next) => {
  try {
    const receipt = await GoodsReceiptService.createGoodsReceipt(
      { branchId: req.branchId, supplierId: req.body.supplierId, items: req.body.items, note: req.body.note },
      { actor: req.user, requestId: req.requestId }
    );
    return successResponse(res, receipt, 'Goods receipt created successfully', 201);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getGoodsReceipts,
  getGoodsReceiptById,
  createGoodsReceipt
};
