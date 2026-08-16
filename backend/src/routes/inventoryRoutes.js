const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const branchContextMiddleware = require('../middleware/branchContextMiddleware');
const { createAdjustmentRules } = require('../validations/inventoryValidation');

router.use(authMiddleware, branchContextMiddleware, roleMiddleware(['admin', 'branch_manager', 'employee']));

router.get('/stock-levels', inventoryController.getStockLevels);
router.get('/product-stock-levels', inventoryController.getProductStockLevels);
router.get('/movements', inventoryController.getMovements);
router.post('/adjustments', createAdjustmentRules, inventoryController.createAdjustment);

module.exports = router;
