const { param, query, validationResult } = require('express-validator');
const { errorResponse } = require('../utils/responseHandler');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map((err) => ({ field: err.path, message: err.msg }));
    return errorResponse(res, 'Validation failed', formattedErrors, 400);
  }
  next();
};

const listNotificationRules = [
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('limit phải từ 1 đến 50'),
  query('unread').optional().isIn(['true', 'false']).withMessage('unread phải là true hoặc false'),
  validate
];

const notificationIdRules = [
  param('id').isInt({ min: 1, max: 2147483647 }).withMessage('Notification ID must be an integer'),
  validate
];

module.exports = { listNotificationRules, notificationIdRules };
