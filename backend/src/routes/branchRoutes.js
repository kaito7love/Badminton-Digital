const express = require('express');
const router = express.Router();
const branchController = require('../controllers/branchController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

// Danh sách chi nhánh cho bộ chuyển chi nhánh — không branch-scoped nên
// không cần branchContextMiddleware.
router.get('/', authMiddleware, roleMiddleware(['admin']), branchController.getBranches);

module.exports = router;
