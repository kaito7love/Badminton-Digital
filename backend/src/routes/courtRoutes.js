const express = require('express');
const router = express.Router();
const courtController = require('../controllers/courtController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const branchContextMiddleware = require('../middleware/branchContextMiddleware');
const {
  createCourtRules,
  updateCourtRules,
  openCourtRules,
  transferCourtRules,
  updateCourtStatusRules
} = require('../validations/courtValidation');

router.use(authMiddleware, branchContextMiddleware);

router.get('/', courtController.getCourts);
router.get('/:id', courtController.getCourtById);

router.post('/', roleMiddleware(['admin', 'branch_manager']), createCourtRules, courtController.createCourt);
router.put('/:id', roleMiddleware(['admin', 'branch_manager']), updateCourtRules, courtController.updateCourt);
router.delete('/:id', roleMiddleware(['admin', 'branch_manager']), courtController.deleteCourt);

router.post('/:id/open', roleMiddleware(['admin', 'branch_manager', 'employee']), openCourtRules, courtController.openCourt);
router.post('/:id/close', roleMiddleware(['admin', 'branch_manager', 'employee']), courtController.closeCourt);
router.post('/:id/transfer', roleMiddleware(['admin', 'branch_manager', 'employee']), transferCourtRules, courtController.transferCourt);
router.put('/:id/status', roleMiddleware(['admin', 'branch_manager', 'employee']), updateCourtStatusRules, courtController.updateCourtStatus);

module.exports = router;
