const { Op } = require('sequelize');
const { ExtraStock, ProductStock, StockMovement, Extra, ProductVariant, Product, Branch, sequelize } = require('../models');
const { getPagination, getPagingData } = require('../utils/pagination');
const { startOfLocalDay, endOfLocalDay } = require('../utils/dateTime');
const AuditService = require('./AuditService');

const ADJUSTMENT_TYPES = ['adjustment_in', 'adjustment_out', 'damaged', 'lost'];

class InventoryService {
  /**
   * Duy nhất entry point thay đổi tồn kho — dùng chung cho phụ kiện trong
   * sân (extraId, extra_stocks) lẫn sản phẩm bán lẻ (productVariantId,
   * product_stocks). Đúng 1 trong 2 phải được truyền, không cả hai/không cái
   * nào. Không service nào khác được UPDATE trực tiếp *_stocks.quantity —
   * mọi thay đổi phải tạo kèm một dòng stock_movements trong cùng
   * transaction với nghiệp vụ gốc.
   */
  static async postMovement({ branchId, extraId = null, productVariantId = null, type, quantity, unitCost = null, note = null, referenceType = null, referenceId = null, actor = null, transaction }) {
    if (!transaction) {
      throw new Error('InventoryService.postMovement requires an active transaction');
    }
    if (!branchId) {
      const error = new Error('Không xác định được chi nhánh để ghi nhận tồn kho');
      error.statusCode = 400;
      throw error;
    }
    if (!extraId === !productVariantId) {
      const error = new Error('Phải chỉ định đúng 1 trong 2: extraId hoặc productVariantId');
      error.statusCode = 400;
      throw error;
    }
    if (!StockMovement.MOVEMENT_TYPES.includes(type)) {
      const error = new Error(`Loại giao dịch kho không hợp lệ: ${type}`);
      error.statusCode = 400;
      throw error;
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      const error = new Error('Số lượng phải là số nguyên dương');
      error.statusCode = 400;
      throw error;
    }

    const stock = extraId
      ? await InventoryService._getLockedExtraStock(extraId, branchId, transaction)
      : await InventoryService._getLockedProductStock(productVariantId, branchId, transaction);

    const isIncoming = StockMovement.INCOMING_TYPES.includes(type);
    const newQuantity = stock.quantity + (isIncoming ? quantity : -quantity);
    if (newQuantity < 0) {
      const error = new Error(`Không đủ tồn kho tại chi nhánh này. Hiện có: ${stock.quantity}`);
      error.statusCode = 400;
      throw error;
    }

    let averageCost = stock.averageCost !== null ? Number(stock.averageCost) : null;
    if (type === 'purchase_receipt' && unitCost != null) {
      averageCost = InventoryService.computeAverageCost(stock.quantity, averageCost, quantity, Number(unitCost));
    }

    await stock.update({ quantity: newQuantity, averageCost }, { transaction });

    const movement = await StockMovement.create({
      branchId,
      extraId,
      productVariantId,
      type,
      quantity,
      unitCost,
      note,
      referenceType,
      referenceId,
      actorUserId: actor?.id || null
    }, { transaction });

    return { movement, stock };
  }

  /** Giá vốn bình quân gia quyền sau khi nhập thêm `incomingQty` với đơn giá `incomingUnitCost`. */
  static computeAverageCost(oldQty, oldAvg, incomingQty, incomingUnitCost) {
    const totalQty = oldQty + incomingQty;
    if (totalQty <= 0) return incomingUnitCost;
    return ((oldQty * (oldAvg || 0)) + (incomingQty * incomingUnitCost)) / totalQty;
  }

  static async _getLockedExtraStock(extraId, branchId, transaction) {
    let stock = await ExtraStock.findOne({
      where: { extraId, branchId },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (stock) return stock;

    try {
      stock = await ExtraStock.create({ extraId, branchId, quantity: 0 }, { transaction });
    } catch (err) {
      // Có thể đã bị request đồng thời khác tạo trước — thử khoá lại lần nữa.
      stock = await ExtraStock.findOne({
        where: { extraId, branchId },
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!stock) throw err;
    }
    return stock;
  }

  /**
   * Kiểm tồn kho có đủ hay không mà KHÔNG ghi giao dịch — dùng để chặn sớm,
   * trước khi chỗ gọi kịp lưu dòng hàng xuống DB. Nếu để `postMovement` bắt
   * sau, một số lượng phi lý (thu ngân gõ nhầm) đã kịp làm tràn cột tiền của
   * dòng hàng và văng lỗi DB, che mất thông báo "không đủ tồn kho".
   * Khoá cùng dòng `product_stocks` mà `postMovement` sẽ khoá ngay sau đó nên
   * không mở thêm khe hở tranh chấp nào.
   */
  static async assertProductStockAvailable({ productVariantId, branchId, quantity, transaction }) {
    const stock = await InventoryService._getLockedProductStock(productVariantId, branchId, transaction);
    if (stock.quantity < quantity) {
      const error = new Error(`Không đủ tồn kho tại chi nhánh này. Hiện có: ${stock.quantity}`);
      error.statusCode = 400;
      throw error;
    }
    return stock;
  }

  static async _getLockedProductStock(productVariantId, branchId, transaction) {
    let stock = await ProductStock.findOne({
      where: { productVariantId, branchId },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (stock) return stock;

    try {
      stock = await ProductStock.create({ productVariantId, branchId, quantity: 0 }, { transaction });
    } catch (err) {
      stock = await ProductStock.findOne({
        where: { productVariantId, branchId },
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!stock) throw err;
    }
    return stock;
  }

  /** Điều chỉnh kho thủ công (hỏng/mất/điều chỉnh tăng-giảm), luôn cần lý do. */
  static async createManualAdjustment({ branchId, extraId, productVariantId, type, quantity, note, actor, requestId }) {
    if (!ADJUSTMENT_TYPES.includes(type)) {
      const error = new Error(`Loại điều chỉnh không hợp lệ: ${type}`);
      error.statusCode = 400;
      throw error;
    }
    if (!note || !note.trim()) {
      const error = new Error('Lý do điều chỉnh kho là bắt buộc');
      error.statusCode = 400;
      throw error;
    }

    const transaction = await sequelize.transaction();
    try {
      const { movement, stock } = await InventoryService.postMovement({
        branchId, extraId, productVariantId, type, quantity, note, referenceType: 'manual', actor, transaction
      });
      await AuditService.record({
        actor, branchId, action: 'stock_movement.adjusted', targetType: 'stock_movement',
        targetId: movement.id, newValues: movement.toJSON(), requestId, transaction
      });
      await transaction.commit();
      return { movement, stock };
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }

  static async listMovements(query, branchId) {
    InventoryService._requireBranch(branchId);
    const { page, limit, offset } = getPagination(query);
    const where = { branchId };
    if (query.extraId) where.extraId = query.extraId;
    if (query.productVariantId) where.productVariantId = query.productVariantId;
    if (query.type) where.type = query.type;
    if (query.from || query.to) {
      const branch = await Branch.findByPk(branchId, { attributes: ['timezone'] });
      where.createdAt = {};
      // Neo bằng 12:00Z rồi cắt theo giờ chi nhánh — không phụ thuộc múi giờ
      // máy chủ (xem cùng lớp lỗi đã sửa ở SessionService.getSessionHistory).
      if (query.from) where.createdAt[Op.gte] = startOfLocalDay(new Date(`${query.from}T12:00:00Z`), branch?.timezone);
      if (query.to) where.createdAt[Op.lte] = endOfLocalDay(new Date(`${query.to}T12:00:00Z`), branch?.timezone);
    }

    const data = await StockMovement.findAndCountAll({
      where,
      limit,
      offset,
      order: [['id', 'DESC']],
      include: [
        { model: Extra, as: 'extra', attributes: ['id', 'name'] },
        { model: ProductVariant, as: 'variant', attributes: ['id', 'sku', 'size', 'color'] }
      ]
    });
    return getPagingData(data, page, limit);
  }

  static async getStockLevels(query, branchId) {
    InventoryService._requireBranch(branchId);
    const { page, limit, offset } = getPagination(query);

    const data = await ExtraStock.findAndCountAll({
      where: { branchId },
      limit,
      offset,
      order: [['id', 'ASC']],
      include: [{ model: Extra, as: 'extra', attributes: ['id', 'name', 'price', 'lowStockThreshold'] }]
    });
    return getPagingData(data, page, limit);
  }

  /** Tồn kho sản phẩm bán lẻ theo chi nhánh — song song với getStockLevels (extras). */
  static async getProductStockLevels(query, branchId) {
    InventoryService._requireBranch(branchId);
    const { page, limit, offset } = getPagination(query);

    const data = await ProductStock.findAndCountAll({
      where: { branchId },
      limit,
      offset,
      order: [['id', 'ASC']],
      include: [{
        model: ProductVariant,
        as: 'variant',
        attributes: ['id', 'sku', 'size', 'color', 'listPrice', 'lowStockThreshold'],
        include: [{ model: Product, as: 'product', attributes: ['id', 'name'] }]
      }]
    });
    return getPagingData(data, page, limit);
  }

  /**
   * Số sản phẩm dưới ngưỡng cảnh báo, tính riêng cho 1 chi nhánh. Bỏ qua
   * dòng tồn kho của phụ kiện đã bị xoá mềm (soft-delete) — include không
   * `where` trả `extra: null` cho các dòng này (đúng hành vi Sequelize với
   * model paranoid), `?? 5` trước đây vô tình biến chúng thành "sắp hết
   * hàng" dù sản phẩm không còn tồn tại để mà cảnh báo.
   */
  static async getLowStockCount(branchId) {
    if (!branchId) return 0;
    const stocks = await ExtraStock.findAll({
      where: { branchId },
      include: [{ model: Extra, as: 'extra', attributes: ['lowStockThreshold'] }]
    });
    return stocks.filter((s) => s.extra && s.quantity <= s.extra.lowStockThreshold).length;
  }

  /** Tương đương getLowStockCount nhưng cho sản phẩm bán lẻ. */
  static async getLowStockCountForProducts(branchId) {
    if (!branchId) return 0;
    const stocks = await ProductStock.findAll({
      where: { branchId },
      include: [{ model: ProductVariant, as: 'variant', attributes: ['lowStockThreshold'] }]
    });
    return stocks.filter((s) => s.variant && s.quantity <= s.variant.lowStockThreshold).length;
  }

  static _requireBranch(branchId) {
    if (!branchId) {
      const error = new Error('Không xác định được chi nhánh kho');
      error.statusCode = 400;
      throw error;
    }
  }
}

module.exports = InventoryService;
