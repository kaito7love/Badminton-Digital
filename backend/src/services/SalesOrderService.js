const { Op } = require('sequelize');
const { SalesOrder, SalesOrderLine, ProductVariant, Product, Invoice, InvoiceLine, Payment, Customer, Employee, User, sequelize } = require('../models');
const InventoryService = require('./InventoryService');
const { nextInvoiceNumber } = require('../utils/documentNumber');
const { generateVietQRUrl } = require('../utils/vietqr');
const { getPagination, getPagingData } = require('../utils/pagination');
const AuditService = require('./AuditService');

const orderIncludes = [
  {
    model: SalesOrderLine,
    as: 'lines',
    include: [{ model: ProductVariant, as: 'variant', include: [{ model: Product, as: 'product', attributes: ['id', 'name'] }] }]
  }
];

/**
 * Đơn bán lẻ (channel 'pos') — độc lập hoàn toàn luồng sân/session. Trừ kho
 * ngay khi thêm dòng (giống mẫu AccessoryService.addSessionExtra cho trụ 1),
 * hoàn kho khi xoá dòng, và tái dùng hạ tầng Invoice/InvoiceLine/Payment lúc
 * checkout thay vì tạo cơ chế hoá đơn riêng.
 */
class SalesOrderService {
  /** Lịch sử đơn bán lẻ — cùng khuôn mẫu SessionService.getSessionHistory (lọc theo ngày, phân trang). */
  static async listOrders(query, branchId) {
    if (!branchId) {
      const error = new Error('Không xác định được chi nhánh');
      error.statusCode = 400;
      throw error;
    }
    const { page, limit, offset } = getPagination(query);
    const where = { branchId };
    if (query.status) where.status = query.status;
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt[Op.gte] = new Date(`${query.from}T00:00:00`);
      if (query.to) where.createdAt[Op.lte] = new Date(`${query.to}T23:59:59.999`);
    }

    const data = await SalesOrder.findAndCountAll({
      where,
      limit,
      offset,
      distinct: true,
      order: [['id', 'DESC']],
      include: [
        ...orderIncludes,
        { model: Customer, as: 'customer', attributes: ['id', 'fullName', 'phone'] },
        { model: Employee, as: 'cashier', attributes: ['id'], include: [{ model: User, as: 'user', attributes: ['fullName'] }] },
        { model: Invoice, as: 'invoice', include: [{ model: Payment, as: 'payment' }] }
      ]
    });
    return getPagingData(data, page, limit);
  }

  static async createOrder({ branchId, customerId, cashierEmployeeId }, context = {}) {
    if (!branchId) {
      const error = new Error('Không xác định được chi nhánh bán hàng');
      error.statusCode = 400;
      throw error;
    }
    const order = await SalesOrder.create({
      branchId,
      channel: 'pos',
      status: 'open',
      customerId: customerId || null,
      cashierEmployeeId: cashierEmployeeId || context.actor?.employee?.id || null
    });
    await AuditService.record({ actor: context.actor, branchId, action: 'sales_order.created', targetType: 'sales_order', targetId: order.id, newValues: order.toJSON(), requestId: context.requestId });
    return SalesOrderService.getOrderById(order.id, branchId);
  }

  static async getOrderById(id, branchId) {
    const where = branchId ? { id, branchId } : { id };
    const order = await SalesOrder.findOne({ where, include: orderIncludes });
    if (!order) {
      const error = new Error('Sales order not found');
      error.statusCode = 404;
      throw error;
    }
    return order;
  }

  static async addLine(orderId, { variantId, quantity }, context = {}) {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      const error = new Error('Số lượng phải là số nguyên dương');
      error.statusCode = 400;
      throw error;
    }
    const transaction = await sequelize.transaction();
    try {
      const order = await SalesOrder.findOne({ where: { id: orderId, ...(context.branchId ? { branchId: context.branchId } : {}) }, transaction, lock: transaction.LOCK.UPDATE });
      if (!order) {
        const error = new Error('Sales order not found');
        error.statusCode = 404;
        throw error;
      }
      if (order.status !== 'open') {
        const error = new Error(`Đơn hàng ở trạng thái '${order.status}', không thể thêm sản phẩm`);
        error.statusCode = 400;
        throw error;
      }
      const variant = await ProductVariant.findByPk(variantId, { transaction });
      if (!variant) {
        const error = new Error('Product variant not found');
        error.statusCode = 404;
        throw error;
      }

      const unitPrice = Number(variant.listPrice);
      const lineTotal = unitPrice * quantity;

      const line = await SalesOrderLine.create({
        salesOrderId: order.id,
        variantId,
        quantity,
        unitPrice,
        lineTotal
      }, { transaction });

      // Trừ kho đúng chi nhánh của đơn — ném lỗi 400 nếu không đủ tồn.
      await InventoryService.postMovement({
        branchId: order.branchId,
        productVariantId: variantId,
        type: 'sale',
        quantity,
        referenceType: 'sales_order_line',
        referenceId: line.id,
        actor: context.actor,
        transaction
      });

      await AuditService.record({ actor: context.actor, branchId: order.branchId, action: 'sales_order_line.added', targetType: 'sales_order_line', targetId: line.id, newValues: line.toJSON(), requestId: context.requestId, transaction });

      await transaction.commit();
      return SalesOrderService.getOrderById(order.id, order.branchId);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  static async removeLine(orderId, lineId, context = {}) {
    const transaction = await sequelize.transaction();
    try {
      const order = await SalesOrder.findOne({ where: { id: orderId, ...(context.branchId ? { branchId: context.branchId } : {}) }, transaction, lock: transaction.LOCK.UPDATE });
      if (!order) {
        const error = new Error('Sales order not found');
        error.statusCode = 404;
        throw error;
      }
      if (order.status !== 'open') {
        const error = new Error(`Đơn hàng ở trạng thái '${order.status}', không thể xoá sản phẩm`);
        error.statusCode = 400;
        throw error;
      }
      const line = await SalesOrderLine.findOne({ where: { id: lineId, salesOrderId: order.id }, transaction, lock: transaction.LOCK.UPDATE });
      if (!line) {
        const error = new Error('Sales order line not found');
        error.statusCode = 404;
        throw error;
      }

      // Hoàn lại kho đúng chi nhánh của đơn.
      await InventoryService.postMovement({
        branchId: order.branchId,
        productVariantId: line.variantId,
        type: 'sale_return',
        quantity: line.quantity,
        referenceType: 'sales_order_line',
        referenceId: line.id,
        actor: context.actor,
        transaction
      });

      const oldValues = line.toJSON();
      await line.destroy({ transaction });
      await AuditService.record({ actor: context.actor, branchId: order.branchId, action: 'sales_order_line.removed', targetType: 'sales_order_line', targetId: lineId, oldValues, requestId: context.requestId, transaction });

      await transaction.commit();
      return SalesOrderService.getOrderById(order.id, order.branchId);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  static async checkout({ orderId, paymentMethod = 'cash', discountAmount = 0, employeeId, branchId, actor, requestId, idempotencyKey }) {
    if (!branchId || !employeeId) {
      const error = new Error('Không xác định được nhân viên hoặc chi nhánh thanh toán');
      error.statusCode = 403;
      throw error;
    }
    const resolvedIdempotencyKey = idempotencyKey || `sales-order-${orderId}`;
    const transaction = await sequelize.transaction();

    try {
      const existingPayment = await Payment.findOne({
        where: { idempotencyKey: resolvedIdempotencyKey },
        include: [{ model: Invoice, as: 'invoice', attributes: ['id', 'salesOrderId'] }],
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (existingPayment) {
        if (existingPayment.invoice?.salesOrderId !== Number(orderId)) {
          const error = new Error('Idempotency key đã được dùng cho một đơn hàng khác');
          error.statusCode = 409;
          throw error;
        }
        await transaction.commit();
        return SalesOrderService.getCheckoutResult(existingPayment.invoiceId);
      }

      const order = await SalesOrder.findOne({
        where: { id: orderId, branchId },
        include: [{
          model: SalesOrderLine,
          as: 'lines',
          include: [{ model: ProductVariant, as: 'variant', include: [{ model: Product, as: 'product', attributes: ['id', 'name'] }] }]
        }],
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!order) {
        const error = new Error('Sales order not found');
        error.statusCode = 404;
        throw error;
      }
      if (order.status === 'cancelled') {
        const error = new Error('Đơn hàng đã bị huỷ, không thể thanh toán');
        error.statusCode = 400;
        throw error;
      }
      if (!order.lines.length) {
        const error = new Error('Đơn hàng chưa có sản phẩm nào');
        error.statusCode = 400;
        throw error;
      }

      const extrasFee = order.lines.reduce((sum, line) => sum + Number(line.lineTotal), 0);
      const totalAmount = Math.max(0, extrasFee - Number(discountAmount || 0));

      let invoice = await Invoice.findOne({ where: { salesOrderId: order.id }, transaction, lock: transaction.LOCK.UPDATE });
      if (!invoice) {
        invoice = await Invoice.create({
          branchId,
          invoiceNo: await nextInvoiceNumber(branchId, transaction),
          status: 'issued',
          salesOrderId: order.id,
          courtFee: 0,
          extrasFee,
          discountAmount,
          totalAmount
        }, { transaction });
      } else {
        await invoice.update({ courtFee: 0, extrasFee, discountAmount, totalAmount }, { transaction });
        await InvoiceLine.destroy({ where: { invoiceId: invoice.id }, transaction });
      }

      const invoiceLines = order.lines.map((line) => ({
        invoiceId: invoice.id,
        lineKind: 'product',
        description: line.variant?.product ? line.variant.product.name : `Sản phẩm #${line.variantId}`,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        amount: line.lineTotal,
        referenceType: 'sales_order_line',
        referenceId: line.id
      }));
      if (Number(discountAmount) > 0) {
        invoiceLines.push({
          invoiceId: invoice.id,
          lineKind: 'discount',
          description: 'Giảm giá',
          quantity: 1,
          unitPrice: -Number(discountAmount),
          amount: -Number(discountAmount)
        });
      }
      await InvoiceLine.bulkCreate(invoiceLines, { transaction });

      let payment = await Payment.findOne({ where: { invoiceId: invoice.id }, transaction, lock: transaction.LOCK.UPDATE });
      const isImmediatelyConfirmed = paymentMethod === 'cash';
      if (!payment) {
        payment = await Payment.create({
          branchId,
          invoiceId: invoice.id,
          method: paymentMethod,
          amount: totalAmount,
          idempotencyKey: resolvedIdempotencyKey,
          status: isImmediatelyConfirmed ? 'paid' : 'pending',
          paidAt: isImmediatelyConfirmed ? new Date() : null,
          confirmedAt: isImmediatelyConfirmed ? new Date() : null,
          employeeId
        }, { transaction });
      } else {
        const error = new Error('Đơn hàng này đã có yêu cầu thanh toán');
        error.statusCode = 409;
        throw error;
      }

      if (isImmediatelyConfirmed && order.customerId) {
        const customer = await Customer.findByPk(order.customerId, { transaction });
        if (customer) {
          const newTotalSpent = Number(customer.totalSpent) + totalAmount;
          let loyaltyTier = 'normal';
          if (newTotalSpent >= 15000000) loyaltyTier = 'vip';
          else if (newTotalSpent >= 5000000) loyaltyTier = 'gold';
          await customer.update({ totalSpent: newTotalSpent, loyaltyTier }, { transaction });
        }
      }

      if (isImmediatelyConfirmed) await invoice.update({ status: 'paid' }, { transaction });
      await order.update({ status: 'paid' }, { transaction });
      await AuditService.record({ actor, branchId, action: isImmediatelyConfirmed ? 'payment.completed' : 'payment.pending', targetType: 'payment', targetId: payment.id, newValues: payment.toJSON(), requestId, transaction });

      await transaction.commit();

      let qrCodeUrl = null;
      if (paymentMethod === 'transfer') {
        qrCodeUrl = generateVietQRUrl({ amount: totalAmount, addInfo: `HOA DON BD${invoice.id}` });
      }

      return {
        invoiceId: invoice.id,
        invoiceNo: invoice.invoiceNo,
        salesOrderId: order.id,
        extrasFee,
        discountAmount: Number(discountAmount),
        totalAmount,
        paymentMethod,
        paymentStatus: payment.status,
        qrCodeUrl
      };
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }

  static async getCheckoutResult(invoiceId) {
    const invoice = await Invoice.findByPk(invoiceId, { include: [{ model: Payment, as: 'payment' }] });
    const payment = invoice.payment;
    return {
      invoiceId: invoice.id,
      invoiceNo: invoice.invoiceNo,
      salesOrderId: invoice.salesOrderId,
      extrasFee: Number(invoice.extrasFee),
      discountAmount: Number(invoice.discountAmount),
      totalAmount: Number(invoice.totalAmount),
      paymentMethod: payment.method,
      paymentStatus: payment.status,
      qrCodeUrl: payment.method === 'transfer' && payment.status !== 'paid' ? generateVietQRUrl({ amount: invoice.totalAmount, addInfo: `HOA DON ${invoice.invoiceNo}` }) : null
    };
  }
}

module.exports = SalesOrderService;
