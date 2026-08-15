const CustomerService = require("../services/CustomerService");
const { successResponse } = require("../utils/responseHandler");

const getCustomers = async (req, res, next) => {
  try {
    const result = await CustomerService.getAllCustomers(req.query, { actor: req.user });
    return successResponse(res, result.rows, "Customers retrieved successfully", 200, result.meta);
  } catch (err) {
    next(err);
  }
};

const getCustomerById = async (req, res, next) => {
  try {
    const customer = await CustomerService.getCustomerById(req.params.id, { actor: req.user });
    return successResponse(res, customer, "Customer details retrieved");
  } catch (err) {
    next(err);
  }
};

const createCustomer = async (req, res, next) => {
  try {
    const newCustomer = await CustomerService.createCustomer(req.body, { actor: req.user });
    return successResponse(res, newCustomer, "Customer created successfully", 201);
  } catch (err) {
    next(err);
  }
};

const updateCustomer = async (req, res, next) => {
  try {
    const updated = await CustomerService.updateCustomer(req.params.id, req.body, { actor: req.user });
    return successResponse(res, updated, "Customer updated successfully");
  } catch (err) {
    next(err);
  }
};

const deleteCustomer = async (req, res, next) => {
  try {
    await CustomerService.deleteCustomer(req.params.id, { actor: req.user });
    return successResponse(res, null, "Customer deleted successfully");
  } catch (err) {
    next(err);
  }
};

const getCustomerHistory = async (req, res, next) => {
  try {
    const history = await CustomerService.getCustomerHistory(req.params.id, { actor: req.user });
    return successResponse(res, history, "Customer play history retrieved");
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomerHistory,
};
