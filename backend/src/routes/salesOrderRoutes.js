const express = require('express');
const router = express.Router();
const salesOrderController = require('../controllers/salesOrderController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const branchContextMiddleware = require('../middleware/branchContextMiddleware');
const {
  createOrderRules,
  addLineRules,
  removeLineRules,
  checkoutRules
} = require('../validations/salesOrderValidation');

router.use(authMiddleware, branchContextMiddleware, roleMiddleware(['admin', 'branch_manager', 'employee']));

router.get('/', salesOrderController.getOrders);
router.post('/', createOrderRules, salesOrderController.createOrder);
router.get('/:id', salesOrderController.getOrderById);
router.post('/:id/lines', addLineRules, salesOrderController.addLine);
router.delete('/:id/lines/:lineId', removeLineRules, salesOrderController.removeLine);
router.post('/:id/checkout', checkoutRules, salesOrderController.checkout);

module.exports = router;
