const errorHandler = (err, req, res, next) => {
  console.error('[Error Handler]', err);

  const statusCode = err.statusCode || err.status || 500;
  // Lỗi có statusCode/status là service tự throw có chủ đích (validation,
  // not found, forbidden...) — message của nó luôn an toàn để trả nguyên
  // văn. Lỗi KHÔNG có (rơi vào 500 mặc định) là crash/bug thật, message có
  // thể chứa chi tiết nội bộ (lỗi DB, stack...) — chỉ lộ ra ngoài lúc dev.
  const isOperational = Boolean(err.statusCode || err.status);
  const message = isOperational
    ? (err.message || 'Lỗi máy chủ nội bộ.')
    : (process.env.NODE_ENV === 'production' ? 'Lỗi máy chủ nội bộ.' : (err.message || 'Lỗi máy chủ nội bộ.'));

  res.status(statusCode).json({
    success: false,
    data: null,
    message: message,
    errors: err.errors || null
  });
};

module.exports = errorHandler;
