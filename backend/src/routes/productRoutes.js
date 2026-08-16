const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const branchContextMiddleware = require('../middleware/branchContextMiddleware');
const {
  createProductRules,
  updateProductRules,
  addVariantRules,
  updateVariantRules
} = require('../validations/productValidation');

router.use(authMiddleware, branchContextMiddleware);

// Catalog dùng chung toàn chuỗi — mọi role đã đăng nhập đều đọc được (cần
// cho POS/kho), chỉ admin/branch_manager mới sửa được danh mục.
router.get('/', productController.getProducts);
router.get('/:id', productController.getProductById);
router.post('/', roleMiddleware(['admin', 'branch_manager']), createProductRules, productController.createProduct);
router.put('/:id', roleMiddleware(['admin', 'branch_manager']), updateProductRules, productController.updateProduct);
router.post('/:id/variants', roleMiddleware(['admin', 'branch_manager']), addVariantRules, productController.addVariant);
router.put('/variants/:variantId', roleMiddleware(['admin', 'branch_manager']), updateVariantRules, productController.updateVariant);

module.exports = router;
