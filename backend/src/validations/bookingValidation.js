const { body, query, param, validationResult } = require('express-validator');
const { errorResponse } = require('../utils/responseHandler');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(err => ({ field: err.path, message: err.msg }));
    return errorResponse(res, 'Validation failed', formattedErrors, 400);
  }
  next();
};

const createBookingRules = [
  body('courtId').isInt().withMessage('Court ID is required and must be an integer'),
  body('customerId').optional({ nullable: true }).isInt().withMessage('Customer ID must be an integer'),
  body('customerName').optional({ nullable: true }).isString().trim().isLength({ max: 100 }).withMessage('Customer name must be a string up to 100 characters'),
  body('customerPhone').optional({ nullable: true }).isString().trim().isLength({ max: 20 }).withMessage('Customer phone must be a string up to 20 characters'),
  body('bookingDate').isISO8601().withMessage('Booking date must be a valid date (YYYY-MM-DD)'),
  body('startTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/).withMessage('Start time must be HH:mm or HH:mm:ss'),
  body('endTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/).withMessage('End time must be HH:mm or HH:mm:ss'),
  validate
];

// Sửa lịch chỉ đổi được sân, ngày và giờ. Trước đây validator chỉ chặn `status`
// còn service ghi nguyên body, nên gửi `branchId` là lịch biến khỏi chi nhánh và
// khung giờ đó đặt trùng được, gửi `createdBy` là giả người tạo. Muốn đổi khách
// thì huỷ lịch và tạo lịch mới. BookingService.pickEditableFields lọc lại đúng
// danh sách này.
const EDITABLE_BOOKING_FIELDS = ['courtId', 'bookingDate', 'startTime', 'endTime'];

const rejectUneditableBookingFields = (req, res, next) => {
  const payload = req.body && typeof req.body === 'object' ? req.body : {};
  const rejected = Object.keys(payload).filter((key) => !EDITABLE_BOOKING_FIELDS.includes(key));
  if (rejected.length) {
    return errorResponse(
      res,
      `Không sửa được các trường: ${rejected.join(', ')}`,
      rejected.map((field) => ({ field, message: 'Đổi lịch chỉ đổi được sân, ngày và giờ' })),
      400
    );
  }
  next();
};

const updateBookingRules = [
  param('id').isInt().withMessage('Booking ID must be an integer'),
  rejectUneditableBookingFields,
  body('courtId').optional().isInt().withMessage('Court ID must be an integer'),
  body('bookingDate').optional().isISO8601().withMessage('Booking date must be valid'),
  body('startTime').optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/).withMessage('Start time must be HH:mm or HH:mm:ss'),
  body('endTime').optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/).withMessage('End time must be HH:mm or HH:mm:ss'),
  validate
];

const checkAvailabilityRules = [
  query('courtId').isInt().withMessage('Court ID is required'),
  query('bookingDate').isISO8601().withMessage('Booking date is required (YYYY-MM-DD)'),
  query('startTime').notEmpty().withMessage('Start time is required'),
  query('endTime').notEmpty().withMessage('End time is required'),
  validate
];

module.exports = {
  EDITABLE_BOOKING_FIELDS,
  rejectUneditableBookingFields,
  createBookingRules,
  updateBookingRules,
  checkAvailabilityRules
};
