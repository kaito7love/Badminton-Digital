const SalesOrderService = require('../services/SalesOrderService');
const { successResponse } = require('../utils/responseHandler');

const getOrders = async (req, res, next) => {
  try {
    const result = await SalesOrderService.listOrders(req.query, req.branchId);
    return successResponse(res, result.rows, 'Sales orders retrieved successfully', 200, result.meta);
  } catch (err) {
    next(err);
  }
};

const createOrder = async (req, res, next) => {
  try {
    const order = await SalesOrderService.createOrder({
      branchId: req.branchId,
      customerId: req.body.customerId,
      cashierEmployeeId: req.user?.employee?.id
    }, { actor: req.user, requestId: req.requestId });
    return successResponse(res, order, 'Sales order created successfully', 201);
  } catch (err) {
    next(err);
  }
};

const getOrderById = async (req, res, next) => {
  try {
    const order = await SalesOrderService.getOrderById(req.params.id, req.branchId);
    return successResponse(res, order, 'Sales order details retrieved');
  } catch (err) {
    next(err);
  }
};

const addLine = async (req, res, next) => {
  try {
    const order = await SalesOrderService.addLine(req.params.id, {
      variantId: req.body.variantId,
      quantity: req.body.quantity
    }, { actor: req.user, branchId: req.branchId, requestId: req.requestId });
    return successResponse(res, order, 'Product added to sales order', 201);
  } catch (err) {
    next(err);
  }
};

const removeLine = async (req, res, next) => {
  try {
    const order = await SalesOrderService.removeLine(req.params.id, req.params.lineId, { actor: req.user, branchId: req.branchId, requestId: req.requestId });
    return successResponse(res, order, 'Product removed from sales order');
  } catch (err) {
    next(err);
  }
};

const checkout = async (req, res, next) => {
  try {
    const result = await SalesOrderService.checkout({
      orderId: req.params.id,
      paymentMethod: req.body.paymentMethod || 'cash',
      discountAmount: req.body.discountAmount || 0,
      employeeId: req.user?.employee?.id,
      branchId: req.branchId,
      actor: req.user,
      requestId: req.requestId,
      idempotencyKey: req.get('Idempotency-Key') || req.body.idempotencyKey
    });
    return successResponse(res, result, 'Checkout completed successfully', 201);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getOrders,
  createOrder,
  getOrderById,
  addLine,
  removeLine,
  checkout
};
