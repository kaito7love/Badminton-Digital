const EmployeeService = require('../services/EmployeeService');
const { successResponse } = require('../utils/responseHandler');

const getEmployees = async (req, res, next) => {
  try {
    const result = await EmployeeService.getAllEmployees(req.query, req.branchId);
    return successResponse(res, result.rows, 'Employees retrieved successfully', 200, result.meta);
  } catch (err) {
    next(err);
  }
};

const getEmployeeById = async (req, res, next) => {
  try {
    const employee = await EmployeeService.getEmployeeById(req.params.id, req.branchId);
    return successResponse(res, employee, 'Employee details retrieved');
  } catch (err) {
    next(err);
  }
};

const createEmployee = async (req, res, next) => {
  try {
    const newEmployee = await EmployeeService.createEmployee(req.body, { branchId: req.branchId, actor: req.user, requestId: req.requestId });
    return successResponse(res, newEmployee, 'Employee created successfully', 201);
  } catch (err) {
    next(err);
  }
};

const updateEmployee = async (req, res, next) => {
  try {
    const updated = await EmployeeService.updateEmployee(req.params.id, req.body, { branchId: req.branchId, actor: req.user, requestId: req.requestId });
    return successResponse(res, updated, 'Employee updated successfully');
  } catch (err) {
    next(err);
  }
};

const deleteEmployee = async (req, res, next) => {
  try {
    await EmployeeService.deleteEmployee(req.params.id, { branchId: req.branchId, actor: req.user, requestId: req.requestId });
    return successResponse(res, null, 'Employee deleted successfully');
  } catch (err) {
    next(err);
  }
};

const getActivityLogs = async (req, res, next) => {
  try {
    const logs = await EmployeeService.getActivityLogs(req.params.id, req.branchId);
    return successResponse(res, logs, 'Activity logs retrieved');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getActivityLogs
};
