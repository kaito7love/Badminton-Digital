const express = require('express');
const router = express.Router();
const activityLogController = require('../controllers/activityLogController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const branchContextMiddleware = require('../middleware/branchContextMiddleware');

router.use(authMiddleware, branchContextMiddleware, roleMiddleware(['admin', 'branch_manager']));

router.get('/', activityLogController.list);

module.exports = router;
