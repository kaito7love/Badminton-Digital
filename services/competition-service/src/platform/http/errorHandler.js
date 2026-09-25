const { UniqueConstraintError, ValidationError: SequelizeValidationError } = require('sequelize');
const { AppError } = require('./errors');
const { DomainError } = require('../../shared/domainError');
const { fail } = require('./envelope');

// Handler lỗi chung — đăng ký cuối cùng. Không bao giờ trả nguyên object lỗi của
// Sequelize (chứa cả bản ghi) — chỉ { field, message }, như errorHandler.js của
// app chính.

const OPENAPI_CODES = {
  400: ['VALIDATION_FAILED', 'Dữ liệu gửi lên không đúng hợp đồng API'],
  404: ['NOT_FOUND', 'Không có endpoint này'],
  405: ['METHOD_NOT_ALLOWED', 'Endpoint không hỗ trợ method này'],
  413: ['PAYLOAD_TOO_LARGE', 'Dữ liệu gửi lên quá lớn'],
  415: ['UNSUPPORTED_MEDIA_TYPE', 'Content-Type phải là application/json']
};

const fieldOf = (path) =>
  String(path || '')
    .replace(/^\/?(body|query|params|headers)[./]?/, '')
    .replace(/^\./, '')
    .replace(/\//g, '.');

const isOpenApiError = (err) => typeof err.status === 'number' && Array.isArray(err.errors) && err.errors.every((e) => 'path' in e);

const createErrorHandler = (logger) =>
  // eslint-disable-next-line no-unused-vars
  (err, req, res, next) => {
    if (err instanceof AppError || err instanceof DomainError) {
      return fail(res, err.status, err.code, err.message, err.errors);
    }
    if (isOpenApiError(err)) {
      if (err.status >= 500) {
        // Response không khớp OpenAPI — lỗi của chính service (test contract bắt được).
        logger.error({ requestId: req.requestId, errors: err.errors }, 'response vi phạm hợp đồng OpenAPI');
        return fail(res, 500, 'CONTRACT_VIOLATION', 'Response không khớp hợp đồng API', err.errors.map((e) => ({ field: fieldOf(e.path), message: e.message })));
      }
      if (err.status === 400 && err.errors.length && err.errors.every((e) => /headers.idempotency-key/i.test(String(e.path)))) {
        return fail(res, 400, 'IDEMPOTENCY_KEY_REQUIRED', 'Thiếu hoặc sai header Idempotency-Key', [
          { field: 'Idempotency-Key', message: 'Bắt buộc với thao tác ghi (8–128 ký tự: chữ, số, - _)' }
        ]);
      }
      const [code, message] = OPENAPI_CODES[err.status] || ['VALIDATION_FAILED', err.message];
      return fail(res, err.status, code, message, err.errors.map((e) => ({ field: fieldOf(e.path), message: e.message })));
    }
    if (err.type === 'entity.parse.failed') return fail(res, 400, 'INVALID_JSON', 'Body không phải JSON hợp lệ');
    if (err instanceof UniqueConstraintError) {
      return fail(res, 409, 'CONFLICT', 'Dữ liệu bị trùng', (err.errors || []).map((e) => ({ field: e.path, message: 'Đã tồn tại' })));
    }
    if (err instanceof SequelizeValidationError) {
      return fail(res, 400, 'VALIDATION_FAILED', 'Dữ liệu không hợp lệ', (err.errors || []).map((e) => ({ field: e.path, message: e.message })));
    }
    logger.error({ requestId: req.requestId, err: err.message, stack: err.stack }, 'unhandled error');
    return fail(res, 500, 'INTERNAL_ERROR', 'Lỗi hệ thống');
  };

module.exports = { createErrorHandler };
