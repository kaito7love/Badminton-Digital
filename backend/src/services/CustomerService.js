const { Customer, CourtSession, Booking, Invoice, Court, Op } = require('../models');
const { getPagination, getPagingData } = require('../utils/pagination');

class CustomerService {
  static async getAllCustomers(query) {
    const { page, limit, offset } = getPagination(query);
    const { search } = query;

    const where = {};
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

  static async getCustomerById(id) {
    const customer = await Customer.findByPk(id);
    if (!customer) {
      const error = new Error('Customer not found');
      error.statusCode = 404;
      throw error;
    }
    return customer;
  }

  static async createCustomer(data) {
    const existing = await Customer.findOne({ where: { phone: data.phone } });
    if (existing) {
      const error = new Error('Customer with this phone number already exists');
      error.statusCode = 400;
      throw error;
    }
    return await Customer.create(data);
  }

  static async updateCustomer(id, data) {
    const customer = await Customer.findByPk(id);
    if (!customer) {
      const error = new Error('Customer not found');
      error.statusCode = 404;
      throw error;
    }
    if (data.phone && data.phone !== customer.phone) {
      const existing = await Customer.findOne({ where: { phone: data.phone } });
      if (existing) {
        const error = new Error('Phone number is already in use by another customer');
        error.statusCode = 400;
        throw error;
      }
    }
    return await customer.update(data);
  }

  static async deleteCustomer(id) {
    const customer = await Customer.findByPk(id);
    if (!customer) {
      const error = new Error('Customer not found');
      error.statusCode = 404;
      throw error;
    }
    await customer.destroy();
    return true;
  }

  static async getCustomerHistory(id) {
    const customer = await Customer.findByPk(id);
    if (!customer) {
      const error = new Error('Customer not found');
      error.statusCode = 404;
      throw error;
    }

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
}

module.exports = CustomerService;
