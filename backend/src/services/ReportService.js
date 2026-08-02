const { Invoice, Payment, CourtSession, Court, Extra, SessionExtra, sequelize } = require('../models');
const { Op } = require('sequelize');

class ReportService {
  static async getDashboardSummary() {
    const today = new Date().toISOString().slice(0, 10);
    
    // Total Revenue Today
    const todayPayments = await Payment.findAll({
      where: {
        status: 'paid',
        paidAt: {
          [Op.gte]: new Date(`${today}T00:00:00.000Z`),
          [Op.lte]: new Date(`${today}T23:59:59.999Z`)
        }
      },
      include: [{ model: Invoice, as: 'invoice' }]
    });

    const todayRevenue = todayPayments.reduce((sum, p) => sum + Number(p.invoice.totalAmount), 0);

    // Active Courts / Sessions
    const totalCourts = await Court.count();
    const activeCourts = await Court.count({ where: { status: 'playing' } });
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

  static async getRevenueReport(period = 'daily') {
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
      where: { status: 'paid' },
      include: [{ model: Invoice, as: 'invoice', attributes: [] }],
      group: [sequelize.fn('DATE_FORMAT', sequelize.col('paid_at'), groupByFormat)],
      order: [[sequelize.fn('DATE_FORMAT', sequelize.col('paid_at'), groupByFormat), 'DESC']],
      raw: true
    });

    return revenueData;
  }

  static async getTopCourts() {
    return await CourtSession.findAll({
      attributes: [
        'courtId',
        [sequelize.fn('COUNT', sequelize.col('CourtSession.id')), 'totalSessions'],
        [sequelize.fn('SUM', sequelize.col('duration_seconds')), 'totalDurationSeconds']
      ],
      include: [{ model: Court, as: 'court', attributes: ['name'] }],
      group: ['courtId', 'court.id'],
      order: [[sequelize.fn('COUNT', sequelize.col('CourtSession.id')), 'DESC']],
      limit: 5
    });
  }

  static async getTopAccessories() {
    return await SessionExtra.findAll({
      attributes: [
        'extraId',
        [sequelize.fn('SUM', sequelize.col('quantity')), 'totalQuantitySold'],
        [sequelize.fn('SUM', sequelize.col('subtotal')), 'totalRevenue']
      ],
      include: [{ model: Extra, as: 'extra', attributes: ['name', 'price'] }],
      group: ['extraId', 'extra.id'],
      order: [[sequelize.fn('SUM', sequelize.col('quantity')), 'DESC']],
      limit: 5
    });
  }
}

module.exports = ReportService;
