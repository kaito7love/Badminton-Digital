const { Op } = require('sequelize');
const { Voucher, SalesOrder, sequelize } = require('../models');
const { getPagination, getPagingData } = require('../utils/pagination');
const { startOfLocalDay, endOfLocalDay, DEFAULT_TIMEZONE } = require('../utils/dateTime');
const AuditService = require('./AuditService');

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Mã giảm giá dùng chung cho cả hai luồng bán hàng (POS tại quầy và đơn khách
 * tự đặt online) — cả hai chỉ cần gọi `validateAndCompute` trong transaction
 * đang mở của mình rồi tự lưu `voucherId/voucherCode/voucherDiscountAmount`
 * vào đơn, không có state hay bảng "lượt đã dùng" nào tách riêng ở đây.
 *
 * Số lượt đã dùng đếm trực tiếp bằng COUNT trên `sales_orders.voucher_id`:
 * đơn `paid`, cộng đơn chuyển khoản đang chờ trả tiền (xem `countUsage`) —
 * cùng nguyên tắc "huỷ/bỏ dở thì trả lại" đã dùng cho tồn kho
 * (InventoryService.postMovement type sale/sale_return). Nhờ vậy huỷ, hết hạn
 * hoặc bỏ dở một đơn cũng tự động nhả lại đúng 1 lượt dùng mã, không cần dọn
 * dẹp gì thêm.
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
    // Làm tròn về đồng nguyên: VND không có đơn vị nhỏ hơn 1đ, mà 10% của
    // 333.333đ ra 33.333,3 — để nguyên thì số lẻ đó chui vào
    // sales_orders.voucher_discount_amount DECIMAL(12,2) rồi lệch khi đối soát.
    return Math.round(Math.min(capped, amount));
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

  /**
   * `excludeOrderId` để bỏ chính đơn đang xét ra khỏi phép đếm — cần khi
   * kiểm tra lại mã lúc checkout một đơn ĐÃ mang voucher_id: nếu không loại
   * ra thì đơn tự đếm chính mình là một lượt đã dùng và mã usageLimit=1 sẽ
   * báo "hết lượt" ngay trên đơn hợp lệ của nó.
   *
   * Đếm đơn `paid` và đơn chuyển khoản đang chờ trả tiền (`open` có
   * `paymentDeadlineAt`):
   * - Không đếm mọi đơn `open`: trước đây đếm "khác cancelled", nên một đơn
   *   quầy áp mã rồi bỏ dở, không thanh toán cũng chẳng huỷ, giữ một lượt dùng
   *   mã vĩnh viễn dù chưa hề "dùng" thật.
   * - Nhưng phải đếm đơn chờ chuyển khoản: đơn đó đã chốt số tiền giảm lúc đặt
   *   và webhook sẽ biến nó thành `paid` mà không kiểm lại mã. Chỉ đếm `paid`
   *   thì một khách đặt liền 5 đơn chuyển khoản, lần nào cũng đếm ra 0, trả cả
   *   5 là dùng mã `perCustomerLimit = 1` năm lần.
   * Đơn chờ bị huỷ hoặc hết hạn thì thành `cancelled` (với `paymentDeadlineAt`
   * về null), tự thôi được đếm.
   */
  static async countUsage(voucherId, customerId, transaction, excludeOrderId = null) {
    const notSelf = excludeOrderId ? { id: { [Op.ne]: excludeOrderId } } : {};
    const holdsUsage = {
      [Op.or]: [
        { status: 'paid' },
        { status: 'open', paymentDeadlineAt: { [Op.ne]: null } }
      ]
    };
    const total = await SalesOrder.count({
      where: { voucherId, ...holdsUsage, ...notSelf },
      transaction
    });
    const byCustomer = customerId
      ? await SalesOrder.count({
        where: { voucherId, customerId, ...holdsUsage, ...notSelf },
        transaction
      })
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
  static async validateAndCompute({ code, customerId = null, orderAmount, transaction, excludeOrderId = null }) {
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
      const { total, byCustomer } = await VoucherService.countUsage(voucher.id, customerId, transaction, excludeOrderId);
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

  /**
   * Các bất biến phải đúng ở CẢ create lẫn update — trước đây chỉ create kiểm
   * `percent > 100`, nên sửa một mã 10% thành 150% qua PUT là lọt, và mã đó
   * giảm trọn vẹn giá trị đơn (đơn về 0đ).
   */
  /**
   * `<input type="date">` gửi lên chuỗi ngày trơn "YYYY-MM-DD". Theo chuẩn
   * ECMAScript, chuỗi CHỈ CÓ NGÀY được hiểu là nửa đêm UTC — ở giờ Việt Nam
   * đó là 07:00 SÁNG, nên mã "áp dụng đến hết hôm nay" chết ngay từ 7 giờ
   * sáng chứ không phải cuối ngày. Diễn giải lại theo giờ chi nhánh mặc định:
   * ngày bắt đầu -> 00:00:00 giờ chi nhánh, ngày kết thúc -> 23:59:59.999 giờ
   * chi nhánh ("đến hết ngày" phải hiểu vậy, không phải nửa đêm đầu ngày đó).
   * Chuỗi đã có giờ (ISO đầy đủ) giữ nguyên — mọi client gọi API trực tiếp
   * cũng được diễn giải nhất quán, không chỉ web.
   */
  static normalizeDateBoundary(value, boundary) {
    if (typeof value !== 'string' || !DATE_ONLY_RE.test(value)) return value;
    const anchor = new Date(`${value}T12:00:00Z`);
    const fn = boundary === 'end' ? endOfLocalDay : startOfLocalDay;
    return fn(anchor, DEFAULT_TIMEZONE).toISOString();
  }

  static assertConsistent({ discountType, discountValue, startsAt, endsAt }) {
    if (discountType === 'percent' && Number(discountValue) > 100) {
      const error = new Error('Giảm theo % không thể vượt quá 100');
      error.statusCode = 400;
      throw error;
    }
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      const error = new Error('Ngày kết thúc phải sau ngày bắt đầu');
      error.statusCode = 400;
      throw error;
    }
  }

  static async create(data, context = {}) {
    const code = VoucherService.normalizeCode(data.code);
    const existing = await Voucher.findOne({ where: { code } });
    if (existing) {
      const error = new Error('Mã giảm giá này đã tồn tại');
      error.statusCode = 400;
      throw error;
    }
    const startsAt = VoucherService.normalizeDateBoundary(data.startsAt, 'start');
    const endsAt = VoucherService.normalizeDateBoundary(data.endsAt, 'end');
    VoucherService.assertConsistent({ ...data, startsAt, endsAt });

    const voucher = await Voucher.create({
      code,
      description: data.description || null,
      discountType: data.discountType,
      discountValue: data.discountValue,
      maxDiscountAmount: data.discountType === 'percent' ? (data.maxDiscountAmount ?? null) : null,
      minOrderAmount: data.minOrderAmount || 0,
      startsAt: startsAt || null,
      endsAt: endsAt || null,
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

    if (data.startsAt !== undefined) {
      data = { ...data, startsAt: VoucherService.normalizeDateBoundary(data.startsAt, 'start') };
    }
    if (data.endsAt !== undefined) {
      data = { ...data, endsAt: VoucherService.normalizeDateBoundary(data.endsAt, 'end') };
    }

    // Kiểm bất biến trên GIÁ TRỊ SAU KHI GHÉP, không phải chỉ trên phần client
    // gửi lên: sửa mỗi discountValue=150 mà không gửi discountType thì vẫn
    // phải soi discountType đang lưu trong DB mới biết đó là percent.
    const merged = {
      discountType: data.discountType ?? voucher.discountType,
      discountValue: data.discountValue ?? voucher.discountValue,
      startsAt: data.startsAt !== undefined ? data.startsAt : voucher.startsAt,
      endsAt: data.endsAt !== undefined ? data.endsAt : voucher.endsAt
    };
    VoucherService.assertConsistent(merged);

    // Giữ đúng bất biến "flat thì không có mức trần" như create: đổi percent
    // sang flat mà để lại max_discount_amount cũ là dữ liệu rác, admin nhìn
    // bảng sẽ tưởng mã flat vẫn đang bị chặn trần.
    if (merged.discountType === 'flat') {
      data = { ...data, maxDiscountAmount: null };
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
