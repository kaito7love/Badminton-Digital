const express = require('express');
const router = express.Router();
const supplierController = require('../controllers/supplierController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const branchContextMiddleware = require('../middleware/branchContextMiddleware');
const { createSupplierRules, updateSupplierRules } = require('../validations/supplierValidation');

router.use(authMiddleware, branchContextMiddleware);

router.get('/', roleMiddleware(['admin', 'branch_manager', 'employee']), supplierController.getSuppliers);
router.get('/:id', roleMiddleware(['admin', 'branch_manager', 'employee']), supplierController.getSupplierById);

router.post('/', roleMiddleware(['admin']), createSupplierRules, supplierController.createSupplier);
router.put('/:id', roleMiddleware(['admin']), updateSupplierRules, supplierController.updateSupplier);
router.delete('/:id', roleMiddleware(['admin']), supplierController.deleteSupplier);

module.exports = router;
