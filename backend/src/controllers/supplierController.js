const SupplierService = require('../services/SupplierService');
const { successResponse } = require('../utils/responseHandler');

const getSuppliers = async (req, res, next) => {
  try {
    const result = await SupplierService.getAllSuppliers(req.query);
    return successResponse(res, result.rows, 'Suppliers retrieved successfully', 200, result.meta);
  } catch (err) {
    next(err);
  }
};

const getSupplierById = async (req, res, next) => {
  try {
    const supplier = await SupplierService.getSupplierById(req.params.id);
    return successResponse(res, supplier, 'Supplier details retrieved');
  } catch (err) {
    next(err);
  }
};

const createSupplier = async (req, res, next) => {
  try {
    const supplier = await SupplierService.createSupplier(req.body, { actor: req.user, branchId: req.branchId, requestId: req.requestId });
    return successResponse(res, supplier, 'Supplier created successfully', 201);
  } catch (err) {
    next(err);
  }
};

const updateSupplier = async (req, res, next) => {
  try {
    const updated = await SupplierService.updateSupplier(req.params.id, req.body, { actor: req.user, branchId: req.branchId, requestId: req.requestId });
    return successResponse(res, updated, 'Supplier updated successfully');
  } catch (err) {
    next(err);
  }
};

const deleteSupplier = async (req, res, next) => {
  try {
    await SupplierService.deleteSupplier(req.params.id, { actor: req.user, branchId: req.branchId, requestId: req.requestId });
    return successResponse(res, null, 'Supplier deleted successfully');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier
};
