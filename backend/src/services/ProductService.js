const { ProductCategory, Product, ProductVariant, sequelize } = require('../models');
const { getPagination, getPagingData } = require('../utils/pagination');
const AuditService = require('./AuditService');

/**
 * Catalog bán lẻ (danh mục/sản phẩm/biến thể) — dùng chung toàn chuỗi, không
 * có branch_id. Tồn kho theo từng chi nhánh nằm ở InventoryService/ProductStock,
 * không phải ở đây.
 */
class ProductService {
  static async listCategories(query = {}) {
    const { page, limit, offset } = getPagination(query);
    const data = await ProductCategory.findAndCountAll({
      limit,
      offset,
      order: [['sortOrder', 'ASC'], ['id', 'ASC']]
    });
    return getPagingData(data, page, limit);
  }

  static async createCategory({ name, sortOrder = 0 }, context = {}) {
    const category = await ProductCategory.create({ name, sortOrder });
    await AuditService.record({ actor: context.actor, branchId: context.branchId, action: 'product_category.created', targetType: 'product_category', targetId: category.id, newValues: category.toJSON(), requestId: context.requestId });
    return category;
  }

  static async updateCategory(id, data, context = {}) {
    const category = await ProductCategory.findByPk(id);
    if (!category) {
      const error = new Error('Product category not found');
      error.statusCode = 404;
      throw error;
    }
    const oldValues = category.toJSON();
    const updated = await category.update(data);
    await AuditService.record({ actor: context.actor, branchId: context.branchId, action: 'product_category.updated', targetType: 'product_category', targetId: category.id, oldValues, newValues: updated.toJSON(), requestId: context.requestId });
    return updated;
  }

  static async deleteCategory(id, context = {}) {
    const category = await ProductCategory.findByPk(id);
    if (!category) {
      const error = new Error('Product category not found');
      error.statusCode = 404;
      throw error;
    }
    const oldValues = category.toJSON();
    await category.destroy();
    await AuditService.record({ actor: context.actor, branchId: context.branchId, action: 'product_category.deleted', targetType: 'product_category', targetId: category.id, oldValues, requestId: context.requestId });
    return true;
  }

  static async listProducts(query = {}) {
    const { page, limit, offset } = getPagination(query);
    const where = {};
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.isActive !== undefined) where.isActive = query.isActive === 'true' || query.isActive === true;

    const data = await Product.findAndCountAll({
      where,
      limit,
      offset,
      order: [['id', 'DESC']],
      include: [
        { model: ProductCategory, as: 'category', attributes: ['id', 'name'] },
        { model: ProductVariant, as: 'variants' }
      ]
    });
    return getPagingData(data, page, limit);
  }

  static async getProductById(id) {
    const product = await Product.findByPk(id, {
      include: [
        { model: ProductCategory, as: 'category', attributes: ['id', 'name'] },
        { model: ProductVariant, as: 'variants' }
      ]
    });
    if (!product) {
      const error = new Error('Product not found');
      error.statusCode = 404;
      throw error;
    }
    return product;
  }

  /** Tạo sản phẩm kèm ít nhất 1 biến thể (SKU) trong cùng transaction. */
  static async createProduct({ categoryId, productType = 'retail', name, isActive = true, variants }, context = {}) {
    if (!Array.isArray(variants) || variants.length === 0) {
      const error = new Error('Sản phẩm cần ít nhất 1 biến thể (SKU)');
      error.statusCode = 400;
      throw error;
    }

    const transaction = await sequelize.transaction();
    try {
      const product = await Product.create({ categoryId: categoryId || null, productType, name, isActive }, { transaction });

      const createdVariants = [];
      for (const variant of variants) {
        if (!variant.sku || !variant.listPrice) {
          const error = new Error('Mỗi biến thể cần sku và listPrice');
          error.statusCode = 400;
          throw error;
        }
        createdVariants.push(await ProductVariant.create({
          productId: product.id,
          sku: variant.sku,
          size: variant.size || null,
          color: variant.color || null,
          listPrice: variant.listPrice,
          trackInventory: variant.trackInventory !== false,
          lowStockThreshold: variant.lowStockThreshold ?? 5
        }, { transaction }));
      }

      await AuditService.record({ actor: context.actor, branchId: context.branchId, action: 'product.created', targetType: 'product', targetId: product.id, newValues: { ...product.toJSON(), variants: createdVariants.map((v) => v.toJSON()) }, requestId: context.requestId, transaction });
      await transaction.commit();
      return ProductService.getProductById(product.id);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  static async updateProduct(id, data, context = {}) {
    const product = await Product.findByPk(id);
    if (!product) {
      const error = new Error('Product not found');
      error.statusCode = 404;
      throw error;
    }
    const oldValues = product.toJSON();
    const { categoryId, productType, name, isActive } = data;
    const updated = await product.update({ categoryId, productType, name, isActive });
    await AuditService.record({ actor: context.actor, branchId: context.branchId, action: 'product.updated', targetType: 'product', targetId: product.id, oldValues, newValues: updated.toJSON(), requestId: context.requestId });
    return ProductService.getProductById(id);
  }

  /** Thêm 1 biến thể (SKU) mới cho sản phẩm đã có. */
  static async addVariant(productId, data, context = {}) {
    const product = await Product.findByPk(productId);
    if (!product) {
      const error = new Error('Product not found');
      error.statusCode = 404;
      throw error;
    }
    if (!data.sku || !data.listPrice) {
      const error = new Error('Biến thể cần sku và listPrice');
      error.statusCode = 400;
      throw error;
    }
    const variant = await ProductVariant.create({
      productId,
      sku: data.sku,
      size: data.size || null,
      color: data.color || null,
      listPrice: data.listPrice,
      trackInventory: data.trackInventory !== false,
      lowStockThreshold: data.lowStockThreshold ?? 5
    });
    await AuditService.record({ actor: context.actor, branchId: context.branchId, action: 'product_variant.created', targetType: 'product_variant', targetId: variant.id, newValues: variant.toJSON(), requestId: context.requestId });
    return variant;
  }

  static async updateVariant(id, data, context = {}) {
    const variant = await ProductVariant.findByPk(id);
    if (!variant) {
      const error = new Error('Product variant not found');
      error.statusCode = 404;
      throw error;
    }
    const oldValues = variant.toJSON();
    const updated = await variant.update(data);
    await AuditService.record({ actor: context.actor, branchId: context.branchId, action: 'product_variant.updated', targetType: 'product_variant', targetId: variant.id, oldValues, newValues: updated.toJSON(), requestId: context.requestId });
    return updated;
  }
}

module.exports = ProductService;
