/**
 * Standardized Response Envelope Handlers
 */

const successResponse = (res, data = null, message = 'Success', statusCode = 200, meta = null) => {
  const payload = {
    success: true,
    data,
    message,
    errors: null
  };
  if (meta) {
    payload.meta = meta;
  }
  return res.status(statusCode).json(payload);
};

const errorResponse = (res, message = 'Error occurred', errors = null, statusCode = 400) => {
  return res.status(statusCode).json({
    success: false,
    data: null,
    message,
    errors: errors || [{ message }]
  });
};

module.exports = {
  successResponse,
  errorResponse
};
