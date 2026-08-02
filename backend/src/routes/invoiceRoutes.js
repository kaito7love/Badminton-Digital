const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

router.use(authMiddleware);

router.get('/:id', paymentController.getInvoiceById);
router.get('/:id/export-pdf', roleMiddleware(['admin', 'employee']), paymentController.exportPdf);

module.exports = router;
