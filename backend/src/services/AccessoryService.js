const { Extra, ExtraStock, SessionExtra, CourtSession, sequelize } = require("../models");
const { getPagination, getPagingData } = require("../utils/pagination");
const AuditService = require('./AuditService');
const InventoryService = require('./InventoryService');

class AccessoryService {
  /** Tồn kho trả về là của branch trong context — mỗi chi nhánh có số tồn riêng. */
  static async getAllAccessories(query, branchId = null) {
    const { page, limit, offset } = getPagination(query);

    const data = await Extra.findAndCountAll({
      limit,
      offset,
      order: [["id", "ASC"]],
      include: branchId
        ? [{ model: ExtraStock, as: 'stocks', where: { branchId }, required: false, attributes: ['quantity', 'averageCost'] }]
        : [],
    });

    data.rows = data.rows.map((row) => {
      const json = row.toJSON();
      const stock = json.stocks?.[0];
      json.stockQuantity = stock ? stock.quantity : 0;
      json.averageCost = stock ? stock.averageCost : null;
      delete json.stocks;
      return json;
    });

    return getPagingData(data, page, limit);
  }

  static async getAccessoryById(id) {
    const accessory = await Extra.findByPk(id);
    if (!accessory) {
      const error = new Error("Accessory not found");
      error.statusCode = 404;
      throw error;
    }
    return accessory;
  }

  static async createAccessory(data, context = {}) {
    const transaction = await sequelize.transaction();
    try {
      const accessory = await Extra.create({
      name: data.name,
      price: data.price,
      lowStockThreshold: data.lowStockThreshold || 5,
      }, { transaction });
      await AuditService.record({ actor: context.actor, branchId: context.branchId, action: 'extra.created', targetType: 'extra', targetId: accessory.id, newValues: accessory.toJSON(), requestId: context.requestId, transaction });
      await transaction.commit();
      return accessory;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  static async updateAccessory(id, data, context = {}) {
    const transaction = await sequelize.transaction();
    try {
      const accessory = await Extra.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!accessory) {
        const error = new Error("Accessory not found");
        error.statusCode = 404;
        throw error;
      }
      const oldValues = accessory.toJSON();
      const updated = await accessory.update({ name: data.name, price: data.price, lowStockThreshold: data.lowStockThreshold }, { transaction });
      await AuditService.record({ actor: context.actor, branchId: context.branchId, action: 'extra.updated', targetType: 'extra', targetId: accessory.id, oldValues, newValues: updated.toJSON(), requestId: context.requestId, transaction });
      await transaction.commit();
      return updated;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  static async deleteAccessory(id, context = {}) {
    const transaction = await sequelize.transaction();
    try {
      const accessory = await Extra.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!accessory) {
        const error = new Error("Accessory not found");
        error.statusCode = 404;
        throw error;
      }
      const oldValues = accessory.toJSON();
      await accessory.destroy({ transaction });
      await AuditService.record({ actor: context.actor, branchId: context.branchId, action: 'extra.deleted', targetType: 'extra', targetId: accessory.id, oldValues, requestId: context.requestId, transaction });
      await transaction.commit();
      return true;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  static async addSessionExtra(sessionId, extraId, quantity, context = {}) {
    const transaction = await sequelize.transaction();
    try {
      const session = await CourtSession.findOne({ where: { id: sessionId, ...(context.branchId ? { branchId: context.branchId } : {}) }, transaction, lock: transaction.LOCK.UPDATE });
      if (!session) {
        const error = new Error("Court session not found");
        error.statusCode = 404;
        throw error;
      }
      if (session.status !== "playing") {
        const error = new Error("Cannot add accessories to a closed court session");
        error.statusCode = 400;
        throw error;
      }
      const extra = await Extra.findByPk(extraId, { transaction });
      if (!extra) {
        const error = new Error("Accessory not found");
        error.statusCode = 404;
        throw error;
      }

      const unitPrice = Number(extra.price);
      const subtotal = unitPrice * quantity;

      // Create session extra record
      const sessionExtra = await SessionExtra.create(
        {
          sessionId,
          extraId,
          quantity,
          unitPrice,
          subtotal,
        },
        { transaction },
      );

      // Trừ kho đúng chi nhánh của phiên sân — ném lỗi 400 nếu không đủ tồn.
      await InventoryService.postMovement({
        branchId: session.branchId,
        extraId,
        type: 'sale',
        quantity,
        referenceType: 'session_extra',
        referenceId: sessionExtra.id,
        actor: context.actor,
        transaction,
      });

      await AuditService.record({ actor: context.actor, branchId: session.branchId, action: 'session_extra.added', targetType: 'session_extra', targetId: sessionExtra.id, newValues: sessionExtra.toJSON(), requestId: context.requestId, transaction });

      await transaction.commit();
      return sessionExtra;
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }

  static async getSessionExtras(sessionId) {
    return await SessionExtra.findAll({
      where: { sessionId },
      include: [{ model: Extra, as: "extra" }],
    });
  }

  /**
   * Return unused accessories from a playing session back to stock.
   * - Validates session is still "playing".
   * - Ensures returnQuantity does not exceed the purchased quantity.
   * - Restores returnQuantity to stock of the branch owning the session.
   * - If all items returned, deletes the SessionExtra record; otherwise adjusts quantity & subtotal.
   */
  static async returnSessionExtra(sessionId, extraId, returnQuantity, context = {}) {
    const transaction = await sequelize.transaction();
    try {
      const session = await CourtSession.findOne({ where: { id: sessionId, ...(context.branchId ? { branchId: context.branchId } : {}) }, transaction, lock: transaction.LOCK.UPDATE });
      if (!session) {
        const error = new Error("Court session not found");
        error.statusCode = 404;
        throw error;
      }
      if (session.status !== "playing") {
        const error = new Error("Cannot return accessories for a closed court session");
        error.statusCode = 400;
        throw error;
      }
      // Find the SessionExtra record for this session + extra combination
      const sessionExtra = await SessionExtra.findOne({
        where: { sessionId, extraId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!sessionExtra) {
        const error = new Error(
          "This accessory was not added to the current session",
        );
        error.statusCode = 404;
        throw error;
      }

      if (returnQuantity > sessionExtra.quantity) {
        const error = new Error(
          `Return quantity (${returnQuantity}) exceeds purchased quantity (${sessionExtra.quantity})`,
        );
        error.statusCode = 400;
        throw error;
      }

      // Cộng lại kho đúng chi nhánh của phiên sân
      await InventoryService.postMovement({
        branchId: session.branchId,
        extraId,
        type: 'sale_return',
        quantity: returnQuantity,
        referenceType: 'session_extra',
        referenceId: sessionExtra.id,
        actor: context.actor,
        transaction,
      });

      let result;
      const newQuantity = sessionExtra.quantity - returnQuantity;
      if (newQuantity === 0) {
        // All items returned — remove the record entirely
        await sessionExtra.destroy({ transaction });
        result = { deleted: true, returnedQuantity: returnQuantity };
      } else {
        // Partial return — adjust quantity and subtotal
        const newSubtotal = Number(sessionExtra.unitPrice) * newQuantity;
        await sessionExtra.update(
          { quantity: newQuantity, subtotal: newSubtotal },
          { transaction },
        );
        result = {
          deleted: false,
          remainingQuantity: newQuantity,
          newSubtotal,
          returnedQuantity: returnQuantity,
        };
      }

      await AuditService.record({ actor: context.actor, branchId: session.branchId, action: 'session_extra.returned', targetType: 'session_extra', targetId: sessionExtra.id, oldValues: sessionExtra.toJSON(), newValues: result, requestId: context.requestId, transaction });

      await transaction.commit();
      return result;
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }
}

module.exports = AccessoryService;
