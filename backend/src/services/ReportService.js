const { Invoice, Payment, CourtSession, Court, Customer, Extra, SessionExtra, InvoiceLine, ExtraStock, ProductStock, ProductVariant, Product, Employee, User, Branch, sequelize } = require('../models');
const { Op } = require('sequelize');
const { startOfLocalDay, endOfLocalDay, getUtcOffsetMinutes, DEFAULT_TIMEZONE } = require('../utils/dateTime');
const InventoryService = require('./InventoryService');

// GROUP BY theo ngày/tháng/năm phải dịch cột DATETIME sang giờ địa phương
// trước khi DATE_FORMAT, nếu không giao dịch từ 00:00–07:00 giờ VN sẽ bị tính
// nhầm sang ngày hôm trước (cùng lớp bug đã từng fix cho Dashboard "hôm nay"
// — xem `startOfLocalDay`/`endOfLocalDay` — nhưng chưa áp cho báo cáo theo kỳ).
//
// Cột DATETIME lưu theo UTC (`config.js` đặt `timezone: '+00:00'`, dữ liệu cũ
// đã đổi ở migration 20260821400001), nên độ lệch cần cộng chính là độ lệch
// của múi giờ chi nhánh so với UTC. Không phụ thuộc múi giờ máy chủ.
//
// So sánh nhiều chi nhánh (`compareBranches`) dùng chung 1 offset mặc định
// vì cả chuỗi hiện tại chỉ vận hành ở 1 múi giờ (`DEFAULT_TIMEZONE`); nếu
// sau này có chi nhánh khác múi giờ thật, chỗ này cần tách offset theo từng
// `branch_id` thay vì 1 hằng số chung.
const localDateFormatExpr = (column, groupByFormat, timezone = DEFAULT_TIMEZONE) => {
  const offsetMinutes = getUtcOffsetMinutes(new Date(), timezone);
  const shifted = sequelize.fn('DATE_ADD', column, sequelize.literal(`INTERVAL ${offsetMinutes} MINUTE`));
  return sequelize.fn('DATE_FORMAT', shifted, groupByFormat);
};

// Phân loại từng dòng invoice_lines về 1 trong 4 nhóm nguồn doanh thu.
// reference_type phân biệt "phụ kiện dùng trong sân" (session_extra) với
// "bán lẻ tại quầy" (sales_order_line) — cả 2 cùng chung line_kind='product'.
const REVENUE_SOURCE_CASE = `CASE
  WHEN \`InvoiceLine\`.\`line_kind\` = 'court_time' THEN 'court'
  WHEN \`InvoiceLine\`.\`line_kind\` = 'product' AND \`InvoiceLine\`.\`reference_type\` = 'session_extra' THEN 'session_extra'
  WHEN \`InvoiceLine\`.\`line_kind\` = 'product' AND \`InvoiceLine\`.\`reference_type\` = 'sales_order_line' THEN 'retail'
  WHEN \`InvoiceLine\`.\`line_kind\` = 'discount' THEN 'discount'
  ELSE 'other'
END`;

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
    const branch = await Branch.findByPk(branchId);
    // "Hôm nay" phải là ngày theo giờ quán, không phải theo UTC: mốc 00:00Z ứng
    // với 07:00 sáng giờ Việt Nam, nên doanh thu ca sáng sớm sẽ bị đẩy sang ngày
    // hôm trước còn khách chơi qua nửa đêm lại bị đếm nhầm vào hôm nay.
    const todayPayments = await Payment.findAll({
      where: {
        branchId,
        status: 'paid',
        paidAt: {
          [Op.gte]: startOfLocalDay(new Date(), branch?.timezone),
          [Op.lte]: endOfLocalDay(new Date(), branch?.timezone)
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

    // Low stock items count (tính riêng theo chi nhánh) — gộp cả phụ kiện
    // trong sân lẫn sản phẩm bán lẻ, 2 ledger tồn kho tách biệt.
    const [lowStockExtras, lowStockProducts] = await Promise.all([
      InventoryService.getLowStockCount(branchId),
      InventoryService.getLowStockCountForProducts(branchId)
    ]);
    const lowStockCount = lowStockExtras + lowStockProducts;

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
    const branch = await Branch.findByPk(branchId);
    const dateExpr = localDateFormatExpr(sequelize.col('paid_at'), groupByFormat, branch?.timezone);

    const revenueData = await Payment.findAll({
      attributes: [
        [dateExpr, 'date'],
        [sequelize.fn('SUM', sequelize.col('invoice.total_amount')), 'totalRevenue'],
        [sequelize.fn('COUNT', sequelize.col('Payment.id')), 'totalTransactions']
      ],
      where: { branchId, status: 'paid', ...(paidAtRange || {}) },
      include: [{ model: Invoice, as: 'invoice', attributes: [] }],
      group: [dateExpr],
      order: [[dateExpr, 'DESC']],
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

  /**
   * Doanh thu tách theo 4 nguồn (tiền sân / phụ kiện trong sân / bán lẻ
   * quầy / giảm giá), theo kỳ, kèm chi tiết từng dòng giảm giá. Dữ liệu lấy
   * từ `invoice_lines`, chỉ có từ khi `feat/invoice-line-items` merge
   * (2026-08-16) — trả kèm `dataFrom` để frontend hiển thị rõ giới hạn.
   * `compareBranches` chỉ có tác dụng khi gọi kèm quyền admin (kiểm tra ở
   * controller) — khi đó bỏ qua `branchId` đơn lẻ, group theo từng chi nhánh.
   */
  static async getRevenueBreakdown({ branchId, compareBranches = false, period = 'daily', from = null, to = null }) {
    if (!compareBranches) ReportService.requireBranch(branchId);

    let groupByFormat;
    if (period === 'monthly') groupByFormat = '%Y-%m';
    else if (period === 'yearly') groupByFormat = '%Y';
    else groupByFormat = '%Y-%m-%d';

    const createdAtRange = buildDateRange('createdAt', from, to);
    const invoiceWhere = compareBranches ? {} : { branchId };
    // compareBranches gộp nhiều chi nhánh trong 1 query nên dùng offset mặc
    // định (xem ghi chú ở `localDateFormatExpr`); trường hợp 1 chi nhánh thì
    // lấy đúng timezone của chi nhánh đó.
    const branch = compareBranches ? null : await Branch.findByPk(branchId);
    const bucketExpr = localDateFormatExpr(sequelize.col('InvoiceLine.created_at'), groupByFormat, branch?.timezone);

    const groupCols = [
      bucketExpr,
      sequelize.literal(REVENUE_SOURCE_CASE)
    ];
    if (compareBranches) groupCols.push(sequelize.col('invoice.branch_id'));

    const rows = await InvoiceLine.findAll({
      attributes: [
        [bucketExpr, 'bucket'],
        [sequelize.literal(REVENUE_SOURCE_CASE), 'source'],
        ...(compareBranches ? [[sequelize.col('invoice.branch_id'), 'branchId']] : []),
        [sequelize.fn('SUM', sequelize.col('InvoiceLine.amount')), 'amount'],
        [sequelize.fn('SUM', sequelize.col('InvoiceLine.quantity')), 'quantity']
      ],
      where: { ...(createdAtRange || {}) },
      include: [{ model: Invoice, as: 'invoice', attributes: [], where: invoiceWhere }],
      group: groupCols,
      order: [[bucketExpr, 'DESC']],
      raw: true
    });

    const discountDetails = await InvoiceLine.findAll({
      attributes: ['id', 'amount', 'createdAt'],
      where: { lineKind: 'discount', ...(createdAtRange || {}) },
      include: [{
        model: Invoice,
        as: 'invoice',
        attributes: ['id', 'invoiceNo', 'branchId'],
        where: invoiceWhere,
        include: [{
          model: Payment,
          as: 'payment',
          attributes: ['id'],
          include: [{
            model: Employee,
            as: 'employee',
            attributes: ['id'],
            include: [{ model: User, as: 'user', attributes: ['fullName'] }]
          }]
        }]
      }],
      order: [['createdAt', 'DESC']],
      limit: 200
    });

    return {
      dataFrom: '2026-08-16',
      breakdown: rows,
      discounts: discountDetails.map((line) => ({
        invoiceNo: line.invoice?.invoiceNo,
        branchId: line.invoice?.branchId,
        employeeName: line.invoice?.payment?.employee?.user?.fullName || null,
        amount: Number(line.amount),
        createdAt: line.createdAt
      }))
    };
  }

  /**
   * Đối chiếu nhập/bán/tồn theo item × chi nhánh — nguồn chính là
   * `stock_movements` (đầy đủ từ M4, 2026-08-15, không bị giới hạn "chưa
   * backfill" như `invoice_lines`). "Bán theo hoá đơn" chỉ tính được từ
   * 2026-08-16 — chênh lệch giữa 2 số "bán" là tín hiệu thất thoát tiềm ẩn
   * (kho đã trừ nhưng chưa từng thanh toán), không phải lỗi sổ kho nội bộ.
   */
  static async getInventoryReconciliation({ branchId, from = null, to = null }) {
    ReportService.requireBranch(branchId);

    const dateFilter = [];
    const replacements = { branchId };
    if (from) { dateFilter.push('sm.created_at >= :from'); replacements.from = `${from} 00:00:00`; }
    if (to) { dateFilter.push('sm.created_at <= :to'); replacements.to = `${to} 23:59:59.999`; }
    const smDateClause = dateFilter.length ? `AND ${dateFilter.join(' AND ')}` : '';

    const ilDateFilter = [];
    const ilReplacements = { branchId };
    if (from) { ilDateFilter.push('il.created_at >= :from'); ilReplacements.from = `${from} 00:00:00`; }
    if (to) { ilDateFilter.push('il.created_at <= :to'); ilReplacements.to = `${to} 23:59:59.999`; }
    const ilDateClause = ilDateFilter.length ? `AND ${ilDateFilter.join(' AND ')}` : '';

    const [ledgerRows] = await sequelize.query(
      `SELECT
         COALESCE(extra_id, product_variant_id) AS itemId,
         CASE WHEN extra_id IS NOT NULL THEN 'extra' ELSE 'product_variant' END AS itemType,
         SUM(CASE WHEN type = 'purchase_receipt' THEN quantity ELSE 0 END) AS qtyIn,
         SUM(CASE WHEN type = 'sale' THEN quantity ELSE 0 END) AS qtySoldLedger,
         SUM(CASE WHEN type = 'sale_return' THEN quantity ELSE 0 END) AS qtyReturned,
         SUM(CASE WHEN type = 'adjustment_in' THEN quantity
                  WHEN type IN ('adjustment_out', 'damaged', 'lost') THEN -quantity
                  ELSE 0 END) AS qtyAdjustedNet
       FROM stock_movements sm
       WHERE branch_id = :branchId ${smDateClause}
       GROUP BY itemId, itemType`,
      { replacements }
    );

    const [invoiceSessionRows] = await sequelize.query(
      `SELECT se.extra_id AS itemId, 'extra' AS itemType, SUM(il.quantity) AS qtySoldInvoice
       FROM invoice_lines il
       JOIN session_extras se ON il.reference_type = 'session_extra' AND il.reference_id = se.id
       JOIN invoices i ON il.invoice_id = i.id
       WHERE il.line_kind = 'product' AND i.branch_id = :branchId ${ilDateClause}
       GROUP BY se.extra_id`,
      { replacements: ilReplacements }
    );

    const [invoiceRetailRows] = await sequelize.query(
      `SELECT sol.variant_id AS itemId, 'product_variant' AS itemType, SUM(il.quantity) AS qtySoldInvoice
       FROM invoice_lines il
       JOIN sales_order_lines sol ON il.reference_type = 'sales_order_line' AND il.reference_id = sol.id
       JOIN invoices i ON il.invoice_id = i.id
       WHERE il.line_kind = 'product' AND i.branch_id = :branchId ${ilDateClause}
       GROUP BY sol.variant_id`,
      { replacements: ilReplacements }
    );

    const soldInvoiceMap = new Map();
    for (const row of [...invoiceSessionRows, ...invoiceRetailRows]) {
      soldInvoiceMap.set(`${row.itemType}:${row.itemId}`, Number(row.qtySoldInvoice));
    }

    const extraStocks = await ExtraStock.findAll({ where: { branchId }, include: [{ model: Extra, as: 'extra', attributes: ['id', 'name'] }] });
    const productStocks = await ProductStock.findAll({
      where: { branchId },
      include: [{ model: ProductVariant, as: 'variant', attributes: ['id', 'sku'], include: [{ model: Product, as: 'product', attributes: ['name'] }] }]
    });
    const currentStockMap = new Map();
    for (const s of extraStocks) currentStockMap.set(`extra:${s.extraId}`, { quantity: s.quantity, name: s.extra?.name });
    for (const s of productStocks) currentStockMap.set(`product_variant:${s.productVariantId}`, { quantity: s.quantity, name: `${s.variant?.product?.name || ''} (${s.variant?.sku || ''})` });

    const results = ledgerRows.map((row) => {
      const key = `${row.itemType}:${row.itemId}`;
      const qtySoldInvoice = soldInvoiceMap.get(key) || 0;
      const qtySoldLedger = Number(row.qtySoldLedger);
      const qtyReturned = Number(row.qtyReturned);
      const current = currentStockMap.get(key);
      return {
        itemType: row.itemType,
        itemId: row.itemId,
        name: current?.name || null,
        qtyIn: Number(row.qtyIn),
        qtySoldLedger,
        qtyReturned,
        qtyAdjustedNet: Number(row.qtyAdjustedNet),
        qtySoldInvoice,
        // Trừ số đã trả lại (thêm giỏ rồi xoá dòng/huỷ giỏ) trước khi so
        // với hoá đơn — nếu không, add-rồi-remove sẽ bị báo nhầm là "bán
        // chưa thanh toán" dù tồn kho ròng không đổi.
        soldDiscrepancy: (qtySoldLedger - qtyReturned) - qtySoldInvoice,
        currentQuantity: current?.quantity ?? null
      };
    });

    return {
      dataFrom: { ledger: '2026-08-15', invoiceComparison: '2026-08-16' },
      items: results.filter((r) => r.qtyIn || r.qtySoldLedger || r.qtyReturned || r.qtyAdjustedNet)
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
