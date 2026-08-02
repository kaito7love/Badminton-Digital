const PaymentService = require('../services/PaymentService');
const { successResponse } = require('../utils/responseHandler');

const checkout = async (req, res, next) => {
  try {
    const employeeId = req.user?.employee?.id || 1;
    const result = await PaymentService.checkout({
      sessionId: req.body.sessionId,
      paymentMethod: req.body.paymentMethod || 'cash',
      discountAmount: req.body.discountAmount || 0,
      isDiscountPercent: req.body.isDiscountPercent || false,
      employeeId
    });

    return successResponse(res, result, 'Checkout completed successfully', 201);
  } catch (err) {
    next(err);
  }
};

const getInvoiceById = async (req, res, next) => {
  try {
    const invoice = await PaymentService.getInvoiceById(req.params.id);
    return successResponse(res, invoice, 'Invoice details retrieved');
  } catch (err) {
    next(err);
  }
};

const exportPdf = async (req, res, next) => {
  try {
    const invoice = await PaymentService.getInvoiceById(req.params.id);
    // For export PDF API, returning printable JSON payload or HTML content
    return successResponse(res, {
      invoice,
      exportFormat: 'PDF/Printable',
      printedAt: new Date()
    }, 'Invoice PDF ready for printing');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  checkout,
  getInvoiceById,
  exportPdf
};
