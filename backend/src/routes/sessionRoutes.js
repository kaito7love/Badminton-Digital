const express = require('express');
const router = express.Router();
const accessoryController = require('../controllers/accessoryController');
const sessionController = require('../controllers/sessionController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const branchContextMiddleware = require('../middleware/branchContextMiddleware');
const { addSessionExtraRules, returnSessionExtraRules } = require('../validations/accessoryValidation');

router.use(authMiddleware, branchContextMiddleware);

// ─── Session History & Detail ─────────────────────────────────────
// QUAN TRỌNG: đặt /history TRƯỚC /:sessionId để tránh Express hiểu 'history' là param
router.get('/history', roleMiddleware(['admin', 'branch_manager', 'employee']), sessionController.getSessionHistory);
router.get('/:sessionId', roleMiddleware(['admin', 'branch_manager', 'employee']), sessionController.getSessionById);

// ─── Session Extras (phụ kiện trong phiên chơi) ──────────────────
router.post('/:sessionId/extras', roleMiddleware(['admin', 'branch_manager', 'employee']), addSessionExtraRules, accessoryController.addSessionExtra);
router.get('/:sessionId/extras', roleMiddleware(['admin', 'branch_manager', 'employee']), accessoryController.getSessionExtras);
router.post('/:sessionId/extras/return', roleMiddleware(['admin', 'branch_manager', 'employee']), returnSessionExtraRules, accessoryController.returnSessionExtra);

module.exports = router;

