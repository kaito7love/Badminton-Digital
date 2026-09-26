const express = require('express');
const { createAuthenticator } = require('./platform/http/auth');
const requestContext = require('./platform/http/requestContext');
const { accessLog } = require('./platform/logging/logger');
const { createErrorHandler } = require('./platform/http/errorHandler');
const { createOpenApi } = require('./platform/http/openapi');
const { createIdempotency } = require('./platform/http/idempotency');
const { createHealthRouter } = require('./platform/health/health');
const { createAudit } = require('./platform/audit/audit');
const { createOutbox } = require('./platform/events/outbox');
const { createInbox } = require('./platform/events/inbox');
const { createEventValidator } = require('./platform/events/schemas');
const { createDispatcher } = require('./platform/events/dispatcher');
const { createScheduler } = require('./platform/jobs/scheduler');
const { requireScope } = require('./platform/http/auth');
const { ok, paged } = require('./platform/http/envelope');
const { notFound, conflict } = require('./platform/http/errors');
const { parsePagination } = require('./platform/http/pagination');
const asyncHandler = require('./platform/http/asyncHandler');
const { createPlayerModule } = require('./modules/player');
const { createRatingModule } = require('./modules/rating');
const { createRankingModule } = require('./modules/ranking');
const { createMatchmakingRouter } = require('./modules/matchmaking');
const { createMatchModule } = require('./modules/match');
const { createTournamentModule } = require('./modules/tournament');

// Composition root: dựng platform, lắp các module theo đúng chiều phụ thuộc
// (player ← rating ← ranking; player ← match; tất cả ← tournament; matchmaking độc
// lập), rồi mount route.
const createApp = ({ config, sequelize, models, logger }) => {
  const validator = config.events.validatePayloads ? createEventValidator() : null;
  const platform = {
    audit: createAudit(models),
    outbox: createOutbox({ OutboxEvent: models.OutboxEvent, targets: config.events.webhookTargets, validator }),
    inbox: createInbox({
      sequelize,
      InboxEvent: models.InboxEvent,
      sources: config.events.inboundSources,
      toleranceSeconds: config.events.signatureToleranceSeconds,
      logger
    }),
    idempotency: createIdempotency({ IdempotencyKey: models.IdempotencyKey, logger })
  };

  const player = createPlayerModule({ models, sequelize, platform });
  const rating = createRatingModule({ models, sequelize, platform, players: player.service });
  const ranking = createRankingModule({ models, sequelize, players: player.service, ratingQueries: rating.queries, config });
  const matchmakingRouter = createMatchmakingRouter();
  const match = createMatchModule({ models, sequelize, platform, players: player.service });
  const tournament = createTournamentModule({ models, sequelize, platform, players: player.service, rating, ranking, match });

  const dispatcher = createDispatcher({
    sequelize,
    OutboxEvent: models.OutboxEvent,
    targets: config.events.webhookTargets,
    logger,
    timeoutMs: config.events.deliveryTimeoutMs
  });
  const scheduler = createScheduler({ logger, utcOffsetMinutes: config.jobs.snapshotUtcOffsetMinutes });
  scheduler.dailyAt('leaderboard-snapshot', config.jobs.snapshotHour, (now) => ranking.service.dailySnapshot(now));
  scheduler.everyMinutes('idempotency-purge', 60, () => platform.idempotency.purgeExpired());

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.http.trustProxyHops);
  app.use(requestContext(config));
  app.use(accessLog(logger));
  // Giữ raw body để kiểm chữ ký HMAC của sự kiện gửi vào.
  app.use(express.json({ limit: '256kb', verify: (req, res, buf) => { req.rawBody = buf; } }));

  app.use(createHealthRouter({ sequelize, config }));
  const openapi = createOpenApi({ validateResponses: config.http.validateResponses });
  if (config.http.docsEnabled) openapi.mountDocs(app);

  // Xác thực TRƯỚC khi kiểm hợp đồng: thiếu token → 401, không để lộ gì qua lỗi 400.
  // Riêng /v1/events xác thực bằng chữ ký HMAC của nguồn gửi, không dùng service token.
  const authenticator = createAuthenticator(config.auth);
  app.use('/v1', (req, res, next) => (req.path === '/events' ? next() : authenticator.middleware(req, res, next)));
  app.use(openapi.validator);
  app.post('/v1/events', platform.inbox.receive);

  const v1 = express.Router();
  v1.use(player.router);
  v1.use(rating.router);
  v1.use(ranking.router);
  v1.use(matchmakingRouter);
  v1.use(match.router);
  v1.use(tournament.router);

  // Vận hành: xem / gửi lại sự kiện kẹt (scope ops:admin — gateway không cấp).
  v1.get(
    '/ops/outbox',
    requireScope('ops:admin'),
    asyncHandler(async (req, res) => {
      const { page, limit } = parsePagination(req.query);
      const where = { tenantId: req.auth.tenant, status: req.query.status || 'dead' };
      const { rows, count } = await models.OutboxEvent.findAndCountAll({ where, order: [['id', 'ASC']], offset: (page - 1) * limit, limit });
      const items = rows.map((r) => ({
        id: r.id, eventId: r.eventId, type: r.type, target: r.target, status: r.status, attempts: r.attempts,
        lastError: r.lastError, createdAt: new Date(r.createdAt).toISOString()
      }));
      return ok(res, paged(items, count, page, limit));
    })
  );
  v1.post(
    '/ops/outbox/:id/replay',
    requireScope('ops:admin'),
    asyncHandler(async (req, res) => {
      const row = await models.OutboxEvent.findOne({ where: { id: req.params.id, tenantId: req.auth.tenant } });
      if (!row) throw notFound('Không tìm thấy sự kiện');
      if (row.status !== 'dead') throw conflict('INVALID_STATE', 'Chỉ gửi lại được sự kiện ở trạng thái dead');
      await row.update({ status: 'pending', attempts: 0, nextAttemptAt: new Date(), lastError: null });
      return ok(res, { id: row.id, status: row.status }, { message: 'Đã xếp lại để gửi' });
    })
  );

  app.use('/v1', v1);
  app.use((req, res, next) => next(notFound('Không có endpoint này')));
  app.use(createErrorHandler(logger));

  return { app, modules: { player, rating, ranking, match, tournament }, platform, dispatcher, scheduler, openapi };
};

module.exports = { createApp };
