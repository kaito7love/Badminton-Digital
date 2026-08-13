const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employeeController');
const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');
const branchContextMiddleware = require('../middleware/branchContextMiddleware');
const {
  createEmployeeRules,
  updateEmployeeRules
} = require('../validations/employeeValidation');

router.use(authMiddleware, branchContextMiddleware, roleMiddleware(['admin']));

router.get('/', employeeController.getEmployees);
router.get('/:id/activity-logs', employeeController.getActivityLogs);
router.get('/:id', employeeController.getEmployeeById);

router.post('/', createEmployeeRules, employeeController.createEmployee);
router.put('/:id', updateEmployeeRules, employeeController.updateEmployee);
router.delete('/:id', employeeController.deleteEmployee);

module.exports = router;
