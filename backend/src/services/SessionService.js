const {
  CourtSession, Court, Customer, Employee, Invoice, Payment,
  SessionExtra, Extra, Booking, Branch, sequelize
} = require('../models');
const { Op } = require('sequelize');
const { getPagination, getPagingData } = require('../utils/pagination');
const { startOfLocalDay, endOfLocalDay } = require('../utils/dateTime');
const { calculateSessionCourtFee, calculateInvoiceTotals } = require('../utils/priceCalculator');
const CourtService = require('./CourtService');

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
   * Lấy chi tiết một phiên chơi theo ID.
   *
   * Phiên đang chơi kèm `checkoutPreview` — số tiền nếu thanh toán ngay bây giờ,
   * tính bằng đúng hàm checkout dùng (kể cả các đoạn trước khi chuyển sân). Modal
   * thanh toán hiện số này rồi gửi lại `endTime` của nó khi xác nhận, nên số trên
   * modal và số trên hoá đơn là một. Trước đây trang Sân tự nhân giờ chơi với giá
   * cao điểm ở trình duyệt: chơi giờ thấp điểm vẫn hiện giá cao điểm, thu ngân
   * thu theo modal là lệch quỹ.
   */
  static async getSessionById(id, context = {}) {
    const where = { id };
    if (context.branchId) where.branchId = context.branchId;

    const session = await CourtSession.findOne({
      where,
      include: [
        { model: Court,    as: 'court',    attributes: ['id', 'name', 'status', 'peakPricePerHour', 'offpeakPricePerHour'] },
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

    if (session.status !== 'playing') return session;

    const endTime = new Date();
    const pricing = await CourtService.loadPricingContext(session.branchId);
    const fee = calculateSessionCourtFee(session, session.court, endTime, pricing);
    const totals = calculateInvoiceTotals(fee.courtFee, session.sessionExtras || []);

    return {
      ...session.toJSON(),
      checkoutPreview: {
        endTime: endTime.toISOString(),
        durationSeconds: fee.durationSeconds,
        courtFee: totals.courtFee,
        extrasFee: totals.extrasFee,
        totalAmount: totals.totalBeforeDiscount
      }
    };
  }
}

module.exports = SessionService;
