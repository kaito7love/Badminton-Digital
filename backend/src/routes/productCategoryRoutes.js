const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const branchContextMiddleware = require('../middleware/branchContextMiddleware');
const { createCategoryRules, updateCategoryRules } = require('../validations/productValidation');

router.use(authMiddleware, branchContextMiddleware);

router.get('/', roleMiddleware(['admin', 'branch_manager', 'employee']), productController.getCategories);
router.post('/', roleMiddleware(['admin', 'branch_manager']), createCategoryRules, productController.createCategory);
router.put('/:id', roleMiddleware(['admin', 'branch_manager']), updateCategoryRules, productController.updateCategory);
router.delete('/:id', roleMiddleware(['admin', 'branch_manager']), productController.deleteCategory);

module.exports = router;
