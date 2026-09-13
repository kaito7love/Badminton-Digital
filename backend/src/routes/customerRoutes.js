const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const branchContextMiddleware = require('../middleware/branchContextMiddleware');
const {
  createCustomerRules,
  updateCustomerRules,
  mergeIntoAccountRules
} = require('../validations/customerValidation');

router.use(authMiddleware, branchContextMiddleware);

router.get('/', roleMiddleware(['admin', 'branch_manager', 'employee']), customerController.getCustomers);
router.get('/:id/history', customerController.getCustomerHistory);
router.get('/:id', customerController.getCustomerById);

router.post('/', roleMiddleware(['admin', 'branch_manager', 'employee']), createCustomerRules, customerController.createCustomer);
router.put('/:id', roleMiddleware(['admin', 'branch_manager', 'employee']), updateCustomerRules, customerController.updateCustomer);
// Việc xác minh chủ số diễn ra tại quầy nên mọi nhân viên đều gộp được; mỗi lần gộp có nhật ký.
router.post('/:id/merge-into-account', roleMiddleware(['admin', 'branch_manager', 'employee']), mergeIntoAccountRules, customerController.mergeIntoAccount);
router.delete('/:id', roleMiddleware(['admin']), customerController.deleteCustomer);

module.exports = router;
