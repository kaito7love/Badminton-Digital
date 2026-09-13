const bcrypt = require('bcrypt');
const { Customer, CourtSession, Booking, SalesOrder, Invoice, Court, User, Role, sequelize } = require('../models');
const { Op } = require('sequelize');
const { getPagination, getPagingData } = require('../utils/pagination');
const { normalizePhone } = require('../utils/phone');
const { computeLoyaltyTier } = require('../utils/loyalty');
const AuditService = require('./AuditService');

const httpError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

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
    await CustomerService.attachPendingAccounts(data.rows);

    return getPagingData(data, page, limit);
  }

  /**
   * Gắn `pendingAccount` vào hồ sơ tại quầy (chưa gắn tài khoản, có số) khi số
   * đó đã có tài khoản khách tự đăng ký mà hồ sơ của tài khoản chưa mang số —
   * tức đang chờ nhân viên xác minh rồi gộp (`mergeIntoAccount`).
   */
  static async attachPendingAccounts(rows) {
    const phones = rows.filter((row) => !row.userId && row.phone).map((row) => row.phone);
    const accounts = phones.length
      ? await User.findAll({
        where: { phone: { [Op.in]: phones } },
        attributes: ['id', 'phone', 'createdAt'],
        include: [
          { model: Role, as: 'role', attributes: ['name'], where: { name: 'customer' } },
          { model: Customer, as: 'customer', attributes: ['id', 'fullName'], where: { phone: null } }
        ]
      })
      : [];
    const byPhone = new Map(accounts.map((account) => [account.phone, account]));

    rows.forEach((row) => {
      const account = !row.userId && row.phone ? byPhone.get(row.phone) : null;
      row.setDataValue('pendingAccount', account
        ? { customerId: account.customer.id, fullName: account.customer.fullName, registeredAt: account.createdAt }
        : null);
    });
    return rows;
  }

  /**
   * Hồ sơ của tài khoản đăng ký trùng số với một hồ sơ tại quầy chưa gộp thì
   * chưa mang số (xem AuthService.register). Khi chính chủ tài khoản xem hồ sơ
   * của mình thì hiện số/email của tài khoản thay vào chỗ trống — trang Tài
   * khoản không được tự khai ra "số này đang nằm ở một hồ sơ khác". Chỉ đổi dữ
   * liệu trả về, không ghi DB.
   */
  static withAccountContact(customer, user) {
    if (!customer || !user) return customer;
    if (!customer.phone && user.phone) customer.setDataValue('phone', user.phone);
    if (!customer.email && user.email) customer.setDataValue('email', user.email);
    return customer;
  }

  static async getCustomerById(id, context = {}) {
    const customer = await Customer.findByPk(id);
    if (!customer) {
      const error = new Error('Customer not found');
      error.statusCode = 404;
      throw error;
    }
    CustomerService.assertOwnership(customer, context.actor);
    if (context.actor?.role?.name === 'customer') CustomerService.withAccountContact(customer, context.actor);
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

    // Không có mật khẩu thì chỉ lập hồ sơ. Khách tự đăng ký sau bằng chính số
    // này thì tài khoản nhận hồ sơ riêng; nhân viên xác minh rồi gộp tại quầy
    // (mergeIntoAccount) để lịch sử không bị chẻ đôi.
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
    if (context.actor?.role?.name === 'customer') CustomerService.withAccountContact(customer, context.actor);

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

  /**
   * Điều kiện gộp hồ sơ tại quầy `walkIn` vào hồ sơ `account` của tài khoản
   * `accountUser`. Hai hồ sơ nạp kèm dòng đã xoá mềm để phân biệt "đã gộp rồi"
   * (409) với "không tồn tại" (404).
   */
  static assertMergeable({ walkIn, account, accountUser }) {
    if (!walkIn || !account) throw httpError('Không tìm thấy hồ sơ khách hàng', 404);
    if (walkIn.id === account.id) throw httpError('Không gộp được một hồ sơ vào chính nó', 400);
    if (walkIn.deletedAt) throw httpError('Hồ sơ này đã được gộp hoặc đã bị xoá', 409);
    if (walkIn.userId) throw httpError('Hồ sơ này đã gắn với một tài khoản', 409);
    if (!walkIn.phone) throw httpError('Hồ sơ tại quầy chưa có số điện thoại để đối chiếu', 400);
    if (account.deletedAt || !account.userId || !accountUser) {
      throw httpError('Hồ sơ đích không phải hồ sơ của một tài khoản đang tồn tại', 400);
    }
    if (accountUser.role?.name !== 'customer') throw httpError('Chỉ gộp được vào tài khoản khách hàng', 400);
    if (account.phone) throw httpError('Hồ sơ của tài khoản đã mang số điện thoại, không có gì chờ gộp', 400);
    if (normalizePhone(accountUser.phone) !== walkIn.phone) {
      throw httpError('Số điện thoại của tài khoản không trùng với hồ sơ tại quầy', 400);
    }
  }

  /**
   * Gộp hồ sơ tại quầy vào hồ sơ của tài khoản khách tự đăng ký cùng số.
   *
   * Đăng ký không tự gộp vì hệ thống không xác minh được chủ số
   * (AuthService.register); nhân viên chỉ gộp sau khi xác minh người trước mặt
   * vừa là chủ số vừa là chủ tài khoản. Một transaction: lịch sử, tổng chi
   * tiêu, hạng và số điện thoại chuyển sang hồ sơ tài khoản, hồ sơ cũ bị xoá
   * mềm, ghi nhật ký `customer.merged`.
   */
  static async mergeIntoAccount(walkInId, accountCustomerId, context = {}) {
    const transaction = await sequelize.transaction();
    try {
      // Khoá cả hai hồ sơ theo thứ tự id tăng dần — hai lần gộp chạy chéo nhau
      // không khoá ngược chiều mà deadlock.
      const rows = await Customer.findAll({
        where: { id: [Number(walkInId), Number(accountCustomerId)] },
        order: [['id', 'ASC']],
        paranoid: false,
        lock: transaction.LOCK.UPDATE,
        transaction
      });
      const walkIn = rows.find((row) => row.id === Number(walkInId));
      const account = rows.find((row) => row.id === Number(accountCustomerId));
      const accountUser = account?.userId
        ? await User.findByPk(account.userId, {
          include: [{ model: Role, as: 'role', attributes: ['name'] }],
          transaction
        })
        : null;
      CustomerService.assertMergeable({ walkIn, account, accountUser });

      // Chuyển cả dòng đã xoá mềm để không còn gì trỏ về hồ sơ sắp xoá.
      const moved = {};
      for (const [key, Model] of [['courtSessions', CourtSession], ['bookings', Booking], ['salesOrders', SalesOrder]]) {
        const [count] = await Model.update(
          { customerId: account.id },
          { where: { customerId: walkIn.id }, paranoid: false, transaction }
        );
        moved[key] = count;
      }

      const totalSpentBefore = { walkIn: Number(walkIn.totalSpent), account: Number(account.totalSpent) };
      const totalSpent = Math.round((totalSpentBefore.walkIn + totalSpentBefore.account) * 100) / 100;
      const loyaltyTier = computeLoyaltyTier(totalSpent);
      const phone = walkIn.phone;
      const email = account.email || walkIn.email || null;

      // customers.phone là unique: nhả số khỏi hồ sơ cũ trước rồi mới gắn sang hồ sơ tài khoản.
      await walkIn.update({ phone: null }, { transaction });
      await walkIn.destroy({ transaction });
      await account.update({ phone, email, totalSpent, loyaltyTier }, { transaction });

      await AuditService.record({
        actor: context.actor,
        branchId: context.branchId || null,
        action: 'customer.merged',
        targetType: 'customer',
        targetId: account.id,
        oldValues: { walkInCustomerId: walkIn.id, walkInFullName: walkIn.fullName, phone, totalSpent: totalSpentBefore },
        newValues: { accountCustomerId: account.id, moved, totalSpent, loyaltyTier },
        requestId: context.requestId,
        transaction
      });

      await transaction.commit();
      return { customer: account, mergedCustomerId: walkIn.id, moved };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
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
