const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const branchContextMiddleware = require('../middleware/branchContextMiddleware');

router.use(authMiddleware, branchContextMiddleware, roleMiddleware(['admin']));

router.get('/dashboard', reportController.getDashboard);
router.get('/revenue', reportController.getRevenue);
router.get('/top-courts', reportController.getTopCourts);
router.get('/top-accessories', reportController.getTopAccessories);

module.exports = router;
