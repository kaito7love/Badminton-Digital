// Lỗi luật nghiệp vụ từ hàm thuần trong domain/. Tầng HTTP đổi thành 422 (hoặc
// status khác nếu có) mà domain không phải biết gì về HTTP.
class DomainError extends Error {
  constructor(code, message, errors = null, status = 422) {
    super(message);
    this.code = code;
    this.errors = errors;
    this.status = status;
  }
}

module.exports = { DomainError };
