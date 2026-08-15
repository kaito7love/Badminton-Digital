const { Invoice, InvoiceLine, Payment, CourtSession, SessionExtra, Extra, Customer, Court, Employee, sequelize } = require('../models');
const { calculateCourtFee, calculateInvoiceTotals } = require('../utils/priceCalculator');
const { generateVietQRUrl } = require('../utils/vietqr');
const { nextInvoiceNumber } = require('../utils/documentNumber');
const AuditService = require('./AuditService');
const SettingService = require('./SettingService');

class PaymentService {
  static async checkout({ sessionId, paymentMethod = 'cash', discountAmount = 0, isDiscountPercent = false, employeeId, branchId, actor, requestId, idempotencyKey }) {
    if (!branchId || !employeeId) {
      const error = new Error('Không xác định được nhân viên hoặc chi nhánh thanh toán');
      error.statusCode = 403;
      throw error;
    }
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
        const endTime = new Date();
        const { peakStartHour, peakEndHour } = await SettingService.getPeakHours();
        const feeCalc = calculateCourtFee(
          session.startTime,
          endTime,
          session.court.peakPricePerHour,
          session.court.offpeakPricePerHour,
          peakStartHour,
          peakEndHour
        );
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

      // Calculate Invoice Totals
      const totals = calculateInvoiceTotals(
        courtFee,
        session.sessionExtras,
        discountAmount,
        isDiscountPercent
      );

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
          description: 'Giảm giá',
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
          let loyaltyTier = 'normal';
          if (newTotalSpent >= 15000000) {
            loyaltyTier = 'vip';
          } else if (newTotalSpent >= 5000000) {
            loyaltyTier = 'gold';
          }

          await customer.update({
            totalSpent: newTotalSpent,
            loyaltyTier
          }, { transaction });
        }
      }

      if (isImmediatelyConfirmed) await invoice.update({ status: 'paid' }, { transaction });
      await AuditService.record({ actor, branchId, action: isImmediatelyConfirmed ? 'payment.completed' : 'payment.pending', targetType: 'payment', targetId: payment.id, newValues: payment.toJSON(), requestId, transaction });

      await transaction.commit();

      // Generate VietQR Url if transfer method
      let qrCodeUrl = null;
      if (paymentMethod === 'transfer') {
        qrCodeUrl = generateVietQRUrl({
          amount: totals.totalAmount,
          addInfo: `HOA DON BD${invoice.id}`
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
      await transaction.rollback();
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

  static async processWebhook({ provider, providerReference, status, invoiceNo, payload, requestId }) {
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
      if (payment.status === 'paid') {
        await transaction.commit();
        return payment;
      }
      if (!['pending', 'processing'].includes(payment.status)) {
        const error = new Error('Giao dịch không thể chuyển sang trạng thái paid');
        error.statusCode = 409;
        throw error;
      }
      const oldValues = payment.toJSON();
      await payment.update({ status: 'paid', provider, providerReference, paidAt: new Date(), confirmedAt: new Date(), webhookPayload: payload }, { transaction });
      await invoice.update({ status: 'paid' }, { transaction });
      const session = await CourtSession.findByPk(invoice.sessionId, { transaction, lock: transaction.LOCK.UPDATE });
      if (session?.customerId) {
        const customer = await Customer.findByPk(session.customerId, { transaction, lock: transaction.LOCK.UPDATE });
        if (customer) {
          const totalSpent = Number(customer.totalSpent) + Number(invoice.totalAmount);
          await customer.update({ totalSpent, loyaltyTier: totalSpent >= 15000000 ? 'vip' : totalSpent >= 5000000 ? 'gold' : 'normal' }, { transaction });
        }
      }
      await AuditService.record({ branchId: invoice.branchId, action: 'payment.webhook_confirmed', targetType: 'payment', targetId: payment.id, oldValues, newValues: payment.toJSON(), requestId, transaction });
      await transaction.commit();
      return payment;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}

module.exports = PaymentService;
