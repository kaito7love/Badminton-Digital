const { Supplier, sequelize } = require('../models');
const { getPagination, getPagingData } = require('../utils/pagination');
const AuditService = require('./AuditService');

class SupplierService {
  static async getAllSuppliers(query) {
    const { page, limit, offset } = getPagination(query);

    const data = await Supplier.findAndCountAll({
      where: { isActive: true },
      limit,
      offset,
      order: [['name', 'ASC']]
    });

    return getPagingData(data, page, limit);
  }

  static async getSupplierById(id) {
    const supplier = await Supplier.findByPk(id);
    if (!supplier) {
      const error = new Error('Supplier not found');
      error.statusCode = 404;
      throw error;
    }
    return supplier;
  }

  static async createSupplier(data, context = {}) {
    const transaction = await sequelize.transaction();
    try {
      const supplier = await Supplier.create({
        name: data.name,
        phone: data.phone || null,
        email: data.email || null,
        address: data.address || null,
        taxCode: data.taxCode || null,
        note: data.note || null
      }, { transaction });
      await AuditService.record({ actor: context.actor, branchId: context.branchId, action: 'supplier.created', targetType: 'supplier', targetId: supplier.id, newValues: supplier.toJSON(), requestId: context.requestId, transaction });
      await transaction.commit();
      return supplier;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  static async updateSupplier(id, data, context = {}) {
    const transaction = await sequelize.transaction();
    try {
      const supplier = await Supplier.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!supplier) {
        const error = new Error('Supplier not found');
        error.statusCode = 404;
        throw error;
      }
      const oldValues = supplier.toJSON();
      const updated = await supplier.update(data, { transaction });
      await AuditService.record({ actor: context.actor, branchId: context.branchId, action: 'supplier.updated', targetType: 'supplier', targetId: supplier.id, oldValues, newValues: updated.toJSON(), requestId: context.requestId, transaction });
      await transaction.commit();
      return updated;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  static async deleteSupplier(id, context = {}) {
    const transaction = await sequelize.transaction();
    try {
      const supplier = await Supplier.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!supplier) {
        const error = new Error('Supplier not found');
        error.statusCode = 404;
        throw error;
      }
      const oldValues = supplier.toJSON();
      await supplier.destroy({ transaction });
      await AuditService.record({ actor: context.actor, branchId: context.branchId, action: 'supplier.deleted', targetType: 'supplier', targetId: supplier.id, oldValues, requestId: context.requestId, transaction });
      await transaction.commit();
      return true;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}

module.exports = SupplierService;
