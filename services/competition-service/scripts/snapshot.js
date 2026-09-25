// Chạy tay job ảnh chụp BXH (bình thường scheduler tự chạy lúc 03:00 giờ VN).
//   npm run snapshot
require('dotenv').config();
const { loadConfig } = require('../src/platform/config');
const { createLogger } = require('../src/platform/logging/logger');
const { createSequelize } = require('../src/platform/db/sequelize');
const { defineModels } = require('../src/db');
const { createApp } = require('../src/app');

(async () => {
  const config = loadConfig();
  const logger = createLogger(config);
  const sequelize = createSequelize(config.db, logger);
  const models = defineModels(sequelize);
  const { modules } = createApp({ config, sequelize, models, logger });
  const result = await modules.ranking.service.dailySnapshot(new Date());
  console.log(`Ảnh chụp BXH ngày ${result.date}: ${result.rows} dòng`);
  await sequelize.close();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
