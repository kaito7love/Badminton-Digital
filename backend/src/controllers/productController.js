const ProductService = require('../services/ProductService');
const { successResponse } = require('../utils/responseHandler');

const getCategories = async (req, res, next) => {
  try {
    const result = await ProductService.listCategories(req.query);
    return successResponse(res, result.rows, 'Product categories retrieved successfully', 200, result.meta);
  } catch (err) {
    next(err);
  }
};

const createCategory = async (req, res, next) => {
  try {
    const category = await ProductService.createCategory(req.body, { actor: req.user, branchId: req.branchId, requestId: req.requestId });
    return successResponse(res, category, 'Product category created successfully', 201);
  } catch (err) {
    next(err);
  }
};

const updateCategory = async (req, res, next) => {
  try {
    const category = await ProductService.updateCategory(req.params.id, req.body, { actor: req.user, branchId: req.branchId, requestId: req.requestId });
    return successResponse(res, category, 'Product category updated successfully');
  } catch (err) {
    next(err);
  }
};

const deleteCategory = async (req, res, next) => {
  try {
    await ProductService.deleteCategory(req.params.id, { actor: req.user, branchId: req.branchId, requestId: req.requestId });
    return successResponse(res, null, 'Product category deleted successfully');
  } catch (err) {
    next(err);
  }
};

const getProducts = async (req, res, next) => {
  try {
    const result = await ProductService.listProducts(req.query);
    return successResponse(res, result.rows, 'Products retrieved successfully', 200, result.meta);
  } catch (err) {
    next(err);
  }
};

const getProductById = async (req, res, next) => {
  try {
    const product = await ProductService.getProductById(req.params.id);
    return successResponse(res, product, 'Product details retrieved');
  } catch (err) {
    next(err);
  }
};

const createProduct = async (req, res, next) => {
  try {
    const product = await ProductService.createProduct(req.body, { actor: req.user, branchId: req.branchId, requestId: req.requestId });
    return successResponse(res, product, 'Product created successfully', 201);
  } catch (err) {
    next(err);
  }
};

const updateProduct = async (req, res, next) => {
  try {
    const product = await ProductService.updateProduct(req.params.id, req.body, { actor: req.user, branchId: req.branchId, requestId: req.requestId });
    return successResponse(res, product, 'Product updated successfully');
  } catch (err) {
    next(err);
  }
};

const addVariant = async (req, res, next) => {
  try {
    const variant = await ProductService.addVariant(req.params.id, req.body, { actor: req.user, branchId: req.branchId, requestId: req.requestId });
    return successResponse(res, variant, 'Product variant created successfully', 201);
  } catch (err) {
    next(err);
  }
};

const updateVariant = async (req, res, next) => {
  try {
    const variant = await ProductService.updateVariant(req.params.variantId, req.body, { actor: req.user, branchId: req.branchId, requestId: req.requestId });
    return successResponse(res, variant, 'Product variant updated successfully');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  addVariant,
  updateVariant
};
