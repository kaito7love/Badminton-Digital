const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const { checkoutRules } = require('../validations/paymentValidation');

router.use(authMiddleware);

router.post('/checkout', roleMiddleware(['admin', 'employee']), checkoutRules, paymentController.checkout);

module.exports = router;
