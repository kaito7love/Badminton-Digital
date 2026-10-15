const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const branchContextMiddleware = require('../middleware/branchContextMiddleware');
const { reportRangeRules } = require('../validations/reportValidation');

router.use(authMiddleware, branchContextMiddleware, roleMiddleware(['admin', 'branch_manager']));

router.get('/dashboard', reportController.getDashboard);
router.get('/revenue', reportRangeRules, reportController.getRevenue);
router.get('/top-courts', reportController.getTopCourts);
router.get('/top-accessories', reportController.getTopAccessories);
router.get('/revenue-breakdown', reportRangeRules, reportController.getRevenueBreakdown);
router.get('/inventory-reconciliation', reportController.getInventoryReconciliation);
router.get('/export-excel', reportRangeRules, reportController.exportExcel);
router.get('/export-pdf', reportRangeRules, reportController.exportPdf);

module.exports = router;
