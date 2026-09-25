// Lỗi nghiệp vụ có mã máy đọc được. Handler chung (errorHandler.js) đổi thành
// envelope { success:false, data:null, message, code, errors }.

class AppError extends Error {
  constructor(status, code, message, errors = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

const badRequest = (message, errors, code = 'VALIDATION_FAILED') => new AppError(400, code, message, errors);
const unauthenticated = (message = 'Thiếu hoặc sai service token') => new AppError(401, 'UNAUTHENTICATED', message);
const forbiddenScope = (scopes) =>
  new AppError(403, 'FORBIDDEN_SCOPE', `Token thiếu quyền: cần một trong ${scopes.join(', ')}`);
const notFound = (message = 'Không tìm thấy') => new AppError(404, 'NOT_FOUND', message);
const conflict = (code, message, errors) => new AppError(409, code, message, errors);
const unprocessable = (code, message, errors) => new AppError(422, code, message, errors);

module.exports = { AppError, badRequest, unauthenticated, forbiddenScope, notFound, conflict, unprocessable };
