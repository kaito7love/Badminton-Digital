const PaymentService = require('../services/PaymentService');
const { successResponse } = require('../utils/responseHandler');
const { buildInvoicePdf } = require('../utils/reportExporter');

const checkout = async (req, res, next) => {
  try {
    const result = await PaymentService.checkout({
      sessionId: req.body.sessionId,
      paymentMethod: req.body.paymentMethod || 'cash',
      discountAmount: Number(req.body.discountAmount) || 0,
      // Đã qua `.toBoolean(true)` ở paymentValidation — so đúng `true`, không dùng truthy.
      isDiscountPercent: req.body.isDiscountPercent === true,
      discountReason: req.body.discountReason || null,
      endTime: req.body.endTime || null,
      employeeId: req.user?.employee?.id,
      branchId: req.branchId,
      actor: req.user,
      requestId: req.requestId,
      idempotencyKey: req.get('Idempotency-Key') || req.body.idempotencyKey
    });

    return successResponse(res, result, 'Checkout completed successfully', 201);
  } catch (err) {
    next(err);
  }
};

const getInvoiceById = async (req, res, next) => {
  try {
    const invoice = await PaymentService.getInvoiceById(req.params.id, { actor: req.user, branchId: req.branchId });
    return successResponse(res, invoice, 'Invoice details retrieved');
  } catch (err) {
    next(err);
  }
};

const voidInvoice = async (req, res, next) => {
  try {
    const result = await PaymentService.voidInvoice(req.params.id, {
      reason: req.body.reason,
      actor: req.user,
      branchId: req.branchId,
      requestId: req.requestId
    });
    return successResponse(res, result, 'Invoice voided successfully');
  } catch (err) {
    next(err);
  }
};

const exportPdf = async (req, res, next) => {
  try {
    const invoice = await PaymentService.getInvoiceById(req.params.id, { actor: req.user, branchId: req.branchId });
    const buffer = await buildInvoicePdf(invoice);
    const fileName = `hoa-don-${invoice.invoiceNo || invoice.id}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', buffer.length);
    return res.send(buffer);
  } catch (err) {
    next(err);
  }
};

// Secret đã được kiểm ở middleware/paymentWebhookAuth trước khi tới đây.
const processWebhook = async (req, res, next) => {
  try {
    const payment = await PaymentService.processWebhook({
      provider: req.body.provider,
      providerReference: req.body.providerReference,
      status: req.body.status,
      invoiceNo: req.body.invoiceNo,
      amount: req.body.amount,
      payload: req.body,
      requestId: req.requestId
    });
    return successResponse(res, payment, 'Payment webhook processed');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  checkout,
  processWebhook,
  getInvoiceById,
  exportPdf,
  voidInvoice
};
