// Giao diện công khai của module `match`. Phụ thuộc: player.
const { defineMatchModels } = require('./infrastructure/models');
const { createMatchService } = require('./application/matchService');
const { createMatchRouter } = require('./infrastructure/http/routes');
const badmintonScore = require('./domain/badmintonScore');
const matchStats = require('./domain/matchStats');
const player = require('../player');

const createMatchModule = ({ models, sequelize, platform, players }) => {
  const service = createMatchService({ models, sequelize, players, platform });
  const router = createMatchRouter({ matches: service, players, profile: player.domain.profile, idempotency: platform.idempotency });
  return { service, router };
};

module.exports = { defineMatchModels, createMatchModule, domain: { badmintonScore, matchStats } };
