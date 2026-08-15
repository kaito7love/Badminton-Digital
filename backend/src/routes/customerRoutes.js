const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const branchContextMiddleware = require('../middleware/branchContextMiddleware');
const {
  createCustomerRules,
  updateCustomerRules
} = require('../validations/customerValidation');

router.use(authMiddleware, branchContextMiddleware);

router.get('/', roleMiddleware(['admin', 'branch_manager', 'employee']), customerController.getCustomers);
router.get('/:id/history', customerController.getCustomerHistory);
router.get('/:id', customerController.getCustomerById);

router.post('/', roleMiddleware(['admin', 'branch_manager', 'employee']), createCustomerRules, customerController.createCustomer);
router.put('/:id', roleMiddleware(['admin', 'branch_manager', 'employee']), updateCustomerRules, customerController.updateCustomer);
router.delete('/:id', roleMiddleware(['admin']), customerController.deleteCustomer);

module.exports = router;
