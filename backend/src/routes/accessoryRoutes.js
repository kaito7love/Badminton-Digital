const express = require('express');
const router = express.Router();
const accessoryController = require('../controllers/accessoryController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const branchContextMiddleware = require('../middleware/branchContextMiddleware');
const {
  createAccessoryRules,
  updateAccessoryRules,
  addSessionExtraRules
} = require('../validations/accessoryValidation');

router.use(authMiddleware, branchContextMiddleware);

// Accessories CRUD — bản đọc kèm giá vốn bình quân và tồn kho theo chi nhánh,
// nên chỉ nhân viên đọc được.
router.get('/', roleMiddleware(['admin', 'branch_manager', 'employee']), accessoryController.getAccessories);
router.get('/:id', roleMiddleware(['admin', 'branch_manager', 'employee']), accessoryController.getAccessoryById);

router.post('/', roleMiddleware(['admin']), createAccessoryRules, accessoryController.createAccessory);
router.put('/:id', roleMiddleware(['admin']), updateAccessoryRules, accessoryController.updateAccessory);
router.delete('/:id', roleMiddleware(['admin']), accessoryController.deleteAccessory);

module.exports = router;
