// Giao diện công khai của module `ranking`. Phụ thuộc: player, rating.
const { defineRankingModels } = require('./infrastructure/models');
const { createRankingService } = require('./application/rankingService');
const { createPointsService } = require('./application/pointsService');
const rankingPoints = require('./domain/rankingPoints');
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
  const pointsService = createPointsService({ models, players, ratingQueries, profile, levelFor: rating.domain.levelFor });
  service.attachPoints(pointsService);
  players.registerMergeHandler(pointsService.mergeHandler);
  players.registerEnricher(service.enricher);
  const router = createRankingRouter({ ranking: service, points: pointsService, players, profile });
  return { service, points: pointsService, router };
};

module.exports = { defineRankingModels, createRankingModule, domain: { leaderboardRules, rankingPoints } };
