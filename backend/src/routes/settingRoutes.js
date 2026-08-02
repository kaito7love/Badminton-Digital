const express = require('express');
const router = express.Router();
const settingController = require('../controllers/settingController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const { updateSettingRules } = require('../validations/settingValidation');

router.use(authMiddleware, roleMiddleware(['admin']));

router.get('/', settingController.getSettings);
router.put('/', updateSettingRules, settingController.updateSetting);
router.put('/pricing', settingController.updatePricing);
router.put('/operating-hours', settingController.updateOperatingHours);
router.put('/branding', settingController.updateBranding);

module.exports = router;
