const express = require('express');
const router = express.Router();
const accessoryController = require('../controllers/accessoryController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const { addSessionExtraRules } = require('../validations/accessoryValidation');

router.use(authMiddleware);

router.post('/:sessionId/extras', roleMiddleware(['admin', 'employee']), addSessionExtraRules, accessoryController.addSessionExtra);
router.get('/:sessionId/extras', roleMiddleware(['admin', 'employee']), accessoryController.getSessionExtras);

module.exports = router;
