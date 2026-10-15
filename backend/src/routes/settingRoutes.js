const express = require('express');
const router = express.Router();
const settingController = require('../controllers/settingController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const branchContextMiddleware = require('../middleware/branchContextMiddleware');
const { updateSettingRules, settingBodyRules } = require('../validations/settingValidation');

router.use(authMiddleware, branchContextMiddleware, roleMiddleware(['admin']));

router.get('/', settingController.getSettings);
router.put('/', updateSettingRules, settingController.updateSetting);
router.put('/pricing', settingBodyRules, settingController.updatePricing);
router.put('/operating-hours', settingBodyRules, settingController.updateOperatingHours);
router.put('/branding', settingBodyRules, settingController.updateBranding);

module.exports = router;
