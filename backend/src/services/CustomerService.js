const bcrypt = require('bcrypt');
const { Customer, CourtSession, Booking, Invoice, Court, User, Role, sequelize } = require('../models');
const { Op } = require('sequelize');
const { getPagination, getPagingData } = require('../utils/pagination');
const { normalizePhone } = require('../utils/phone');

class CustomerService {
  /**
   * Các trường nhân viên được phép nhập/sửa trên hồ sơ khách hàng.
   *
   * `totalSpent` và `loyaltyTier` cố tình nằm ngoài: chúng do PaymentService
   * cộng dồn sau mỗi lần thanh toán, sửa tay thì hạng thành viên và ưu đãi đi
   * kèm không còn phản ánh khoản khách đã chi. `userId` cũng vậy — gắn hồ sơ
   * vào tài khoản nào không phải việc của một form sửa thông tin.
   */
  static pickEditableFields(data = {}) {
    const editable = ['fullName', 'phone', 'email'];
    return editable.reduce((payload, key) => {
      if (data[key] !== undefined) payload[key] = data[key];
      return payload;
    }, {});
  }

  /** Danh sách/tìm kiếm khách hàng dùng chung toàn chuỗi — 1 hồ sơ áp dụng ở mọi chi nhánh. */
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

  static async getCustomerById(id, context = {}) {
    const customer = await Customer.findByPk(id);
    if (!customer) {
      const error = new Error('Customer not found');
      error.statusCode = 404;
      throw error;
    }
    CustomerService.assertOwnership(customer, context.actor);
    return customer;
  }

  static async createCustomer(data, context) {
    const phone = normalizePhone(data.phone);
    const email = data.email ? String(data.email).trim().toLowerCase() : null;

    const existing = await Customer.findOne({ where: { phone } });
    if (existing) {
      const error = new Error('Số điện thoại này đã có hồ sơ khách hàng');
      error.statusCode = 400;
      throw error;
    }

    // Không có mật khẩu thì chỉ lập hồ sơ, khách tự đăng ký sau bằng chính số
    // này và sẽ được gắn vào hồ sơ có sẵn — lịch sử không bị chẻ làm đôi.
    if (!data.password) {
      return await Customer.create({
        ...CustomerService.pickEditableFields(data),
        phone,
        email
      });
    }

    const transaction = await sequelize.transaction();
    try {
      const takenPhone = await User.findOne({ where: { phone }, transaction });
      if (takenPhone) {
        const error = new Error('Số điện thoại này đã có tài khoản đăng nhập');
        error.statusCode = 409;
        throw error;
      }
      if (email) {
        const takenEmail = await User.findOne({ where: { email }, transaction });
        if (takenEmail) {
          const error = new Error('Email này đã được dùng cho tài khoản khác');
          error.statusCode = 409;
          throw error;
        }
      }

      const customerRole = await Role.findOne({ where: { name: 'customer' }, transaction });
      if (!customerRole) {
        const error = new Error('Hệ thống chưa cấu hình vai trò khách hàng');
        error.statusCode = 500;
        throw error;
      }

      const user = await User.create({
        roleId: customerRole.id,
        email,
        phone,
        passwordHash: await bcrypt.hash(data.password, 10),
        fullName: String(data.fullName).trim(),
        isActive: true
      }, { transaction });

      const customer = await Customer.create({
        ...CustomerService.pickEditableFields(data),
        userId: user.id,
        phone,
        email
      }, { transaction });

      await transaction.commit();
      return customer;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * Biến thông tin khách vãng lai (tên, có thể kèm SĐT) thành hồ sơ khách hàng.
   *
   * Có SĐT thì gộp vào hồ sơ cũ (dùng chung toàn chuỗi) — nhờ vậy khách vãng
   * lai hôm nay để lại số ở chi nhánh này, mai quay lại chi nhánh khác vẫn nối
   * liền lịch sử chi tiêu. Chỉ có tên thì mỗi lần là một hồ sơ mới, vì không
   * có gì để định danh mà gộp.
   *
   * Trả về null nếu không có thông tin gì — phiên chơi/booking khi đó thực sự ẩn danh.
   */
  static async resolveWalkIn({ fullName, phone, transaction = null }) {
    const name = (fullName || '').trim();
    const normalizedPhone = normalizePhone(phone);

    if (!name && !normalizedPhone) return null;

    if (normalizedPhone) {
      const existing = await Customer.findOne({
        where: { phone: normalizedPhone },
        transaction
      });
      if (existing) return existing;
    }

    return await Customer.create({
      fullName: name || 'Khách vãng lai',
      phone: normalizedPhone
    }, { transaction });
  }

  static async updateCustomer(id, data, context) {
    const transaction = await sequelize.transaction();
    try {
      const customer = await Customer.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
      if (!customer) {
        const error = new Error('Customer not found');
        error.statusCode = 404;
        throw error;
      }
      // Chuỗi rỗng phải thành NULL: unique index coi '' là một giá trị thật nên hai
      // khách cùng để trống sẽ đụng nhau, còn NULL thì bao nhiêu cũng được.
      const payload = CustomerService.pickEditableFields(data);
      if ('phone' in payload) payload.phone = normalizePhone(payload.phone);

      if (payload.phone && payload.phone !== customer.phone) {
        const existing = await Customer.findOne({ where: { phone: payload.phone }, transaction });
        if (existing) {
          const error = new Error('Số điện thoại này đã thuộc về khách hàng khác');
          error.statusCode = 400;
          throw error;
        }
        // Hồ sơ đã gắn tài khoản thì SĐT còn là danh tính đăng nhập — đổi ở đây
        // mà quên đổi bên users là khách mất đường vào hệ thống. Cùng transaction
        // với việc sửa customer bên dưới để không lệch nhau nếu 1 trong 2 lỗi.
        if (customer.userId) {
          const takenByUser = await User.findOne({
            where: { phone: payload.phone, id: { [Op.ne]: customer.userId } },
            transaction
          });
          if (takenByUser) {
            const error = new Error('Số điện thoại này đã có tài khoản đăng nhập khác');
            error.statusCode = 409;
            throw error;
          }
          await User.update({ phone: payload.phone }, { where: { id: customer.userId }, transaction });
        }
      }
      const updated = await customer.update(payload, { transaction });
      await transaction.commit();
      return updated;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
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

  static async getCustomerHistory(id, context = {}) {
    const customer = await Customer.findByPk(id);
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
