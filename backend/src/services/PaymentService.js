const { Invoice, Payment, CourtSession, SessionExtra, Extra, Customer, Court, Employee, sequelize } = require('../models');
const { calculateCourtFee, calculateInvoiceTotals } = require('../utils/priceCalculator');
const { generateVietQRUrl } = require('../utils/vietqr');

class PaymentService {
  static async checkout({ sessionId, paymentMethod = 'cash', discountAmount = 0, isDiscountPercent = false, employeeId = 1 }) {
    const transaction = await sequelize.transaction();

    try {
      const session = await CourtSession.findByPk(sessionId, {
        include: [
          { model: Court, as: 'court' },
          { model: SessionExtra, as: 'sessionExtras', include: [{ model: Extra, as: 'extra' }] }
        ],
        transaction
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
        const feeCalc = calculateCourtFee(
          session.startTime,
          endTime,
          session.court.peakPricePerHour,
          session.court.offpeakPricePerHour
        );
        courtFee = feeCalc.courtFee;

        await session.update({
          endTime,
          durationSeconds: feeCalc.durationSeconds,
          courtFee,
          status: 'closed'
        }, { transaction });

        await session.court.update({ status: 'empty' }, { transaction });
      }

      // Calculate Invoice Totals
      const totals = calculateInvoiceTotals(
        courtFee,
        session.sessionExtras,
        discountAmount,
        isDiscountPercent
      );

      // Check if invoice already exists for this session
      let invoice = await Invoice.findOne({ where: { sessionId }, transaction });
      if (!invoice) {
        invoice = await Invoice.create({
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
      }

      // Create Payment
      let payment = await Payment.findOne({ where: { invoiceId: invoice.id }, transaction });
      if (!payment) {
        payment = await Payment.create({
          invoiceId: invoice.id,
          method: paymentMethod,
          status: 'paid',
          paidAt: new Date(),
          employeeId
        }, { transaction });
      } else {
        await payment.update({
          method: paymentMethod,
          status: 'paid',
          paidAt: new Date(),
          employeeId
        }, { transaction });
      }

      // Update Customer total spent & loyalty tier if customer is linked
      if (session.customerId) {
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
        qrCodeUrl
      };
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  }

  static async getInvoiceById(id) {
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

    return invoice;
  }
}

module.exports = PaymentService;
