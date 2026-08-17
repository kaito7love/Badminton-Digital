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
const InventoryService = require('./InventoryService');
const AuditService = require('./AuditService');
const { getPagination, getPagingData } = require('../utils/pagination');
const { normalizePhone } = require('../utils/phone');

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
  { model: Branch, as: 'branch', attributes: ['id', 'name', 'address'] },
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

  static async placeOrder({ branchId, items, contactName, contactPhone, customerNote }, context = {}) {
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

      const order = await SalesOrder.create({
        branchId: branch.id,
        channel: 'online',
        status: 'open',
        customerId,
        cashierEmployeeId: null,
        contactName: (contactName || context.actor?.fullName || '').trim() || null,
        contactPhone: normalizePhone(contactPhone) || context.actor?.phone || null,
        customerNote: customerNote ? String(customerNote).trim().slice(0, 500) : null
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
    return getPagingData(data, page, limit);
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
    return order;
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

      // Hàng đã giữ chỗ lúc đặt phải trả lại kệ, nếu không đơn bị huỷ vẫn giam
      // hàng và người sau không mua được.
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

      await order.update({ status: 'cancelled' }, { transaction });
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
}

module.exports = OnlineOrderService;
