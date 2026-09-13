const { Op } = require('sequelize');
const { Invoice, InvoiceLine, Payment, CourtSession, SessionExtra, Extra, Customer, Court, Employee, SalesOrder, SalesOrderLine, sequelize } = require('../models');
const { calculateSessionCourtFee, calculateInvoiceTotals } = require('../utils/priceCalculator');
const { generateVietQRUrl } = require('../utils/vietqr');
const { assertTransferEnabled } = require('../utils/paymentConfig');
const { resolveManualDiscount, assertManualDiscountAllowed } = require('../utils/discountPolicy');
const { nextInvoiceNumber } = require('../utils/documentNumber');
const { computeLoyaltyTier } = require('../utils/loyalty');
const AuditService = require('./AuditService');
const SettingService = require('./SettingService');
const InventoryService = require('./InventoryService');
const CourtService = require('./CourtService');
const realtimeBus = require('../utils/realtimeBus');

// Modal thanh toán gửi lại `endTime` của số tiền đã xem trước. Cũ hơn 10 phút là
// thu ngân để modal mở quá lâu — lùi giờ kết thúc xa hơn là thu thiếu tiền giờ.
const CHECKOUT_PREVIEW_MAX_AGE_MS = 10 * 60 * 1000;
// Mốc do chính server phát ra ở bước xem trước, chỉ chừa vài giây lệch đồng hồ
// khi chạy nhiều instance.
const CLOCK_SKEW_MS = 5 * 1000;

const httpError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

class PaymentService {
  /**
   * Giờ kết thúc phiên lúc checkout. Không truyền thì là "bây giờ" như trước.
   *
   * Modal "Thanh Toán & Đóng sân" gửi lại đúng `endTime` của số tiền đã xem trước
   * (`GET /sessions/:id` → `checkoutPreview`), nên số trên modal và số trên hoá đơn
   * là một, không lệch vì vài phút thu ngân đứng đếm tiền. Chỉ nhận mốc không
   * trước giờ mở sân (hay lần chuyển sân gần nhất), không ở tương lai và không cũ
   * quá 10 phút.
   */
  static resolveCheckoutEndTime(session, requestedEndTime, now = new Date()) {
    if (!requestedEndTime) return now;
    const endTime = new Date(requestedEndTime);
    if (Number.isNaN(endTime.getTime())) throw httpError('Giờ kết thúc không hợp lệ', 400);
    if (endTime < new Date(session.startTime)) throw httpError('Giờ kết thúc không được trước giờ mở sân', 400);
    if (session.billedFrom && endTime < new Date(session.billedFrom)) {
      throw httpError('Phiên vừa được chuyển sân sau lúc xem trước — vui lòng tính lại', 400);
    }
    if (endTime.getTime() > now.getTime() + CLOCK_SKEW_MS) throw httpError('Giờ kết thúc không được ở tương lai', 400);
    if (now.getTime() - endTime.getTime() > CHECKOUT_PREVIEW_MAX_AGE_MS) {
      throw httpError('Số tiền xem trước đã quá 10 phút — vui lòng tính lại trước khi thanh toán', 400);
    }
    return endTime;
  }

  static async checkout({ sessionId, paymentMethod = 'cash', discountAmount = 0, isDiscountPercent = false, discountReason = null, endTime: requestedEndTime = null, employeeId, branchId, actor, requestId, idempotencyKey }) {
    if (!branchId || !employeeId) {
      const error = new Error('Không xác định được nhân viên hoặc chi nhánh thanh toán');
      error.statusCode = 403;
      throw error;
    }
    if (paymentMethod === 'transfer') assertTransferEnabled();
    // Đọc trần giảm giá TRƯỚC khi mở transaction: không kéo dài thời gian giữ
    // khoá dòng phiên chơi chỉ để đọc một setting.
    const discountPolicy = Number(discountAmount) > 0 ? await SettingService.getDiscountPolicy() : null;
    const resolvedIdempotencyKey = idempotencyKey || `session-${sessionId}`;
    const transaction = await sequelize.transaction();

    try {
      const existingPayment = await Payment.findOne({
        where: { idempotencyKey: resolvedIdempotencyKey },
        include: [{ model: Invoice, as: 'invoice', attributes: ['id', 'sessionId'] }],
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (existingPayment) {
        if (existingPayment.invoice?.sessionId !== Number(sessionId)) {
          const error = new Error('Idempotency key đã được dùng cho một phiên chơi khác');
          error.statusCode = 409;
          throw error;
        }
        await transaction.commit();
        return PaymentService.getCheckoutResult(existingPayment.invoiceId);
      }

      const session = await CourtSession.findOne({
        where: { id: sessionId, branchId },
        include: [
          { model: Court, as: 'court' },
          { model: SessionExtra, as: 'sessionExtras', include: [{ model: Extra, as: 'extra' }] }
        ],
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      if (!session) {
        const error = new Error('Court session not found');
        error.statusCode = 404;
        throw error;
      }

      // If session is still playing, auto-close it
      let courtFee = Number(session.courtFee) || 0;
      if (session.status === 'playing') {
        const endTime = PaymentService.resolveCheckoutEndTime(session, requestedEndTime);
        // Giờ cao điểm + múi giờ chi nhánh đọc riêng, không gộp vào include của
        // câu khoá dòng phía trên (xem CourtService.loadPricingContext).
        const pricing = await CourtService.loadPricingContext(branchId, transaction);
        // Cộng cả tiền các đoạn đã chơi ở sân trước nếu phiên từng chuyển sân.
        const feeCalc = calculateSessionCourtFee(session, session.court, endTime, pricing);
        courtFee = feeCalc.courtFee;

        // Đóng phiên là đủ để sân trở lại trạng thái trống — courts.status chỉ nói
        // về vòng đời khai thác, không phản ánh việc có ai đang chơi hay không.
        await session.update({
          endTime,
          durationSeconds: feeCalc.durationSeconds,
          courtFee,
          status: 'closed'
        }, { transaction });
      }

      // Giảm giá tay: quy ra đồng trên tổng trước giảm, kiểm lý do + trần theo vai trò.
      const totalBeforeDiscount = calculateInvoiceTotals(courtFee, session.sessionExtras).totalBeforeDiscount;
      const manualDiscount = resolveManualDiscount({ baseAmount: totalBeforeDiscount, discountAmount, isDiscountPercent });
      const discount = assertManualDiscountAllowed({
        actor,
        baseAmount: totalBeforeDiscount,
        discountAmount: manualDiscount,
        reason: discountReason,
        policy: discountPolicy
      });

      // Calculate Invoice Totals
      const totals = calculateInvoiceTotals(courtFee, session.sessionExtras, manualDiscount);

      // Check if invoice already exists for this session
      let invoice = await Invoice.findOne({ where: { sessionId, branchId }, transaction, lock: transaction.LOCK.UPDATE });
      if (!invoice) {
        invoice = await Invoice.create({
          branchId,
          invoiceNo: await nextInvoiceNumber(branchId, transaction),
          status: 'issued',
          sessionId,
          courtFee: totals.courtFee,
          extrasFee: totals.extrasFee,
          discountAmount: totals.discountAmount,
          totalAmount: totals.totalAmount
        }, { transaction });
      } else {
        await invoice.update({
          courtFee: totals.courtFee,
          extrasFee: totals.extrasFee,
          discountAmount: totals.discountAmount,
          totalAmount: totals.totalAmount
        }, { transaction });
        // Re-checkout (idempotency retry/resume) — xoá dòng cũ trước khi dựng
        // lại từ đầu, tránh nhân đôi/lệch dữ liệu với tổng vừa cập nhật ở trên.
        await InvoiceLine.destroy({ where: { invoiceId: invoice.id }, transaction });
      }

      // Dòng chi tiết hoá đơn — nguồn dữ liệu itemized cho báo cáo sau này,
      // độc lập với các cột tổng hợp ở trên (giữ nguyên để không phá dashboard/
      // export hiện tại). Tổng amount các dòng luôn bằng totals.totalAmount.
      const invoiceLines = [
        {
          invoiceId: invoice.id,
          lineKind: 'court_time',
          description: 'Tiền sân',
          quantity: 1,
          unitPrice: totals.courtFee,
          amount: totals.courtFee,
          referenceType: 'court_session',
          referenceId: session.id
        },
        ...session.sessionExtras.map((se) => ({
          invoiceId: invoice.id,
          lineKind: 'product',
          description: se.extra?.name || `Phụ kiện #${se.extraId}`,
          quantity: se.quantity,
          unitPrice: se.unitPrice,
          amount: se.subtotal,
          referenceType: 'session_extra',
          referenceId: se.id
        }))
      ];
      if (totals.discountAmount > 0) {
        invoiceLines.push({
          invoiceId: invoice.id,
          lineKind: 'discount',
          description: `Giảm giá: ${discount.reason}`.slice(0, 255),
          quantity: 1,
          unitPrice: -totals.discountAmount,
          amount: -totals.discountAmount
        });
      }
      await InvoiceLine.bulkCreate(invoiceLines, { transaction });

      // Create Payment
      let payment = await Payment.findOne({ where: { invoiceId: invoice.id }, transaction, lock: transaction.LOCK.UPDATE });
      const isImmediatelyConfirmed = paymentMethod === 'cash';
      if (!payment) {
        payment = await Payment.create({
          branchId,
          invoiceId: invoice.id,
          method: paymentMethod,
          amount: totals.totalAmount,
          idempotencyKey: resolvedIdempotencyKey,
          status: isImmediatelyConfirmed ? 'paid' : 'pending',
          paidAt: isImmediatelyConfirmed ? new Date() : null,
          confirmedAt: isImmediatelyConfirmed ? new Date() : null,
          employeeId
        }, { transaction });
      } else {
        const error = new Error('Phiên chơi này đã có yêu cầu thanh toán');
        error.statusCode = 409;
        throw error;
      }

      if (isImmediatelyConfirmed && session.customerId) {
        const customer = await Customer.findByPk(session.customerId, { transaction });
        if (customer) {
          const newTotalSpent = Number(customer.totalSpent) + totals.totalAmount;
          await customer.update({
            totalSpent: newTotalSpent,
            loyaltyTier: computeLoyaltyTier(newTotalSpent)
          }, { transaction });
        }
      }

      if (isImmediatelyConfirmed) await invoice.update({ status: 'paid' }, { transaction });
      await AuditService.record({ actor, branchId, action: isImmediatelyConfirmed ? 'payment.completed' : 'payment.pending', targetType: 'payment', targetId: payment.id, newValues: payment.toJSON(), requestId, transaction });
      if (totals.discountAmount > 0) {
        await AuditService.record({
          actor,
          branchId,
          action: 'payment.discount_applied',
          targetType: 'invoice',
          targetId: invoice.id,
          newValues: {
            invoiceNo: invoice.invoiceNo,
            sessionId: session.id,
            role: actor?.role?.name || null,
            totalBeforeDiscount: totals.totalBeforeDiscount,
            discountAmount: totals.discountAmount,
            percent: discount.percent,
            reason: discount.reason,
            input: { discountAmount, isDiscountPercent }
          },
          requestId,
          transaction
        });
      }

      await transaction.commit();
      // Checkout thường đi kèm tự động đóng sân (session đang 'playing' —
      // xem đoạn "auto-close" phía trên), nên đây CŨNG là một điểm đổi
      // trạng thái sân thật sự — trang Sân của thiết bị khác chỉ gọi
      // paymentService.checkout lúc bấm "Đóng Sân & Tính Tiền", không gọi
      // CourtService.closeCourt (route đó tồn tại nhưng không frontend nào
      // dùng tới), nên phải bắn sự kiện ở đây, không phải chỉ ở closeCourt.
      realtimeBus.emit('court:updated', { branchId, courtId: session.courtId });

      // Generate VietQR Url if transfer method
      let qrCodeUrl = null;
      if (paymentMethod === 'transfer') {
        // Nội dung chuyển khoản PHẢI là invoiceNo: webhook ngân hàng tra hoá
        // đơn bằng `Invoice.findOne({ where: { invoiceNo } })`. Dùng id nội bộ
        // ở đây thì khoản tiền về không khớp được với hoá đơn nào.
        qrCodeUrl = generateVietQRUrl({
          amount: totals.totalAmount,
          addInfo: `HOA DON ${invoice.invoiceNo}`
        });
      }

      return {
        invoiceId: invoice.id,
        sessionId: session.id,
        courtName: session.court.name,
        totalBeforeDiscount: totals.totalBeforeDiscount,
        courtFee: totals.courtFee,
        extrasFee: totals.extrasFee,
        discountAmount: totals.discountAmount,
        totalAmount: totals.totalAmount,
        paymentMethod,
        paymentStatus: payment.status,
        invoiceNo: invoice.invoiceNo,
        qrCodeUrl
      };
    } catch (err) {
      // Chỉ rollback khi transaction chưa tự kết thúc — cùng khuôn đã áp ở
      // SalesOrderService (26ad904), tránh lỗi rollback-trên-transaction-đã-
      // chết che mất lỗi gốc.
      if (!transaction.finished) {
        await transaction.rollback().catch(() => {});
      }
      throw err;
    }
  }

  static async getCheckoutResult(invoiceId) {
    const invoice = await PaymentService.getInvoiceById(invoiceId);
    const payment = invoice.payment;
    return {
      invoiceId: invoice.id,
      invoiceNo: invoice.invoiceNo,
      sessionId: invoice.sessionId,
      courtName: invoice.session?.court?.name,
      totalBeforeDiscount: Number(invoice.courtFee) + Number(invoice.extrasFee),
      courtFee: Number(invoice.courtFee),
      extrasFee: Number(invoice.extrasFee),
      discountAmount: Number(invoice.discountAmount),
      totalAmount: Number(invoice.totalAmount),
      paymentMethod: payment.method,
      paymentStatus: payment.status,
      qrCodeUrl: payment.method === 'transfer' && payment.status !== 'paid' ? generateVietQRUrl({ amount: invoice.totalAmount, addInfo: `HOA DON ${invoice.invoiceNo}` }) : null
    };
  }

  static async getInvoiceById(id, context = {}) {
    const invoice = await Invoice.findByPk(id, {
      include: [
        {
          model: CourtSession,
          as: 'session',
          include: [
            { model: Court, as: 'court' },
            { model: Customer, as: 'customer' },
            { model: SessionExtra, as: 'sessionExtras', include: [{ model: Extra, as: 'extra' }] }
          ]
        },
        { model: Payment, as: 'payment' }
      ]
    });

    if (!invoice) {
      const error = new Error('Invoice not found');
      error.statusCode = 404;
      throw error;
    }

    if (context.branchId && invoice.branchId !== context.branchId) {
      const error = new Error('Invoice không thuộc chi nhánh hiện tại');
      error.statusCode = 403;
      throw error;
    }
    if (context.actor?.role?.name === 'customer' && invoice.session?.customerId !== context.actor.customer?.id) {
      const error = new Error('Bạn không có quyền truy cập hóa đơn này');
      error.statusCode = 403;
      throw error;
    }

    return invoice;
  }

  /**
   * Huỷ toàn bộ 1 hoá đơn đã thanh toán (nhân viên bấm nhầm lúc checkout,
   * khách yêu cầu hoàn tiền...). Chỉ huỷ toàn bộ — không hoàn từng dòng.
   * Không đụng gì tới hoá đơn `draft`/`issued` (chưa có gì để hoàn) hay đã
   * `void` từ trước (409, tránh trừ totalSpent/trả kho hai lần).
   */
  static async voidInvoice(invoiceId, { reason, actor, branchId, requestId }) {
    if (!reason || !reason.trim()) {
      const error = new Error('Lý do huỷ hoá đơn là bắt buộc');
      error.statusCode = 400;
      throw error;
    }
    const transaction = await sequelize.transaction();
    try {
      const invoice = await Invoice.findOne({
        where: { id: invoiceId, ...(branchId ? { branchId } : {}) },
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      if (!invoice) {
        const error = new Error('Invoice not found');
        error.statusCode = 404;
        throw error;
      }
      if (invoice.status === 'void') {
        const error = new Error('Hoá đơn này đã được huỷ trước đó');
        error.statusCode = 409;
        throw error;
      }
      if (invoice.status !== 'paid') {
        const error = new Error(`Chỉ huỷ được hoá đơn đã thanh toán (trạng thái hiện tại: '${invoice.status}')`);
        error.statusCode = 400;
        throw error;
      }

      const payment = await Payment.findOne({ where: { invoiceId: invoice.id }, transaction, lock: transaction.LOCK.UPDATE });
      if (!payment || payment.status !== 'paid') {
        const error = new Error('Không tìm thấy giao dịch đã thanh toán ứng với hoá đơn này');
        error.statusCode = 400;
        throw error;
      }

      // Xác định khách hàng gắn với hoá đơn — cùng nhánh if/else đã dùng ở
      // processWebhook: hoá đơn phiên sân hoặc hoá đơn đơn bán lẻ loại trừ
      // lẫn nhau (sessionId/salesOrderId không bao giờ cùng có giá trị).
      let customerId = null;
      if (invoice.salesOrderId) {
        const order = await SalesOrder.findByPk(invoice.salesOrderId, { transaction, lock: transaction.LOCK.UPDATE });
        customerId = order?.customerId || null;

        // Trả kho — chỉ áp dụng cho hoá đơn bán lẻ. Phụ kiện gọi trong phiên
        // chơi (hoá đơn sessionId) đã bị tiêu thụ lúc chơi, không phải hàng
        // hoá có thể nhập lại kệ, nên không đụng tới ở nhánh else.
        const productLines = await InvoiceLine.findAll({
          where: { invoiceId: invoice.id, lineKind: 'product', referenceType: 'sales_order_line' },
          transaction
        });
        for (const line of productLines) {
          const soLine = await SalesOrderLine.findByPk(line.referenceId, { transaction });
          if (soLine) {
            await InventoryService.postMovement({
              branchId: invoice.branchId,
              productVariantId: soLine.variantId,
              type: 'sale_return',
              quantity: line.quantity,
              referenceType: 'invoice_line',
              referenceId: line.id,
              actor,
              transaction
            });
          }
        }
      } else if (invoice.sessionId) {
        const session = await CourtSession.findByPk(invoice.sessionId, { transaction, lock: transaction.LOCK.UPDATE });
        customerId = session?.customerId || null;
      }

      const oldValues = { invoiceStatus: invoice.status, paymentStatus: payment.status };

      await payment.update({ status: 'refunded' }, { transaction });
      await invoice.update({ status: 'void' }, { transaction });

      if (customerId) {
        const customer = await Customer.findByPk(customerId, { transaction, lock: transaction.LOCK.UPDATE });
        if (customer) {
          const newTotalSpent = Math.max(0, Number(customer.totalSpent) - Number(invoice.totalAmount));
          await customer.update({
            totalSpent: newTotalSpent,
            loyaltyTier: computeLoyaltyTier(newTotalSpent)
          }, { transaction });
        }
      }

      await AuditService.record({
        actor,
        branchId: invoice.branchId,
        action: 'invoice.voided',
        targetType: 'invoice',
        targetId: invoice.id,
        oldValues,
        newValues: { invoiceStatus: 'void', paymentStatus: 'refunded', reason },
        requestId,
        transaction
      });

      await transaction.commit();

      return {
        invoiceId: invoice.id,
        invoiceNo: invoice.invoiceNo,
        status: invoice.status,
        paymentStatus: payment.status,
        totalAmount: Number(invoice.totalAmount)
      };
    } catch (err) {
      if (!transaction.finished) {
        await transaction.rollback().catch(() => {});
      }
      throw err;
    }
  }

  /**
   * Dịch vụ báo có gọi vào khi tiền về. Đã qua `paymentWebhookAuth` (secret) và
   * `webhookRules` (bắt buộc `amount`) trước khi tới đây.
   *
   * | Tình huống | Kết quả |
   * |---|---|
   * | Mã giao dịch ngân hàng đã xác nhận cho giao dịch KHÁC | 409 + nhật ký `reference_reused` |
   * | Giao dịch đã `paid`, cùng mã (dịch vụ gửi lại) | 200, không cộng tiền lần hai |
   * | Giao dịch đã `paid`, mã khác (khách chuyển hai lần) | 200, không cộng tiền, nhật ký `already_paid` |
   * | Giao dịch đã `cancelled`/`refunded` (tiền về sau khi đơn huỷ) | 409 + nhật ký `payment_not_pending` |
   * | `amount` khác số tiền của giao dịch | 409 + nhật ký `amount_mismatch`, giữ `pending` |
   *
   * Nhật ký từ chối (`payment.webhook_rejected`) được commit trước khi báo lỗi —
   * nó là dấu vết duy nhất để quầy biết có khoản tiền phải đối soát/hoàn trả.
   */
  static async processWebhook({ provider, providerReference, status, invoiceNo, amount, payload, requestId }) {
    if (status !== 'paid') {
      const error = new Error('Trạng thái webhook không được hỗ trợ');
      error.statusCode = 400;
      throw error;
    }
    const transaction = await sequelize.transaction();
    try {
      const invoice = await Invoice.findOne({ where: { invoiceNo }, transaction, lock: transaction.LOCK.UPDATE });
      if (!invoice) {
        const error = new Error('Không tìm thấy hóa đơn');
        error.statusCode = 404;
        throw error;
      }
      const payment = await Payment.findOne({ where: { invoiceId: invoice.id }, transaction, lock: transaction.LOCK.UPDATE });
      if (!payment) {
        const error = new Error('Không tìm thấy giao dịch thanh toán');
        error.statusCode = 404;
        throw error;
      }

      const recordRejection = (reason, extra = {}) => AuditService.record({
        branchId: invoice.branchId,
        action: 'payment.webhook_rejected',
        targetType: 'payment',
        targetId: payment.id,
        newValues: {
          reason,
          invoiceNo,
          provider,
          providerReference,
          amount,
          expectedAmount: Number(payment.amount),
          paymentStatus: payment.status,
          payload,
          ...extra
        },
        requestId,
        transaction
      });
      const reject = async (reason, statusCode, message, extra) => {
        await recordRejection(reason, extra);
        await transaction.commit();
        throw httpError(message, statusCode);
      };

      const reusedBy = await Payment.findOne({
        where: { provider, providerReference, id: { [Op.ne]: payment.id } },
        attributes: ['id'],
        transaction
      });
      if (reusedBy) {
        await reject('reference_reused', 409, 'Mã giao dịch ngân hàng này đã được dùng để xác nhận một hoá đơn khác', { otherPaymentId: reusedBy.id });
      }

      if (payment.status === 'paid') {
        if (payment.provider !== provider || payment.providerReference !== providerReference) {
          await recordRejection('already_paid');
        }
        await transaction.commit();
        return payment;
      }
      if (!['pending', 'processing'].includes(payment.status)) {
        await reject('payment_not_pending', 409, 'Giao dịch không còn chờ thanh toán (đã huỷ hoặc đã hoàn tiền) — quầy cần đối soát và hoàn tiền thủ công');
      }
      if (Number(amount) !== Number(payment.amount)) {
        await reject('amount_mismatch', 409, 'Số tiền nhận được không khớp số tiền của hoá đơn');
      }

      const oldValues = payment.toJSON();
      await payment.update({ status: 'paid', provider, providerReference, paidAt: new Date(), confirmedAt: new Date(), webhookPayload: payload }, { transaction });
      await invoice.update({ status: 'paid' }, { transaction });

      // Invoice của một buổi chơi hay của một đơn bán lẻ (POS/online) là hai
      // nhánh loại trừ nhau (sessionId với salesOrderId không bao giờ cùng có
      // giá trị) — tách rõ if/else thay vì dựa vào optional chaining lặng lẽ
      // bỏ qua, để nhánh đơn bán lẻ không bị quên như trước đây.
      let customerId = null;
      if (invoice.salesOrderId) {
        const order = await SalesOrder.findByPk(invoice.salesOrderId, { transaction, lock: transaction.LOCK.UPDATE });
        if (order) {
          // Đơn đã bị khách tự huỷ (hết hạn/huỷ tay) trong lúc chờ webhook thì
          // không hồi lại 'paid' nữa — tiền vẫn cần xử lý hoàn trả thủ công,
          // nhưng đó là việc của quầy, không phải nơi webhook tự quyết.
          if (order.status === 'open') {
            await order.update({ status: 'paid', paymentDeadlineAt: null }, { transaction });
            customerId = order.customerId;
          }
        }
      } else if (invoice.sessionId) {
        const session = await CourtSession.findByPk(invoice.sessionId, { transaction, lock: transaction.LOCK.UPDATE });
        customerId = session?.customerId || null;
      }

      if (customerId) {
        const customer = await Customer.findByPk(customerId, { transaction, lock: transaction.LOCK.UPDATE });
        if (customer) {
          const totalSpent = Number(customer.totalSpent) + Number(invoice.totalAmount);
          await customer.update({ totalSpent, loyaltyTier: computeLoyaltyTier(totalSpent) }, { transaction });
        }
      }
      await AuditService.record({ branchId: invoice.branchId, action: 'payment.webhook_confirmed', targetType: 'payment', targetId: payment.id, oldValues, newValues: payment.toJSON(), requestId, transaction });
      await transaction.commit();
      return payment;
    } catch (error) {
      // Nhánh từ chối đã tự commit nhật ký rồi mới ném lỗi — không rollback lại.
      if (!transaction.finished) {
        await transaction.rollback().catch(() => {});
      }
      throw error;
    }
  }
}

module.exports = PaymentService;
