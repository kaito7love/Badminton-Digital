const { Invoice, Payment, CourtSession, Court, Extra, SessionExtra, sequelize } = require('../models');
const { Op } = require('sequelize');

class ReportService {
  static async getDashboardSummary(branchId) {
    ReportService.requireBranch(branchId);
    const today = new Date().toISOString().slice(0, 10);
    
    // Total Revenue Today
    const todayPayments = await Payment.findAll({
      where: {
        branchId,
        status: 'paid',
        paidAt: {
          [Op.gte]: new Date(`${today}T00:00:00.000Z`),
          [Op.lte]: new Date(`${today}T23:59:59.999Z`)
        }
      },
      include: [{ model: Invoice, as: 'invoice' }]
    });

    const todayRevenue = todayPayments.reduce((sum, p) => sum + Number(p.invoice.totalAmount), 0);

    // Active Courts / Sessions — court status never stores "playing"; a court
    // is playing iff it has an open CourtSession, so count that instead.
    const totalCourts = await Court.count({ where: { branchId } });
    const activeCourts = await CourtSession.count({
      where: { branchId, status: 'playing' },
      distinct: true,
      col: 'courtId'
    });
    const occupancyRate = totalCourts > 0 ? Math.round((activeCourts / totalCourts) * 100) : 0;

    // Low stock items count
    const lowStockCount = await Extra.count({
      where: {
        stockQuantity: { [Op.lte]: sequelize.col('low_stock_threshold') }
      }
    });

    return {
      todayRevenue,
      totalCourts,
      activeCourts,
      occupancyRate,
      lowStockCount
    };
  }

  static async getRevenueReport(period = 'daily', branchId) {
    ReportService.requireBranch(branchId);
    let groupByFormat;
    if (period === 'monthly') {
      groupByFormat = '%Y-%m';
    } else if (period === 'yearly') {
      groupByFormat = '%Y';
    } else {
      groupByFormat = '%Y-%m-%d';
    }

    const revenueData = await Payment.findAll({
      attributes: [
        [sequelize.fn('DATE_FORMAT', sequelize.col('paid_at'), groupByFormat), 'date'],
        [sequelize.fn('SUM', sequelize.col('invoice.total_amount')), 'totalRevenue'],
        [sequelize.fn('COUNT', sequelize.col('Payment.id')), 'totalTransactions']
      ],
      where: { branchId, status: 'paid' },
      include: [{ model: Invoice, as: 'invoice', attributes: [] }],
      group: [sequelize.fn('DATE_FORMAT', sequelize.col('paid_at'), groupByFormat)],
      order: [[sequelize.fn('DATE_FORMAT', sequelize.col('paid_at'), groupByFormat), 'DESC']],
      raw: true
    });

    return revenueData;
  }

  static async getTopCourts(branchId) {
    ReportService.requireBranch(branchId);
    return await CourtSession.findAll({
      attributes: [
        'courtId',
        [sequelize.fn('COUNT', sequelize.col('CourtSession.id')), 'totalSessions'],
        [sequelize.fn('SUM', sequelize.col('duration_seconds')), 'totalDurationSeconds']
      ],
      where: { branchId },
      include: [{ model: Court, as: 'court', attributes: ['name'] }],
      group: ['courtId', 'court.id'],
      order: [[sequelize.fn('COUNT', sequelize.col('CourtSession.id')), 'DESC']],
      limit: 5
    });
  }

  static async getTopAccessories(branchId) {
    ReportService.requireBranch(branchId);
    return await SessionExtra.findAll({
      attributes: [
        'extraId',
        [sequelize.fn('SUM', sequelize.col('quantity')), 'totalQuantitySold'],
        [sequelize.fn('SUM', sequelize.col('subtotal')), 'totalRevenue']
      ],
      include: [
        { model: Extra, as: 'extra', attributes: ['name', 'price'] },
        { model: CourtSession, as: 'session', attributes: [], where: { branchId } }
      ],
      group: ['extraId', 'extra.id'],
      order: [[sequelize.fn('SUM', sequelize.col('quantity')), 'DESC']],
      limit: 5
    });
  }

  static requireBranch(branchId) {
    if (!branchId) {
      const error = new Error('Không xác định được chi nhánh báo cáo');
      error.statusCode = 400;
      throw error;
    }
  }
}

module.exports = ReportService;
