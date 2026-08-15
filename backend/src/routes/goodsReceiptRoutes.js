const express = require('express');
const router = express.Router();
const goodsReceiptController = require('../controllers/goodsReceiptController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const branchContextMiddleware = require('../middleware/branchContextMiddleware');
const { createGoodsReceiptRules, getGoodsReceiptRules } = require('../validations/goodsReceiptValidation');

router.use(authMiddleware, branchContextMiddleware, roleMiddleware(['admin', 'branch_manager', 'employee']));

router.get('/', goodsReceiptController.getGoodsReceipts);
router.get('/:id', getGoodsReceiptRules, goodsReceiptController.getGoodsReceiptById);
router.post('/', createGoodsReceiptRules, goodsReceiptController.createGoodsReceipt);

module.exports = router;
