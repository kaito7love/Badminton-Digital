// Giao diện công khai của module `ranking`. Phụ thuộc: player, rating.
const { defineRankingModels } = require('./infrastructure/models');
const { createRankingService } = require('./application/rankingService');
const { createRankingRouter } = require('./infrastructure/http/routes');
const leaderboardRules = require('./domain/leaderboardRules');
const player = require('../player');
const rating = require('../rating');

const createRankingModule = ({ models, sequelize, players, ratingQueries, config }) => {
  const profile = player.domain.profile;
  const service = createRankingService({
    models,
    sequelize,
    players,
    ratingQueries,
    levelFor: rating.domain.levelFor,
    profile,
    utcOffsetMinutes: config.jobs.snapshotUtcOffsetMinutes
  });
  players.registerEnricher(service.enricher);
  const router = createRankingRouter({ ranking: service, players, profile });
  return { service, router };
};

module.exports = { defineRankingModels, createRankingModule, domain: { leaderboardRules } };
