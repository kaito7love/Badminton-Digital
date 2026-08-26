const { Op } = require('sequelize');
const { SalesOrder, SalesOrderLine, ProductVariant, Product, Invoice, InvoiceLine, Payment, Customer, Employee, User, Branch, sequelize } = require('../models');
const InventoryService = require('./InventoryService');
const { nextInvoiceNumber } = require('../utils/documentNumber');
const { generateVietQRUrl } = require('../utils/vietqr');
const { getPagination, getPagingData } = require('../utils/pagination');
const { startOfLocalDay, endOfLocalDay } = require('../utils/dateTime');
const { computeLoyaltyTier } = require('../utils/loyalty');
const AuditService = require('./AuditService');
const VoucherService = require('./VoucherService');

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
      const branch = await Branch.findByPk(branchId, { attributes: ['timezone'] });
      where.createdAt = {};
      // Neo bằng 12:00Z rồi cắt theo giờ chi nhánh — không phụ thuộc múi giờ
      // máy chủ (xem cùng lớp lỗi đã sửa ở SessionService.getSessionHistory).
      if (query.from) where.createdAt[Op.gte] = startOfLocalDay(new Date(`${query.from}T12:00:00Z`), branch?.timezone);
      if (query.to) where.createdAt[Op.lte] = endOfLocalDay(new Date(`${query.to}T12:00:00Z`), branch?.timezone);
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
    // Thêm Invoice/Payment (trước đây chỉ có `orderIncludes` = lines) — trang
    // POS cần đọc lại được `paymentStatus` khi refresh đơn transfer đang chờ.
    const order = await SalesOrder.findOne({
      where,
      include: [...orderIncludes, { model: Invoice, as: 'invoice', include: [{ model: Payment, as: 'payment' }] }]
    });
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

      // Chặn số lượng vượt tồn NGAY, trước khi dòng hàng chạm DB: lưu trước
      // rồi mới kiểm thì một số lượng phi lý làm tràn cột `line_total` và trả
      // về lỗi DB thay vì thông báo hết hàng mà thu ngân đọc được.
      await InventoryService.assertProductStockAvailable({
        productVariantId: variantId,
        branchId: order.branchId,
        quantity,
        transaction
      });

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
      // Chỉ rollback khi transaction chưa tự kết thúc (VD: MySQL đã huỷ do
      // deadlock) — gọi rollback() trên transaction đã chết ném lỗi mới,
      // che mất lỗi gốc và lọt ra client dưới dạng HTTP 500 khó hiểu.
      if (!transaction.finished) {
        await transaction.rollback().catch(() => {});
      }
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
      // Chỉ rollback khi transaction chưa tự kết thúc (VD: MySQL đã huỷ do
      // deadlock) — gọi rollback() trên transaction đã chết ném lỗi mới,
      // che mất lỗi gốc và lọt ra client dưới dạng HTTP 500 khó hiểu.
      if (!transaction.finished) {
        await transaction.rollback().catch(() => {});
      }
      throw error;
    }
  }

  /**
   * Áp (hoặc gỡ, khi `voucherCode` rỗng) mã giảm giá cho đơn tại quầy, trước
   * lúc checkout — cùng cơ chế khoá dòng voucher trong transaction như
   * OnlineOrderService.placeOrder, để hai quầy/hai khách không giành cùng một
   * lượt cuối cùng của một mã. `voucherDiscountAmount` ghi ở đây chỉ là số để
   * HIỂN THỊ cho thu ngân thấy ngay; con số có hiệu lực về tiền là số được
   * tính lại trong `checkout` trên giỏ hàng cuối cùng (xem ghi chú ở đó) —
   * giỏ có thể còn thay đổi sau bước này.
   */
  static async applyVoucher(orderId, { voucherCode }, context = {}) {
    const transaction = await sequelize.transaction();
    try {
      const order = await SalesOrder.findOne({
        where: { id: orderId, ...(context.branchId ? { branchId: context.branchId } : {}) },
        include: [{ model: SalesOrderLine, as: 'lines' }],
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!order) {
        const error = new Error('Sales order not found');
        error.statusCode = 404;
        throw error;
      }
      if (order.status !== 'open') {
        const error = new Error(`Đơn hàng ở trạng thái '${order.status}', không thể áp mã giảm giá`);
        error.statusCode = 400;
        throw error;
      }

      const oldValues = {
        voucherId: order.voucherId,
        voucherCode: order.voucherCode,
        voucherDiscountAmount: order.voucherDiscountAmount
      };

      if (!voucherCode) {
        await order.update({ voucherId: null, voucherCode: null, voucherDiscountAmount: null }, { transaction });
      } else {
        const subtotal = order.lines.reduce((sum, line) => sum + Number(line.lineTotal), 0);
        const { voucher, discountAmount } = await VoucherService.validateAndCompute({
          code: voucherCode,
          customerId: order.customerId,
          orderAmount: subtotal,
          transaction
        });
        await order.update(
          { voucherId: voucher.id, voucherCode: voucher.code, voucherDiscountAmount: discountAmount },
          { transaction }
        );
      }

      await AuditService.record({
        actor: context.actor,
        branchId: order.branchId,
        action: voucherCode ? 'sales_order.voucher_applied' : 'sales_order.voucher_removed',
        targetType: 'sales_order',
        targetId: order.id,
        oldValues,
        newValues: { voucherId: order.voucherId, voucherCode: order.voucherCode, voucherDiscountAmount: order.voucherDiscountAmount },
        requestId: context.requestId,
        transaction
      });

      await transaction.commit();
      return SalesOrderService.getOrderById(order.id, order.branchId);
    } catch (error) {
      // Chỉ rollback khi transaction chưa tự kết thúc (VD: MySQL đã huỷ do
      // deadlock) — gọi rollback() trên transaction đã chết ném lỗi mới,
      // che mất lỗi gốc và lọt ra client dưới dạng HTTP 500 khó hiểu.
      if (!transaction.finished) {
        await transaction.rollback().catch(() => {});
      }
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
      // Khoá `sales_orders` TRƯỚC `payments` — thống nhất thứ tự khoá với
      // addLine/removeLine/applyVoucher (đều khoá sales_orders trước). Trước
      // đây hàm này khoá payments trước (gap lock trên uk_payments_idempotency_key
      // của Payment.findOne({lock: UPDATE}) khi chưa có dòng nào khớp) rồi
      // mới khoá sales_orders — hai luồng checkout song song trên cùng một
      // đơn khoá 2 tài nguyên theo thứ tự ngược nhau, MySQL phát hiện
      // deadlock và giết một transaction, lộ ra HTTP 500 kèm thông báo nội
      // bộ thay vì 409 rõ ràng.
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

      // Đơn đã khoá được rồi mới kiểm đã có hoá đơn/giao dịch chưa — luồng
      // thua trong cặp request song song đợi tới đây mới đọc lại được trạng
      // thái mới nhất (do luồng thắng đã commit hoặc đang giữ khoá).
      const existingInvoice = await Invoice.findOne({ where: { salesOrderId: order.id }, transaction });
      if (existingInvoice) {
        const existingPayment = await Payment.findOne({ where: { invoiceId: existingInvoice.id }, transaction });
        if (existingPayment) {
          if (existingPayment.idempotencyKey === resolvedIdempotencyKey) {
            // Đúng là request retry của chính lượt thanh toán này (client gọi
            // lại do timeout/mất mạng) — trả lại nguyên kết quả cũ, không tạo
            // giao dịch mới.
            await transaction.commit();
            return SalesOrderService.getCheckoutResult(existingInvoice.id);
          }
          const error = new Error('Đơn hàng này đã có yêu cầu thanh toán');
          error.statusCode = 409;
          throw error;
        }
      }

      // Idempotency key trùng nhưng gắn với đơn khác — lỗi dùng sai của
      // client (tái dùng key cũ), không phải giao dịch trùng thật.
      const keyUsedElsewhere = await Payment.findOne({
        where: { idempotencyKey: resolvedIdempotencyKey },
        include: [{ model: Invoice, as: 'invoice', attributes: ['id', 'salesOrderId'] }],
        transaction
      });
      if (keyUsedElsewhere && keyUsedElsewhere.invoice?.salesOrderId !== Number(orderId)) {
        const error = new Error('Idempotency key đã được dùng cho một đơn hàng khác');
        error.statusCode = 409;
        throw error;
      }

      if (!order.lines.length) {
        const error = new Error('Đơn hàng chưa có sản phẩm nào');
        error.statusCode = 400;
        throw error;
      }

      const extrasFee = order.lines.reduce((sum, line) => sum + Number(line.lineTotal), 0);

      // Tính LẠI số tiền giảm của mã ngay tại đây, trên giỏ hàng cuối cùng —
      // không tin số đã chốt lúc applyVoucher. Giữa hai thời điểm đó nhân
      // viên có thể đã thêm/bớt dòng hàng (chuyện thường ở quầy: quét nhầm,
      // khách đổi ý) hoặc admin đã tắt mã. Nếu chỉ đọc số cũ thì mọi ràng
      // buộc minOrderAmount/maxDiscountAmount/isActive/hạn dùng đều vượt qua
      // được: áp mã lúc giỏ "đẹp" rồi bỏ bớt hàng, hoá đơn ra tiền giảm lớn
      // hơn cả tiền hàng. `excludeOrderId` để đơn không tự đếm mình là một
      // lượt đã dùng khi soi usageLimit.
      let voucherDiscount = 0;
      if (order.voucherId) {
        const revalidated = await VoucherService.validateAndCompute({
          code: order.voucherCode,
          customerId: order.customerId,
          orderAmount: extrasFee,
          transaction,
          excludeOrderId: order.id
        });
        voucherDiscount = revalidated.discountAmount;
        if (voucherDiscount !== Number(order.voucherDiscountAmount || 0)) {
          await order.update({ voucherDiscountAmount: voucherDiscount }, { transaction });
        }
      }

      // Giảm giá tay cũng phải nằm trong phần còn lại của đơn — trước đây
      // discount_amount lưu số thô nên nhập 999.999đ cho đơn 25.000đ vẫn ghi
      // thẳng vào hoá đơn, làm báo cáo doanh thu đọc ra số vô nghĩa.
      const manualDiscount = Math.max(0, Math.min(Number(discountAmount || 0), extrasFee - voucherDiscount));
      const totalDiscountAmount = manualDiscount + voucherDiscount;
      const totalAmount = Math.max(0, extrasFee - totalDiscountAmount);

      let invoice = await Invoice.findOne({ where: { salesOrderId: order.id }, transaction, lock: transaction.LOCK.UPDATE });
      if (!invoice) {
        invoice = await Invoice.create({
          branchId,
          invoiceNo: await nextInvoiceNumber(branchId, transaction),
          status: 'issued',
          salesOrderId: order.id,
          courtFee: 0,
          extrasFee,
          discountAmount: totalDiscountAmount,
          totalAmount
        }, { transaction });
      } else {
        await invoice.update({ courtFee: 0, extrasFee, discountAmount: totalDiscountAmount, totalAmount }, { transaction });
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
      if (voucherDiscount > 0) {
        invoiceLines.push({
          invoiceId: invoice.id,
          lineKind: 'discount',
          description: `Mã giảm giá ${order.voucherCode}`,
          quantity: 1,
          unitPrice: -voucherDiscount,
          amount: -voucherDiscount
        });
      }
      if (manualDiscount > 0) {
        invoiceLines.push({
          invoiceId: invoice.id,
          lineKind: 'discount',
          description: 'Giảm giá',
          quantity: 1,
          unitPrice: -manualDiscount,
          amount: -manualDiscount
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
          await customer.update({ totalSpent: newTotalSpent, loyaltyTier: computeLoyaltyTier(newTotalSpent) }, { transaction });
        }
      }

      if (isImmediatelyConfirmed) await invoice.update({ status: 'paid' }, { transaction });
      await order.update({ status: 'paid' }, { transaction });
      await AuditService.record({ actor, branchId, action: isImmediatelyConfirmed ? 'payment.completed' : 'payment.pending', targetType: 'payment', targetId: payment.id, newValues: payment.toJSON(), requestId, transaction });

      await transaction.commit();

      let qrCodeUrl = null;
      if (paymentMethod === 'transfer') {
        // Nội dung chuyển khoản PHẢI là invoiceNo: webhook ngân hàng tra hoá
        // đơn bằng `Invoice.findOne({ where: { invoiceNo } })`. Dùng id nội bộ
        // ở đây thì khoản tiền về không khớp được với hoá đơn nào.
        qrCodeUrl = generateVietQRUrl({ amount: totalAmount, addInfo: `HOA DON ${invoice.invoiceNo}` });
      }

      return {
        invoiceId: invoice.id,
        invoiceNo: invoice.invoiceNo,
        salesOrderId: order.id,
        extrasFee,
        discountAmount: totalDiscountAmount,
        voucherCode: order.voucherCode,
        voucherDiscountAmount: voucherDiscount,
        totalAmount,
        paymentMethod,
        paymentStatus: payment.status,
        qrCodeUrl
      };
    } catch (err) {
      if (!transaction.finished) {
        await transaction.rollback().catch(() => {});
      }
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
