const express = require('express');
const router = express.Router();
const accessoryController = require('../controllers/accessoryController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const {
  createAccessoryRules,
  updateAccessoryRules,
  addSessionExtraRules
} = require('../validations/accessoryValidation');

router.use(authMiddleware);

// Accessories CRUD
router.get('/', accessoryController.getAccessories);
router.get('/:id', accessoryController.getAccessoryById);

router.post('/', roleMiddleware(['admin']), createAccessoryRules, accessoryController.createAccessory);
router.put('/:id', roleMiddleware(['admin']), updateAccessoryRules, accessoryController.updateAccessory);
router.delete('/:id', roleMiddleware(['admin']), accessoryController.deleteAccessory);

module.exports = router;
