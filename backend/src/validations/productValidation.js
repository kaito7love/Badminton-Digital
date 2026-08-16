const { body, param, validationResult } = require('express-validator');
const { errorResponse } = require('../utils/responseHandler');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(err => ({ field: err.path, message: err.msg }));
    return errorResponse(res, 'Validation failed', formattedErrors, 400);
  }
  next();
};

const createCategoryRules = [
  body('name').trim().notEmpty().withMessage('Category name is required'),
  body('sortOrder').optional().isInt(),
  validate
];

const updateCategoryRules = [
  param('id').isInt().withMessage('Category ID must be an integer'),
  body('name').optional().trim().notEmpty(),
  body('sortOrder').optional().isInt(),
  validate
];

const createProductRules = [
  body('name').trim().notEmpty().withMessage('Product name is required'),
  body('categoryId').optional({ nullable: true }).isInt(),
  body('productType').optional().isIn(['retail', 'consumable', 'rental', 'service']),
  body('variants').isArray({ min: 1 }).withMessage('Product needs at least 1 variant'),
  body('variants.*.sku').trim().notEmpty().withMessage('sku is required for each variant'),
  body('variants.*.listPrice').isFloat({ min: 0 }).withMessage('listPrice must be a non-negative number'),
  body('variants.*.size').optional({ nullable: true }).trim(),
  body('variants.*.color').optional({ nullable: true }).trim(),
  validate
];

const updateProductRules = [
  param('id').isInt().withMessage('Product ID must be an integer'),
  body('name').optional().trim().notEmpty(),
  body('categoryId').optional({ nullable: true }).isInt(),
  body('productType').optional().isIn(['retail', 'consumable', 'rental', 'service']),
  body('isActive').optional().isBoolean(),
  validate
];

const addVariantRules = [
  param('id').isInt().withMessage('Product ID must be an integer'),
  body('sku').trim().notEmpty().withMessage('sku is required'),
  body('listPrice').isFloat({ min: 0 }).withMessage('listPrice must be a non-negative number'),
  body('size').optional({ nullable: true }).trim(),
  body('color').optional({ nullable: true }).trim(),
  validate
];

const updateVariantRules = [
  param('variantId').isInt().withMessage('Variant ID must be an integer'),
  body('sku').optional().trim().notEmpty(),
  body('listPrice').optional().isFloat({ min: 0 }),
  body('size').optional({ nullable: true }).trim(),
  body('color').optional({ nullable: true }).trim(),
  body('lowStockThreshold').optional().isInt({ min: 0 }),
  validate
];

module.exports = {
  createCategoryRules,
  updateCategoryRules,
  createProductRules,
  updateProductRules,
  addVariantRules,
  updateVariantRules
};
