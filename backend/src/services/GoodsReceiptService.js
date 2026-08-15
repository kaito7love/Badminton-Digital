const { GoodsReceipt, GoodsReceiptItem, Extra, Supplier, User, sequelize } = require('../models');
const { getPagination, getPagingData } = require('../utils/pagination');
const { nextGoodsReceiptCode } = require('../utils/documentNumber');
const InventoryService = require('./InventoryService');
const AuditService = require('./AuditService');

const detailIncludes = [
  { model: Supplier, as: 'supplier', attributes: ['id', 'name', 'phone'] },
  { model: User, as: 'receivedBy', attributes: ['id', 'fullName'] },
  { model: GoodsReceiptItem, as: 'items', include: [{ model: Extra, as: 'extra', attributes: ['id', 'name'] }] }
];

class GoodsReceiptService {
  static async createGoodsReceipt({ branchId, supplierId, items, note }, context = {}) {
    if (!branchId) {
      const error = new Error('Không xác định được chi nhánh nhập kho');
      error.statusCode = 400;
      throw error;
    }
    if (!Array.isArray(items) || items.length === 0) {
      const error = new Error('Phiếu nhập kho cần ít nhất 1 dòng sản phẩm');
      error.statusCode = 400;
      throw error;
    }

    const preparedItems = items.map((item) => {
      const quantity = Number(item.quantity);
      const unitCost = Number(item.unitCost);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        const error = new Error('Số lượng dòng hàng phải là số nguyên dương');
        error.statusCode = 400;
        throw error;
      }
      if (Number.isNaN(unitCost) || unitCost < 0) {
        const error = new Error('Đơn giá nhập không hợp lệ');
        error.statusCode = 400;
        throw error;
      }
      return { extraId: item.extraId, quantity, unitCost, subtotal: quantity * unitCost };
    });
    const totalCost = preparedItems.reduce((sum, item) => sum + item.subtotal, 0);

    const transaction = await sequelize.transaction();
    try {
      const code = await nextGoodsReceiptCode(branchId, transaction);

      const receipt = await GoodsReceipt.create({
        branchId,
        code,
        supplierId: supplierId || null,
        receivedByUserId: context.actor?.id || null,
        note: note || null,
        totalCost
      }, { transaction });

      for (const item of preparedItems) {
        await GoodsReceiptItem.create({ goodsReceiptId: receipt.id, ...item }, { transaction });
        await InventoryService.postMovement({
          branchId,
          extraId: item.extraId,
          type: 'purchase_receipt',
          quantity: item.quantity,
          unitCost: item.unitCost,
          referenceType: 'goods_receipt',
          referenceId: receipt.id,
          actor: context.actor,
          transaction
        });
      }

      await AuditService.record({ actor: context.actor, branchId, action: 'goods_receipt.created', targetType: 'goods_receipt', targetId: receipt.id, newValues: { code, supplierId, totalCost, items: preparedItems }, requestId: context.requestId, transaction });

      await transaction.commit();
      return GoodsReceipt.findByPk(receipt.id, { include: detailIncludes });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  static async listGoodsReceipts(query, branchId) {
    if (!branchId) {
      const error = new Error('Không xác định được chi nhánh');
      error.statusCode = 400;
      throw error;
    }
    const { page, limit, offset } = getPagination(query);

    const data = await GoodsReceipt.findAndCountAll({
      where: { branchId },
      limit,
      offset,
      order: [['id', 'DESC']],
      include: [
        { model: Supplier, as: 'supplier', attributes: ['id', 'name'] },
        { model: User, as: 'receivedBy', attributes: ['id', 'fullName'] }
      ]
    });
    return getPagingData(data, page, limit);
  }

  static async getGoodsReceiptById(id, branchId) {
    const receipt = await GoodsReceipt.findOne({ where: { id, branchId }, include: detailIncludes });
    if (!receipt) {
      const error = new Error('Goods receipt not found');
      error.statusCode = 404;
      throw error;
    }
    return receipt;
  }
}

module.exports = GoodsReceiptService;
