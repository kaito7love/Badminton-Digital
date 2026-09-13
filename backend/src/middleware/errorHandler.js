const { UniqueConstraintError, ValidationError, ForeignKeyConstraintError } = require('sequelize');

const GENERIC_MESSAGE = 'Lỗi máy chủ nội bộ.';

// `errors` trong response chỉ được là [{ field, message }] do chính file này
// dựng. Tuyệt đối không trả `err.errors` thô của Sequelize: mỗi
// ValidationErrorItem giữ `instance` là nguyên bản ghi đang lưu — với bảng
// users là cả passwordHash lẫn refreshToken. Quản lý chi nhánh từng lấy được
// refresh token của admin chỉ bằng một lệnh sửa nhân viên kèm email sai.
const toFieldErrors = (err) =>
  (Array.isArray(err.errors) ? err.errors : []).map((item) => ({
    field: item.path || null,
    message: item.message
  }));

const classifyError = (err) => {
  // Lỗi có statusCode/status là service tự throw có chủ đích (validation,
  // not found, forbidden...) — message của nó luôn an toàn để trả nguyên văn.
  if (err.statusCode || err.status) {
    return { statusCode: err.statusCode || err.status, message: err.message || GENERIC_MESSAGE, errors: null };
  }
  // UniqueConstraintError kế thừa ValidationError nên phải xét trước.
  if (err instanceof UniqueConstraintError) {
    return { statusCode: 409, message: 'Dữ liệu bị trùng với bản ghi đã có.', errors: toFieldErrors(err) };
  }
  if (err instanceof ValidationError) {
    return { statusCode: 400, message: 'Dữ liệu không hợp lệ.', errors: toFieldErrors(err) };
  }
  if (err instanceof ForeignKeyConstraintError) {
    return {
      statusCode: 409,
      message: 'Dữ liệu đang được tham chiếu hoặc tham chiếu tới bản ghi không tồn tại.',
      errors: null
    };
  }
  // Còn lại là crash/bug thật: message có thể chứa chi tiết nội bộ (lỗi DB,
  // tên bảng...) nên chỉ lộ ra ngoài lúc dev.
  return {
    statusCode: 500,
    message: process.env.NODE_ENV === 'production' ? GENERIC_MESSAGE : (err.message || GENERIC_MESSAGE),
    errors: null
  };
};

// Không log nguyên object lỗi: nó mang theo `instance` và câu SQL kèm tham số,
// bí mật chỉ chuyển từ response sang file log. Đường dẫn cũng bỏ query string —
// kết nối SSE truyền access token qua `?token=`.
const logError = (err, req, statusCode) => {
  const path = String(req.originalUrl || req.url || '').split('?')[0];
  const dbCode = err.parent?.code ? ` [${err.parent.code}]` : '';
  console.error(`[Error Handler] ${statusCode} ${req.method} ${path} — ${err.name}${dbCode}: ${err.message}`);
  if (statusCode >= 500 && err.stack) console.error(err.stack);
};

const errorHandler = (err, req, res, next) => {
  const { statusCode, message, errors } = classifyError(err);
  logError(err, req, statusCode);

  res.status(statusCode).json({
    success: false,
    data: null,
    message,
    errors
  });
};

module.exports = errorHandler;
