const errorHandler = (err, req, res, next) => {
  console.error('[Error Handler]', err);

  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Lỗi máy chủ nội bộ.';

  res.status(statusCode).json({
    success: false,
    data: null,
    message: message,
    errors: err.errors || null
  });
};

module.exports = errorHandler;
