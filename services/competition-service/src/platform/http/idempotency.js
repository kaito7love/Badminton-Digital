const crypto = require('crypto');
const { UniqueConstraintError, Op } = require('sequelize');
const { badRequest, conflict, unprocessable } = require('./errors');

// Idempotency-Key cho mọi POST / PUT có tác dụng phụ (docs/02 mục 1.3):
//  - cùng key + cùng body  → trả lại đúng response cũ (Idempotent-Replayed: true)
//  - cùng key + khác body  → 422 IDEMPOTENCY_KEY_REUSED
//  - request đầu còn đang chạy → 409 IDEMPOTENCY_IN_PROGRESS
// Response 5xx không được lưu (xoá khoá) để client thử lại được.

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

const createIdempotency = ({ IdempotencyKey, ttlHours = 24, logger }) => {
  const middleware = async (req, res, next) => {
    try {
      const key = req.get('Idempotency-Key');
      if (!key) {
        throw badRequest('Thiếu header Idempotency-Key', [{ field: 'Idempotency-Key', message: 'Bắt buộc với thao tác ghi' }], 'IDEMPOTENCY_KEY_REQUIRED');
      }
      if (!KEY_PATTERN.test(key)) {
        throw badRequest('Idempotency-Key không hợp lệ', [{ field: 'Idempotency-Key', message: '8–128 ký tự: chữ, số, - _' }], 'IDEMPOTENCY_KEY_REQUIRED');
      }
      const clientId = `${req.auth.tenant}|${req.auth.clientId}`.slice(0, 191);
      const requestHash = crypto
        .createHash('sha256')
        .update(`${req.method} ${req.baseUrl}${req.path}\n${JSON.stringify(req.body || {})}`)
        .digest('hex');

      const existing = await IdempotencyKey.findOne({ where: { clientId, idemKey: key } });
      if (existing && existing.expiresAt > new Date()) {
        if (existing.requestHash !== requestHash) {
          throw unprocessable('IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key này đã dùng cho một request khác');
        }
        if (existing.status === 'in_progress') {
          throw conflict('IDEMPOTENCY_IN_PROGRESS', 'Request cùng Idempotency-Key đang được xử lý');
        }
        res.set('Idempotent-Replayed', 'true');
        return res.status(existing.responseStatus).json(existing.responseBody);
      }
      if (existing) await existing.destroy();

      let row;
      try {
        row = await IdempotencyKey.create({
          clientId,
          idemKey: key,
          requestHash,
          status: 'in_progress',
          expiresAt: new Date(Date.now() + ttlHours * 3600 * 1000)
        });
      } catch (err) {
        if (err instanceof UniqueConstraintError) {
          throw conflict('IDEMPOTENCY_IN_PROGRESS', 'Request cùng Idempotency-Key đang được xử lý');
        }
        throw err;
      }

      // Lưu response XONG rồi mới gửi đi: nếu gửi trước rồi lưu sau, client gửi lại
      // ngay khi nhận response sẽ gặp 409 "đang xử lý" (test thật bắt được).
      const originalJson = res.json.bind(res);
      res.json = (payload) => {
        const status = res.statusCode;
        const store =
          status >= 500 ? row.destroy() : row.update({ status: 'completed', responseStatus: status, responseBody: payload });
        store
          .catch((err) => logger.error({ err: err.message, key }, 'idempotency store failed'))
          .finally(() => originalJson(payload));
        return res;
      };
      return next();
    } catch (err) {
      return next(err);
    }
  };

  const purgeExpired = () => IdempotencyKey.destroy({ where: { expiresAt: { [Op.lt]: new Date() } } });

  return { middleware, purgeExpired };
};

module.exports = { createIdempotency };
