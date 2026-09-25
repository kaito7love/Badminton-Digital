const { UniqueConstraintError } = require('sequelize');
const { verify } = require('./signature');
const { unauthenticated, badRequest } = require('../http/errors');
const { ok } = require('../http/envelope');

// Nhận sự kiện từ hệ thống khác (POST /v1/events). Xác thực bằng chữ ký HMAC
// của nguồn gửi, khử trùng lặp theo (nguồn, id sự kiện) → mỗi sự kiện có hiệu ứng
// đúng một lần dù bên gửi gửi lại. Handler chạy trong cùng transaction với dòng
// inbox: handler lỗi thì không ghi inbox, bên gửi gửi lại sau.

const createInbox = ({ sequelize, InboxEvent, sources, toleranceSeconds, logger }) => {
  const handlers = new Map();
  const sourceByName = new Map(sources.map((s) => [s.source, s]));

  const register = (type, handler) => {
    handlers.set(type, handler);
  };

  const receive = async (req, res, next) => {
    try {
      const source = sourceByName.get(req.get('X-Event-Source'));
      const raw = req.rawBody ? req.rawBody.toString('utf8') : '';
      if (
        !source ||
        !verify({
          secret: source.secret,
          signature: req.get('X-Signature'),
          timestamp: req.get('X-Timestamp'),
          body: raw,
          toleranceSeconds
        })
      ) {
        throw unauthenticated('Chữ ký sự kiện không hợp lệ');
      }
      const event = req.body || {};
      if (!event.id || !event.type) throw badRequest('Sự kiện thiếu id hoặc type', [{ field: 'id', message: 'Bắt buộc' }]);

      const already = await InboxEvent.findOne({ where: { source: source.source, eventId: String(event.id) } });
      if (already) return ok(res, { eventId: event.id, status: 'duplicate' });

      const handler = handlers.get(event.type);
      let status = 'ignored';
      let result = 'Không có handler cho loại sự kiện này';
      try {
        await sequelize.transaction(async (transaction) => {
          if (handler) {
            result = (await handler(event, { transaction, tenant: source.tenant, actorRef: `event:${source.source}` })) || 'ok';
            status = 'processed';
          }
          await InboxEvent.create(
            {
              source: source.source,
              eventId: String(event.id),
              type: event.type,
              tenantId: source.tenant,
              status,
              result: String(result).slice(0, 255),
              receivedAt: new Date()
            },
            { transaction }
          );
        });
      } catch (err) {
        if (err instanceof UniqueConstraintError) return ok(res, { eventId: event.id, status: 'duplicate' });
        throw err;
      }
      logger.info({ eventId: event.id, type: event.type, source: source.source, status }, 'inbound event');
      return ok(res, { eventId: event.id, status, result });
    } catch (err) {
      return next(err);
    }
  };

  return { register, receive };
};

module.exports = { createInbox };
