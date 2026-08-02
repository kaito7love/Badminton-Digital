const express = require('express');
const router = express.Router();
const courtController = require('../controllers/courtController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const {
  createCourtRules,
  updateCourtRules,
  openCourtRules,
  transferCourtRules
} = require('../validations/courtValidation');

router.use(authMiddleware);

router.get('/', courtController.getCourts);
router.get('/:id', courtController.getCourtById);

router.post('/', roleMiddleware(['admin']), createCourtRules, courtController.createCourt);
router.put('/:id', roleMiddleware(['admin']), updateCourtRules, courtController.updateCourt);
router.delete('/:id', roleMiddleware(['admin']), courtController.deleteCourt);

router.post('/:id/open', roleMiddleware(['admin', 'employee']), openCourtRules, courtController.openCourt);
router.post('/:id/close', roleMiddleware(['admin', 'employee']), courtController.closeCourt);
router.post('/:id/transfer', roleMiddleware(['admin', 'employee']), transferCourtRules, courtController.transferCourt);
router.put('/:id/maintenance', roleMiddleware(['admin', 'employee']), courtController.toggleMaintenance);

module.exports = router;
