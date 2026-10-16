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
    return { statusCode: err.statusCode || err.status, message: err.message || GENERIC_MESSAGE, errors: null, code: err.errorCode || undefined };
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
  // Lỗi tranh chấp của MySQL (R11): hai request cùng khoá một dòng, một bên bị chọn làm "nạn nhân". Dữ liệu vẫn
  // nhất quán — nên là 409 để client thử lại, không phải 500 như crash thật.
  const dbCode = err.parent?.code || err.original?.code;
  if (dbCode === 'ER_LOCK_DEADLOCK' || dbCode === 'ER_LOCK_WAIT_TIMEOUT') {
    return {
      statusCode: 409,
      message: 'Hệ thống đang xử lý một yêu cầu khác trên cùng dữ liệu, vui lòng thử lại sau giây lát.',
      errors: null
    };
  }
  // Giá trị vượt cột (chuỗi quá dài, số ngoài miền INT) lọt qua validator: lỗi của đầu vào, không phải của máy chủ.
  if (['ER_DATA_TOO_LONG', 'ER_WARN_DATA_OUT_OF_RANGE', 'ER_DATA_OUT_OF_RANGE', 'ER_TRUNCATED_WRONG_VALUE', 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD'].includes(dbCode)) {
    return { statusCode: 400, message: 'Dữ liệu vượt quá độ dài hoặc giá trị cho phép.', errors: null };
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
  const { statusCode, message, errors, code } = classifyError(err);
  logError(err, req, statusCode);

  res.status(statusCode).json({
    success: false,
    data: null,
    message,
    errors,
    ...(code ? { code } : {})
  });
};

module.exports = errorHandler;
