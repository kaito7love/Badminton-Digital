const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const {
  createCustomerRules,
  updateCustomerRules
} = require('../validations/customerValidation');

router.use(authMiddleware);

router.get('/', roleMiddleware(['admin', 'employee']), customerController.getCustomers);
router.get('/:id/history', customerController.getCustomerHistory);
router.get('/:id', customerController.getCustomerById);

router.post('/', roleMiddleware(['admin', 'employee']), createCustomerRules, customerController.createCustomer);
router.put('/:id', roleMiddleware(['admin', 'employee']), updateCustomerRules, customerController.updateCustomer);
router.delete('/:id', roleMiddleware(['admin']), customerController.deleteCustomer);

module.exports = router;
