const express = require('express');
// Giao diện công khai của module `session` (buổi giao lưu).
// Phụ thuộc: player, rating, matchmaking (thuần), match.
const { defineSessionModels } = require('./infrastructure/models');
const { createSessionContext } = require('./application/sessionContext');
const { createSessionService } = require('./application/sessionService');
const { createSessionQueries } = require('./application/sessionQueries');
const { createSignupService } = require('./application/signupService');
const { createSessionPublic } = require('./application/publicQueries');
const { createSessionRouter } = require('./infrastructure/http/routes');
const { createSessionPublicRouter } = require('./infrastructure/http/publicRoutes');
const sessionRules = require('./domain/sessionRules');

const createSessionModule = ({ models, sequelize, platform, players, rating, match, stream }) => {
  const ctx = createSessionContext({ models });
  const signups = createSignupService({ models, players, platform, ctx });
  const service = createSessionService({
    models, sequelize, players, ratings: rating.service, ratingQueries: rating.queries, matches: match.service, platform, ctx, signups
  });
  const queries = createSessionQueries({ models, players, matches: match.service, ctx, service });

  // Ngữ cảnh "session" cho module match: quyền, buổi còn mở, "xong không tỉ số",
  // trả người về hàng chờ khi trận rời sân.
  match.service.registerContext('session', {
    load: (transaction, tenant, id, opts) => ctx.load(transaction, tenant, id, opts),
    authorize: (auth, s, action) => ctx.authorize(auth, s, action),
    assertCanRecord: (s) => ctx.assertOpen(s),
    afterResult: async () => {},
    allowEndWithoutResult: true,
    afterStatusChange: (transaction, change) => service.onMatchStatus(transaction, change)
  });
  players.registerMergeHandler(service.mergeHandler);

  // Trang công khai của buổi giao lưu + khách tự đăng ký (plan 27).
  const pub = createSessionPublic({ models, players, queries, service });
  const staffRouter = createSessionRouter({ service, queries, ctx, idempotency: platform.idempotency, stream, signups, pub });
  const router = express.Router();
  router.use(staffRouter);
  router.use(createSessionPublicRouter({ pub, stream }));
  return { service, queries, pub, signups, router };
};

module.exports = { defineSessionModels, createSessionModule, domain: { sessionRules } };
