const { Extra, SessionExtra, CourtSession, sequelize } = require('../models');
const { getPagination, getPagingData } = require('../utils/pagination');

class AccessoryService {
  static async getAllAccessories(query) {
    const { page, limit, offset } = getPagination(query);

    const data = await Extra.findAndCountAll({
      limit,
      offset,
      order: [['id', 'ASC']]
    });

    return getPagingData(data, page, limit);
  }

  static async getAccessoryById(id) {
    const accessory = await Extra.findByPk(id);
    if (!accessory) {
      const error = new Error('Accessory not found');
      error.statusCode = 404;
      throw error;
    }
    return accessory;
  }

  static async createAccessory(data) {
    return await Extra.create({
      name: data.name,
      price: data.price,
      stockQuantity: data.stockQuantity || 0,
      lowStockThreshold: data.lowStockThreshold || 5
    });
  }

  static async updateAccessory(id, data) {
    const accessory = await Extra.findByPk(id);
    if (!accessory) {
      const error = new Error('Accessory not found');
      error.statusCode = 404;
      throw error;
    }
    return await accessory.update(data);
  }

  static async deleteAccessory(id) {
    const accessory = await Extra.findByPk(id);
    if (!accessory) {
      const error = new Error('Accessory not found');
      error.statusCode = 404;
      throw error;
    }
    await accessory.destroy();
    return true;
  }

  static async addSessionExtra(sessionId, extraId, quantity) {
    const session = await CourtSession.findByPk(sessionId);
    if (!session) {
      const error = new Error('Court session not found');
      error.statusCode = 404;
      throw error;
    }
    if (session.status !== 'playing') {
      const error = new Error('Cannot add accessories to a closed court session');
      error.statusCode = 400;
      throw error;
    }

    const transaction = await sequelize.transaction();
    try {
      const extra = await Extra.findByPk(extraId, { transaction });
      if (!extra) {
        const error = new Error('Accessory not found');
        error.statusCode = 404;
        throw error;
      }

      if (extra.stockQuantity < quantity) {
        const error = new Error(`Insufficient stock. Available: ${extra.stockQuantity}`);
        error.statusCode = 400;
        throw error;
      }

      const unitPrice = Number(extra.price);
      const subtotal = unitPrice * quantity;

      // Deduct stock
      await extra.update({ stockQuantity: extra.stockQuantity - quantity }, { transaction });

      // Create session extra record
      const sessionExtra = await SessionExtra.create({
        sessionId,
        extraId,
        quantity,
        unitPrice,
        subtotal
      }, { transaction });

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
      include: [{ model: Extra, as: 'extra' }]
    });
  }
}

module.exports = AccessoryService;
