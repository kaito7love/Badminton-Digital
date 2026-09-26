// Composition root của tầng dữ liệu: gom model của platform + từng module.
// Chỉ file ở gốc src/ (db.js, app.js, main.js) được biết mọi module.
const { definePlatformModels } = require('./platform/db/platformModels');
const { definePlayerModels } = require('./modules/player');
const { defineRatingModels } = require('./modules/rating');
const { defineRankingModels } = require('./modules/ranking');
const { defineMatchModels } = require('./modules/match');
const { defineTournamentModels } = require('./modules/tournament');

const defineModels = (sequelize) => ({
  ...definePlatformModels(sequelize),
  ...definePlayerModels(sequelize),
  ...defineRatingModels(sequelize),
  ...defineRankingModels(sequelize),
  ...defineMatchModels(sequelize),
  ...defineTournamentModels(sequelize)
});

module.exports = { defineModels };
