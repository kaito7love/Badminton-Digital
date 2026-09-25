// Giao diện công khai của module `rating`. Phụ thuộc: player.
const { defineRatingModels } = require('./infrastructure/models');
const { createRatingQueries } = require('./application/ratingQueries');
const { createRatingService } = require('./application/ratingService');
const { createRatingRouter } = require('./infrastructure/http/routes');
const player = require('../player');
const ratingEngine = require('./domain/ratingEngine');
const ratingConfig = require('./domain/ratingConfig');
const { levelFor } = require('./domain/levels');
const { pairingRating } = require('./domain/pairingRating');

const createRatingModule = ({ models, sequelize, platform, players }) => {
  const queries = createRatingQueries({ models, sequelize });
  const service = createRatingService({ models, sequelize, players, platform });

  // Gắn vào module player qua hook — player không biết gì về điểm.
  players.registerEnricher(queries.enricher);
  players.registerListFilter(queries.listFilter);
  players.registerProfileGuard(service.genderGuard);
  players.registerMergeHandler(service.mergeHandler);

  const router = createRatingRouter({
    ratings: service,
    queries,
    players,
    playerDomain: player.domain.profile,
    idempotency: platform.idempotency
  });
  return { service, queries, router };
};

module.exports = {
  defineRatingModels,
  createRatingModule,
  domain: { ratingEngine, ratingConfig, levelFor, pairingRating }
};
