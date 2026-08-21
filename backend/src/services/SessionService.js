const {
  CourtSession, Court, Customer, Employee, Invoice, Payment,
  SessionExtra, Extra, Booking, Branch, sequelize
} = require('../models');
const { Op } = require('sequelize');
const { getPagination, getPagingData } = require('../utils/pagination');
const { startOfLocalDay, endOfLocalDay } = require('../utils/dateTime');

class SessionService {
  /**
   * Lấy lịch sử các phiên chơi đã đóng (status = 'closed')
   * Dùng cho HistoryPage tab "Phiên Chơi"
   */
  static async getSessionHistory(query, context = {}) {
    const { page, limit, offset } = getPagination(query);
    const { date, courtName, customerId, employeeId } = query;

    const where = { status: 'closed' };
    if (context.branchId) where.branchId = context.branchId;
    if (customerId)  where.customerId  = customerId;
    if (employeeId)  where.employeeId  = employeeId;

    // Lọc theo ngày bắt đầu phiên — phải cắt theo giờ CHI NHÁNH, không phải
    // giờ máy chủ: `new Date(`${date}T00:00:00`)` không có offset nên
    // ECMAScript hiểu theo giờ local của TIẾN TRÌNH, ra kết quả khác nhau
    // tuỳ server chạy ở múi giờ nào. Neo bằng 12:00Z (giữa trưa UTC, mọi
    // múi giờ trên thế giới đều đang cùng ngày lịch đó) rồi để
    // `startOfLocalDay`/`endOfLocalDay` cắt đúng theo múi giờ chi nhánh.
    if (date) {
      const branch = context.branchId ? await Branch.findByPk(context.branchId, { attributes: ['timezone'] }) : null;
      const dayStart = startOfLocalDay(new Date(`${date}T12:00:00Z`), branch?.timezone);
      const dayEnd   = endOfLocalDay(new Date(`${date}T12:00:00Z`), branch?.timezone);
      where.startTime = { [Op.between]: [dayStart, dayEnd] };
    }

    // Build court include — có thể filter theo tên sân
    const courtInclude = {
      model: Court,
      as: 'court',
      attributes: ['id', 'name'],
      ...(courtName ? { where: { name: { [Op.like]: `%${courtName}%` } }, required: true } : { required: false })
    };

    const data = await CourtSession.findAndCountAll({
      where,
      limit,
      offset,
      order: [['startTime', 'DESC']],
      include: [
        courtInclude,
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'fullName', 'phone'],
          required: false
        },
        {
          model: Employee,
          as: 'employee',
          attributes: ['id', 'position'],
          required: false
        },
        {
          model: Invoice,
          as: 'invoice',
          required: false,
          attributes: ['id', 'invoiceNo', 'status', 'courtFee', 'extrasFee', 'discountAmount', 'totalAmount'],
          include: [
            {
              model: Payment,
              as: 'payment',
              required: false,
              attributes: ['id', 'method', 'status', 'paidAt', 'amount']
            }
          ]
        },
        {
          model: SessionExtra,
          as: 'sessionExtras',
          required: false,
          attributes: ['id', 'quantity', 'unitPrice', 'subtotal'],
          include: [
            {
              model: Extra,
              as: 'extra',
              attributes: ['id', 'name'],
              required: false
            }
          ]
        }
      ]
    });

    return getPagingData(data, page, limit);
  }

  /**
   * Lấy chi tiết một phiên chơi theo ID
   */
  static async getSessionById(id, context = {}) {
    const where = { id };
    if (context.branchId) where.branchId = context.branchId;

    const session = await CourtSession.findOne({
      where,
      include: [
        { model: Court,    as: 'court',    attributes: ['id', 'name', 'status'] },
        { model: Customer, as: 'customer', attributes: ['id', 'fullName', 'phone', 'loyaltyTier'], required: false },
        { model: Employee, as: 'employee', attributes: ['id', 'position'], required: false },
        { model: Booking,  as: 'booking',  attributes: ['id', 'bookingDate', 'startTime', 'endTime', 'status'], required: false },
        {
          model: Invoice,
          as: 'invoice',
          required: false,
          include: [{ model: Payment, as: 'payment', required: false }]
        },
        {
          model: SessionExtra,
          as: 'sessionExtras',
          required: false,
          include: [{ model: Extra, as: 'extra', attributes: ['id', 'name', 'price'] }]
        }
      ]
    });

    if (!session) {
      const error = new Error('Court session not found');
      error.statusCode = 404;
      throw error;
    }

    return session;
  }
}

module.exports = SessionService;
