const express = require('express');
// Giao diện công khai của module `tournament`.
// Phụ thuộc: player, rating, ranking, matchmaking (thuần), match.
const { defineTournamentModels } = require('./infrastructure/models');
const { createTournamentContext } = require('./application/tournamentContext');
const { createTournamentService } = require('./application/tournamentService');
const { createFinalizeService } = require('./application/finalizeService');
const { createTournamentQueries } = require('./application/tournamentQueries');
const { createTournamentPublic } = require('./application/publicQueries');
const { createTournamentMergeHandler } = require('./application/playerMerge');
const { createTournamentRouter } = require('./infrastructure/http/routes');
const { createTournamentPublicRouter } = require('./infrastructure/http/publicRoutes');
const { assertAction } = require('./domain/stateMachine');
const standings = require('./domain/standings');
const placements = require('./domain/placements');
const formatAdvisor = require('./domain/formatAdvisor');
const bracketPlan = require('./domain/bracketPlan');
const draw = require('./domain/draw');
const eligibility = require('./domain/eligibility');
const operations = require('./domain/operations');

const createTournamentModule = ({ models, sequelize, platform, players, rating, ranking, match, stream }) => {
  const ctx = createTournamentContext({ models });
  const service = createTournamentService({
    models, sequelize, players, ratingQueries: rating.queries, matches: match.service, platform, ctx
  });
  const finalizer = createFinalizeService({
    models, sequelize, players, ratings: rating.service, ratingQueries: rating.queries, points: ranking.points, matches: match.service, platform, ctx
  });
  const queries = createTournamentQueries({ models, players, matches: match.service, ctx });
  players.registerMergeHandler(createTournamentMergeHandler({ models, finalizer }));

  // Ngữ cảnh "tournament" cho module match: quyền, trạng thái, chuyển drawn → in_progress.
  match.service.registerContext('tournament', {
    load: (transaction, tenant, id, opts) => ctx.load(transaction, tenant, id, opts),
    authorize: (auth, t, action) => ctx.authorize(auth, t, action),
    assertCanRecord: (t) => assertAction(t, 'record'),
    afterResult: async (transaction, { ctx: t }) => {
      if (t.status === 'drawn') await t.update({ status: 'in_progress' }, { transaction });
    },
    withdrawnTeamIds: (transaction, t) => ctx.withdrawnTeamIds(transaction, t),
    // "Gọi ra sân" chỉ vào sân của giải (plan 20); giải cũ chưa có danh sách sân → không kiểm.
    courtRefs: (t) => t.courtRefs || null
  });

  const staffRouter = createTournamentRouter({ service, finalizer, queries, ctx, players, matches: match.service, idempotency: platform.idempotency, stream });
  // Trang công khai của giải (plan 27): xem không cần quyền nhân viên, qua bộ gọt riêng.
  const pub = createTournamentPublic({ models, players, queries });
  const router = express.Router();
  router.use(staffRouter);
  router.use(createTournamentPublicRouter({ pub, stream }));
  return { service, finalizer, queries, pub, router };
};

module.exports = {
  defineTournamentModels,
  createTournamentModule,
  domain: { standings, placements, formatAdvisor, bracketPlan, draw, eligibility, operations }
};
