const express = require('express');
const rateLimit = require('express-rate-limit');
const { UniqueConstraintError } = require('sequelize');
const { verify } = require('../integrations/competition/signature');
const { handleEvent } = require('../integrations/competition/webhookHandlers');

// POST /api/v1/integrations/competition/events — competition-service báo chốt giải / đóng buổi (plan 23).
// Fail-closed như paymentWebhookAuth: chưa cấu hình → 503, sai chữ ký hoặc lệch giờ quá 5 phút → 401 (và ghi
// ActivityLog competition.webhook_rejected). Khử trùng theo id sự kiện: service gửi "ít nhất một lần".
// Phải mount TRƯỚC express.json() toàn cục — chữ ký tính trên đúng các byte nhận được nên route tự giữ rawBody.

const SERVICE_SOURCE = 'competition-service';

const reply = (res, status, message, data = null, success = status < 300) =>
  res.status(status).json({ success, data, message, errors: null });

const createCompetitionWebhookRouter = ({ config, sequelize, models, record, limiter = null }) => {
  const router = express.Router();
  const guard = limiter || rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => reply(res, 429, 'Quá nhiều yêu cầu.')
  });

  const reject = async (req, reason) => {
    try {
      await record({ actor: null, action: 'competition.webhook_rejected', targetType: 'competition', targetId: null, newValues: { reason, ip: req.ip }, requestId: req.requestId });
    } catch {
      /* nhật ký lỗi không được làm đổi câu trả lời 401 */
    }
  };

  router.post(
    '/events',
    guard,
    express.json({ limit: '256kb', verify: (req, res, buf) => { req.rawBody = buf; } }),
    async (req, res, next) => {
      try {
        if (!config.enabled) return reply(res, 503, 'Tích hợp thi đấu chưa được cấu hình');
        const valid = req.get('X-Event-Source') === SERVICE_SOURCE && verify({
          secret: config.webhookSecret,
          signature: req.get('X-Signature'),
          timestamp: req.get('X-Timestamp'),
          body: req.rawBody ? req.rawBody.toString('utf8') : ''
        });
        if (!valid) {
          await reject(req, 'bad_signature');
          return reply(res, 401, 'Chữ ký sự kiện không hợp lệ');
        }

        const event = req.body || {};
        if (typeof event.id !== 'string' || !event.id || event.id.length > 64 || typeof event.type !== 'string' || !event.type) {
          return reply(res, 400, 'Sự kiện thiếu id hoặc type');
        }

        const { IntegrationInbox } = models;
        if (await IntegrationInbox.findOne({ where: { eventId: event.id } })) {
          return reply(res, 200, 'OK', { eventId: event.id, status: 'duplicate' });
        }
        let status = 'ignored';
        try {
          await sequelize.transaction(async (transaction) => {
            const logged = await handleEvent(event, { transaction, record });
            status = logged ? 'processed' : 'ignored';
            await IntegrationInbox.create({ eventId: event.id, type: event.type.slice(0, 100), status, receivedAt: new Date() }, { transaction });
          });
        } catch (err) {
          if (err instanceof UniqueConstraintError) return reply(res, 200, 'OK', { eventId: event.id, status: 'duplicate' });
          throw err;
        }
        return reply(res, 200, 'OK', { eventId: event.id, status });
      } catch (err) {
        return next(err);
      }
    }
  );

  return router;
};

module.exports = { createCompetitionWebhookRouter };
