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
  body('bookingDate').isISO8601().withMessage('Booking date must be a valid date (YYYY-MM-DD)'),
  body('startTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/).withMessage('Start time must be HH:mm or HH:mm:ss'),
  body('endTime').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/).withMessage('End time must be HH:mm or HH:mm:ss'),
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
  createBookingRules,
  checkAvailabilityRules
};
