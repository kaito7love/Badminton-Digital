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
    // Chỉ kiểm tra trùng khi thực sự có số điện thoại — khách vãng lai không số
    // vẫn được phép tạo hồ sơ.
    if (data.phone) {
      const existing = await Customer.findOne({ where: { phone: data.phone, branchId: context.branchId } });
      if (existing) {
        const error = new Error('Customer with this phone number already exists');
        error.statusCode = 400;
        throw error;
      }
    }
    return await Customer.create({ ...data, branchId: context.branchId, phone: data.phone || null });
  }

  /**
   * Biến thông tin khách vãng lai (tên, có thể kèm SĐT) thành hồ sơ khách hàng.
   *
   * Có SĐT thì gộp vào hồ sơ cũ trong cùng chi nhánh — nhờ vậy khách vãng lai hôm
   * nay để lại số, mai quay lại sẽ nối liền lịch sử chi tiêu. Chỉ có tên thì mỗi
   * lần là một hồ sơ mới, vì không có gì để định danh mà gộp.
   *
   * Trả về null nếu không có thông tin gì — phiên chơi/booking khi đó thực sự ẩn danh.
   */
  static async resolveWalkIn({ branchId, fullName, phone, transaction = null }) {
    const name = (fullName || '').trim();
    const normalizedPhone = (phone || '').trim() || null;

    if (!name && !normalizedPhone) return null;

    if (normalizedPhone) {
      const existing = await Customer.findOne({
        where: { branchId, phone: normalizedPhone },
        transaction
      });
      if (existing) return existing;
    }

    return await Customer.create({
      branchId,
      fullName: name || 'Khách vãng lai',
      phone: normalizedPhone
    }, { transaction });
  }

  static async updateCustomer(id, data, context) {
    const customer = await Customer.findOne({ where: { id, ...(context.branchId ? { branchId: context.branchId } : {}) } });
    if (!customer) {
      const error = new Error('Customer not found');
      error.statusCode = 404;
      throw error;
    }
    // Chuỗi rỗng phải thành NULL: unique index coi '' là một giá trị thật nên hai
    // khách cùng để trống sẽ đụng nhau, còn NULL thì bao nhiêu cũng được.
    const payload = { ...data };
    if ('phone' in payload) payload.phone = (payload.phone || '').trim() || null;

    if (payload.phone && payload.phone !== customer.phone) {
      const existing = await Customer.findOne({ where: { phone: payload.phone, branchId: customer.branchId } });
      if (existing) {
        const error = new Error('Phone number is already in use by another customer');
        error.statusCode = 400;
        throw error;
      }
    }
    return await customer.update(payload);
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
