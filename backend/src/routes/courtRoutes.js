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
  updateCourtStatusRules,
  updateCourtLayoutRules
} = require('../validations/courtValidation');

router.use(authMiddleware, branchContextMiddleware);

// Sân kèm phiên đang chơi (họ tên, SĐT khách) là dữ liệu vận hành — chỉ nhân
// viên đọc. Trang khách xem sân qua /public/courts.
router.get('/', roleMiddleware(['admin', 'branch_manager', 'employee']), courtController.getCourts);
// Đặt trước '/:id' — nếu để sau, Express sẽ khớp '/layout' vào :id.
router.put('/layout', roleMiddleware(['admin', 'branch_manager']), updateCourtLayoutRules, courtController.updateCourtLayout);
router.get('/:id', roleMiddleware(['admin', 'branch_manager', 'employee']), courtController.getCourtById);

router.post('/', roleMiddleware(['admin', 'branch_manager']), createCourtRules, courtController.createCourt);
router.put('/:id', roleMiddleware(['admin', 'branch_manager']), updateCourtRules, courtController.updateCourt);
router.delete('/:id', roleMiddleware(['admin', 'branch_manager']), courtController.deleteCourt);

router.post('/:id/open', roleMiddleware(['admin', 'branch_manager', 'employee']), openCourtRules, courtController.openCourt);
router.post('/:id/close', roleMiddleware(['admin', 'branch_manager', 'employee']), courtController.closeCourt);
router.post('/:id/transfer', roleMiddleware(['admin', 'branch_manager', 'employee']), transferCourtRules, courtController.transferCourt);
router.put('/:id/status', roleMiddleware(['admin', 'branch_manager', 'employee']), updateCourtStatusRules, courtController.updateCourtStatus);

module.exports = router;
