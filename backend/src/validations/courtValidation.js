const { body, param, validationResult } = require('express-validator');
const { errorResponse } = require('../utils/responseHandler');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(err => ({ field: err.path, message: err.msg }));
    return errorResponse(res, 'Validation failed', formattedErrors, 400);
  }
  next();
};

const createCourtRules = [
  body('name').trim().notEmpty().withMessage('Court name is required'),
  body('peakPricePerHour').isNumeric().withMessage('Peak price must be a number'),
  body('offpeakPricePerHour').isNumeric().withMessage('Off-peak price must be a number'),
  body('note').optional().isString(),
  validate
];

const updateCourtRules = [
  param('id').isInt().withMessage('Court ID must be an integer'),
  body('name').optional().trim().notEmpty().withMessage('Court name cannot be empty'),
  body('peakPricePerHour').optional().isNumeric().withMessage('Peak price must be a number'),
  body('offpeakPricePerHour').optional().isNumeric().withMessage('Off-peak price must be a number'),
  body('status').optional().isIn(['empty', 'playing', 'maintenance']).withMessage('Invalid status'),
  validate
];

const openCourtRules = [
  param('id').isInt().withMessage('Court ID must be an integer'),
  body('customerId').optional({ nullable: true }).isInt().withMessage('Customer ID must be an integer'),
  body('bookingId').optional({ nullable: true }).isInt().withMessage('Booking ID must be an integer'),
  body('guestName').optional({ nullable: true }).isString().trim().isLength({ max: 100 }).withMessage('Guest name must be a string up to 100 characters'),
  validate
];

const transferCourtRules = [
  param('id').isInt().withMessage('Source Court ID must be an integer'),
  body('targetCourtId').isInt().withMessage('Target Court ID must be an integer'),
  validate
];

module.exports = {
  createCourtRules,
  updateCourtRules,
  openCourtRules,
  transferCourtRules
};
