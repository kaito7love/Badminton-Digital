const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const branchContextMiddleware = require('../middleware/branchContextMiddleware');
const { voidInvoiceRules } = require('../validations/paymentValidation');

router.use(authMiddleware, branchContextMiddleware);

router.get('/:id', paymentController.getInvoiceById);
router.get('/:id/export-pdf', roleMiddleware(['admin', 'branch_manager', 'employee']), paymentController.exportPdf);
router.post('/:id/void', roleMiddleware(['admin', 'branch_manager']), voidInvoiceRules, paymentController.voidInvoice);

module.exports = router;
