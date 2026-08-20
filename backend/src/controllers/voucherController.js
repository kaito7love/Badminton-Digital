const VoucherService = require('../services/VoucherService');
const { successResponse } = require('../utils/responseHandler');

const buildContext = (req) => ({ actor: req.user, branchId: req.branchId, requestId: req.requestId });

const list = async (req, res, next) => {
  try {
    const result = await VoucherService.list(req.query);
    return successResponse(res, result.rows, 'Danh sách mã giảm giá', 200, result.meta);
  } catch (err) {
    next(err);
  }
};

const getById = async (req, res, next) => {
  try {
    const voucher = await VoucherService.getById(req.params.id);
    return successResponse(res, voucher, 'Chi tiết mã giảm giá');
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const voucher = await VoucherService.create(req.body, buildContext(req));
    return successResponse(res, voucher, 'Tạo mã giảm giá thành công', 201);
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const voucher = await VoucherService.update(req.params.id, req.body, buildContext(req));
    return successResponse(res, voucher, 'Cập nhật mã giảm giá thành công');
  } catch (err) {
    next(err);
  }
};

const deactivate = async (req, res, next) => {
  try {
    const voucher = await VoucherService.deactivate(req.params.id, buildContext(req));
    return successResponse(res, voucher, 'Đã ngừng áp dụng mã giảm giá');
  } catch (err) {
    next(err);
  }
};

// Xem trước số tiền giảm — khách (checkout) lẫn nhân viên (POS) đều gọi được.
// Khách thì kèm luôn customerId của chính họ để soi giới hạn perCustomerLimit;
// nhân viên xem hộ khách tại quầy thì chưa biết khách nào nên bỏ qua giới hạn
// này, SalesOrderService.applyVoucher sẽ kiểm lại đúng customerId lúc áp thật.
const preview = async (req, res, next) => {
  try {
    const customerId = req.user.role?.name === 'customer' ? req.user.customer?.id || null : null;
    const result = await VoucherService.preview({
      code: req.body.code,
      customerId,
      orderAmount: req.body.orderAmount
    });
    return successResponse(res, result, 'Mã giảm giá hợp lệ');
  } catch (err) {
    next(err);
  }
};

module.exports = { list, getById, create, update, deactivate, preview };
