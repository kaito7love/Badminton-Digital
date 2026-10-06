// Giao diện công khai của module `match`. Phụ thuộc: player.
const { defineMatchModels } = require('./infrastructure/models');
const { createMatchService } = require('./application/matchService');
const { createLiveScoring } = require('./application/liveScoring');
const { createMatchRouter } = require('./infrastructure/http/routes');
const badmintonScore = require('./domain/badmintonScore');
const matchStats = require('./domain/matchStats');
const liveScore = require('./domain/liveScore');
const publicView = require('./domain/publicView');
const player = require('../player');

const createMatchModule = ({ models, sequelize, platform, players }) => {
  const service = createMatchService({ models, sequelize, players, platform });
  const live = createLiveScoring({ models, sequelize, realtime: platform.realtime, core: service.internal });
  players.registerMergeHandler(service.mergeHandler);
  const router = createMatchRouter({ matches: service, live, players, profile: player.domain.profile, idempotency: platform.idempotency });
  return { service, live, router };
};

module.exports = { defineMatchModels, createMatchModule, domain: { badmintonScore, matchStats, liveScore, publicView } };
