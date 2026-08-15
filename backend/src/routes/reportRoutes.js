const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const branchContextMiddleware = require('../middleware/branchContextMiddleware');

router.use(authMiddleware, branchContextMiddleware, roleMiddleware(['admin', 'branch_manager']));

router.get('/dashboard', reportController.getDashboard);
router.get('/revenue', reportController.getRevenue);
router.get('/top-courts', reportController.getTopCourts);
router.get('/top-accessories', reportController.getTopAccessories);
router.get('/export-excel', reportController.exportExcel);
router.get('/export-pdf', reportController.exportPdf);

module.exports = router;
