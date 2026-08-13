const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const branchContextMiddleware = require('../middleware/branchContextMiddleware');

router.use(authMiddleware, branchContextMiddleware);

router.get('/:id', paymentController.getInvoiceById);
router.get('/:id/export-pdf', roleMiddleware(['admin', 'employee']), paymentController.exportPdf);

module.exports = router;
