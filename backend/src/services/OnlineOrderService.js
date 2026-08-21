const {
  Branch,
  Invoice,
  Payment,
  Product,
  ProductVariant,
  SalesOrder,
  SalesOrderLine,
  sequelize
} = require('../models');
const { Op } = require('sequelize');
const InventoryService = require('./InventoryService');
const AuditService = require('./AuditService');
const VoucherService = require('./VoucherService');
const { getPagination, getPagingData } = require('../utils/pagination');
const { normalizePhone } = require('../utils/phone');
const { generateVietQRUrl } = require('../utils/vietqr');
const { nextInvoiceNumber } = require('../utils/documentNumber');

// Khách chọn "chuyển khoản" thì có đúng 30 phút để quét mã trước khi hệ thống
// tự huỷ và trả hàng về kệ — đủ để lái xe tới ATM/mở app ngân hàng, ngắn đủ để
// hàng không bị giam vô thời hạn vì một đơn không ai quay lại trả tiền.
const PAYMENT_WINDOW_MS = 30 * 60 * 1000;

const orderIncludes = [
  {
    model: SalesOrderLine,
    as: 'lines',
    include: [{
      model: ProductVariant,
      as: 'variant',
      include: [{ model: Product, as: 'product', attributes: ['id', 'name'] }]
    }]
  },
  // `timezone` để frontend hiển thị mốc thời gian theo giờ CHI NHÁNH NHẬN HÀNG,
  // không theo giờ máy khách đang ngồi.
  { model: Branch, as: 'branch', attributes: ['id', 'name', 'address', 'timezone'] },
  { model: Invoice, as: 'invoice', attributes: ['id', 'invoiceNo', 'status', 'totalAmount'], include: [{ model: Payment, as: 'payment', attributes: ['id', 'method', 'status', 'paidAt'] }] }
];

/**
 * Đơn khách tự đặt trên web — `sales_orders.channel = 'online'`.
 *
 * Dùng lại đúng bảng và đúng cơ chế của đơn bán tại quầy (channel 'pos') thay
 * vì dựng một cơ chế đơn hàng thứ hai: hàng vẫn trừ kho lúc đặt, hoàn kho lúc
 * huỷ, và khi khách tới lấy thì nhân viên thanh toán bằng đúng luồng POS sẵn
 * có (`SalesOrderService.checkout`). Nhờ vậy doanh thu, tồn kho và báo cáo
 * không phải cộng thêm một nguồn số liệu nào mới.
 *
 * Trừ kho ngay lúc đặt là cố ý: khách đặt xong lái xe tới nơi mới biết hết
 * hàng là hỏng cả buổi. Đổi lại, đơn bị bỏ quên sẽ giam hàng — nên huỷ đơn
 * phải hoàn kho, và đó là việc `cancelOrder` bên dưới làm.
 */
class OnlineOrderService {
  /** Giá bán là giá tại thời điểm đặt — khách thấy số nào thì chốt số đó. */
  static computeLines(variants, items) {
    const variantById = new Map(variants.map((variant) => [variant.id, variant]));

    return items.map((item) => {
      const variant = variantById.get(Number(item.variantId));
      if (!variant) {
        const error = new Error(`Sản phẩm #${item.variantId} không còn được bán`);
        error.statusCode = 400;
        throw error;
      }
      const quantity = Number(item.quantity);
      const unitPrice = Number(variant.listPrice);
      return {
        variantId: variant.id,
        quantity,
        unitPrice,
        lineTotal: unitPrice * quantity
      };
    });
  }

  static totalOf(lines) {
    return lines.reduce((sum, line) => sum + Number(line.lineTotal), 0);
  }

  /** Mốc 30 phút kể từ lúc đặt — tách hàm để test không phải giả lập Date.now toàn cục. */
  static paymentDeadlineFrom(now = new Date()) {
    return new Date(now.getTime() + PAYMENT_WINDOW_MS);
  }

  /** Đơn đang chờ chuyển khoản mà đã quá mốc `paymentDeadlineAt` chưa. */
  static isPaymentExpired(order, now = new Date()) {
    if (!order?.paymentDeadlineAt) return false;
    return new Date(order.paymentDeadlineAt).getTime() < now.getTime();
  }

  /**
   * QR chuyển khoản cho một đơn — `addInfo` gắn mã đơn để quầy dò tay khi đối
   * chiếu sao kê (webhook đối soát tự động cho đơn thật sự tích hợp cổng
   * thanh toán ngân hàng; addInfo là lưới đỡ khi webhook không tới hoặc quầy
   * cần tra thủ công).
   */
  static buildQrCodeUrl(orderId, amount) {
    return generateVietQRUrl({ amount, addInfo: `DH${orderId}` });
  }

  /**
   * QR để hiển thị cho khách ngay bây giờ — null nếu không còn gì để trả:
   * chọn tiền mặt, đã thanh toán, hoặc đơn đã huỷ/hết hạn.
   */
  static qrCodeFor(order) {
    if (order.paymentMethod !== 'transfer' || order.status !== 'open') return null;
    const amount = order.invoice?.totalAmount ?? OnlineOrderService.totalOf(order.lines || []);
    return OnlineOrderService.buildQrCodeUrl(order.id, amount);
  }

  /**
   * Gộp các dòng trùng biến thể trước khi đặt: giỏ hàng phía client có thể gửi
   * cùng một SKU làm hai dòng, để nguyên thì đơn có hai dòng y hệt nhau và
   * nhân viên soạn hàng phải tự cộng nhẩm.
   */
  static mergeItems(items) {
    const merged = new Map();
    for (const item of items) {
      const variantId = Number(item.variantId);
      const quantity = Number(item.quantity);
      merged.set(variantId, (merged.get(variantId) || 0) + quantity);
    }
    return [...merged.entries()].map(([variantId, quantity]) => ({ variantId, quantity }));
  }

  static async placeOrder({ branchId, items, contactName, contactPhone, customerNote, paymentMethod = 'cash', voucherCode }, context = {}) {
    const customerId = context.actor?.customer?.id;
    if (!customerId) {
      const error = new Error('Tài khoản chưa gắn hồ sơ khách hàng, không đặt hàng được');
      error.statusCode = 403;
      throw error;
    }
    if (!Array.isArray(items) || items.length === 0) {
      const error = new Error('Giỏ hàng đang trống');
      error.statusCode = 400;
      throw error;
    }

    const branch = await Branch.findOne({ where: { id: branchId, isActive: true } });
    if (!branch) {
      const error = new Error('Chi nhánh không tồn tại hoặc đã ngưng hoạt động');
      error.statusCode = 400;
      throw error;
    }

    const mergedItems = OnlineOrderService.mergeItems(items);

    const transaction = await sequelize.transaction();
    try {
      // Chỉ nhận biến thể của sản phẩm đang mở bán: khách gửi thẳng variantId
      // nên không thể tin danh sách phía client là hợp lệ.
      const variants = await ProductVariant.findAll({
        where: { id: mergedItems.map((item) => item.variantId) },
        include: [{ model: Product, as: 'product', where: { isActive: true, productType: 'retail' }, attributes: ['id', 'name'] }],
        transaction
      });

      const lines = OnlineOrderService.computeLines(variants, mergedItems);
      const isTransfer = paymentMethod === 'transfer';
      const subtotal = OnlineOrderService.totalOf(lines);

      // Xác thực + khoá dòng voucher trong CHÍNH transaction đang tạo đơn: hai
      // khách cùng giành lượt cuối cùng của một mã thì người khoá được dòng
      // voucher trước mới qua được, người sau đọc lại COUNT đã tính luôn cả
      // đơn vừa insert (SalesOrderService POS cũng khoá kiểu này khi áp mã).
      let voucherResult = null;
      if (voucherCode) {
        voucherResult = await VoucherService.validateAndCompute({
          code: voucherCode,
          customerId,
          orderAmount: subtotal,
          transaction
        });
      }

      const order = await SalesOrder.create({
        branchId: branch.id,
        channel: 'online',
        status: 'open',
        customerId,
        cashierEmployeeId: null,
        contactName: (contactName || context.actor?.fullName || '').trim() || null,
        contactPhone: normalizePhone(contactPhone) || context.actor?.phone || null,
        customerNote: customerNote ? String(customerNote).trim().slice(0, 500) : null,
        paymentMethod,
        voucherId: voucherResult?.voucher.id ?? null,
        voucherCode: voucherResult ? voucherResult.voucher.code : null,
        voucherDiscountAmount: voucherResult ? voucherResult.discountAmount : null,
        // Đặt mốc hạn ngay khi tạo đơn, cùng transaction: đơn không sống được
        // nếu bước tồn kho bên dưới rollback, nên không sợ đặt hạn cho một đơn
        // rồi sau đó lại không có đơn nào tồn tại để mà hết hạn.
        paymentDeadlineAt: isTransfer ? OnlineOrderService.paymentDeadlineFrom() : null
      }, { transaction });

      for (const line of lines) {
        const created = await SalesOrderLine.create({ ...line, salesOrderId: order.id }, { transaction });
        // Ném 400 khi không đủ tồn — cả đơn rollback, khách được báo ngay chứ
        // không nhận một đơn nửa vời rồi ra quầy mới biết thiếu hàng.
        await InventoryService.postMovement({
          branchId: branch.id,
          productVariantId: line.variantId,
          type: 'sale',
          quantity: line.quantity,
          referenceType: 'sales_order_line',
          referenceId: created.id,
          actor: context.actor,
          transaction
        });
      }

      // Chọn chuyển khoản thì tạo hoá đơn + giao dịch ngay — không chờ nhân
      // viên như đơn tiền mặt. Payment.status ở 'pending' cho tới khi webhook
      // xác nhận (PaymentService.processWebhook) hoặc tác vụ quét nền huỷ đơn
      // vì quá hạn (`expireStalePendingOrders`).
      if (isTransfer) {
        const discountAmount = voucherResult?.discountAmount || 0;
        const totalAmount = subtotal - discountAmount;
        const invoice = await Invoice.create({
          branchId: branch.id,
          invoiceNo: await nextInvoiceNumber(branch.id, transaction),
          status: 'issued',
          salesOrderId: order.id,
          courtFee: 0,
          extrasFee: subtotal,
          discountAmount,
          totalAmount
        }, { transaction });

        await Payment.create({
          branchId: branch.id,
          invoiceId: invoice.id,
          method: 'transfer',
          status: 'pending',
          amount: totalAmount,
          employeeId: null,
          idempotencyKey: `online-order-${order.id}`
        }, { transaction });
      }

      await AuditService.record({
        actor: context.actor,
        branchId: branch.id,
        action: 'sales_order.placed_online',
        targetType: 'sales_order',
        targetId: order.id,
        newValues: { ...order.toJSON(), lines },
        requestId: context.requestId,
        transaction
      });

      await transaction.commit();
      return OnlineOrderService.getOrderForCustomer(order.id, customerId);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  static async listOrdersForCustomer(query, customerId) {
    const { page, limit, offset } = getPagination(query);
    const where = { customerId, channel: 'online' };
    if (query.status) where.status = query.status;

    const data = await SalesOrder.findAndCountAll({
      where,
      limit,
      offset,
      distinct: true,
      order: [['id', 'DESC']],
      include: orderIncludes
    });
    const paged = getPagingData(data, page, limit);
    return { ...paged, rows: paged.rows.map(OnlineOrderService.serialize) };
  }

  /** Gắn thêm `qrCodeUrl` tính sẵn — trang chi tiết/danh sách không phải tự dựng URL QR. */
  static serialize(order) {
    return { ...order.toJSON(), qrCodeUrl: OnlineOrderService.qrCodeFor(order) };
  }

  /**
   * Luôn lọc theo customerId ngay trong câu truy vấn: đơn hàng có kèm số điện
   * thoại người nhận, đoán đúng một mã đơn không được phép là đọc được thông
   * tin của người khác.
   */
  static async getOrderForCustomer(id, customerId) {
    const order = await SalesOrder.findOne({
      where: { id, customerId, channel: 'online' },
      include: orderIncludes
    });
    if (!order) {
      const error = new Error('Không tìm thấy đơn hàng');
      error.statusCode = 404;
      throw error;
    }
    return OnlineOrderService.serialize(order);
  }

  /**
   * Trả hàng về kệ + void hoá đơn/giao dịch đang chờ (nếu có), trên MỘT đơn đã
   * khoá (`lock: UPDATE`) sẵn trong transaction đang chạy. Dùng chung cho huỷ
   * tay (cancelOrder) và tự huỷ vì quá hạn (expireStalePendingOrders) — hai
   * nơi khác nhau về ai gọi và log gì, nhưng phần "trả lại trạng thái ban đầu"
   * thì giống hệt nhau.
   */
  static async _releaseOrder(order, transaction, context = {}) {
    for (const line of order.lines) {
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
    }

    // Chỉ đơn chọn chuyển khoản mới có hoá đơn ở giai đoạn này (tạo ngay lúc
    // đặt, xem placeOrder) — đơn tiền mặt chưa có gì để void.
    const invoice = await Invoice.findOne({ where: { salesOrderId: order.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (invoice) {
      await invoice.update({ status: 'void' }, { transaction });
      await Payment.update({ status: 'cancelled' }, { where: { invoiceId: invoice.id }, transaction });
    }

    await order.update({ status: 'cancelled', paymentDeadlineAt: null }, { transaction });
  }

  static async cancelOrder(id, context = {}) {
    const customerId = context.actor?.customer?.id;
    const transaction = await sequelize.transaction();
    try {
      const order = await SalesOrder.findOne({
        where: { id, customerId, channel: 'online' },
        include: [{ model: SalesOrderLine, as: 'lines' }],
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!order) {
        const error = new Error('Không tìm thấy đơn hàng');
        error.statusCode = 404;
        throw error;
      }
      if (order.status !== 'open') {
        const error = new Error(
          order.status === 'paid'
            ? 'Đơn đã thanh toán, không huỷ được. Vui lòng liên hệ quầy.'
            : 'Đơn này đã huỷ trước đó.'
        );
        error.statusCode = 400;
        throw error;
      }

      await OnlineOrderService._releaseOrder(order, transaction, context);
      await AuditService.record({
        actor: context.actor,
        branchId: order.branchId,
        action: 'sales_order.cancelled_by_customer',
        targetType: 'sales_order',
        targetId: order.id,
        oldValues: { status: 'open' },
        newValues: { status: 'cancelled' },
        requestId: context.requestId,
        transaction
      });

      await transaction.commit();
      return OnlineOrderService.getOrderForCustomer(order.id, customerId);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * Quét nền: huỷ các đơn chọn chuyển khoản đã quá 30 phút chưa thanh toán,
   * trả hàng về kệ. Mỗi đơn xử lý trong transaction riêng — một đơn lỗi không
   * kéo những đơn khác theo. Gọi định kỳ từ server.js (`setInterval`), không
   * phải từ một request nào của khách.
   */
  static async expireStalePendingOrders(now = new Date()) {
    const candidates = await SalesOrder.findAll({
      where: { channel: 'online', status: 'open', paymentDeadlineAt: { [Op.lt]: now } },
      attributes: ['id']
    });

    let expired = 0;
    for (const { id } of candidates) {
      const transaction = await sequelize.transaction();
      try {
        const order = await SalesOrder.findOne({
          where: { id },
          include: [{ model: SalesOrderLine, as: 'lines' }],
          transaction,
          lock: transaction.LOCK.UPDATE
        });
        // Khoá xong mới kiểm tra lại: đơn có thể vừa được thanh toán (webhook)
        // hoặc khách vừa tự huỷ ngay giữa lúc liệt kê và lúc khoá được dòng.
        if (!order || order.status !== 'open' || !OnlineOrderService.isPaymentExpired(order, now)) {
          await transaction.commit();
          continue;
        }

        await OnlineOrderService._releaseOrder(order, transaction);
        await AuditService.record({
          branchId: order.branchId,
          action: 'sales_order.expired_unpaid',
          targetType: 'sales_order',
          targetId: order.id,
          oldValues: { status: 'open' },
          newValues: { status: 'cancelled' },
          transaction
        });

        await transaction.commit();
        expired += 1;
      } catch (error) {
        await transaction.rollback();
        console.error(`[OnlineOrderService] Lỗi khi tự huỷ đơn #${id} quá hạn thanh toán:`, error.message);
      }
    }
    return { expired, checked: candidates.length };
  }
}

module.exports = OnlineOrderService;
