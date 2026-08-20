const { Op } = require('sequelize');
const { Voucher, SalesOrder, sequelize } = require('../models');
const { getPagination, getPagingData } = require('../utils/pagination');
const AuditService = require('./AuditService');

/**
 * Mã giảm giá dùng chung cho cả hai luồng bán hàng (POS tại quầy và đơn khách
 * tự đặt online) — cả hai chỉ cần gọi `validateAndCompute` trong transaction
 * đang mở của mình rồi tự lưu `voucherId/voucherCode/voucherDiscountAmount`
 * vào đơn, không có state hay bảng "lượt đã dùng" nào tách riêng ở đây.
 *
 * Số lượt đã dùng đếm trực tiếp bằng COUNT trên `sales_orders.voucher_id`,
 * bỏ qua đơn `cancelled` — cùng nguyên tắc "huỷ thì trả lại" đã dùng cho tồn
 * kho (InventoryService.postMovement type sale/sale_return). Nhờ vậy huỷ một
 * đơn cũng tự động nhả lại đúng 1 lượt dùng mã, không cần dọn dẹp gì thêm.
 */
class VoucherService {
  static normalizeCode(code) {
    return String(code || '').trim().toUpperCase();
  }

  /**
   * Số tiền được giảm cho MỘT đơn có tổng `orderAmount`, theo đúng voucher đã
   * xác thực. Không bao giờ vượt quá orderAmount (đơn 50k với voucher giảm cứng
   * 100k thì giảm tối đa 50k, không thể để đơn xuống âm).
   */
  static computeDiscount(voucher, orderAmount) {
    const amount = Number(orderAmount);
    if (voucher.discountType === 'flat') {
      return Math.min(Number(voucher.discountValue), amount);
    }
    const raw = amount * (Number(voucher.discountValue) / 100);
    const capped = voucher.maxDiscountAmount != null ? Math.min(raw, Number(voucher.maxDiscountAmount)) : raw;
    return Math.min(capped, amount);
  }

  /** Còn hiệu lực ở thời điểm `now` không — không tính chuyện lượt dùng hay đơn tối thiểu. */
  static assertWithinWindow(voucher, now = new Date()) {
    if (!voucher.isActive) {
      const error = new Error('Mã giảm giá này đã ngừng áp dụng');
      error.statusCode = 400;
      throw error;
    }
    if (voucher.startsAt && now < new Date(voucher.startsAt)) {
      const error = new Error('Mã giảm giá chưa tới ngày áp dụng');
      error.statusCode = 400;
      throw error;
    }
    if (voucher.endsAt && now > new Date(voucher.endsAt)) {
      const error = new Error('Mã giảm giá đã hết hạn');
      error.statusCode = 400;
      throw error;
    }
  }

  static async countUsage(voucherId, customerId, transaction) {
    const total = await SalesOrder.count({
      where: { voucherId, status: { [Op.ne]: 'cancelled' } },
      transaction
    });
    const byCustomer = customerId
      ? await SalesOrder.count({ where: { voucherId, customerId, status: { [Op.ne]: 'cancelled' } }, transaction })
      : 0;
    return { total, byCustomer };
  }

  /**
   * Xác thực mã + tính số tiền giảm — dùng ngay trong transaction đang tạo/áp
   * đơn. BẮT BUỘC truyền `transaction`: khoá dòng voucher (FOR UPDATE) để hai
   * đơn cùng giành lượt cuối cùng không thể cùng lọt qua kiểm tra usageLimit
   * (đọc thêm ghi chú ở nơi gọi — OnlineOrderService/SalesOrderService cũng
   * khoá dòng `sales_orders` tương ứng trước khi gọi hàm này).
   */
  static async validateAndCompute({ code, customerId = null, orderAmount, transaction }) {
    if (!transaction) {
      throw new Error('VoucherService.validateAndCompute requires an active transaction');
    }
    const normalized = VoucherService.normalizeCode(code);
    if (!normalized) {
      const error = new Error('Vui lòng nhập mã giảm giá');
      error.statusCode = 400;
      throw error;
    }

    const voucher = await Voucher.findOne({
      where: { code: normalized },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!voucher) {
      const error = new Error('Mã giảm giá không tồn tại');
      error.statusCode = 404;
      throw error;
    }

    VoucherService.assertWithinWindow(voucher);

    const amount = Number(orderAmount);
    if (amount < Number(voucher.minOrderAmount)) {
      const error = new Error(
        `Đơn hàng cần tối thiểu ${Number(voucher.minOrderAmount).toLocaleString('vi-VN')}đ mới dùng được mã này`
      );
      error.statusCode = 400;
      throw error;
    }

    if (voucher.usageLimit != null || voucher.perCustomerLimit != null) {
      const { total, byCustomer } = await VoucherService.countUsage(voucher.id, customerId, transaction);
      if (voucher.usageLimit != null && total >= voucher.usageLimit) {
        const error = new Error('Mã giảm giá đã hết lượt sử dụng');
        error.statusCode = 400;
        throw error;
      }
      if (voucher.perCustomerLimit != null && customerId && byCustomer >= voucher.perCustomerLimit) {
        const error = new Error('Bạn đã dùng hết lượt cho mã giảm giá này');
        error.statusCode = 400;
        throw error;
      }
    }

    const discountAmount = VoucherService.computeDiscount(voucher, amount);
    return { voucher, discountAmount };
  }

  /**
   * Kiểm tra không khoá — dùng cho khách xem trước số tiền giảm ở checkout
   * trước khi thật sự đặt đơn. Không đáng tin cho việc trừ tiền cuối cùng
   * (lượt dùng có thể hết ngay sau khi xem trước), chỉ để hiển thị UI.
   */
  static async preview({ code, customerId = null, orderAmount }) {
    const transaction = await sequelize.transaction();
    try {
      const result = await VoucherService.validateAndCompute({ code, customerId, orderAmount, transaction });
      await transaction.rollback();
      return { discountAmount: result.discountAmount, description: result.voucher.description };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  // ─── Quản trị (admin/branch_manager) ────────────────────────────────────

  static async list(query = {}) {
    const { page, limit, offset } = getPagination(query);
    const where = {};
    if (query.isActive !== undefined) where.isActive = query.isActive === 'true' || query.isActive === true;
    if (query.search) where.code = { [Op.like]: `%${VoucherService.normalizeCode(query.search)}%` };

    const data = await Voucher.findAndCountAll({ where, limit, offset, order: [['id', 'DESC']] });
    return getPagingData(data, page, limit);
  }

  static async getById(id) {
    const voucher = await Voucher.findByPk(id);
    if (!voucher) {
      const error = new Error('Voucher not found');
      error.statusCode = 404;
      throw error;
    }
    return voucher;
  }

  static async create(data, context = {}) {
    const code = VoucherService.normalizeCode(data.code);
    const existing = await Voucher.findOne({ where: { code } });
    if (existing) {
      const error = new Error('Mã giảm giá này đã tồn tại');
      error.statusCode = 400;
      throw error;
    }
    if (data.discountType === 'percent' && Number(data.discountValue) > 100) {
      const error = new Error('Giảm theo % không thể vượt quá 100');
      error.statusCode = 400;
      throw error;
    }

    const voucher = await Voucher.create({
      code,
      description: data.description || null,
      discountType: data.discountType,
      discountValue: data.discountValue,
      maxDiscountAmount: data.discountType === 'percent' ? (data.maxDiscountAmount ?? null) : null,
      minOrderAmount: data.minOrderAmount || 0,
      startsAt: data.startsAt || null,
      endsAt: data.endsAt || null,
      usageLimit: data.usageLimit ?? null,
      perCustomerLimit: data.perCustomerLimit ?? null,
      isActive: data.isActive !== false
    });
    await AuditService.record({
      actor: context.actor,
      branchId: context.branchId,
      action: 'voucher.created',
      targetType: 'voucher',
      targetId: voucher.id,
      newValues: voucher.toJSON(),
      requestId: context.requestId
    });
    return voucher;
  }

  static async update(id, data, context = {}) {
    const voucher = await VoucherService.getById(id);
    const oldValues = voucher.toJSON();

    // Đổi mã lúc này là đổi cả định danh mã khách đang truyền miệng nhau —
    // cho phép, nhưng vẫn phải kiểm trùng với mã khác.
    if (data.code !== undefined) {
      const nextCode = VoucherService.normalizeCode(data.code);
      const clashing = await Voucher.findOne({ where: { code: nextCode, id: { [Op.ne]: voucher.id } } });
      if (clashing) {
        const error = new Error('Mã giảm giá này đã tồn tại');
        error.statusCode = 400;
        throw error;
      }
      data = { ...data, code: nextCode };
    }

    const updated = await voucher.update({
      ...(data.code !== undefined && { code: data.code }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.discountType !== undefined && { discountType: data.discountType }),
      ...(data.discountValue !== undefined && { discountValue: data.discountValue }),
      ...(data.maxDiscountAmount !== undefined && { maxDiscountAmount: data.maxDiscountAmount }),
      ...(data.minOrderAmount !== undefined && { minOrderAmount: data.minOrderAmount }),
      ...(data.startsAt !== undefined && { startsAt: data.startsAt }),
      ...(data.endsAt !== undefined && { endsAt: data.endsAt }),
      ...(data.usageLimit !== undefined && { usageLimit: data.usageLimit }),
      ...(data.perCustomerLimit !== undefined && { perCustomerLimit: data.perCustomerLimit }),
      ...(data.isActive !== undefined && { isActive: data.isActive })
    });
    await AuditService.record({
      actor: context.actor,
      branchId: context.branchId,
      action: 'voucher.updated',
      targetType: 'voucher',
      targetId: voucher.id,
      oldValues,
      newValues: updated.toJSON(),
      requestId: context.requestId
    });
    return updated;
  }

  /**
   * Không có DELETE thật: `sales_orders.voucher_id` tham chiếu RESTRICT tới
   * đây, một mã đã từng dùng thì xoá cứng sẽ gãy lịch sử đơn hàng cũ. Ngừng
   * áp dụng bằng `isActive=false` — mã cũ vẫn tra được, chỉ không dùng tiếp.
   */
  static async deactivate(id, context = {}) {
    return VoucherService.update(id, { isActive: false }, context);
  }
}

module.exports = VoucherService;
