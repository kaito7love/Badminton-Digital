const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const branchContextMiddleware = require('../middleware/branchContextMiddleware');
const { checkoutRules, webhookRules } = require('../validations/paymentValidation');

router.post('/webhook', webhookRules, paymentController.processWebhook);

router.use(authMiddleware, branchContextMiddleware);

router.post('/checkout', roleMiddleware(['admin', 'branch_manager', 'employee']), checkoutRules, paymentController.checkout);

module.exports = router;
