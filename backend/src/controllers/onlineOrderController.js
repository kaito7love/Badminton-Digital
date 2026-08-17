const OnlineOrderService = require('../services/OnlineOrderService');
const { successResponse } = require('../utils/responseHandler');

const buildContext = (req) => ({ actor: req.user, requestId: req.requestId });

const placeOrder = async (req, res, next) => {
  try {
    const { branchId, items, contactName, contactPhone, customerNote } = req.body;
    const order = await OnlineOrderService.placeOrder(
      { branchId, items, contactName, contactPhone, customerNote },
      buildContext(req)
    );
    return successResponse(res, order, 'Đặt hàng thành công', 201);
  } catch (err) {
    next(err);
  }
};

const getMyOrders = async (req, res, next) => {
  try {
    const result = await OnlineOrderService.listOrdersForCustomer(req.query, req.user.customer?.id);
    return successResponse(res, result.rows, 'Danh sách đơn hàng', 200, result.meta);
  } catch (err) {
    next(err);
  }
};

const getMyOrderById = async (req, res, next) => {
  try {
    const order = await OnlineOrderService.getOrderForCustomer(req.params.id, req.user.customer?.id);
    return successResponse(res, order, 'Chi tiết đơn hàng');
  } catch (err) {
    next(err);
  }
};

const cancelMyOrder = async (req, res, next) => {
  try {
    const order = await OnlineOrderService.cancelOrder(req.params.id, buildContext(req));
    return successResponse(res, order, 'Đã huỷ đơn hàng');
  } catch (err) {
    next(err);
  }
};

module.exports = { placeOrder, getMyOrders, getMyOrderById, cancelMyOrder };
