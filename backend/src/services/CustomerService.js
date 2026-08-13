const { Customer, CourtSession, Booking, Invoice, Court } = require('../models');
const { Op } = require('sequelize');
const { getPagination, getPagingData } = require('../utils/pagination');

class CustomerService {
  static async getAllCustomers(query, context = {}) {
    const { page, limit, offset } = getPagination(query);
    const { search } = query;

    const where = {};
    if (context.branchId) where.branchId = context.branchId;
    if (search) {
      where[Op.or] = [
        { fullName: { [Op.like]: `%${search}%` } },
        { phone: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } }
      ];
    }

    const data = await Customer.findAndCountAll({
      where,
      limit,
      offset,
      order: [['id', 'DESC']]
    });

    return getPagingData(data, page, limit);
  }

  static async getCustomerById(id, context = {}) {
    const customer = await Customer.findOne({ where: { id, ...(context.branchId ? { branchId: context.branchId } : {}) } });
    if (!customer) {
      const error = new Error('Customer not found');
      error.statusCode = 404;
      throw error;
    }
    CustomerService.assertOwnership(customer, context.actor);
    return customer;
  }

  static async createCustomer(data, context) {
    if (!context.branchId) {
      const error = new Error('Không xác định được chi nhánh khách hàng');
      error.statusCode = 400;
      throw error;
    }
    const existing = await Customer.findOne({ where: { phone: data.phone, branchId: context.branchId } });
    if (existing) {
      const error = new Error('Customer with this phone number already exists');
      error.statusCode = 400;
      throw error;
    }
    return await Customer.create({ ...data, branchId: context.branchId });
  }

  static async updateCustomer(id, data, context) {
    const customer = await Customer.findOne({ where: { id, ...(context.branchId ? { branchId: context.branchId } : {}) } });
    if (!customer) {
      const error = new Error('Customer not found');
      error.statusCode = 404;
      throw error;
    }
    if (data.phone && data.phone !== customer.phone) {
      const existing = await Customer.findOne({ where: { phone: data.phone, branchId: customer.branchId } });
      if (existing) {
        const error = new Error('Phone number is already in use by another customer');
        error.statusCode = 400;
        throw error;
      }
    }
    return await customer.update(data);
  }

  static async deleteCustomer(id, context) {
    const customer = await Customer.findOne({ where: { id, ...(context.branchId ? { branchId: context.branchId } : {}) } });
    if (!customer) {
      const error = new Error('Customer not found');
      error.statusCode = 404;
      throw error;
    }
    await customer.destroy();
    return true;
  }

  static async getCustomerHistory(id, context = {}) {
    const customer = await Customer.findOne({ where: { id, ...(context.branchId ? { branchId: context.branchId } : {}) } });
    if (!customer) {
      const error = new Error('Customer not found');
      error.statusCode = 404;
      throw error;
    }
    CustomerService.assertOwnership(customer, context.actor);

    const sessions = await CourtSession.findAll({
      where: { customerId: id },
      include: [
        { model: Court, as: 'court', attributes: ['name'] },
        { model: Invoice, as: 'invoice' }
      ],
      order: [['createdAt', 'DESC']]
    });

    const bookings = await Booking.findAll({
      where: { customerId: id },
      include: [{ model: Court, as: 'court', attributes: ['name'] }],
      order: [['createdAt', 'DESC']]
    });

    return {
      customer,
      sessions,
      bookings
    };
  }

  static assertOwnership(customer, actor) {
    if (actor?.role?.name === 'customer' && customer.id !== actor.customer?.id) {
      const error = new Error('Bạn không có quyền truy cập khách hàng này');
      error.statusCode = 403;
      throw error;
    }
  }
}

module.exports = CustomerService;
