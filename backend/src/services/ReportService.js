const { Invoice, Payment, CourtSession, Court, Customer, Extra, SessionExtra, sequelize } = require('../models');
const { Op } = require('sequelize');

// Dựng điều kiện lọc theo khoảng ngày (from/to dạng YYYY-MM-DD, cả hai đều optional)
const buildDateRange = (column, from, to) => {
  if (!from && !to) return null;
  const range = {};
  if (from) range[Op.gte] = new Date(`${from}T00:00:00`);
  if (to) range[Op.lte] = new Date(`${to}T23:59:59.999`);
  return { [column]: range };
};

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

    const totalCourts = await Court.count({ where: { branchId } });

    // Mẫu số của tỷ lệ lấp đầy là công suất khai thác, không phải tổng số sân:
    // sân bảo trì vẫn tính (đang mất doanh thu tạm thời), sân đã ngưng khai thác
    // thì không — tính vào sẽ kéo tỷ lệ xuống một cách sai lệch.
    const operatingCourts = await Court.count({
      where: { branchId, status: { [Op.in]: ['active', 'maintenance'] } }
    });

    // Sân đang chơi suy ra từ phiên đang mở, không đọc courts.status
    const activeCourts = await CourtSession.count({
      distinct: true,
      col: 'courtId',
      where: { branchId, status: 'playing' }
    });
    const occupancyRate = operatingCourts > 0 ? Math.round((activeCourts / operatingCourts) * 100) : 0;

    // Low stock items count
    const lowStockCount = await Extra.count({
      where: {
        stockQuantity: { [Op.lte]: sequelize.col('low_stock_threshold') }
      }
    });

    return {
      todayRevenue,
      totalCourts,
      operatingCourts,
      activeCourts,
      occupancyRate,
      lowStockCount
    };
  }

  static async getRevenueReport(period = 'daily', branchId, { from = null, to = null } = {}) {
    ReportService.requireBranch(branchId);
    let groupByFormat;
    if (period === 'monthly') {
      groupByFormat = '%Y-%m';
    } else if (period === 'yearly') {
      groupByFormat = '%Y';
    } else {
      groupByFormat = '%Y-%m-%d';
    }

    const paidAtRange = buildDateRange('paidAt', from, to);

    const revenueData = await Payment.findAll({
      attributes: [
        [sequelize.fn('DATE_FORMAT', sequelize.col('paid_at'), groupByFormat), 'date'],
        [sequelize.fn('SUM', sequelize.col('invoice.total_amount')), 'totalRevenue'],
        [sequelize.fn('COUNT', sequelize.col('Payment.id')), 'totalTransactions']
      ],
      where: { branchId, status: 'paid', ...(paidAtRange || {}) },
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

  /** Danh sách phiên chơi đã đóng, dùng cho sheet "Phiên chơi" khi xuất báo cáo */
  static async getSessionDetails({ branchId, from = null, to = null, limit = 5000 }) {
    ReportService.requireBranch(branchId);
    const startTimeRange = buildDateRange('startTime', from, to);

    return await CourtSession.findAll({
      where: { branchId, status: 'closed', ...(startTimeRange || {}) },
      include: [
        { model: Court, as: 'court', attributes: ['name'] },
        { model: Customer, as: 'customer', attributes: ['fullName', 'phone'], required: false },
        {
          model: Invoice,
          as: 'invoice',
          attributes: ['invoiceNo', 'courtFee', 'extrasFee', 'discountAmount', 'totalAmount', 'status'],
          required: false
        }
      ],
      order: [['startTime', 'DESC']],
      limit
    });
  }

  /** Gom toàn bộ dữ liệu cho file Excel / PDF */
  static async getExportData({ period = 'daily', from = null, to = null, branchId }) {
    ReportService.requireBranch(branchId);

    const [summary, revenue, topCourts, topAccessories, sessions] = await Promise.all([
      ReportService.getDashboardSummary(branchId),
      ReportService.getRevenueReport(period, branchId, { from, to }),
      ReportService.getTopCourts(branchId),
      ReportService.getTopAccessories(branchId),
      ReportService.getSessionDetails({ branchId, from, to })
    ]);

    const totalRevenue = revenue.reduce((sum, row) => sum + Number(row.totalRevenue || 0), 0);
    const totalTransactions = revenue.reduce((sum, row) => sum + Number(row.totalTransactions || 0), 0);

    return {
      generatedAt: new Date(),
      period,
      from,
      to,
      summary: {
        ...summary,
        totalRevenue,
        totalTransactions,
        totalSessions: sessions.length
      },
      revenue,
      topCourts: topCourts.map((c) => (c.toJSON ? c.toJSON() : c)),
      topAccessories: topAccessories.map((a) => (a.toJSON ? a.toJSON() : a)),
      sessions: sessions.map((s) => (s.toJSON ? s.toJSON() : s))
    };
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
