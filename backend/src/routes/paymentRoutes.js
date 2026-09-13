const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const branchContextMiddleware = require('../middleware/branchContextMiddleware');
const paymentWebhookAuth = require('../middleware/paymentWebhookAuth');
const { checkoutRules, webhookRules } = require('../validations/paymentValidation');

// Công khai (dịch vụ báo có gọi vào), nên secret được kiểm trước cả validation.
router.post('/webhook', paymentWebhookAuth, webhookRules, paymentController.processWebhook);

router.use(authMiddleware, branchContextMiddleware);

router.post('/checkout', roleMiddleware(['admin', 'branch_manager', 'employee']), checkoutRules, paymentController.checkout);

module.exports = router;
